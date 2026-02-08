const fs = require("fs");
const path = require("path");
const PATHS = require("../utils/paths");

// Built-in interfaces (lazy-loaded to avoid side effects on require)
const builtIn = {
  get terminal() {
    return require("./terminal");
  },
  get discord() {
    return require("./discord");
  },
};

// Auto-discover custom interfaces from ~/.peely/interfaces/custom/
const customDir = PATHS.customInterfaces;
const custom = {};

if (fs.existsSync(customDir)) {
  for (const entry of fs.readdirSync(customDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const indexPath = path.join(customDir, entry.name, "index.js");
    if (!fs.existsSync(indexPath)) continue;
    // Lazy-load via getter so broken interfaces don't crash everything
    Object.defineProperty(custom, entry.name, {
      get() {
        return require(indexPath);
      },
      enumerable: true,
      configurable: true,
    });
  }
}

module.exports = { ...builtIn, ...custom };