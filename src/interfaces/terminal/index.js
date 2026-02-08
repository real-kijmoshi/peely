const readline = require("readline");
const chalk = require("chalk");
const config = require("../../utils/config");
const ai = require("../../ai");
const memory = require("../../utils/memory");
const ora = require("ora");
const cmds = require("./commands");

// ── State ── (loaded from disk)
const conversationHistory = memory.load("terminal");
let running = true;

// ── UI helpers ──
const LOGO = cmds.interactiveLogo;
const { printStatus, pairDiscord } = cmds;

const HELP_TEXT = cmds.buildSlashHelp();

const printSeparator = () => {
  console.log(chalk.dim("  " + "─".repeat(50)));
};

const printAssistant = (text) => {
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (i === 0) {
      console.log(chalk.bold.magenta("  🍌 ") + line);
    } else {
      console.log("     " + line);
    }
  });
};

const printError = (msg) => {
  console.log(chalk.red("  ✗ ") + msg);
};

const printSuccess = (msg) => {
  console.log(chalk.green("  ✓ ") + msg);
};

// ── Slash command handler ──
const handleSlashCommand = async (input, rl) => {
  const parts = input.slice(1).trim().split(/\s+/);
  const cmd = parts[0];

  switch (cmd) {
    case "help":
      console.log(HELP_TEXT);
      return true;

    case "clear":
      conversationHistory.length = 0;
      memory.clear("terminal");
      console.log();
      printSuccess("Conversation cleared.");
      console.log();
      return true;

    case "model":
      return { clack: true, run: () => cmds.chooseModel() };

    case "status":
      printStatus({ messageCount: conversationHistory.length });
      return true;

    case "pair": {
      if (parts[1] === "discord" && parts[2]) {
        const code = parts[2].toUpperCase();
        try {
          const result = await pairDiscord(code);
          console.log();
          if (result.ok) {
            printSuccess(`Paired Discord user ${result.userId}!`);
          } else {
            printError(result.error);
          }
          console.log();
        } catch (err) {
          console.log();
          printError(err.message);
          console.log();
        }
        return true;
      }
      console.log();
      printError("Usage: /pair discord <code>");
      console.log();
      return true;
    }

    case "exit":
    case "quit":
      running = false;
      console.log();
      console.log(chalk.dim("  👋 See you later!"));
      console.log();
      return true;

    case "timers": {
      cmds.printTimers();
      return true;
    }

    case "plugins": {
      cmds.printPlugins();
      return true;
    }

    case "interfaces":
    case "interface": {
      return { clack: true, run: () => cmds.interfaceMenu() };
    }

    case "settings": {
      return { clack: true, run: () => cmds.openSettings() };
    }

    default:
      console.log();
      printError(`Unknown command: /${cmd}. Type /help for commands.`);
      console.log();
      return true;
  }
};

// ── Chat handler ──
const handleChat = async (input) => {
  conversationHistory.push({ role: "user", content: input });

  const spinner = ora({
    text: chalk.dim("  Thinking..."),
    spinner: "dots",
    indent: 2,
  }).start();

  try {
    const response = await ai.chat(conversationHistory);
    spinner.stop();

    const reply = response.content || "...";
    conversationHistory.push({ role: "assistant", content: reply });

    // Keep history manageable (same limits as daemon/discord)
    if (conversationHistory.length > 80) {
      conversationHistory.splice(0, conversationHistory.length - 60);
    }

    memory.save("terminal", conversationHistory);

    console.log();
    printAssistant(reply);

    if (response.toolResults && response.toolResults.length > 0) {
      console.log(
        chalk.dim(
          `     [used ${response.toolResults.length} tool(s): ${response.toolResults
            .map((r) => r.id)
            .join(", ")}]`
        )
      );
    }

    console.log();
  } catch (err) {
    spinner.stop();
    console.log();
    printError(err.message);
    console.log();
    // Remove failed user message
    conversationHistory.pop();
  }
};

// ── Reclaim stdin after @clack/prompts so readline can re-attach ──
const reclaimStdin = () => {
  // Only remove "keypress" listeners left behind by @clack.
  // NEVER remove "data" listeners — that kills the internal keypress-decoder
  // pipe that readline.emitKeypressEvents() installs once on first use.
  // A new readline.createInterface() sees the decoder symbol is already set
  // and skips re-initialisation, so removing the data handler is fatal.
  process.stdin.removeAllListeners("keypress");
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    try { process.stdin.setRawMode(false); } catch (_) {}
  }
  process.stdin.pause();
};

// ── Main loop ──
const start = async () => {
  console.log(LOGO);

  const model = config.get("ai.model");
  if (!model) {
    console.log(chalk.yellow("  No AI model selected. Let's pick one first.\n"));
    await ai.chooseModel();
  }

  console.log(
    chalk.dim(`  Model: ${config.get("ai.model") || "none"}  •  Type /help for commands\n`)
  );
  printSeparator();
  console.log();

  let rl;
  let closeResolve;
  let processing = false;
  let intentionalClose = false;  // true while we close rl for @clack commands

  const createRl = () => {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.bold.cyan("  you › "),
      terminal: true,
    });

    rl.on("line", (line) => processLine(line));

    // Capture a reference so the handler always checks the *current* rl
    const thisRl = rl;
    rl.on("close", () => {
      // Ignore if this is an intentional close (we're handing off to @clack)
      if (intentionalClose) return;
      // Ignore if this rl was already replaced by a newer one
      if (thisRl !== rl) return;
      running = false;
      if (closeResolve) closeResolve();
    });
  };

  const processLine = async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    processing = true;
    rl.pause();

    try {
      if (input.startsWith("/")) {
        const result = await handleSlashCommand(input, rl);

        // @clack command — needs exclusive stdin control
        if (result && result.clack) {
          intentionalClose = true;
          rl.close();
          try {
            await result.run();
          } catch (err) {
            printError(err.message);
          }
          reclaimStdin();
          intentionalClose = false;
          createRl();
          process.stdin.resume();
          processing = false;
          rl.prompt();
          return;
        }

        if (!running) {
          rl.close();
          return;
        }
      } else {
        await handleChat(input);
      }
    } catch (err) {
      printError(err.message);
    }

    processing = false;
    if (running) {
      rl.resume();
      rl.prompt();
    }
  };

  createRl();
  rl.prompt();

  // Keep process alive
  return new Promise((resolve) => {
    closeResolve = resolve;
  });
};

module.exports = { start, ...cmds };