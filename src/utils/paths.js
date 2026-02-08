const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Persistent data directory for peely.
 *
 * All user data (config, conversations, custom plugins, logs, pid files, db)
 * lives under ~/.peely/ so nothing is lost when the package is updated or
 * reinstalled via npm.
 */
const DATA_HOME = path.join(os.homedir(), ".peely");

// Ensure the top-level directory tree exists on first require()
const dirs = [
  DATA_HOME,
  path.join(DATA_HOME, "data"),
  path.join(DATA_HOME, "data", "conversations"),
  path.join(DATA_HOME, "plugins", "custom"),
];

for (const d of dirs) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ── Resolved paths used throughout the app ──
const PATHS = {
  /** Root of all persistent user data */
  home: DATA_HOME,

  /** config.json */
  config: path.join(DATA_HOME, "config.json"),

  /** data/ directory (logs, quick.db, etc.) */
  data: path.join(DATA_HOME, "data"),

  /** data/conversations/ */
  conversations: path.join(DATA_HOME, "data", "conversations"),

  /** data/quick.db (Discord pairing database) */
  quickDb: path.join(DATA_HOME, "data", "quick.db"),

  /** data/peely.log */
  log: path.join(DATA_HOME, "data", "peely.log"),

  /** data/daemon.log */
  daemonLog: path.join(DATA_HOME, "data", "daemon.log"),

  /** .peely.pid */
  pidFile: path.join(DATA_HOME, ".peely.pid"),

  /** .peely-daemon.pid */
  daemonPidFile: path.join(DATA_HOME, ".peely-daemon.pid"),

  /** plugins/custom/ directory for user-created plugins */
  customPlugins: path.join(DATA_HOME, "plugins", "custom"),
};

// ── One-time migration from old (in-project) layout ──
// Runs once; drops a marker file so it never re-runs.
const MIGRATION_MARKER = path.join(DATA_HOME, ".migrated");

const migrate = () => {
  if (fs.existsSync(MIGRATION_MARKER)) return;

  // Try to find the old project-local data.  The old code used process.cwd()
  // or __dirname-relative paths.  We check the package root (two levels up
  // from this file) AND cwd, favouring whichever has actual data.
  const packageRoot = path.resolve(__dirname, "..", "..");
  const candidates = [packageRoot, process.cwd()].filter(Boolean);
  // de-duplicate
  const seen = new Set();
  const roots = [];
  for (const c of candidates) {
    const resolved = path.resolve(c);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      roots.push(resolved);
    }
  }

  for (const root of roots) {
    // config.json
    const oldConfig = path.join(root, "config.json");
    if (fs.existsSync(oldConfig) && !fs.existsSync(PATHS.config)) {
      try {
        fs.copyFileSync(oldConfig, PATHS.config);
      } catch (_) {}
    }

    // data/conversations/*.json
    const oldConvDir = path.join(root, "data", "conversations");
    if (fs.existsSync(oldConvDir)) {
      try {
        for (const f of fs.readdirSync(oldConvDir)) {
          const src = path.join(oldConvDir, f);
          const dst = path.join(PATHS.conversations, f);
          if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
        }
      } catch (_) {}
    }

    // data/quick.db
    const oldDb = path.join(root, "data", "quick.db");
    if (fs.existsSync(oldDb) && !fs.existsSync(PATHS.quickDb)) {
      try {
        fs.copyFileSync(oldDb, PATHS.quickDb);
      } catch (_) {}
    }

    // custom plugins (old location: src/plugins/custom/)
    const oldCustom = path.join(root, "src", "plugins", "custom");
    if (fs.existsSync(oldCustom)) {
      try {
        for (const f of fs.readdirSync(oldCustom)) {
          const src = path.join(oldCustom, f);
          const dst = path.join(PATHS.customPlugins, f);
          if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
        }
      } catch (_) {}
    }
  }

  // Write marker so migration is never re-attempted
  try {
    fs.writeFileSync(MIGRATION_MARKER, new Date().toISOString(), "utf-8");
  } catch (_) {}
};

migrate();

module.exports = PATHS;
