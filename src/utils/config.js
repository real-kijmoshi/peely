const fs = require("fs");
const PATHS = require("./paths");

const CONFIG_PATH = PATHS.config;

if (!fs.existsSync(CONFIG_PATH)) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({}, null, 4));
}

const readConfig = () => {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(raw || "{}");
  } catch (err) {
    return {};
  }
};

const writeConfig = (cfg) => {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 4));
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
