/**
 * Command & action helpers used by both cli.js (via terminal re-export)
 * and the interactive REPL.  Everything lives here so there is a single
 * source of truth — no separate "shared" directory.
 */

const chalk = require("chalk");
const fs = require("fs");
const path = require("path");
const config = require("../../utils/config");
const PATHS = require("../../utils/paths");

// ═══════════════════════════════════════════════════════════════════
//  Branding
// ═══════════════════════════════════════════════════════════════════

const logo = `
  ${chalk.magenta("╔══════════════════════════════╗")}
  ${chalk.magenta("║")}  ${chalk.bold.white("🍌 peely")} ${chalk.dim("— your AI assistant")} ${chalk.magenta("║")}
  ${chalk.magenta("╚══════════════════════════════╝")}
`;

const interactiveLogo = (() => {
  try {
    const p = path.join(__dirname, "..", "..", "assets", "ascii-logo.txt");
    const art = fs.readFileSync(p, "utf8");
    return (
      art
        .split("\n")
        .map((line) => (line.trim() === "" ? "" : chalk.magenta("  " + line)))
        .join("\n") +
      "\n\n" +
      chalk.bold.white("  🍌 peely") +
      " " +
      chalk.dim("— interactive mode") +
      "\n"
    );
  } catch (_) {
    return logo;
  }
})();

// ═══════════════════════════════════════════════════════════════════
//  Status
// ═══════════════════════════════════════════════════════════════════

const getStatusInfo = () => ({
  model: config.get("ai.model") || null,
  discordConfigured: !!config.get("interfaces.discord.token"),
  githubConfigured: !!config.get("github.token"),
});

/**
 * Print a formatted status block to stdout.
 * @param {{ messageCount?: number, background?: string }} extra
 */
const printStatus = (extra = {}) => {
  const info = getStatusInfo();
  const model = info.model || chalk.dim("not set");
  const discord = info.discordConfigured
    ? chalk.green("configured")
    : chalk.red("not set");
  const github = info.githubConfigured
    ? chalk.green("authorized")
    : chalk.red("not set");

  console.log();
  console.log(chalk.bold("  Status:"));
  console.log(`    AI Model:      ${model}`);
  console.log(`    GitHub:        ${github}`);
  console.log(`    Discord:       ${discord}`);
  if (typeof extra.messageCount === "number") {
    console.log(`    Messages:      ${extra.messageCount}`);
  }
  if (typeof extra.background === "string") {
    console.log(`    Background:    ${extra.background}`);
  }
  console.log();
};

// ═══════════════════════════════════════════════════════════════════
//  Discord pairing
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {string} code — 6-char pair code
 * @returns {{ ok: boolean, userId?: string, error?: string }}
 */
const pairDiscord = async (code) => {
  if (!code) return { ok: false, error: "Usage: peely pair discord <code>" };

  const { SqliteDriver, QuickDB } = require("quick.db");
  const db = new QuickDB({ driver: new SqliteDriver(PATHS.quickDb) });
  const record = await db.get(`pairCode_${code.toUpperCase()}`);

  let userId;
  if (record && typeof record === "object" && record.userId) {
    if (record.createdAt && Date.now() - record.createdAt > 5 * 60 * 1000) {
      await db.delete(`pairCode_${code.toUpperCase()}`);
      return { ok: false, error: `Invalid or expired pair code: ${code}` };
    }
    userId = record.userId;
  } else if (typeof record === "string") {
    userId = record;
  } else {
    return { ok: false, error: `Invalid or expired pair code: ${code}` };
  }

  await db.set(`paired_${userId}`, true);
  await db.delete(`pairCode_${code.toUpperCase()}`);
  config.set("interfaces.discord.pairedUsers", [
    ...(config.get("interfaces.discord.pairedUsers") || []),
    userId,
  ]);

  return { ok: true, userId };
};

// ═══════════════════════════════════════════════════════════════════
//  PID helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {string} pidFile — absolute path
 * @returns {{ alive: boolean, pid: string|null }}
 */
const checkPidFile = (pidFile) => {
  if (!fs.existsSync(pidFile)) return { alive: false, pid: null };
  const pid = fs.readFileSync(pidFile, "utf-8").trim();
  try {
    process.kill(Number(pid), 0);
    return { alive: true, pid };
  } catch (_) {
    return { alive: false, pid };
  }
};

// ═══════════════════════════════════════════════════════════════════
//  Command handlers (AI, settings, interfaces …)
// ═══════════════════════════════════════════════════════════════════

const chooseModel = async () => {
  const ai = require("../../ai");
  await ai.chooseModel();
};

const openSettings = async () => {
  const { settingsMenu } = require("../../utils/settings");
  await settingsMenu();
};

/**
 * Prompt for a Discord Bot Token and save it.
 * @returns {{ ok: boolean }}
 */
const setupDiscordToken = async () => {
  const { text, isCancel } = require("@clack/prompts");
  const token = await text({ message: "Enter your Discord Bot Token:" });
  if (!isCancel(token) && token && token.trim()) {
    config.set("interfaces.discord.token", token.trim());
    return { ok: true };
  }
  return { ok: false };
};

// ── Timers ────────────────────────────────────────────────────────

const getTimers = () => {
  const { events } = require("../../utils/events");
  return events.listScheduled();
};

const printTimers = () => {
  const scheduled = getTimers();
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
};

// ── Plugins ───────────────────────────────────────────────────────

const getPlugins = () => {
  const pluginModule = require("../../plugins");
  return pluginModule.plugins;
};

const printPlugins = () => {
  const plugins = getPlugins();
  console.log();
  console.log(chalk.bold("  Loaded plugins:"));
  for (const p of plugins) {
    const toolCount = p.tools ? Object.keys(p.tools).length : 0;
    console.log(`    • ${chalk.cyan(p.name)} — ${toolCount} tool(s) — ${p.description || ""}`);
  }
  console.log();
};

// ═══════════════════════════════════════════════════════════════════
//  Help text
// ═══════════════════════════════════════════════════════════════════

const CLI_COMMANDS = [
  { usage: "peely", desc: "Start interactive TUI" },
  { usage: "peely setup", desc: "First-time onboarding wizard" },
  { usage: "peely chat <message>", desc: "One-shot chat (connects to daemon)" },
  { usage: "peely daemon start", desc: "Start daemon in background" },
  { usage: "peely daemon stop", desc: "Stop daemon" },
  { usage: "peely daemon restart", desc: "Restart daemon (for updates)" },
  { usage: "peely daemon status", desc: "Show daemon status" },
  { usage: "peely start", desc: "Legacy: Run Discord bot in background" },
  { usage: "peely stop", desc: "Legacy: Stop background process" },
  { usage: "peely discord", desc: "Start Discord bot only" },
  { usage: "peely pair discord <code>", desc: "Pair Discord account" },
  { usage: "peely pair discord setup", desc: "Set Discord bot token" },
  { usage: "peely model", desc: "Choose AI model" },
  { usage: "peely settings", desc: "Edit config, tokens & API keys" },
  { usage: "peely status", desc: "Show config status" },
  { usage: "peely help", desc: "Show this help" },
];

const SLASH_COMMANDS = [
  { usage: "/help", desc: "Show this help" },
  { usage: "/clear", desc: "Clear conversation history" },
  { usage: "/model", desc: "Switch AI model" },
  { usage: "/settings", desc: "Edit config, tokens & API keys" },
  { usage: "/timers", desc: "Show active timers" },
  { usage: "/plugins", desc: "List loaded plugins" },
  { usage: "/pair discord <code>", desc: "Pair a Discord account" },
  { usage: "/status", desc: "Show system status" },
  { usage: "/exit", desc: "Exit peely" },
];

const printCliHelp = (headerLogo) => {
  console.log(headerLogo);
  console.log(chalk.bold("  Usage:"));
  for (const { usage, desc } of CLI_COMMANDS) {
    console.log(`    ${chalk.cyan(usage.padEnd(30))} ${desc}`);
  }
  console.log();
};

const buildSlashHelp = () => {
  const lines = [chalk.bold("  Commands:")];
  for (const { usage, desc } of SLASH_COMMANDS) {
    lines.push(`    ${chalk.cyan(usage.padEnd(24))} ${desc}`);
  }
  return "\n" + lines.join("\n") + "\n";
};

// ═══════════════════════════════════════════════════════════════════
//  Exports
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  // Branding
  logo,
  interactiveLogo,

  // Status
  getStatusInfo,
  printStatus,

  // Discord
  pairDiscord,

  // PID
  checkPidFile,

  // Commands
  chooseModel,
  openSettings,
  setupDiscordToken,
  getTimers,
  printTimers,
  getPlugins,
  printPlugins,

  // Help
  CLI_COMMANDS,
  SLASH_COMMANDS,
  printCliHelp,
  buildSlashHelp,
};
