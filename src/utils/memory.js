const fs = require("fs");
const path = require("path");
const PATHS = require("./paths");

const BASE = PATHS.conversations;

const ensureDir = () => {
  if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { recursive: true });
};

const filenameFor = (key) => {
  const safe = String(key).replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(BASE, `${safe}.json`);
};

const load = (key) => {
  try {
    ensureDir();
    const file = filenameFor(key);
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    return [];
  }
};

const save = (key, data) => {
  ensureDir();
  const file = filenameFor(key);
  try {
    fs.writeFileSync(file, JSON.stringify(data || [], null, 2));
  } catch (err) {
    // best-effort; do not throw to avoid crashing interfaces
    console.error("memory.save error:", err?.message || String(err));
  }
};

const clear = (key) => {
  try {
    const file = filenameFor(key);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (err) {
    // ignore
  }
};

module.exports = { load, save, clear };
