// ── Shared Discord client reference ──
// Set by the Discord interface on boot via setClient()
let client = null;

const setClient = (c) => {
  client = c;
};

const getClient = () => client;

// ── Helper: resolve a user by username, display name, or ID ──
const resolveUser = async (query) => {
  if (!client) throw new Error("Discord bot is not running.");

  // Try by ID first
  if (/^\d{17,20}$/.test(query)) {
    try {
      return await client.users.fetch(query);
    } catch (_) {}
  }

  // Search through all cached guild members
  for (const [, guild] of client.guilds.cache) {
    try {
      await guild.members.fetch({ query, limit: 5 });
    } catch (_) {}

    const member = guild.members.cache.find(
      (m) =>
        m.user.username.toLowerCase() === query.toLowerCase() ||
        m.displayName.toLowerCase() === query.toLowerCase() ||
        m.user.tag.toLowerCase() === query.toLowerCase()
    );

    if (member) return member.user;
  }

  throw new Error(`Could not find user "${query}".`);
};

// ── Helper: resolve a channel by name or ID ──
const resolveChannel = async (query) => {
  if (!client) throw new Error("Discord bot is not running.");

  // By ID
  if (/^\d{17,20}$/.test(query)) {
    try {
      return await client.channels.fetch(query);
    } catch (_) {}
  }

  // By name across guilds
  const name = query.replace(/^#/, "").toLowerCase();
  for (const [, guild] of client.guilds.cache) {
    const ch = guild.channels.cache.find(
      (c) => c.name.toLowerCase() === name && c.isTextBased()
    );
    if (ch) return ch;
  }

  throw new Error(`Could not find channel "${query}".`);
};

// ── Tools ──

const sendDM = async (username, message) => {
  const user = await resolveUser(username);
  const dm = await user.createDM();
  await dm.send(message);
  return `Message sent to ${user.tag} via DM.`;
};

const sendToChannel = async (channel, message) => {
  const ch = await resolveChannel(channel);
  if (!ch.isTextBased()) throw new Error(`Channel #${ch.name} is not a text channel.`);
  await ch.send(message);
  return `Message sent to #${ch.name}.`;
};

const listChannels = async () => {
  if (!client) throw new Error("Discord bot is not running.");
  const channels = [];
  for (const [, guild] of client.guilds.cache) {
    for (const [, ch] of guild.channels.cache) {
      if (ch.isTextBased()) {
        channels.push({ name: ch.name, id: ch.id, guild: guild.name });
      }
    }
  }
  return channels.length > 0
    ? channels.map((c) => `#${c.name} (${c.guild})`).join(", ")
    : "No text channels found.";
};

const listMembers = async () => {
  if (!client) throw new Error("Discord bot is not running.");
  const members = [];
  for (const [, guild] of client.guilds.cache) {
    try {
      await guild.members.fetch({ limit: 50 });
    } catch (_) {}
    for (const [, m] of guild.members.cache) {
      if (!m.user.bot) {
        members.push({ name: m.displayName, tag: m.user.tag, guild: guild.name });
      }
    }
  }
  return members.length > 0
    ? members.map((m) => `${m.name} (${m.tag})`).join(", ")
    : "No members found.";
};

module.exports = {
  name: "discord",
  description: "Send messages and interact with Discord",
  setClient,
  getClient,
  tools: {
    send_dm: {
      description: "Send a direct message to a Discord user by username or display name",
      arguments: [
        { name: "username", type: "string", description: "The username or display name of the recipient" },
        { name: "message", type: "string", description: "The message text to send" },
      ],
      fn: sendDM,
    },
    send_to_channel: {
      description: "Send a message to a Discord text channel by name or ID",
      arguments: [
        { name: "channel", type: "string", description: "The channel name (e.g. general) or ID" },
        { name: "message", type: "string", description: "The message text to send" },
      ],
      fn: sendToChannel,
    },
    list_channels: {
      description: "List all text channels the bot can see",
      arguments: [],
      fn: listChannels,
    },
    list_members: {
      description: "List all non-bot members the bot can see",
      arguments: [],
      fn: listMembers,
    },
  },
};
