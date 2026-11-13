import { $ } from "../../shared/ui/dom.js";
import { presentPromotion } from "./presentation.js";

export async function showPromotion() {
  const dialog = $("promotion-dialog");
  if (!dialog || !navigator.onLine) return;
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  const timeout = setTimeout(interrupt, 3000);
  try {
    const key = "medora-promotion";
    const day = new Date().toDateString();
    if (localStorage.getItem(key)?.startsWith(day + " ")) return;
    for (const type of ["pointerdown", "keydown"]) {
      window.addEventListener(type, interrupt, { capture: true, signal: controller.signal });
    }
    const response = await fetch("/api/promotion", { credentials: "omit", signal: controller.signal });
    if (!response.ok) return;
    const { promotion } = await response.json();
    if (!promotion || document.hidden || controller.signal.aborted ||
        document.querySelector("dialog[open]") || document.querySelector('[data-screen="today"]').hidden) return;
    const seen = localStorage.getItem(key);
    const creativeId = promotion.creativeId ?? promotion.id;
    if (seen?.endsWith(" " + creativeId) || seen?.startsWith(day + " ")) return;

    const count = event => void fetch("/api/promotion/events", {
      method: "POST", credentials: "omit", keepalive: true,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: promotion.id, event })
    }).catch(() => {});
    let clicked = false;
    presentPromotion(dialog, promotion, () => {
      if (!clicked) count("click");
      clicked = true;
    });
    localStorage.setItem(key, `${day} ${creativeId}`);
    count("impression");
  } catch {
    // A fetch or storage error must leave Today usable.
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
