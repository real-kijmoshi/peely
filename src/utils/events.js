const EventEmitter = require("events");

/**
 * Global event bus for peely.
 * Plugins can emit and listen to events, enabling async workflows like:
 *   - timers ("timer:fire")
 *   - incoming messages from any interface ("message:discord", "message:whatsapp")
 *   - webhooks, cron, file watchers, etc.
 *
 * Usage in plugins:
 *   const { events } = require("../../utils/events");
 *   events.on("timer:fire", ({ id, message }) => { ... });
 *   events.emit("timer:fire", { id, message });
 *
 * The AI can schedule actions via tool calls. The tool sets up the listener/timer,
 * and when the event fires it triggers the callback (e.g. send a Discord message).
 */

class peelyEvents extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    this._scheduled = new Map(); // id → { timer, meta }
  }

  /**
   * Schedule a callback after `ms` milliseconds.
   * Returns a unique ID for cancellation.
   */
  scheduleTimeout(id, ms, callback, meta = {}) {
    if (this._scheduled.has(id)) {
      clearTimeout(this._scheduled.get(id).timer);
    }
    const timer = setTimeout(() => {
      this._scheduled.delete(id);
      this.emit("timer:fire", { id, ...meta });
      callback();
    }, ms);
    this._scheduled.set(id, { timer, meta, fireAt: Date.now() + ms });
    return id;
  }

  /**
   * Cancel a scheduled timeout.
   */
  cancelTimeout(id) {
    const entry = this._scheduled.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      this._scheduled.delete(id);
      return true;
    }
    return false;
  }

  /**
   * List all pending scheduled tasks.
   */
  listScheduled() {
    const list = [];
    for (const [id, entry] of this._scheduled) {
      const remaining = Math.max(0, entry.fireAt - Date.now());
      list.push({ id, remainingMs: remaining, ...entry.meta });
    }
    return list;
  }
}

const events = new peelyEvents();

module.exports = { events };
