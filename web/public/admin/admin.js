import { $ } from "/medication/dom.js";
import { localizeMarkup, t } from "/medication/locale.js";

localizeMarkup();
const form = $("promotion-form");
const fields = form.elements;
const panel = $("admin-workspace");
const signIn = $("admin-sign-in");

function status(message, error = false) {
  $("admin-status").textContent = t(message);
  $("admin-status").toggleAttribute("data-error", error);
}
function preview() {
  $("preview-title").textContent = fields.title.value.trim() || t("عنوان پیام");
  $("preview-description").textContent = fields.description.value.trim();
  $("preview-link").hidden = !fields.url.value.trim();
}
function showPromotion(promotion) {
  for (const name of ["title", "description", "url"]) fields[name].value = promotion?.[name] ?? "";
  fields.enabled.checked = promotion?.enabled ?? false;
  preview();
  status(promotion?.enabled ? "پیام فعال است." : "در حال حاضر پیامی نمایش داده نمی‌شود.");
}
async function request(method, body) {
  const response = await fetch("/api/admin/promotion", {
    method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {})
  });
  if (response.status === 401 || response.status === 403) {
    panel.hidden = true;
    signIn.hidden = false;
    status(response.status === 401 ? "برای باز کردن پنل وارد حساب مدورا شوید." : "این حساب به پنل مدیریت دسترسی ندارد.", true);
    return null;
  }
  if (response.status === 400) {
    status("عنوان و نشانی HTTPS پیام را بررسی کنید.", true);
    return null;
  }
  if (!response.ok) throw new Error("Could not read or save the promotion");
  return response.json();
}

form.addEventListener("input", preview);
form.addEventListener("submit", async event => {
  event.preventDefault();
  const payload = {
    title: fields.title.value,
    description: fields.description.value,
    url: fields.url.value,
    enabled: fields.enabled.checked
  };
  $("promotion-fields").disabled = true;
  try {
    const result = await request("PUT", payload);
    if (result) {
      showPromotion(result.promotion);
      status(result.promotion.enabled ? "پیام ذخیره شد و برای نمایش فعال است." : "پیام ذخیره شد و نمایش آن خاموش است.");
    }
  } catch {
    status("پیام ذخیره نشد. دوباره تلاش کنید.", true);
  } finally {
    $("promotion-fields").disabled = false;
  }
});

try {
  const result = await request("GET");
  if (result) {
    showPromotion(result.promotion);
    panel.hidden = false;
  }
} catch {
  status("پنل باز نشد. اتصال اینترنت را بررسی کنید و صفحه را دوباره بارگذاری کنید.", true);
}
