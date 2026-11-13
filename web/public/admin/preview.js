import { $ } from "/medication/shared/ui/dom.js";
import { localizeMarkup, t } from "/medication/shared/i18n/locale.js";
import { presentPromotion } from "/medication/features/promotions/presentation.js";
import { accessCareSettings } from "/medication/shared/storage.js";
import { applyDisplay } from "/medication/styles/display.js";

localizeMarkup();
void accessCareSettings().then(applyDisplay).catch(() => {});
const status = $("preview-status");
const dialog = $("private-ad");
$("preview-dismiss").addEventListener("click", () => dialog.close());
async function show() {
  const replay = $("preview-replay");
  replay.disabled = true;
  try {
    const response = await fetch("/api/admin/promotion/preview", { cache: "no-store" });
    $("preview-login").hidden = response.status !== 401;
    if (!response.ok) {
      status.textContent = t(response.status === 401 ? "برای پیش‌نمایش، روی همین دستگاه وارد حساب مدیر شوید." : "پیش‌نمایش در دسترس نیست.");
      return;
    }
    const { promotion } = await response.json();
    status.textContent = promotion ? "" : t("هنوز پیش‌نمایشی ذخیره نشده است.");
    replay.hidden = !promotion;
    if (promotion) presentPromotion(dialog, promotion);
  } catch {
    status.textContent = t("پیش‌نمایش در دسترس نیست.");
  } finally {
    replay.disabled = false;
  }
}
$("preview-replay").addEventListener("click", show);
await show();
