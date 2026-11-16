const replayWindow = 7 * 86_400_000;

/** @param {{id?: () => string, now?: () => number}} [dependencies] */
export function quickActions({ id = () => crypto.randomUUID(), now = Date.now } = {}) {
  /** @type {Map<string, {operation: string, time: string, expires: number, running: boolean}>} */
  const pending = new Map();
  return {
    /** @param {string} key @param {() => string} time */
    start(key, time) {
      for (const [key, attempt] of pending) if (attempt.expires <= now()) pending.delete(key);
      const previous = pending.get(key);
      if (previous?.running) return null;
      const attempt = previous ?? { operation: id(), time: time(), expires: now() + replayWindow, running: false };
      attempt.running = true;
      pending.set(key, attempt);
      return attempt;
    },
    /** @param {string} key @param {boolean} confirmed */
    finish(key, confirmed) {
      if (confirmed) pending.delete(key);
      else {
        const attempt = pending.get(key);
        if (attempt) attempt.running = false;
      }
    }
  };
}
