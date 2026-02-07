const readline = require("readline");
const chalk = require("chalk");
const config = require("../../utils/config");
const ai = require("../../ai");
const memory = require("../../utils/memory");
const ora = require("ora");

// ── State ── (loaded from disk)
const conversationHistory = memory.load("terminal");
let running = true;

// ── UI helpers ──
const LOGO = (() => {
  try {
    const fs = require("fs");
    const path = require("path");
    const p = path.join(__dirname, "..", "..", "assets", "ascii-logo.txt");
    const art = fs.readFileSync(p, "utf8");
    return art
      .split("\n")
      .map((line) => (line.trim() === "" ? "" : chalk.magenta("  " + line)))
      .join("\n")
      + "\n\n" + chalk.bold.white("  🍌 peely") + " " + chalk.dim("— interactive mode") + "\n";
  } catch (err) {
    // Fallback banner
    return `\n${chalk.magenta("  ____            _ _ _       ")}\n${chalk.magenta(" |  _ \\ ___  __ _(_) (_) ___  ")}\n${chalk.magenta(" | |_) / _ \\/ _\\` | | | |/ _ \\ ")}\n${chalk.magenta(" |  __/  __/ (_| | | | | (_) |")}\n${chalk.magenta(" |_|   \\___|\\__, |_|_|_|\\___/ ")}\n${chalk.magenta("            |___/              ")}\n\n${chalk.bold.white("  🍌 peely")} ${chalk.dim("— interactive mode")}\n`;
  }
})();

const HELP_TEXT = `
${chalk.bold("  Commands:")}
    ${chalk.cyan("/help")}                  Show this help
    ${chalk.cyan("/clear")}                 Clear conversation history
    ${chalk.cyan("/model")}                 Switch AI model
    ${chalk.cyan("/timers")}                Show active timers
    ${chalk.cyan("/plugins")}               List loaded plugins
    ${chalk.cyan("/pair discord <code>")}   Pair a Discord account
    ${chalk.cyan("/status")}                Show system status
    ${chalk.cyan("/exit")}                  Exit peely
`;

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
      return "reset-readline"; // signal processLine to handle the rl reset

    case "status": {
      const model = config.get("ai.model") || chalk.dim("not set");
      const discord = config.get("interfaces.discord.token")
        ? chalk.green("configured")
        : chalk.red("not set");
      const github = config.get("github.token")
        ? chalk.green("authorized")
        : chalk.red("not set");
      const msgs = conversationHistory.length;

      console.log();
      console.log(chalk.bold("  Status:"));
      console.log(`    AI Model:      ${model}`);
      console.log(`    GitHub:        ${github}`);
      console.log(`    Discord:       ${discord}`);
      console.log(`    Messages:      ${msgs}`);
      console.log();
      return true;
    }

    case "pair": {
      if (parts[1] === "discord" && parts[2]) {
        const code = parts[2].toUpperCase();
        try {
          const fs = require("fs");
          if (!fs.existsSync("./data")) fs.mkdirSync("./data", { recursive: true });

          const { SqliteDriver, QuickDB } = require("quick.db");
          const db = new QuickDB({
            driver: new SqliteDriver("./data/quick.db"),
          });

          const userId = await db.get(`pairCode_${code}`);
          if (!userId) {
            console.log();
            printError(`Invalid or expired pair code: ${code}`);
            console.log();
            return true;
          }

          await db.set(`paired_${userId}`, true);
          await db.delete(`pairCode_${code}`);
          config.set("interfaces.discord.pairedUsers", [
            ...(config.get("interfaces.discord.pairedUsers") || []),
            userId,
          ]);

          console.log();
          printSuccess(`Paired Discord user ${userId}!`);
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
      const { events } = require("../../utils/events");
      const scheduled = events.listScheduled();
      console.log();
      if (scheduled.length === 0) {
        console.log(chalk.dim("  No active timers."));
      } else {
        console.log(chalk.bold("  Active timers:"));
        for (const t of scheduled) {
          const secs = Math.ceil(t.remainingMs / 1000);
          const desc = t.meta?.task || t.meta?.message || t.id;
          console.log(`    ⏱️  ${t.id} — ${secs}s left — ${desc}`);
        }
      }
      console.log();
      return true;
    }

    case "plugins": {
      const pluginModule = require("../../plugins");
      console.log();
      console.log(chalk.bold("  Loaded plugins:"));
      for (const p of pluginModule.plugins) {
        const toolCount = p.tools ? Object.keys(p.tools).length : 0;
        console.log(`    • ${chalk.cyan(p.name)} — ${toolCount} tool(s) — ${p.description || ""}`);
      }
      console.log();
      return true;
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

// ── Flush stdin after @clack/prompts to avoid conflicts with readline ──
const flushStdin = () => {
  process.stdin.removeAllListeners();
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    process.stdin.setRawMode(false);
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
    // @clack/prompts leaves stdin in a dirty state — clean it before readline
    flushStdin();
  }

  console.log(
    chalk.dim(`  Model: ${config.get("ai.model") || "none"}  •  Type /help for commands\n`)
  );
  printSeparator();
  console.log();

  let rl;
  let closeResolve;
  let processing = false;
  let resettingRl = false;   // true while we intentionally destroy rl for /model

  const createRl = () => {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.bold.cyan("  you › "),
      terminal: true,
    });

    rl.on("line", (line) => processLine(line));
    rl.on("close", () => {
      if (resettingRl) return;   // intentional close — don't kill the loop
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
        const needsReset = await handleSlashCommand(input, rl);
        // If the command used @clack prompts, rebuild readline
        if (needsReset === "reset-readline") {
          resettingRl = true;
          rl.close();           // release stdin before @clack takes over
          resettingRl = false;
          await ai.chooseModel();
          flushStdin();
          createRl();
          rl.prompt();
          processing = false;
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

module.exports = { start };
