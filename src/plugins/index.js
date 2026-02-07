const fs = require("fs");
const path = require("path");

const BUILTIN_DIR = path.join(__dirname, "plugins");
const CUSTOM_DIR = path.join(__dirname, "custom");

// Ensure custom dir exists
if (!fs.existsSync(CUSTOM_DIR)) fs.mkdirSync(CUSTOM_DIR, { recursive: true });

// ── Load built-in plugins ──
const builtinList = fs.readdirSync(BUILTIN_DIR).filter((f) => f.endsWith(".js"));
const plugins = builtinList.map((f) => {
    const plugin = require(`./plugins/${f}`);
    if (plugin.initialize) plugin.initialize();
    return plugin;
});

// ── Load custom plugins ──
const loadCustomPlugins = () => {
    const customFiles = fs.readdirSync(CUSTOM_DIR).filter((f) => f.endsWith(".js"));
    const loaded = [];
    for (const f of customFiles) {
        try {
            const fullPath = path.join(CUSTOM_DIR, f);
            // Clear require cache so edits are picked up
            delete require.cache[require.resolve(fullPath)];
            const plugin = require(fullPath);
            if (plugin.name && plugin.tools) {
                loaded.push(plugin);
            }
        } catch (err) {
            console.error(`⚠️  Failed to load custom plugin ${f}:`, err.message);
        }
    }
    return loaded;
};

// Initial load of custom plugins
const customPlugins = loadCustomPlugins();
plugins.push(...customPlugins);

// ── Hot-reload custom plugins (called by create_plugin tool) ──
const reloadCustomPlugins = () => {
    // Remove old custom plugins from the array
    for (let i = plugins.length - 1; i >= 0; i--) {
        if (customPlugins.includes(plugins[i])) {
            plugins.splice(i, 1);
        }
    }
    customPlugins.length = 0;

    const freshCustom = loadCustomPlugins();
    customPlugins.push(...freshCustom);
    plugins.push(...freshCustom);

    console.log(`🔄 Reloaded ${freshCustom.length} custom plugin(s)`);
    return freshCustom;
};

module.exports = {
    plugins,
    reloadCustomPlugins,
};