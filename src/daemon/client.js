const net = require("net");
const os = require("os");
const path = require("path");

/**
 * peely Daemon Client
 * 
 * Connects to the daemon server via IPC and sends requests.
 */

class DaemonClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.socketPath = this._getSocketPath();
    this.responseBuffer = "";
  }

  _getSocketPath() {
    // Use Unix socket on Unix-like systems, named pipe on Windows
    if (process.platform === "win32") {
      return path.join("\\\\?\\pipe", "peely-daemon");
    }
    return path.join(os.tmpdir(), "peely-daemon.sock");
  }

  async connect(timeout = 5000) {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.socketPath);
      
      const timeoutHandle = setTimeout(() => {
        this.socket.destroy();
        reject(new Error("Connection timeout"));
      }, timeout);

      this.socket.on("connect", () => {
        clearTimeout(timeoutHandle);
        this.connected = true;
        resolve();
      });

      this.socket.on("error", (err) => {
        clearTimeout(timeoutHandle);
        reject(err);
      });

      this.socket.on("data", (data) => {
        this.responseBuffer += data.toString();
      });

      this.socket.on("end", () => {
        this.connected = false;
      });
    });
  }

  async send(type, payload = {}) {
    if (!this.connected) {
      throw new Error("Not connected to daemon");
    }

    return new Promise((resolve, reject) => {
      this.responseBuffer = "";
      
      const message = { type, payload };
      this.socket.write(JSON.stringify(message) + "\n");

      // Overall timeout to prevent infinite polling
      const RESPONSE_TIMEOUT = 30000;
      const timeout = setTimeout(() => {
        reject(new Error("Response timeout — daemon did not respond within 30s"));
      }, RESPONSE_TIMEOUT);

      // Wait for response
      const checkResponse = () => {
        const newlineIndex = this.responseBuffer.indexOf("\n");
        if (newlineIndex !== -1) {
          clearTimeout(timeout);
          const line = this.responseBuffer.slice(0, newlineIndex);
          this.responseBuffer = this.responseBuffer.slice(newlineIndex + 1);
          
          try {
            const response = JSON.parse(line);
            if (response.success) {
              resolve(response.data);
            } else {
              reject(new Error(response.error || "Unknown error"));
            }
          } catch (err) {
            reject(err);
          }
        } else {
          // Poll every 50ms to reduce CPU usage
          setTimeout(checkResponse, 50);
        }
      };

      checkResponse();
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.end();
      this.connected = false;
    }
  }

  async ping() {
    return this.send("ping");
  }

  async chat(message, conversationId) {
    return this.send("chat", { message, conversationId });
  }

  async status() {
    return this.send("status");
  }

  async clear(conversationId) {
    return this.send("clear", { conversationId });
  }

  async timers() {
    return this.send("timers");
  }

  async shutdown() {
    return this.send("shutdown");
  }
}

module.exports = { DaemonClient };
