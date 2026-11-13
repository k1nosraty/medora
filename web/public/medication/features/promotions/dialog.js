import { $ } from "../../shared/ui/dom.js";
import { presentPromotion } from "./presentation.js";

export function installPromotion(loadOperations) {
  const dialog = $("promotion-dialog");
  const today = document.querySelector('[data-screen="today"]');
  const app = $("app");
  if (!dialog || !today) return;
  const allowed = loadOperations();
  const key = "medora-promotion";
  let seenInPage = "";
  let timer;
  let fetching = false;
  let lastAttempt = 0;
  let retryAfter = 0;
  let retries = 0;
  let lastInteraction = 0;
  let pending;

  function lastSeen() {
    try { return localStorage.getItem(key) ?? seenInPage; }
    catch { return seenInPage; }
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
    if (lastSeen().startsWith(day + " ")) return;
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
      const seen = lastSeen();
      if (seen.startsWith(day + " ") || seen.endsWith(" " + creativeId)) return;
      const count = event => void fetch("/api/promotion/events", {
        method: "POST", credentials: "omit", keepalive: true,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: promotion.id, event })
      }).catch(() => {});
      let clicked = false;
      presentPromotion(dialog, promotion, () => {
        if (!clicked) count("click");
        clicked = true;
      });
      seenInPage = `${day} ${creativeId}`;
      try { localStorage.setItem(key, seenInPage); } catch {}
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
