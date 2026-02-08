/**
 * Interface scaffolding — create new custom interfaces.
 *
 * Custom interfaces live in ~/.peely/interfaces/custom/<name>/index.js
 * so they survive npm updates.  Each interface exports { name, description, start }.
 */

const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const { intro, text, select, isCancel, log, outro } = require("@clack/prompts");
const PATHS = require("../utils/paths");

const CUSTOM_DIR = PATHS.customInterfaces;

// ── Template ──
const template = (name, description, type) => {
  const base = `/**
 * ${name} — custom peely interface
 * ${description}
 */

const config = require("peely/src/utils/config");
const ai = require("peely/src/ai");
const memory = require("peely/src/utils/memory");
const chalk = require("chalk");

// Load / create conversation history for this interface
const conversationHistory = memory.load("${name}");

`;

  if (type === "http") {
    return (
      base +
      `const http = require("http");

const PORT = 3000;

const start = async () => {
  const server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/chat") {
      let body = "";
      for await (const chunk of req) body += chunk;

      try {
        const { message } = JSON.parse(body);
        conversationHistory.push({ role: "user", content: message });

        const response = await ai.chat(conversationHistory);
        const reply = response.content || "...";
        conversationHistory.push({ role: "assistant", content: reply });
        memory.save("${name}", conversationHistory);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ reply }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    } else {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("peely ${name} interface — POST /chat to talk");
    }
  });

  server.listen(PORT, () => {
    console.log(chalk.green(\`  ✓ ${name} interface listening on http://localhost:\${PORT}\`));
  });

  return new Promise(() => {}); // keep alive
};

module.exports = {
  name: "${name}",
  description: "${description}",
  start,
};
`
    );
  }

  if (type === "websocket") {
    return (
      base +
      `// NOTE: install ws first — npm i ws
const { WebSocketServer } = require("ws");

const PORT = 8080;

const start = async () => {
  const wss = new WebSocketServer({ port: PORT });
  console.log(chalk.green(\`  ✓ ${name} interface listening on ws://localhost:\${PORT}\`));

  wss.on("connection", (ws) => {
    const history = [...conversationHistory]; // per-connection copy

    ws.on("message", async (data) => {
      try {
        const message = data.toString();
        history.push({ role: "user", content: message });

        const response = await ai.chat(history);
        const reply = response.content || "...";
        history.push({ role: "assistant", content: reply });
        memory.save("${name}", history);

        ws.send(JSON.stringify({ reply }));
      } catch (err) {
        ws.send(JSON.stringify({ error: err.message }));
      }
    });

    ws.send(JSON.stringify({ reply: "Connected to peely ${name} interface!" }));
  });

  return new Promise(() => {}); // keep alive
};

module.exports = {
  name: "${name}",
  description: "${description}",
  start,
};
`
    );
  }

  if (type === "stdin") {
    return (
      base +
      `const readline = require("readline");

const start = async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.bold.cyan("  ${name} › "),
    terminal: true,
  });

  console.log(chalk.magenta("  ${name}") + chalk.dim(" — type a message or Ctrl+C to exit"));
  console.log();
  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    if (input === "/exit" || input === "/quit") {
      console.log(chalk.dim("  👋 Bye!"));
      rl.close();
      return;
    }

    conversationHistory.push({ role: "user", content: input });

    try {
      const response = await ai.chat(conversationHistory);
      const reply = response.content || "...";
      conversationHistory.push({ role: "assistant", content: reply });
      memory.save("${name}", conversationHistory);
      console.log(chalk.bold.magenta("  🍌 ") + reply);
    } catch (err) {
      console.log(chalk.red("  ✗ ") + err.message);
      conversationHistory.pop();
    }

    console.log();
    rl.prompt();
  });

  rl.on("close", () => process.exit(0));
  return new Promise(() => {});
};

module.exports = {
  name: "${name}",
  description: "${description}",
  start,
};
`
    );
  }

  // Blank / custom
  return (
    base +
    `const start = async () => {
  console.log(chalk.green("  ✓ ${name} interface started"));

  // ── Your interface logic goes here ──
  // Use ai.chat(conversationHistory) to talk to the AI
  // Use memory.save("${name}", conversationHistory) to persist
  // Use config.get() / config.set() for settings

  // Example: handle a single message
  // conversationHistory.push({ role: "user", content: "hello" });
  // const response = await ai.chat(conversationHistory);
  // console.log(response.content);

  return new Promise(() => {}); // keep alive
};

module.exports = {
  name: "${name}",
  description: "${description}",
  start,
};
`
  );
};

// ── Wizard ──
const createInterface = async () => {
  intro(chalk.magenta("🔌 Create a new interface"));

  const name = await text({
    message: "Interface name:",
    placeholder: "e.g. slack, telegram, web",
    validate: (val) => {
      if (!val || !val.trim()) return "Name is required";
      if (!/^[a-z][a-z0-9_-]*$/.test(val.trim()))
        return "Lowercase alphanumeric, hyphens, underscores only";
      const dir = path.join(CUSTOM_DIR, val.trim());
      if (fs.existsSync(dir)) return `Interface "${val.trim()}" already exists`;
    },
  });

  if (isCancel(name)) { outro(chalk.dim("Cancelled.")); return; }

  const description = await text({
    message: "Short description:",
    placeholder: "e.g. Slack bot interface for peely",
  });

  if (isCancel(description)) { outro(chalk.dim("Cancelled.")); return; }

  const type = await select({
    message: "Template:",
    options: [
      { value: "http",      label: "🌐  HTTP server",    hint: "REST API on localhost" },
      { value: "websocket", label: "🔌  WebSocket",       hint: "real-time bidirectional" },
      { value: "stdin",     label: "⌨️   Stdin / readline", hint: "simple terminal loop" },
      { value: "blank",     label: "📄  Blank",            hint: "empty start() scaffold" },
    ],
  });

  if (isCancel(type)) { outro(chalk.dim("Cancelled.")); return; }

  const safeName = name.trim();
  const safeDesc = (description || "").trim() || `Custom ${safeName} interface`;

  const dir = path.join(CUSTOM_DIR, safeName);
  fs.mkdirSync(dir, { recursive: true });

  const code = template(safeName, safeDesc, type);
  const filePath = path.join(dir, "index.js");
  fs.writeFileSync(filePath, code, "utf-8");

  log.success(`Created ${chalk.cyan(safeName)} interface`);
  log.info(`File: ${chalk.dim(filePath)}`);
  log.info(`Start: ${chalk.cyan(`peely interface start ${safeName}`)}`);
  outro(chalk.dim("Done!"));

  return safeName;
};

// ── List all interfaces (built-in + custom) ──
const listInterfaces = () => {
  const builtIn = [
    { name: "terminal", description: "Interactive TUI", type: "built-in" },
    { name: "discord",  description: "Discord bot",     type: "built-in" },
  ];

  const custom = [];
  if (fs.existsSync(CUSTOM_DIR)) {
    for (const entry of fs.readdirSync(CUSTOM_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const indexPath = path.join(CUSTOM_DIR, entry.name, "index.js");
      if (!fs.existsSync(indexPath)) continue;
      try {
        const mod = require(indexPath);
        custom.push({
          name: mod.name || entry.name,
          description: mod.description || "",
          type: "custom",
          path: indexPath,
        });
      } catch (err) {
        custom.push({
          name: entry.name,
          description: chalk.red(`load error: ${err.message}`),
          type: "custom",
          path: indexPath,
        });
      }
    }
  }

  return [...builtIn, ...custom];
};

// ── Load a custom interface by name ──
const loadCustomInterface = (name) => {
  const indexPath = path.join(CUSTOM_DIR, name, "index.js");
  if (!fs.existsSync(indexPath)) return null;
  return require(indexPath);
};

// ── Delete a custom interface ──
const deleteInterface = (name) => {
  const dir = path.join(CUSTOM_DIR, name);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
};

module.exports = { createInterface, listInterfaces, loadCustomInterface, deleteInterface };
