import { t } from "../../shared/i18n/locale.js";
import { renderCreative } from "./creative.js";

export function presentPromotion(dialog, promotion, onClick) {
  const find = selector => dialog.querySelector(selector);
  find("[data-promotion-title]").textContent = promotion.title;
  find("[data-promotion-description]").textContent = promotion.description;
  const link = find("[data-promotion-link]");
  link.hidden = !promotion.url;
  if (promotion.url) link.href = promotion.url;
  else link.removeAttribute("href");
  link.textContent = promotion.linkLabel || t("مشاهدهٔ جزئیات");
  const creative = find("[data-promotion-creative]");
  renderCreative(creative, promotion);
  if (onClick) {
    link.addEventListener("click", onClick, { once: true });
    creative.querySelector("a")?.addEventListener("click", onClick, { once: true });
  }
  dialog.addEventListener("close", () => creative.replaceChildren(), { once: true });
  dialog.showModal();
}
