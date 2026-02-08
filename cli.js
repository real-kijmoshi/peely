#!/usr/bin/env node

const config = require("./src/utils/config");
const chalk = require("chalk");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const PATHS = require("./src/utils/paths");

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

// ── Logo ──
const logo = `
  ${chalk.magenta("╔══════════════════════════════╗")}
  ${chalk.magenta("║")}  ${chalk.bold.white("🍌 peely")} ${chalk.dim("— your AI assistant")} ${chalk.magenta("║")}
  ${chalk.magenta("╚══════════════════════════════╝")}
`;

require("./src/utils/autoupdateInfo").checkUpdate();

const showHelp = () => {
  console.log(logo);
  console.log(chalk.bold("  Usage:"));
  console.log(`    ${chalk.cyan("peely")}                       Start interactive TUI`);
  console.log(`    ${chalk.cyan("peely setup")}                 First-time onboarding wizard`);
  console.log(`    ${chalk.cyan("peely chat")} ${chalk.dim("<message>")}        One-shot chat (connects to daemon)`);
  console.log(`    ${chalk.cyan("peely daemon start")}          Start daemon in background`);
  console.log(`    ${chalk.cyan("peely daemon stop")}           Stop daemon`);
  console.log(`    ${chalk.cyan("peely daemon restart")}        Restart daemon (for updates)`);
  console.log(`    ${chalk.cyan("peely daemon status")}         Show daemon status`);
  console.log(`    ${chalk.cyan("peely start")}                 Legacy: Run Discord bot in background`);
  console.log(`    ${chalk.cyan("peely stop")}                  Legacy: Stop background process`);
  console.log(`    ${chalk.cyan("peely discord")}               Start Discord bot only`);
  console.log(`    ${chalk.cyan("peely pair discord")} ${chalk.dim("<code>")}   Pair Discord account`);
  console.log(`    ${chalk.cyan("peely pair discord setup")}    Set Discord bot token`);
  console.log(`    ${chalk.cyan("peely model")}                 Choose AI model`);
  console.log(`    ${chalk.cyan("peely settings")}              Edit config, tokens & API keys`);
  console.log(`    ${chalk.cyan("peely interface create")}       Create a new custom interface`);
  console.log(`    ${chalk.cyan("peely interface list")}         List all interfaces`);
  console.log(`    ${chalk.cyan("peely interface start")} ${chalk.dim("<name>")} Start a custom interface`);
  console.log(`    ${chalk.cyan("peely interface delete")} ${chalk.dim("<name>")} Delete a custom interface`);
  console.log(`    ${chalk.cyan("peely status")}                Show config status`);
  console.log(`    ${chalk.cyan("peely help")}                  Show this help`);
  console.log();
};

const PID_FILE = PATHS.pidFile;
const DAEMON_PID_FILE = PATHS.daemonPidFile;

const startBackground = async () => {
  if (fs.existsSync(PID_FILE)) {
    const oldPid = fs.readFileSync(PID_FILE, "utf-8").trim();
    try {
      process.kill(Number(oldPid), 0); // check if alive
      console.log(chalk.yellow(`  ✗ peely already running (pid ${oldPid}).`));
      return;
    } catch (_) {
      // stale pid file
      fs.unlinkSync(PID_FILE);
    }
  }

  const logFile = PATHS.log;
  const out = fs.openSync(logFile, "a");

  const child = spawn(process.execPath, [__filename, "discord"], {
    detached: true,
    stdio: ["ignore", out, out],
  });

  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid), "utf-8");
  console.log(chalk.green(`  ✓ Started peely in background (pid ${child.pid}).`));
  console.log(chalk.dim(`  Logs: ${logFile}`));
  console.log(chalk.dim("  Use \`peely stop\` to stop."));
};

const stopBackground = async () => {
  if (!fs.existsSync(PID_FILE)) {
    console.log(chalk.yellow("  ✗ No background peely process found."));
    return;
  }
  try {
    const pid = Number(fs.readFileSync(PID_FILE, "utf-8").trim());
    process.kill(pid, "SIGTERM");
    fs.unlinkSync(PID_FILE);
    console.log(chalk.green(`  ✓ Stopped peely (pid ${pid}).`));
  } catch (err) {
    console.log(chalk.red("  ✗ Failed to stop peely:"), err.message);
  }
};

// ── Daemon commands ──
const startDaemon = async () => {
  if (fs.existsSync(DAEMON_PID_FILE)) {
    const oldPid = fs.readFileSync(DAEMON_PID_FILE, "utf-8").trim();
    try {
      process.kill(Number(oldPid), 0);
      console.log(chalk.yellow(`  ✗ Daemon already running (pid ${oldPid}).`));
      return;
    } catch (_) {
      fs.unlinkSync(DAEMON_PID_FILE);
    }
  }

  const logFile = PATHS.daemonLog;
  const out = fs.openSync(logFile, "a");

  const daemonPath = path.join(__dirname, "src/daemon/index.js");
  const child = spawn(process.execPath, [daemonPath], {
    detached: true,
    stdio: ["ignore", out, out],
  });

  child.unref();
  fs.writeFileSync(DAEMON_PID_FILE, String(child.pid), "utf-8");
  console.log(chalk.green(`  ✓ Started daemon (pid ${child.pid}).`));
  console.log(chalk.dim(`  Logs: ${logFile}`));
  console.log(chalk.dim("  Use \`peely daemon stop\` to stop."));
};

const stopDaemon = async () => {
  // First try graceful shutdown via IPC
  try {
    const { DaemonClient } = require("./src/daemon/client");
    const client = new DaemonClient();
    await client.connect(2000);
    await client.shutdown();
    client.disconnect();
    
    // Clean up PID file
    if (fs.existsSync(DAEMON_PID_FILE)) {
      fs.unlinkSync(DAEMON_PID_FILE);
    }
    
    console.log(chalk.green("  ✓ Daemon stopped gracefully."));
    return;
  } catch (err) {
    // Fall back to SIGTERM if IPC fails
    if (!fs.existsSync(DAEMON_PID_FILE)) {
      console.log(chalk.yellow("  ✗ No daemon process found."));
      return;
    }
    
    try {
      const pid = Number(fs.readFileSync(DAEMON_PID_FILE, "utf-8").trim());
      process.kill(pid, "SIGTERM");
      fs.unlinkSync(DAEMON_PID_FILE);
      console.log(chalk.green(`  ✓ Stopped daemon (pid ${pid}).`));
    } catch (err) {
      console.log(chalk.red("  ✗ Failed to stop daemon:"), err.message);
    }
  }
};

const restartDaemon = async () => {
  console.log(chalk.dim("  Restarting daemon..."));
  await stopDaemon();
  
  // Wait for daemon cleanup: socket cleanup, Discord disconnect, etc.
  const DAEMON_RESTART_DELAY = 1000;
  await new Promise((resolve) => setTimeout(resolve, DAEMON_RESTART_DELAY));
  
  await startDaemon();
};

const daemonStatus = async () => {
  console.log(logo);
  
  let daemonRunning = false;
  let daemonPid = null;
  
  if (fs.existsSync(DAEMON_PID_FILE)) {
    daemonPid = fs.readFileSync(DAEMON_PID_FILE, "utf-8").trim();
    try {
      process.kill(Number(daemonPid), 0);
      daemonRunning = true;
    } catch (_) {
      daemonPid = null;
    }
  }
  
  console.log(chalk.bold("  Daemon Status:"));
  
  if (daemonRunning) {
    console.log(`    Status:      ${chalk.green(`running (pid ${daemonPid})`)}`);
    
    // Try to get detailed status from daemon
    try {
      const { DaemonClient } = require("./src/daemon/client");
      const client = new DaemonClient();
      await client.connect(2000);
      const status = await client.status();
      client.disconnect();
      
      console.log(`    Model:       ${status.model}`);
      console.log(`    Discord:     ${status.discord}`);
      console.log(`    GitHub:      ${status.github}`);
      console.log(`    Timers:      ${status.activeTimers}`);
      console.log(`    Clients:     ${status.connectedClients}`);
      console.log(`    Uptime:      ${Math.floor(status.uptime)}s`);
    } catch (err) {
      console.log(chalk.dim(`    (Could not fetch detailed status: ${err.message})`));
    }
  } else {
    console.log(`    Status:      ${chalk.red("not running")}`);
  }
  
  console.log();
};

const showStatus = () => {
  console.log(logo);
  const model = config.get("ai.model") || chalk.dim("not set");
  const discord = config.get("interfaces.discord.token") ? chalk.green("configured") : chalk.red("not set");
  const github = config.get("github.token") ? chalk.green("authorized") : chalk.red("not set");

  let bgStatus = chalk.dim("not running");
  if (fs.existsSync(PID_FILE)) {
    const pid = fs.readFileSync(PID_FILE, "utf-8").trim();
    try {
      process.kill(Number(pid), 0);
      bgStatus = chalk.green(`running (pid ${pid})`);
    } catch (_) {
      bgStatus = chalk.yellow("stale pid file");
    }
  }

  console.log(chalk.bold("  Status:"));
  console.log(`    AI Model:    ${model}`);
  console.log(`    GitHub:      ${github}`);
  console.log(`    Discord:     ${discord}`);
  console.log(`    Background:  ${bgStatus}`);
  console.log();
};


const pairDiscord = async (code) => {
  if (!code) {
    console.log(chalk.red("  ✗ Usage: peely pair discord <code>"));
    return;
  }

  const { SqliteDriver, QuickDB } = require("quick.db");

  // quick.db SqliteDriver expects a string path
  const db = new QuickDB({ driver: new SqliteDriver(PATHS.quickDb) });
  const userId = await db.get(`pairCode_${code.toUpperCase()}`);

  if (!userId) {
    console.log(chalk.red(`  ✗ Invalid or expired pair code: ${code}`));
    return;
  }

  // Store the pairing
  await db.set(`paired_${userId}`, true);
  await db.delete(`pairCode_${code.toUpperCase()}`);
  config.set("interfaces.discord.pairedUsers", [
    ...(config.get("interfaces.discord.pairedUsers") || []),
    userId,
  ]);

  console.log(chalk.green(`  ✓ Successfully paired Discord user ${userId}!`));
};

const setupDiscord = async () => {
  const { text, isCancel } = require("@clack/prompts");
  console.log(logo);
  const token = await text({ message: "Enter your Discord Bot Token:" });
  if (!isCancel(token) && token && token.trim()) {
    config.set("interfaces.discord.token", token.trim());
    console.log(chalk.green("  ✓ Discord bot token saved!"));
  } else {
    console.log(chalk.red("  ✗ Cancelled."));
  }
};

const oneShot = async (msg) => {
  const ora = require("ora");
  const spinner = ora({ text: chalk.dim("Thinking..."), spinner: "dots" }).start();
  
  try {
    // Try to use daemon if running
    let daemonRunning = false;
    if (fs.existsSync(DAEMON_PID_FILE)) {
      try {
        const pid = Number(fs.readFileSync(DAEMON_PID_FILE, "utf-8").trim());
        process.kill(pid, 0);
        daemonRunning = true;
      } catch (_) {
        daemonRunning = false;
      }
    }
    
    let response;
    
    if (daemonRunning) {
      const { DaemonClient } = require("./src/daemon/client");
      const client = new DaemonClient();
      await client.connect();
      response = await client.chat(msg, "cli");
      client.disconnect();
    } else {
      const ai = require("./src/ai");
      const result = await ai.chat(msg);
      response = { content: result.content, toolResults: result.toolResults };
    }
    
    spinner.stop();
    console.log();
    console.log(chalk.bold.magenta("  peely: ") + response.content);
    
    if (response.toolResults && response.toolResults.length > 0) {
      console.log(chalk.dim(`  [used ${response.toolResults.length} tool(s)]`));
    }
    
    console.log();
  } catch (err) {
    spinner.stop();
    console.error(chalk.red("  Error:"), err.message);
  }
};

// ── Route commands ──
(async () => {
  try {
    switch (command) {
      case "help":
      case "--help":
      case "-h":
        showHelp();
        break;

      case "status":
        showStatus();
        break;

      case "model":
        const ai = require("./src/ai");
        await ai.chooseModel();
        break;

      case "settings": {
        const { settingsMenu } = require("./src/utils/settings");
        await settingsMenu();
        break;
      }

      case "setup":
      case "onboarding":
      case "init": {
        const { intro: setupIntro, confirm, text, isCancel } = require("@clack/prompts");
        console.log(logo);
        setupIntro(chalk.magenta("Welcome to peely! Let's get you set up."));

        // Step 1: AI provider
        console.log();
        console.log(chalk.bold("  Step 1: ") + "Connect to an AI provider");
        const aiModule = require("./src/ai");
        await aiModule.chooseModel();

        // Step 2: Interfaces
        console.log();
        console.log(chalk.bold("  Step 2: ") + "Configure interfaces");
        console.log();

        const wantDiscord = await confirm({ message: "Set up Discord bot?" });
        if (isCancel(wantDiscord)) break;

        if (wantDiscord) {
          const token = await text({
            message: "Paste your Discord Bot Token:",
            placeholder: "get one from discord.com/developers",
          });
          if (!isCancel(token) && token && token.trim()) {
            config.set("interfaces.discord.token", token.trim());
            console.log(chalk.green("  ✓ Discord bot token saved."));
          } else {
            console.log(chalk.dim("  Skipped. Run \`peely pair discord setup\` later."));
          }
        }

        // Step 3: Quick info
        console.log();
        console.log(chalk.bold("  Step 3: ") + "How peely works");
        console.log();
        console.log(chalk.dim("  • peely has built-in tools: math, search, discord, timer"));
        console.log(chalk.dim("  • You can create custom plugins by asking peely to make them"));
        console.log(chalk.dim("  • Conversation memory persists across restarts"));
        console.log(chalk.dim("  • Events system lets plugins react to timers, messages, etc."));
        console.log();
        console.log(chalk.bold("  Useful commands:"));
        console.log(chalk.dim("    peely               — interactive chat"));
        console.log(chalk.dim("    peely daemon start  — run daemon in background"));
        console.log(chalk.dim("    peely daemon stop   — stop daemon"));
        console.log(chalk.dim("    peely daemon status — check daemon status"));
        console.log(chalk.dim("    peely chat <msg>    — one-shot chat (uses daemon if running)"));

        console.log();
        config.set("onboarding.completed", true);
        console.log(chalk.green.bold("  ✓ Setup complete! Run \`peely\` to start chatting."));
        console.log();
        break;
      }

      case "interface":
      case "interfaces": {
        const { createInterface, listInterfaces, loadCustomInterface, deleteInterface } = require("./src/interfaces/create_interface");

        if (subcommand === "create" || subcommand === "new") {
          await createInterface();
        } else if (subcommand === "list" || subcommand === "ls") {
          console.log(logo);
          const all = listInterfaces();
          console.log(chalk.bold("  Interfaces:"));
          for (const iface of all) {
            const tag = iface.type === "built-in"
              ? chalk.dim("[built-in]")
              : chalk.cyan("[custom]");
            console.log(`    ${tag} ${chalk.bold(iface.name)} — ${iface.description}`);
          }
          console.log();
        } else if (subcommand === "start" || subcommand === "run") {
          const ifaceName = args[2];
          if (!ifaceName) {
            console.log(chalk.red("  ✗ Usage: peely interface start <name>"));
            break;
          }
          // Try built-in interfaces first, then custom
          const interfaces = require("./src/interfaces");
          const mod = interfaces[ifaceName] || loadCustomInterface(ifaceName);
          if (!mod || typeof mod.start !== "function") {
            console.log(chalk.red(`  ✗ Interface "${ifaceName}" not found. Run peely interface list.`));
            break;
          }
          await mod.start();
        } else if (subcommand === "delete" || subcommand === "rm") {
          const ifaceName = args[2];
          if (!ifaceName) {
            console.log(chalk.red("  ✗ Usage: peely interface delete <name>"));
            break;
          }
          if (deleteInterface(ifaceName)) {
            console.log(chalk.green(`  ✓ Deleted interface "${ifaceName}".`));
          } else {
            console.log(chalk.red(`  ✗ Interface "${ifaceName}" not found.`));
          }
        } else {
          console.log(chalk.bold("  Interface commands:"));
          console.log(`    ${chalk.cyan("peely interface create")}         Create a new custom interface`);
          console.log(`    ${chalk.cyan("peely interface list")}           List all interfaces`);
          console.log(`    ${chalk.cyan("peely interface start <name>")}  Start a custom interface`);
          console.log(`    ${chalk.cyan("peely interface delete <name>")} Delete a custom interface`);
          console.log();
        }
        break;
      }

      case "pair":
        if (subcommand === "discord") {
          const codeOrSetup = args[2];
          if (codeOrSetup === "setup") {
            await setupDiscord();
          } else {
            await pairDiscord(codeOrSetup);
          }
        } else {
          console.log(chalk.red("  ✗ Unknown pair target. Use: peely pair discord <code>"));
        }
        break;

      case "discord":
        const discord = require("./src/interfaces/discord");
        await discord.start();
        break;

      case "daemon":
        // Daemon subcommands
        switch (subcommand) {
          case "start":
            await startDaemon();
            break;
          case "stop":
            await stopDaemon();
            break;
          case "restart":
            await restartDaemon();
            break;
          case "status":
            await daemonStatus();
            break;
          default:
            console.log(chalk.red("  ✗ Unknown daemon command."));
            console.log(chalk.dim("  Available: start, stop, restart, status"));
        }
        break;

      case "start":
        // Start peely in background (detached)
        await startBackground();
        break;

      case "stop":
        // Stop background peely
        await stopBackground();
        break;

      case "chat":
        const msg = args.slice(1).join(" ");
        if (!msg) {
          console.log(chalk.red("  ✗ Usage: peely chat <message>"));
          break;
        }
        await oneShot(msg);
        break;

      default:
        // First-run: auto-launch onboarding if never completed
        if (!config.get("onboarding.completed") && !command) {
          console.log(chalk.yellow("  First time? Running setup wizard...\n"));
          // Re-invoke with setup
          process.argv.push("setup");
          const { execFileSync } = require("child_process");
          try {
            require("child_process").execSync(`"${process.execPath}" "${__filename}" setup`, {
              stdio: "inherit",
              cwd: process.cwd(),
            });
          } catch (_) {}
          break;
        }

        // No command → launch TUI + Discord (if configured)
        const discordToken = config.get("interfaces.discord.token");
        if (discordToken) {
          const discordBot = require("./src/interfaces/discord");
          discordBot.start().catch((err) =>
            console.error(chalk.red("  Discord error:"), err.message)
          );
        }
        const tui = require("./src/interfaces/terminal");
        await tui.start();
        break;
    }
  } catch (err) {
    console.error(chalk.red("Error:"), err.message);
    process.exit(1);
  }
})();
