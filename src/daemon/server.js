const net = require("net");
const fs = require("fs");
const path = require("path");
const os = require("os");
const chalk = require("chalk");

/**
 * peely Daemon Server
 * 
 * Manages all interfaces (Discord, etc.), plugins, and events in a single
 * background process. CLI clients connect via IPC to send/receive messages.
 */

// Conversation history management constants
const MAX_HISTORY_LENGTH = 80;
const TRIMMED_HISTORY_LENGTH = 60;

class DaemonServer {
  constructor() {
    this.server = null;
    this.clients = new Set();
    this.interfaces = {};
    this.socketPath = this._getSocketPath();
    
    // Ensure data directory exists
    const dataDir = path.resolve(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  _getSocketPath() {
    // Use Unix socket on Unix-like systems, named pipe on Windows
    if (process.platform === "win32") {
      return path.join("\\\\?\\pipe", "peely-daemon");
    }
    return path.join(os.tmpdir(), "peely-daemon.sock");
  }

  async start() {
    // Clean up stale socket
    if (fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch (err) {
        console.error(chalk.red("Failed to remove stale socket:"), err.message);
      }
    }

    // Start interfaces
    await this._startInterfaces();

    // Create IPC server
    this.server = net.createServer((socket) => this._handleClient(socket));
    
    this.server.listen(this.socketPath, () => {
      console.log(chalk.green("✓ Daemon listening on"), this.socketPath);
    });

    this.server.on("error", (err) => {
      console.error(chalk.red("Daemon server error:"), err.message);
    });

    // Graceful shutdown
    process.on("SIGTERM", () => this.shutdown());
    process.on("SIGINT", () => this.shutdown());
  }

  async _startInterfaces() {
    const config = require("../utils/config");
    
    // Start Discord bot if configured
    const discordToken = config.get("interfaces.discord.token");
    if (discordToken) {
      try {
        const discord = require("../interfaces/discord");
        // Don't await - let it run in background
        discord.start().catch((err) => {
          console.error(chalk.red("Discord error:"), err.message);
        });
        this.interfaces.discord = discord;
        console.log(chalk.dim("  Discord interface starting..."));
      } catch (err) {
        console.error(chalk.red("Failed to start Discord:"), err.message);
      }
    }
  }

  _handleClient(socket) {
    this.clients.add(socket);
    console.log(chalk.dim("Client connected"));

    let buffer = "";

    socket.on("data", async (data) => {
      buffer += data.toString();
      
      // Process complete messages (newline-delimited JSON)
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        
        if (line.trim()) {
          await this._handleMessage(socket, line);
        }
      }
    });

    socket.on("end", () => {
      this.clients.delete(socket);
      console.log(chalk.dim("Client disconnected"));
    });

    socket.on("error", (err) => {
      console.error(chalk.red("Client socket error:"), err.message);
      this.clients.delete(socket);
    });
  }

  async _handleMessage(socket, line) {
    try {
      const message = JSON.parse(line);
      const { type, payload } = message;

      let response = { type: "response", success: true };

      switch (type) {
        case "ping":
          response.data = { pong: true, timestamp: Date.now() };
          break;

        case "chat":
          response.data = await this._handleChat(payload);
          break;

        case "status":
          response.data = await this._handleStatus();
          break;

        case "clear":
          response.data = await this._handleClear(payload);
          break;

        case "timers":
          response.data = await this._handleTimers();
          break;

        case "shutdown":
          response.data = { message: "Shutting down..." };
          this._send(socket, response);
          setTimeout(() => this.shutdown(), 100);
          return;

        default:
          response.success = false;
          response.error = `Unknown message type: ${type}`;
      }

      this._send(socket, response);
    } catch (err) {
      console.error(chalk.red("Error handling message:"), err.message);
      this._send(socket, {
        type: "response",
        success: false,
        error: err.message,
      });
    }
  }

  async _handleChat(payload) {
    const { message, conversationId = "cli" } = payload;
    const ai = require("../ai");
    const memory = require("../utils/memory");

    // Load conversation history
    const history = memory.load(`daemon-${conversationId}`);
    history.push({ role: "user", content: message });

    // Get AI response
    const response = await ai.chat(history);
    const reply = response.content || "...";
    
    history.push({ role: "assistant", content: reply });
    
    // Keep history manageable
    if (history.length > MAX_HISTORY_LENGTH) {
      history.splice(0, history.length - TRIMMED_HISTORY_LENGTH);
    }
    
    memory.save(`daemon-${conversationId}`, history);

    return {
      content: reply,
      toolResults: response.toolResults || [],
    };
  }

  async _handleStatus() {
    const config = require("../utils/config");
    const { events } = require("../utils/events");
    
    return {
      model: config.get("ai.model") || "not set",
      discord: config.get("interfaces.discord.token") ? "configured" : "not set",
      github: config.get("github.token") ? "configured" : "not set",
      activeTimers: events.listScheduled().length,
      connectedClients: this.clients.size,
      uptime: process.uptime(),
    };
  }

  async _handleClear(payload) {
    const { conversationId = "cli" } = payload;
    const memory = require("../utils/memory");
    
    memory.clear(`daemon-${conversationId}`);
    
    return {
      message: `Cleared conversation: ${conversationId}`,
    };
  }

  async _handleTimers() {
    const { events } = require("../utils/events");
    
    return {
      timers: events.listScheduled(),
    };
  }

  _send(socket, data) {
    try {
      socket.write(JSON.stringify(data) + "\n");
    } catch (err) {
      console.error(chalk.red("Error sending to client:"), err.message);
    }
  }

  async shutdown() {
    console.log(chalk.yellow("\nShutting down daemon..."));
    
    // Close all client connections
    for (const client of this.clients) {
      client.end();
    }
    
    // Close interfaces
    if (this.interfaces.discord && this.interfaces.discord.client) {
      try {
        console.log(chalk.dim("  Stopping Discord bot..."));
        this.interfaces.discord.client.destroy();
      } catch (err) {
        console.error(chalk.red("Error stopping Discord:"), err.message);
      }
    }
    
    // Close server
    if (this.server) {
      this.server.close();
    }
    
    // Clean up socket file
    if (fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch (err) {
        console.error(chalk.red("Failed to remove socket:"), err.message);
      }
    }
    
    console.log(chalk.green("✓ Daemon stopped"));
    process.exit(0);
  }
}

module.exports = { DaemonServer };
