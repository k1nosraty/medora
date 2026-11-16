const replayWindow = 7 * 86_400_000;
const storageKey = "medora-family-quick-actions-v1";

/** @typedef {{operation: string, time: string, expires: number}} PendingAction */
/** @param {{id?: () => string, now?: () => number, storage?: Storage}} [dependencies] */
export function quickActions({ id = () => crypto.randomUUID(), now = Date.now, storage } = {}) {
  /** @type {Map<string, PendingAction>} */
  const pending = new Map();
  /** @type {Set<string>} */
  const running = new Set();
  try {
    const saved = JSON.parse(storage?.getItem(storageKey) ?? "[]");
    for (const [key, action] of saved) {
      if (typeof key === "string" && typeof action?.operation === "string" && typeof action.time === "string" &&
          Number.isSafeInteger(action.expires) && action.expires > now()) pending.set(key, action);
    }
  } catch {
    // A blocked or invalid session cache leaves retry tracking in memory.
  }

  function persist() {
    try { storage?.setItem(storageKey, JSON.stringify([...pending])); } catch {}
  }

  return {
    /** @param {string} key @param {() => string} time */
    start(key, time) {
      const startedAt = now();
      for (const [savedKey, attempt] of pending) if (attempt.expires <= startedAt) pending.delete(savedKey);
      if (running.has(key)) return null;
      const attempt = pending.get(key) ?? { operation: id(), time: time(), expires: startedAt + replayWindow };
      running.add(key);
      pending.set(key, attempt);
      persist();
      return attempt;
    },
    /** @param {string} key @param {boolean} confirmed */
    finish(key, confirmed) {
      running.delete(key);
      if (confirmed) {
        pending.delete(key);
        persist();
      }
    }
  };
}
