/**
 * Settings menu — edit config values, delete tokens & API keys.
 * Uses @clack/prompts for a polished interactive UI.
 *
 * When called from the TUI, the caller must close its readline first
 * and recreate it after this returns (see terminal/index.js).
 */

const { intro, outro, select, text, confirm, note, isCancel, log } = require("@clack/prompts");
const chalk = require("chalk");
const config = require("./config");
const PATHS = require("./paths");

const ENTRIES = [
  { key: "ai.model",                  label: "AI Model",                sensitive: false },
  { key: "ai.openaiKey",              label: "OpenAI API Key",          sensitive: true },
  { key: "github.token",              label: "GitHub Token",            sensitive: true },
  { key: "interfaces.discord.token",  label: "Discord Bot Token",      sensitive: true },
  { key: "copilot.token",             label: "Copilot Token (auto)",    sensitive: true },
];

const mask = (val) => {
  if (!val) return "not set";
  const s = String(val);
  return s.slice(0, 6) + "•".repeat(Math.min(s.length - 6, 20));
};

/** Build a summary of current config as a formatted string for @clack note() */
const buildConfigSummary = () =>
  ENTRIES.map(({ key, label, sensitive }) => {
    const val = config.get(key);
    if (!val) return `${label}:  ${chalk.dim("not set")}`;
    return `${label}:  ${chalk.green(sensitive ? mask(val) : String(val))}`;
  }).join("\n");

const settingsMenu = async () => {
  intro(chalk.magenta("⚙️  peely settings"));

  // Main loop
  while (true) {
    note(buildConfigSummary(), "Current Configuration");

    const action = await select({
      message: "What would you like to do?",
      options: [
        { value: "edit",          label: "📝  Edit a setting",              hint: "change model, tokens, keys" },
        { value: "delete",        label: "🗑️   Delete a token / API key",   hint: "remove stored credentials" },
        { value: "clear_history", label: "🧹  Clear conversation history",  hint: "wipe all chat memory" },
        { value: "back",          label: "←   Back" },
      ],
    });

    if (isCancel(action) || action === "back") break;

    // ── Edit ──
    if (action === "edit") {
      // Show current values as hints in the select list
      const editOptions = ENTRIES.map((e) => {
        const val = config.get(e.key);
        const hint = val
          ? (e.sensitive ? mask(val) : String(val))
          : "not set";
        return { value: e.key, label: e.label, hint };
      });

      const which = await select({
        message: "Which setting to edit?",
        options: [
          ...editOptions,
          { value: "back", label: "←  Back" },
        ],
      });

      if (isCancel(which) || which === "back") continue;

      if (which === "ai.model") {
        // Use the AI module's model chooser (also uses @clack)
        try {
          const ai = require("../ai");
          await ai.chooseModel();
        } catch (_) {}
        continue;
      }

      const entry = ENTRIES.find((e) => e.key === which);
      const currentVal = config.get(which);

      if (currentVal) {
        log.info(`Current value: ${chalk.cyan(entry.sensitive ? mask(currentVal) : currentVal)}`);
      }

      const newVal = await text({
        message: `New value for ${entry.label}:`,
        placeholder: currentVal ? "(leave empty to keep current)" : "paste value here",
      });

      if (isCancel(newVal)) continue;

      const trimmed = (newVal || "").trim();
      if (trimmed) {
        config.set(which, trimmed);
        log.success(`${entry.label} updated.`);
      } else {
        log.info("Kept existing value.");
      }
    }

    // ── Delete ──
    if (action === "delete") {
      const deletable = ENTRIES.filter((e) => e.sensitive && config.get(e.key));

      if (deletable.length === 0) {
        log.warn("No tokens or API keys are currently stored.");
        continue;
      }

      // Show what's stored so the user knows what they're deleting
      const deleteNote = deletable
        .map((e) => `${e.label}:  ${chalk.green(mask(config.get(e.key)))}`)
        .join("\n");
      note(deleteNote, "Stored Credentials");

      const which = await select({
        message: "Which token/key to delete?",
        options: [
          ...deletable.map((e) => ({ value: e.key, label: e.label })),
          { value: "all",  label: "⚠  Delete ALL tokens", hint: "removes everything" },
          { value: "back", label: "←  Back" },
        ],
      });

      if (isCancel(which) || which === "back") continue;

      if (which === "all") {
        const sure = await confirm({ message: "Delete ALL tokens and API keys?" });
        if (isCancel(sure) || !sure) continue;

        for (const k of ["ai.openaiKey", "github.token", "interfaces.discord.token", "copilot.token", "copilot.expiresAt"]) {
          config.set(k, undefined);
        }
        log.success("All tokens deleted.");
      } else {
        const sure = await confirm({ message: `Delete ${which}?` });
        if (isCancel(sure) || !sure) continue;

        config.set(which, undefined);
        if (which === "copilot.token") config.set("copilot.expiresAt", undefined);
        log.success(`${which} deleted.`);
      }
    }

    // ── Clear history ──
    if (action === "clear_history") {
      const sure = await confirm({ message: "Clear ALL conversation history? This cannot be undone." });
      if (isCancel(sure) || !sure) continue;

      const fs = require("fs");
      const path = require("path");
      const memory = require("./memory");
      memory.clear("terminal");

      const convDir = PATHS.conversations;
      let count = 0;
      try {
        const files = fs.readdirSync(convDir);
        for (const f of files) {
          fs.unlinkSync(path.join(convDir, f));
          count++;
        }
      } catch (_) {}
      log.success(`Cleared ${count} conversation file(s).`);
    }
  }

  outro(chalk.dim("Settings saved."));
};

module.exports = { settingsMenu };
