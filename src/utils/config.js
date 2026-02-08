const fs = require("fs");
const PATHS = require("./paths");

const CONFIG_PATH = PATHS.config;

if (!fs.existsSync(CONFIG_PATH)) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({}, null, 4), { mode: 0o600 });
}

// In-memory cache to avoid redundant synchronous disk I/O
let _configCache = null;

const readConfig = () => {
  if (_configCache) return _configCache;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    _configCache = JSON.parse(raw || "{}");
    return _configCache;
  } catch (err) {
    return {};
  }
};

const writeConfig = (cfg) => {
  _configCache = cfg;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 4), { mode: 0o600 });
};

const get = (key) => {
  if (!key) return undefined;
  const cfg = readConfig();
  const parts = key.split(".");
  let cur = cfg;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
};

const set = (key, value) => {
  if (!key) return;
  const cfg = readConfig();
  const parts = key.split(".");
  let cur = cfg;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
  writeConfig(cfg);
};

module.exports = { get, set };
