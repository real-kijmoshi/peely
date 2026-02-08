#!/usr/bin/env node

const config = require("./src/utils/config");
const chalk = require("chalk");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const PATHS = require("./src/utils/paths");
const tui = require("./src/interfaces/terminal");
const { logo, pairDiscord: sharedPairDiscord, printStatus, checkPidFile } = tui;

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

require("./src/utils/autoupdateInfo").checkUpdate().catch(() => {});

const PID_FILE = PATHS.pidFile;
const DAEMON_PID_FILE = PATHS.daemonPidFile;

const startBackground = async () => {
  const { alive, pid: oldPid } = checkPidFile(PID_FILE);
  if (alive) {
    console.log(chalk.yellow(`  ✗ peely already running (pid ${oldPid}).`));
    return;
  }
  // Clean stale PID file
  if (oldPid && !alive && fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);

  const logFile = PATHS.log;
  const out = fs.openSync(logFile, "a");

  const child = spawn(process.execPath, [__filename, "discord"], {
    detached: true,
    stdio: ["ignore", out, out],
  });

  child.unref();
  fs.closeSync(out); // Close FD in parent to prevent leak
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
  const { alive, pid: oldPid } = checkPidFile(DAEMON_PID_FILE);
  if (alive) {
    console.log(chalk.yellow(`  ✗ Daemon already running (pid ${oldPid}).`));
    return;
  }
  // Clean stale PID file
  if (oldPid && !alive && fs.existsSync(DAEMON_PID_FILE)) fs.unlinkSync(DAEMON_PID_FILE);

  const logFile = PATHS.daemonLog;
  const out = fs.openSync(logFile, "a");

  const daemonPath = path.join(__dirname, "src/daemon/index.js");
  const child = spawn(process.execPath, [daemonPath], {
    detached: true,
    stdio: ["ignore", out, out],
  });

  child.unref();
  fs.closeSync(out); // Close FD in parent to prevent leak
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
  } catch (_ipcErr) {
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
    } catch (killErr) {
      console.log(chalk.red("  ✗ Failed to stop daemon:"), killErr.message);
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
  
  const { alive: daemonRunning, pid: daemonPid } = checkPidFile(DAEMON_PID_FILE);
  
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

  let bgStatus = chalk.dim("not running");
  const { alive, pid } = checkPidFile(PID_FILE);
  if (alive) {
    bgStatus = chalk.green(`running (pid ${pid})`);
  } else if (pid) {
    bgStatus = chalk.yellow("stale pid file");
  }

  printStatus({ background: bgStatus });
};

const pairDiscord = async (code) => {
  const result = await sharedPairDiscord(code);
  if (result.ok) {
    console.log(chalk.green(`  ✓ Successfully paired Discord user ${result.userId}!`));
  } else {
    console.log(chalk.red(`  ✗ ${result.error}`));
  }
};

const setupDiscord = async () => {
  console.log(logo);
  const result = await tui.setupDiscordToken();
  if (result.ok) {
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
    const { alive: daemonRunning } = checkPidFile(DAEMON_PID_FILE);
    
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
        tui.printCliHelp(logo);
        break;

      case "status":
        showStatus();
        break;

      case "model":
        await tui.chooseModel();
        break;

      case "settings":
        await tui.openSettings();
        break;

      case "setup":
      case "onboarding":
      case "init": {
        const { intro: setupIntro, confirm, isCancel } = require("@clack/prompts");
        console.log(logo);
        setupIntro(chalk.magenta("Welcome to peely! Let's get you set up."));

        // Step 1: AI provider
        console.log();
        console.log(chalk.bold("  Step 1: ") + "Connect to an AI provider");
        await tui.chooseModel();

        // Step 2: Interfaces
        console.log();
        console.log(chalk.bold("  Step 2: ") + "Configure interfaces");
        console.log();

        const wantDiscord = await confirm({ message: "Set up Discord bot?" });
        if (isCancel(wantDiscord)) break;

        if (wantDiscord) {
          const result = await tui.setupDiscordToken();
          if (result.ok) {
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
          // Re-run as setup by modifying argv and re-entering the switch
          process.argv.push("setup");
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
        await tui.start();
        break;
    }
  } catch (err) {
    console.error(chalk.red("Error:"), err.message);
    process.exit(1);
  }
})();
