import { $ } from "../../shared/ui/dom.js";
import { t } from "../../shared/i18n/locale.js";
import { renderCreative } from "./creative.js";

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
    if (seen?.endsWith(" " + promotion.id) || seen?.startsWith(day + " ")) return;

    $("promotion-title").textContent = promotion.title;
    $("promotion-description").textContent = promotion.description;
    const link = $("promotion-link");
    link.hidden = !promotion.url;
    if (promotion.url) link.href = promotion.url;
    link.textContent = promotion.linkLabel || t("مشاهدهٔ جزئیات");
    const creative = $("promotion-creative");
    renderCreative(creative, promotion);
    dialog.addEventListener("close", () => creative.replaceChildren(), { once: true });
    localStorage.setItem(key, `${day} ${promotion.id}`);
    dialog.showModal();
  } catch {
    // A fetch or storage error must leave Today usable.
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
