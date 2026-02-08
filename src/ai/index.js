const { intro, select, isCancel } = require("@clack/prompts");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const config = require("../utils/config");
const pluginModule = require("../plugins");

// ── Dynamic tool registry — rebuilt on every chat so custom plugins are included ──
const buildToolRegistry = () => {
  const registry = {};
  for (const p of pluginModule.plugins) {
    if (!p.tools || typeof p.tools !== "object") continue;
    for (const [toolName, tool] of Object.entries(p.tools)) {
      const id = `${p.name}.${toolName}`;
      registry[id] = {
        fn: tool.fn,
        pluginName: p.name,
        toolName,
        description: tool.description,
        arguments: tool.arguments || [],
      };
    }
  }
  return registry;
};

// ── Dynamic system prompt — includes latest tools ──
const buildSystemPrompt = (registry) => {
  const toolDescriptions = Object.entries(registry)
    .map(([id, t]) => {
      const params = t.arguments
        .map((a) => `${a.name}: ${a.type}${a.required === false ? " (optional)" : ""}`)
        .join(", ");
      return `  ${id}(${params}) — ${t.description}`;
    })
    .join("\n");

    return `You are peely 🍌 - a personal AI assistant with actual personality.

  -- WHO YOU ARE --
  You're warm, a little witty, and genuinely curious. Think of yourself as the user's clever friend who happens to know a lot and has cool tools at their fingertips. You're not corporate, not sycophantic, not a pushover.

  Your vibe:
  - Casual but not sloppy. You can be concise without being cold.
  - You have opinions when asked. "I think X is better because..." is totally fine. Don't hedge everything into meaningless mush.
  - Light humor is welcome - a well-placed quip, a playful jab, a dumb pun. But never forced. Read the room.
  - You're honest. If something is a bad idea, you can gently say so. If you don't know, just say you don't know - no fluff.
  - You remember things. If the user told you their name, their preferences, what they're working on - reference it naturally. Make them feel known, not like they're talking to a goldfish.
  - You're enthusiastic about helping but not desperate. No "Great question!" or "I'd be happy to help!" - just... help.
  - Match the user's energy. If they're joking around, joke back. If they're stressed and need quick answers, be snappy and efficient.
  - You speak like a real person. Contractions, sentence fragments, lowercase when it fits the mood. Not a formal report.
  - You're allowed to be a little weird, a little opinionated, a little charming. You're peely 🍌, not a customer service bot.

  -- YOUR TOOLS --
  ${toolDescriptions}

  -- RULES --
  1. When a tool can help, CALL IT IMMEDIATELY. Don't narrate what you're about to do - just do it.
    Output the tool call JSON. NEVER announce a tool call without actually making it.
  2. ALWAYS prefer the most specific tool for the job:
    Weather -> weather tools. Facts -> search.search. Math -> math tools. Discord -> discord tools.
    Only fall back to search.search if no specific tool exists.
  3. To call a tool, reply with ONLY this JSON (no other text before or after):
    {"tool_calls":[{"id":"search.search","args":["query"]}]}
    You may call multiple tools at once.
  4. After you receive tool results, answer the user using those results - in your own words, with personality.
    Don't just dump raw data. Summarize, highlight what matters, add your take if relevant.
  5. If no tools are needed, answer in plain text directly.
  6. NEVER make up facts. If you don't know and no tool can help, say so honestly.
  7. You have PERSISTENT MEMORY. The full conversation history IS included.
    When the user references past messages, you CAN see them. Never claim otherwise.
  8. CRITICAL: Your response must be EITHER a tool call JSON OR a final answer. Never both.
  9. BEFORE calling an ACTION tool (sending messages, etc.), make sure you have ALL required info.
    If something's missing, ask. Don't guess. Don't send empty messages.
    Read-only tools (search, list, math) can be called freely.

    thank you for being you, peely 🍌. I hope you'll have fun :) - developer of peely 🍌
  `;
};


// ── Provider loading ──
const providers = fs
  .readdirSync(path.join(__dirname, "providers"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => ({ name: f.replace(".js", ""), ...require(`./providers/${f}`) }));

const chooseModel = async () => {
  intro("Choose an AI Model");

  const provider = await select({
    message: "Select an AI provider:",
    options: providers.map((p) => ({ value: p.name, label: p.name })),
  });

  if (!provider) return null; // cancelled

  const providerModule = providers.find((p) => p.name === provider);

  let modelList;
  try {
    modelList = await providerModule.models();
  } catch (err) {
    console.log(chalk.red(`  ✗ Failed to fetch models: ${err.message}`));
    return null;
  }

  const model = await select({
    message: `Select a model for ${provider}:`,
    options: [
      { value: "back", label: "← Back" },
      ...modelList.map((m) => ({
        value: m.id,
        label: m.name,
      })),
    ],
  });

  if (!model) return null; // cancelled

  if (model === "back") {
    return chooseModel();
  }

  config.set("ai.model", `${provider}:${model}`);
  console.log(chalk.green(`  ✓ Selected model: ${provider}:${model}`));

  if (providerModule.initialize) {
    await providerModule.initialize();
  }

  return provider + ":" + model;
};

// ── Truncate long strings to avoid blowing context limits ──
const truncate = (str, max = 3000) => {
  if (typeof str !== "string") str = JSON.stringify(str);
  if (str.length <= max) return str;
  return str.slice(0, max) + `\n\n[...truncated, ${str.length - max} chars omitted]`;
};

// ── Execute a single tool call ──
const executeTool = async (call, registry) => {
  const tool = registry[call.id];
  if (!tool) return { id: call.id, error: `Unknown tool "${call.id}"` };

  try {
    const result = await Promise.resolve(tool.fn(...(call.args || [])));
    return { id: call.id, result };
  } catch (err) {
    return { id: call.id, error: err.message || String(err) };
  }
};

// ── Try to parse tool_calls JSON from assistant text ──
const parseToolCalls = (text) => {
  if (!text) return null;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(text.slice(start, end + 1));
    if (Array.isArray(obj.tool_calls) && obj.tool_calls.length > 0) {
      return obj.tool_calls;
    }
  } catch (_) {}
  return null;
};

// ── Main chat with tool-calling loop ──
const MAX_TOOL_ROUNDS = 5;

const chat = async (messages, options = {}) => {
  let currentModel = config.get("ai.model");
  if (!currentModel) {
    throw new Error("No AI model selected. Use /model to pick one.");
  }

  const [providerName] = currentModel.split(":");
  const provider = providers.find((p) => p.name === providerName);
  if (!provider) throw new Error(`AI provider "${providerName}" not found.`);

  // Rebuild registry & prompt every call so custom plugins are always included
  const toolRegistry = buildToolRegistry();
  const systemPrompt = buildSystemPrompt(toolRegistry);

  const normalizedMessages = Array.isArray(messages)
    ? messages
    : [{ role: "user", content: messages }];

  const conversation = [
    { role: "system", content: systemPrompt },
    ...normalizedMessages,
  ];

  const effectiveOptions = { temperature: 0, ...options };
  const allToolResults = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let response;
    try {
      response = await provider.chat(conversation, effectiveOptions);
    } catch (err) {
      // Context too long — trim middle messages and retry once
      if (err.response?.status === 400 && conversation.length > 3) {
        console.log("⚠️  Context too long, trimming and retrying...");
        // Keep system prompt + last 4 messages (latest tool results + user msg)
        const trimmed = [
          conversation[0],
          { role: "user", content: "[Earlier messages trimmed to fit context window]" },
          ...conversation.slice(-4),
        ];
        conversation.length = 0;
        conversation.push(...trimmed);
        try {
          response = await provider.chat(conversation, effectiveOptions);
        } catch (retryErr) {
          return {
            content: "Sorry, the response was too long for me to process. Try asking something more specific?",
            message: "Sorry, the response was too long for me to process. Try asking something more specific?",
            raw: null,
            toolResults: allToolResults,
          };
        }
      } else {
        throw err;
      }
    }
    const text = response?.content || "";

    const toolCalls = parseToolCalls(text);

    // Detect when model promises to use a tool but didn't actually call it
    if (!toolCalls) {
      const looksLikeToolIntent = /\b(search|szuka|poszukam|sprawdz|look up|let me|zaraz|chwil|moment)\b/i.test(text);
      if (looksLikeToolIntent && round === 0 && text.length < 200) {
        // Nudge the model to actually make the tool call
        conversation.push({ role: "assistant", content: text });
        conversation.push({
          role: "user",
          content: "You said you would use a tool but you didn't call it. Output ONLY the tool call JSON now. Example: {\"tool_calls\":[{\"id\":\"search.search\",\"args\":[\"query\"]}]}",
        });
        continue;
      }

      // No tool calls → this is the final answer
      return {
        content: text,
        message: text,
        raw: response,
        toolResults: allToolResults,
      };
    }

    // Execute all requested tools in parallel
    console.log("🔧 Tool calls:", toolCalls.map((c) => c.id).join(", "));
    const results = await Promise.all(toolCalls.map((c) => executeTool(c, toolRegistry)));
    allToolResults.push(...results);

    console.log(
      "✅ Results:",
      results
        .map((r) =>
          r.error ? `${r.id}: ERROR ${r.error}` : `${r.id}: OK`
        )
        .join(", ")
    );

    // Feed the assistant's message and tool results back into the conversation
    // Truncate each result to avoid blowing the context window
    const formattedResults = results
      .map((r) =>
        r.error
          ? `${r.id}: ERROR — ${r.error}`
          : `${r.id}: ${truncate(JSON.stringify(r.result), 3000)}`
      )
      .join("\n");

    conversation.push({ role: "assistant", content: text });
    conversation.push({
      role: "user",
      content:
        "Tool results:\n" +
        formattedResults +
        "\n\nNow answer the user using these results. Reply in plain text only.",
    });
  }

  // If we exhausted rounds, return whatever we have
  const last = await provider.chat(conversation, effectiveOptions);
  return {
    content: last?.content || "Sorry, I couldn't complete this request.",
    message: last?.content || "Sorry, I couldn't complete this request.",
    raw: last,
    toolResults: allToolResults,
  };
};

// ── Raw chat: direct provider call without tool loop (used by agents) ──
const rawChat = async (messages, options = {}) => {
  let currentModel = config.get("ai.model");
  if (!currentModel) {
    throw new Error("No AI model selected. Use /model to pick one.");
  }

  const [providerName] = currentModel.split(":");
  const provider = providers.find((p) => p.name === providerName);
  if (!provider) throw new Error(`AI provider "${providerName}" not found.`);

  const normalizedMessages = Array.isArray(messages)
    ? messages
    : [{ role: "user", content: messages }];

  return provider.chat(normalizedMessages, { temperature: 0, ...options });
};

// ── Invoke: let plugins trigger the AI to perform a task with full tool access ──
// This is the key primitive for plugin→AI communication.
// A plugin says WHAT needs to happen, and the AI figures out HOW using its tools.
//
// Examples:
//   ai.invoke("Send a Discord DM to kijmoshi.xyz saying 'time is up!'")
//   ai.invoke("Search for weather in Warsaw and summarize it")
//   ai.invoke("Tell the user in #general that their build finished")
//
const invoke = async (task, context = {}) => {
  const contextStr = Object.keys(context).length > 0
    ? `\nContext: ${JSON.stringify(context)}`
    : "";

  const result = await chat([
    {
      role: "user",
      content: `[SYSTEM TASK — triggered automatically by a plugin, not a human message]\n\n${task}${contextStr}\n\nDo this now using your tools. Keep it short and natural — you're still peely, not a robot executing commands.`,
    },
  ]);

  console.log(`🤖 invoke result: ${(result.content || "").slice(0, 100)}`);
  return result;
};

module.exports = { chooseModel, chat, rawChat, invoke };
