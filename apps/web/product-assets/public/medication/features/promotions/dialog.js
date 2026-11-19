import {accountTransport} from "../../shared/account-transport.js";
import { $ } from "../../shared/ui/dom.js";
import { presentPromotion } from "./presentation.js";

export function installPromotion(loadOperations) {
  const dialog = $("promotion-dialog");
  const today = document.querySelector('[data-screen="today"]');
  const app = $("app");
  const banner = $("today-promotion");
  if (!dialog || !today || !banner) return;
  const allowed = loadOperations();
  const key = "medora-promotion";
  const historyKey = "medora-promotion-history";
  let history = {};
  let timer;
  let fetching = false;
  let lastAttempt = 0;
  let retryAfter = 0;
  let retries = 0;
  let pending;
  let offer;

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
    const now = new Date();
    if (offer?.day === now.toDateString() && Date.now() < offer.expires) {
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(() => void check(), Math.min(offer.expires, +midnight) - +now);
      return;
    }
    const after = Math.max(retryAfter, pending ? 0 : lastAttempt + 15_000);
    timer = setTimeout(() => void check(), Math.max(0, after - Date.now()));
  }

  async function check() {
    if (fetching || !eligible()) return;
    const day = new Date().toDateString();
    if (offer && (offer.day !== day || Date.now() >= offer.expires)) {
      banner.hidden = true;
      offer = undefined;
    }
    if (offer || displayHistory().day === day) return;
    try { if (localStorage.getItem(key)?.startsWith(day + " ")) return; } catch {}
    fetching = true;
    try {
      if (!await allowed || !eligible()) return;
      if (!pending || Date.now() >= pending.expires) {
        lastAttempt = Date.now();
        const response = await accountTransport("/api/promotion", {
          credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(10_000)
        });
        if (!response.ok) throw new Error("promotion_unavailable");
        retries = 0;
        const { promotion } = await response.json();
        if (!promotion) return;
        pending = { promotion, expires: Math.min(Date.now() + 15_000, promotion.endsAt ?? Infinity) };
      }
      if (!eligible() || Date.now() >= pending.expires) return;
      const { promotion } = pending;
      pending = undefined;
      const creativeId = promotion.creativeId ?? promotion.id;
      const seen = displayHistory();
      const previous = Object.hasOwn(seen, creativeId) ? seen[creativeId] : 0;
      if (seen.day === day || previous >= (promotion.frequency ?? 1)) return;
      offer = { promotion, creativeId, day, expires: promotion.endsAt ?? Infinity };
      $("today-promotion-title").textContent = promotion.title;
      banner.hidden = false;
      schedule();
    } catch {
      retryAfter = Date.now() + 15_000;
      if (++retries <= 2) schedule();
    } finally {
      fetching = false;
    }
  }

  function selectOffer(open) {
    if (!offer) return;
    const { promotion, creativeId, day, expires } = offer;
    offer = undefined;
    const finish = () => {
      banner.hidden = true;
      today.ownerDocument.querySelector('.dock button:not([hidden])')?.focus({ preventScroll: true });
    };
    const seen = displayHistory();
    const previous = Object.hasOwn(seen, creativeId) ? seen[creativeId] : 0;
    if (day !== new Date().toDateString() || Date.now() >= expires ||
        seen.day === day || previous >= (promotion.frequency ?? 1)) {
      finish();
      schedule();
      return;
    }
    history = { ...seen, [creativeId]: previous + Number(open), day };
    try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch {}
    if (!open) {
      finish();
      return;
    }
    const count = event => void accountTransport("/api/promotion/events", {
      method: "POST", credentials: "omit", keepalive: true,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: promotion.id, event })
    }).catch(() => {});
    let clicked = false;
    presentPromotion(dialog, promotion, () => {
      if (!clicked) count("click");
      clicked = true;
    });
    dialog.addEventListener("close", finish, { once: true });
    count("impression");
  }

  $("today-promotion-open").addEventListener("click", () => selectOffer(true));
  $("today-promotion-dismiss").addEventListener("click", () => selectOffer(false));

  const observer = new MutationObserver(schedule);
  observer.observe(app, { attributeFilter: ["hidden"] });
  observer.observe(today, { attributeFilter: ["hidden"] });
  document.addEventListener("close", schedule, true);
  document.addEventListener("visibilitychange", schedule);
  window.addEventListener("online", schedule);
  schedule();
}
