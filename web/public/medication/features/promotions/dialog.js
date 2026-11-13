import { $ } from "../../shared/ui/dom.js";
import { presentPromotion } from "./presentation.js";

export function installPromotion(loadOperations) {
  const dialog = $("promotion-dialog");
  const today = document.querySelector('[data-screen="today"]');
  const app = $("app");
  if (!dialog || !today) return;
  const allowed = loadOperations();
  const key = "medora-promotion";
  const historyKey = "medora-promotion-history";
  let history = {};
  let timer;
  let fetching = false;
  let lastAttempt = 0;
  let retryAfter = 0;
  let retries = 0;
  let lastInteraction = 0;
  let pending;

  function displayHistory() {
    try {
      const stored = JSON.parse(localStorage.getItem(historyKey) ?? "{}");
      const legacy = localStorage.getItem(key);
      if (legacy) {
        const id = legacy.slice(legacy.lastIndexOf(" ") + 1);
        if (!Object.hasOwn(stored, id)) stored[id] = 1;
      }
      return { ...stored, ...history };
    } catch { return history; }
  }

  function eligible() {
    return navigator.onLine && !document.hidden && !app.hidden && !today.hidden &&
      !document.querySelector("dialog[open]");
  }

  function schedule() {
    clearTimeout(timer);
    if (!eligible()) return;
    const after = Math.max(retryAfter, lastInteraction + 700, pending ? 0 : lastAttempt + 15_000);
    timer = setTimeout(() => void check(), Math.max(0, after - Date.now()));
  }

  async function check() {
    if (fetching || !eligible()) return;
    const day = new Date().toDateString();
    if (displayHistory().day === day) return;
    try { if (localStorage.getItem(key)?.startsWith(day + " ")) return; } catch {}
    fetching = true;
    try {
      if (!await allowed || !eligible()) return;
      if (!pending || Date.now() >= pending.expires) {
        lastAttempt = Date.now();
        const response = await fetch("/api/promotion", {
          credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(10_000)
        });
        if (!response.ok) throw new Error("promotion_unavailable");
        retries = 0;
        const { promotion } = await response.json();
        if (!promotion) return;
        pending = { promotion, expires: Math.min(Date.now() + 15_000, promotion.endsAt ?? Infinity) };
      }
      if (!eligible() || Date.now() >= pending.expires) return;
      if (Date.now() - lastInteraction < 700) {
        schedule();
        return;
      }
      const { promotion } = pending;
      pending = undefined;
      const creativeId = promotion.creativeId ?? promotion.id;
      const seen = displayHistory();
      const previous = Object.hasOwn(seen, creativeId) ? seen[creativeId] : 0;
      if (seen.day === day || previous >= (promotion.frequency ?? 1)) return;
      const count = event => void fetch("/api/promotion/events", {
        method: "POST", credentials: "omit", keepalive: true,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: promotion.id, event })
      }).catch(() => {});
      let clicked = false;
      presentPromotion(dialog, promotion, () => {
        if (!clicked) count("click");
        clicked = true;
      });
      history = { ...seen, [creativeId]: previous + 1, day };
      try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch {}
      count("impression");
    } catch {
      retryAfter = Date.now() + 15_000;
      if (++retries <= 2) schedule();
    } finally {
      fetching = false;
    }
  }

  const observer = new MutationObserver(schedule);
  observer.observe(app, { attributeFilter: ["hidden"] });
  observer.observe(today, { attributeFilter: ["hidden"] });
  document.addEventListener("close", schedule, true);
  document.addEventListener("visibilitychange", schedule);
  window.addEventListener("online", schedule);
  function recordInteraction() { lastInteraction = Date.now(); }
  window.addEventListener("pointerdown", recordInteraction, { passive: true });
  window.addEventListener("keydown", recordInteraction);
  schedule();
}
