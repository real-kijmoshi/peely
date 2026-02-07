const fs = require("fs");
const path = require("path");
const config = require("../../utils/config");

const CUSTOM_DIR = path.join(__dirname, "..", "custom");

// Ensure custom dir exists
if (!fs.existsSync(CUSTOM_DIR)) fs.mkdirSync(CUSTOM_DIR, { recursive: true });

// ── Agent system prompt ──
const AGENT_PROMPT = `You are a plugin code generator for peely (a Node.js AI assistant).

Your job: generate a complete, working plugin file based on the user's description.

A plugin MUST export this exact structure:
\`\`\`js
module.exports = {
  name: "plugin_name",           // lowercase, no spaces, unique
  description: "What it does",
  tools: {
    tool_name: {
      description: "What this tool does",
      arguments: [
        { name: "arg1", type: "string", description: "..." },
        // supported types: string, number, boolean
      ],
      fn: async (arg1) => {
        // implementation — return a value (string, number, object)
        return "result";
      },
    },
    // more tools...
  },
};
\`\`\`

IMPORTANT — INVOKING THE AI FROM PLUGINS:
Plugins can trigger the AI to perform any task using ai.invoke(task).
This is the preferred way to make things happen — describe WHAT, let the AI figure out HOW.

\`\`\`js
// Lazy-load to avoid circular dependency
const ai = require("../../ai");
await ai.invoke("send a Discord DM to username saying hello");
await ai.invoke("search for weather in Warsaw and tell me");
\`\`\`

Use ai.invoke() when:
- A plugin needs to trigger an action after an event (timer, webhook, incoming message, etc.)
- A plugin receives data from an external source and wants the AI to process/respond
- You want the AI to decide which tools to use based on context

AVAILABLE UTILITIES:
- const { events } = require("../../utils/events") — event bus for async events
  events.on("eventName", callback) / events.emit("eventName", data)
  events.scheduleTimeout(id, ms, callback, meta) / events.cancelTimeout(id)

RULES:
1. Output ONLY the JavaScript code. No markdown fences, no explanations.
2. The plugin must be a valid CommonJS module (module.exports = {...}).
3. You may use require() for built-in Node.js modules (fs, path, http, https, crypto, url, etc.).
4. You may use require("axios") for HTTP requests — it's available.
5. Every tool must have: description, arguments array, and an async fn.
6. The fn must return a value (string preferred). Never return undefined.
7. Handle errors gracefully with try/catch inside fn.
8. Plugin name must be lowercase with underscores, no spaces.
9. Keep it simple and focused. One plugin = one domain of functionality.
10. Do NOT include any text outside the JavaScript code.
11. When the plugin needs to trigger actions, USE ai.invoke() instead of hardcoding logic.`;

// ── The actual tool functions ──

/**
 * Create a new custom plugin from a description
 */
const createPlugin = async (name, description) => {
  // Lazy-load AI to avoid circular dependency
  const ai = require("../../ai");

  const sanitizedName = name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  const filePath = path.join(CUSTOM_DIR, `${sanitizedName}.js`);

  if (fs.existsSync(filePath)) {
    return `Plugin "${sanitizedName}" already exists at plugins/custom/${sanitizedName}.js. Use edit_plugin to modify it.`;
  }

  // Use the AI as a code generation agent
  const agentMessages = [
    { role: "system", content: AGENT_PROMPT },
    {
      role: "user",
      content: `Create a plugin named "${sanitizedName}" that does the following:\n\n${description}`,
    },
  ];

  const response = await ai.rawChat(agentMessages, { temperature: 0 });
  let code = response?.content || "";

  // Strip markdown fences if the model wrapped it
  code = code.replace(/^```(?:js|javascript)?\n?/gm, "").replace(/```\s*$/gm, "").trim();

  if (!code.includes("module.exports")) {
    return "ERROR: The agent failed to generate valid plugin code. Try again with a clearer description.";
  }

  // Validate by trying to parse (basic check)
  try {
    new Function("require", "module", "exports", "__dirname", "__filename", code);
  } catch (err) {
    return `ERROR: Generated code has a syntax error: ${err.message}. Try again with a simpler description.`;
  }

  fs.writeFileSync(filePath, code, "utf-8");

  // Hot-reload: register the new plugin into the live tool registry
  try {
    const reloadCustomPlugins = require("../index").reloadCustomPlugins;
    if (reloadCustomPlugins) reloadCustomPlugins();
  } catch (_) {}

  return (
    `✅ Plugin "${sanitizedName}" created at plugins/custom/${sanitizedName}.js\n` +
    `It will be available after restart, or immediately if hot-reload is supported.\n\n` +
    `Generated code:\n${code.slice(0, 500)}${code.length > 500 ? "\n..." : ""}`
  );
};

/**
 * Edit an existing custom plugin
 */
const editPlugin = async (name, changes) => {
  const ai = require("../../ai");

  const sanitizedName = name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  const filePath = path.join(CUSTOM_DIR, `${sanitizedName}.js`);

  if (!fs.existsSync(filePath)) {
    return `Plugin "${sanitizedName}" not found in plugins/custom/. Use create_plugin first.`;
  }

  const currentCode = fs.readFileSync(filePath, "utf-8");

  const agentMessages = [
    { role: "system", content: AGENT_PROMPT },
    {
      role: "user",
      content:
        `Here is the current code for plugin "${sanitizedName}":\n\n${currentCode}\n\n` +
        `Apply these changes:\n${changes}\n\n` +
        `Output the COMPLETE updated plugin code.`,
    },
  ];

  const response = await ai.rawChat(agentMessages, { temperature: 0 });
  let code = response?.content || "";

  code = code.replace(/^```(?:js|javascript)?\n?/gm, "").replace(/```\s*$/gm, "").trim();

  if (!code.includes("module.exports")) {
    return "ERROR: The agent failed to generate valid plugin code. Try again.";
  }

  try {
    new Function("require", "module", "exports", "__dirname", "__filename", code);
  } catch (err) {
    return `ERROR: Updated code has a syntax error: ${err.message}. Try again.`;
  }

  // Backup old version
  const backupPath = filePath + ".bak";
  fs.copyFileSync(filePath, backupPath);

  fs.writeFileSync(filePath, code, "utf-8");

  try {
    const reloadCustomPlugins = require("../index").reloadCustomPlugins;
    if (reloadCustomPlugins) reloadCustomPlugins();
  } catch (_) {}

  return (
    `✅ Plugin "${sanitizedName}" updated. Backup saved as ${sanitizedName}.js.bak\n\n` +
    `Updated code:\n${code.slice(0, 500)}${code.length > 500 ? "\n..." : ""}`
  );
};

/**
 * List all custom plugins
 */
const listPlugins = () => {
  if (!fs.existsSync(CUSTOM_DIR)) return "No custom plugins directory found.";

  const files = fs
    .readdirSync(CUSTOM_DIR)
    .filter((f) => f.endsWith(".js"));

  if (files.length === 0) return "No custom plugins installed.";

  const list = files.map((f) => {
    try {
      // Read name/description without requiring (avoid side effects)
      const content = fs.readFileSync(path.join(CUSTOM_DIR, f), "utf-8");
      const nameMatch = content.match(/name:\s*["']([^"']+)["']/);
      const descMatch = content.match(/description:\s*["']([^"']+)["']/);
      return `• ${nameMatch ? nameMatch[1] : f} — ${descMatch ? descMatch[1] : "no description"}`;
    } catch (_) {
      return `• ${f} — (could not read)`;
    }
  });

  return `Custom plugins (${files.length}):\n${list.join("\n")}`;
};

/**
 * Delete a custom plugin
 */
const deletePlugin = (name) => {
  const sanitizedName = name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  const filePath = path.join(CUSTOM_DIR, `${sanitizedName}.js`);

  if (!fs.existsSync(filePath)) {
    return `Plugin "${sanitizedName}" not found.`;
  }

  fs.unlinkSync(filePath);
  // Also remove backup if exists
  const bak = filePath + ".bak";
  if (fs.existsSync(bak)) fs.unlinkSync(bak);

  return `🗑️ Plugin "${sanitizedName}" deleted. Restart to fully unload it.`;
};

module.exports = {
  name: "create_plugin",
  description: "[EXPERIMENTAL] Create, edit, list, and delete custom plugins using AI",
  tools: {
    create: {
      description: "Create a new custom plugin. The AI agent will generate the code from your description.",
      arguments: [
        { name: "name", type: "string", description: "Plugin name (lowercase, no spaces)" },
        { name: "description", type: "string", description: "Detailed description of what the plugin should do and what tools it should have" },
      ],
      fn: createPlugin,
    },
    edit: {
      description: "Edit an existing custom plugin. Describe what changes to make.",
      arguments: [
        { name: "name", type: "string", description: "Name of the plugin to edit" },
        { name: "changes", type: "string", description: "Description of changes to apply" },
      ],
      fn: editPlugin,
    },
    list: {
      description: "List all installed custom plugins",
      arguments: [],
      fn: listPlugins,
    },
    delete: {
      description: "Delete a custom plugin",
      arguments: [
        { name: "name", type: "string", description: "Name of the plugin to delete" },
      ],
      fn: deletePlugin,
    },
  },
};
