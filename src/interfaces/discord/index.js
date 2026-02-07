const { Client, Events, GatewayIntentBits, Partials, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require("discord.js");
const config = require("../../utils/config");
const ai = require("../../ai");
const memory = require("../../utils/memory");
const chalk = require("chalk");
const fs = require("fs");

// ── Ensure data dir ──
if (!fs.existsSync("./data")) fs.mkdirSync("./data", { recursive: true });

let db = null;
const getDb = async () => {
  if (db) return db;
  const { SqliteDriver, QuickDB } = require("quick.db");
  try {
    const driver = new SqliteDriver("./data/quick.db");
    db = new QuickDB({ driver });
  } catch (err) {
    console.error("DB init error, falling back to in-memory DB:", err?.message || String(err));
    db = new QuickDB();
  }
  return db;
};

// ── Per-user conversation memory (persistent) ──
// In-memory cache backed by disk
const conversations = new Map();

const getConversation = (userId) => {
  if (!conversations.has(userId)) {
    // Load from disk on first access
    conversations.set(userId, memory.load(`discord-${userId}`));
  }
  return conversations.get(userId);
};

const saveConversation = (userId) => {
  const history = conversations.get(userId);
  if (history) memory.save(`discord-${userId}`, history);
};

// ── Slash commands definition ──
const commands = [
  new SlashCommandBuilder()
    .setName("pair")
    .setDescription("Get a pairing code to link your Discord account with peely"),
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask peely a question")
    .addStringOption((opt) =>
      opt.setName("question").setDescription("Your question").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clear your conversation history with peely"),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show peely status"),
];

// ── Build embed helpers ──
const peelyEmbed = (text) =>
  new EmbedBuilder()
    .setColor(0xd946ef)
    .setAuthor({ name: "🍌 peely" })
    .setDescription(String(text || "..."))
    .setTimestamp();

const errorEmbed = (text) =>
  new EmbedBuilder()
    .setColor(0xef4444)
    .setAuthor({ name: "🍌 peely" })
    .setDescription(`❌ ${String(text || "Unknown error")}`)
    .setTimestamp();

// ── Client setup ──
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
  ],
});

// ── Ready event ──
client.once(Events.ClientReady, async (readyClient) => {
  console.log(chalk.green(`  ✓ Discord bot online as ${readyClient.user.tag}`));

  // Wire client into discord plugin so tools can send messages
  try {
    const discordPlugin = require("../../plugins/plugins/discord");
    discordPlugin.setClient(client);
    console.log(chalk.dim("  Discord plugin connected."));
  } catch (_) {}

  // Register slash commands
  try {
    const rest = new REST({ version: "10" }).setToken(config.get("interfaces.discord.token"));
    await rest.put(Routes.applicationCommands(readyClient.user.id), {
      body: commands.map((c) => c.toJSON()),
    });
    console.log(chalk.dim("  Slash commands registered."));
  } catch (err) {
    console.error(chalk.red("  ✗ Failed to register commands:"), err.message);
  }
});

// ── Interaction handler (slash commands) ──
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user } = interaction;

  try {
    // Defer immediately to avoid 3-second timeout
    const ephemeral = commandName !== "ask";
    await interaction.deferReply({ ephemeral });

    if (commandName === "pair") {
      const database = await getDb();
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      await database.set(`pairCode_${code}`, user.id);

      // Expire after 5 minutes
      setTimeout(async () => {
        await database.delete(`pairCode_${code}`).catch(() => {});
      }, 5 * 60 * 1000);

      await interaction.editReply({
        embeds: [
          peelyEmbed(
            `🔗 **Your pairing code:** \`${code}\`\n\n` +
              `Use it within 5 minutes:\n` +
              `• **CLI:** \`peely pair discord ${code}\`\n` +
              `• **TUI:** \`/pair discord ${code}\``
          ),
        ],
      });
      return;
    }

    if (commandName === "ask") {
      const question = interaction.options.getString("question");

      const history = getConversation(user.id);
      history.push({ role: "user", content: question });

      const response = await ai.chat(history);
      const reply = response.content || "...";
      history.push({ role: "assistant", content: reply });

      // Truncate if too long for Discord
      const truncated =
        reply.length > 4000 ? reply.slice(0, 3990) + "\n..." : reply;

      const embed = peelyEmbed(truncated);
      if (response.toolResults && response.toolResults.length > 0) {
        embed.setFooter({
          text: `Tools used: ${response.toolResults.map((r) => r.id).join(", ")}`,
        });
      }

      saveConversation(user.id);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (commandName === "clear") {
      conversations.delete(user.id);
      memory.clear(`discord-${user.id}`);
      await interaction.editReply({
        embeds: [peelyEmbed("🗑️ Conversation cleared!")],
      });
      return;
    }

    if (commandName === "status") {
      const model = config.get("ai.model") || "not set";
      const paired = (config.get("interfaces.discord.pairedUsers") || []).includes(user.id);
      const msgCount = (getConversation(user.id) || []).length;

      await interaction.editReply({
        embeds: [
          peelyEmbed(
            `📊 **Status**\n` +
              `• Model: \`${model}\`\n` +
              `• Paired: ${paired ? "✅" : "❌"}\n` +
              `• Messages: ${msgCount}`
          ),
        ],
      });
      return;
    }
  } catch (err) {
    console.error("Interaction error:", err);
    const reply = { embeds: [errorEmbed(err.message)] };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply).catch(() => {});
    } else {
      await interaction.reply({ ...reply, ephemeral: true }).catch(() => {});
    }
  }
});

// ── Message handler (all messages) ──
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  console.log(chalk.dim(`  [msg] ${message.author.tag}: ${message.content.slice(0, 50)}`));

  let content = message.content.replace(/<@!?\d+>/g, "").trim();
  if (!content) return;

  try {
    await message.channel.sendTyping();

    const history = getConversation(message.author.id);
    history.push({ role: "user", content });

    const response = await ai.chat(history);
    const reply = response.content || "...";
    history.push({ role: "assistant", content: reply });

    // Keep history manageable
    if (history.length > 80) {
      history.splice(0, history.length - 60);
    }
    saveConversation(message.author.id);

    const truncated =
      reply.length > 4000 ? reply.slice(0, 3990) + "\n..." : reply;

    const embed = peelyEmbed(truncated);
    if (response.toolResults && response.toolResults.length > 0) {
      embed.setFooter({
        text: `Tools: ${response.toolResults.map((r) => r.id).join(", ")}`,
      });
    }

    await message.reply({ embeds: [embed] });
  } catch (err) {
    console.error("Message handler error:", err);
    await message.reply({ embeds: [errorEmbed(err?.message || String(err))] }).catch(() => {});
  }
});

// ── Start function ──
const start = async () => {
  const token = config.get("interfaces.discord.token");
  if (!token) {
    const { text, intro } = require("@clack/prompts");
    intro("Discord Bot Setup");
    const newToken = await text({ message: "Enter your Discord Bot Token:" });
    if (typeof newToken !== "string" || !newToken.trim()) {
      throw new Error("Discord token is required.");
    }
    config.set("interfaces.discord.token", newToken.trim());
    await client.login(newToken.trim());
  } else {
    await client.login(token);
  }

  console.log(chalk.dim("  Discord bot starting..."));

  // Keep alive
  return new Promise(() => {});
};

module.exports = { start, client };
