const { events } = require("../../utils/events");

let _counter = 0;
const nextId = () => `timer_${++_counter}_${Date.now()}`;

/**
 * Built-in timer / reminder plugin.
 * Uses ai.invoke() — the AI decides HOW to execute the task using its tools.
 * 
 * Example flow:
 *   User: "za 15 sekund napisz na discord do kijmoshi.xyz hej"
 *   → AI calls timer.set(15, "send a Discord DM to kijmoshi.xyz saying hej")
 *   → After 15s, timer calls ai.invoke("send a Discord DM to kijmoshi.xyz saying hej")
 *   → AI calls discord.send_dm("kijmoshi.xyz", "hej")
 */

const setTimer = async (seconds, task) => {
  if (!seconds || seconds <= 0) return "Error: duration must be > 0 seconds.";
  if (!task) return "Error: task description is required — describe what should happen when the timer fires.";

  const id = nextId();
  const ms = seconds * 1000;

  events.scheduleTimeout(id, ms, async () => {
    try {
      // Lazy-load to avoid circular dependency
      const ai = require("../../ai");
      console.log(`⏱️ Timer ${id} fired — invoking AI: "${task}"`);
      await ai.invoke(task);
    } catch (err) {
      console.error(`⏱️ Timer ${id} invoke error:`, err.message);
    }
  }, { task, seconds });

  const timeStr = seconds >= 60 ? `${(seconds / 60).toFixed(1)} min` : `${seconds}s`;
  return `⏱️ Timer set for ${timeStr}. ID: ${id}. When it fires, the AI will execute: "${task}"`;
};

const cancelTimer = async (timerId) => {
  const cancelled = events.cancelTimeout(timerId);
  return cancelled
    ? `✅ Timer ${timerId} cancelled.`
    : `❌ Timer ${timerId} not found.`;
};

const listTimers = async () => {
  const scheduled = events.listScheduled();
  if (scheduled.length === 0) return "No active timers.";

  return scheduled
    .map((t) => {
      const secs = Math.ceil(t.remainingMs / 1000);
      return `• ${t.id} — ${secs}s left — "${t.task}"`;
    })
    .join("\n");
};

module.exports = {
  name: "timer",
  description: "Set timers that trigger the AI to perform any task after a delay",
  tools: {
    set: {
      description: "Set a timer. After the delay, the AI will execute the given task using its tools (e.g. send Discord DM, search, anything).",
      arguments: [
        { name: "seconds", type: "number", description: "Delay in seconds" },
        { name: "task", type: "string", description: "Natural language description of what the AI should do when the timer fires (e.g. 'send a Discord DM to kijmoshi.xyz saying time is up')" },
      ],
      fn: setTimer,
    },
    cancel: {
      description: "Cancel a running timer by its ID",
      arguments: [
        { name: "timerId", type: "string", description: "The timer ID to cancel" },
      ],
      fn: cancelTimer,
    },
    list: {
      description: "List all active timers",
      arguments: [],
      fn: listTimers,
    },
  },
};
