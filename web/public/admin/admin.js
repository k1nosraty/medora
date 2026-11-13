import { $, button, element } from "/medication/shared/ui/dom.js";
import { localizeMarkup, t } from "/medication/shared/i18n/locale.js";
import { applyDisplay } from "/medication/styles/display.js";
import { accessCareSettings } from "/medication/shared/storage.js";
import { renderCreative } from "/medication/features/promotions/creative.js";

localizeMarkup();
const refreshDisplay = () => accessCareSettings().then(applyDisplay).catch(() => {});
void refreshDisplay();
window.addEventListener("focus", refreshDisplay);
const form = $("promotion-form");
const fields = form.elements;
const panel = $("admin-workspace");
const signIn = $("admin-sign-in");
const accountsPath = "/api/admin/accounts";
const promotionPath = "/api/admin/promotion";
const search = $("admin-account-search");
const more = $("admin-account-more");
const confirmation = $("admin-account-delete");
const cancel = $("admin-delete-cancel");
const confirm = $("admin-delete-confirm");
let selectedAccount;
let nextPage;
let accountQuery = "";
let loadingAccounts = false;
let loadingPromotion = false;
let promotionLoaded = false;
let previewTimer;

function status(id, message, error = false) {
  $(id).textContent = message ? t(message) : "";
  $(id).toggleAttribute("data-error", error);
}
function httpsUrl(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}
function preview() {
  $("preview-title").textContent = fields.title.value.trim() || t("عنوان پیام");
  $("preview-description").textContent = fields.description.value.trim();
  const mediaType = fields.mediaType.value;
  const mediaField = $("promotion-media-field");
  mediaField.hidden = !mediaType;
  fields.mediaUrl.disabled = !mediaType;
  fields.mediaUrl.required = Boolean(mediaType);
  $("promotion-media-hint").textContent = t(mediaType === "video" ? "لینک مستقیم MP4 را وارد کنید." : "لینک مستقیم JPG، PNG، WebP یا GIF را وارد کنید.");
  const url = httpsUrl(fields.url.value);
  const link = $("preview-link");
  link.hidden = !url;
  if (url) link.href = url;
  else link.removeAttribute("href");
  link.textContent = fields.linkLabel.value.trim() || t("مشاهدهٔ جزئیات");
  const mediaStatus = $("preview-media-status");
  mediaStatus.hidden = true;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => renderCreative($("preview-creative"), {
    mediaType, mediaUrl: httpsUrl(fields.mediaUrl.value), url, title: $("preview-title").textContent
  }, () => {
    mediaStatus.textContent = t("فایل باز نشد. لینک مستقیم فایل را بررسی کنید.");
    mediaStatus.hidden = false;
  }), 250);
}
function localDateTime(value) {
  if (value == null) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(value - offset).toISOString().slice(0, 16);
}
function showPromotion(promotion) {
  for (const name of ["title", "description", "url", "mediaType", "mediaUrl", "linkLabel"]) fields[name].value = promotion?.[name] ?? "";
  for (const name of ["startsAt", "endsAt"]) fields[name].value = localDateTime(promotion?.[name]);
  fields.enabled.checked = promotion?.enabled ?? false;
  preview();
  const now = Date.now();
  status("promotion-status", !promotion?.enabled ? "در حال حاضر پیامی نمایش داده نمی‌شود."
    : promotion.startsAt > now ? "نمایش زمان‌بندی شده است."
    : promotion.endsAt != null && promotion.endsAt <= now ? "بازهٔ نمایش تمام شده است."
    : "پیام فعال است.");
}
async function request(path, method = "GET", body) {
  const response = await fetch(path, {
    method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {})
  });
  if (response.status === 401 || response.status === 403) {
    panel.hidden = true;
    signIn.hidden = false;
    if (confirmation.open) confirmation.close();
    status("admin-status", response.status === 401 ? "برای باز کردن پنل وارد حساب مدورا شوید." : "این حساب به پنل مدیریت دسترسی ندارد.", true);
    return null;
  }
  if (!response.ok && response.status !== 400 && response.status !== 409) throw new Error("Admin request failed");
  return response.json();
}

function accountRow(account) {
  const row = element("li", "", "admin-account");
  const identity = element("div", "", "admin-account-identity");
  const username = element("strong", account.username);
  const email = element("bdi", account.email, "quiet");
  username.dir = email.dir = "ltr";
  identity.append(username, email);
  row.append(identity);
  if (account.admin) row.append(element("span", t("مدیر"), "quiet"));
  else {
    const remove = button(t("حذف حساب"), () => {
      if (loadingAccounts) return;
      selectedAccount = account;
      $("admin-account-delete-email").textContent = account.email;
      status("admin-delete-status", "");
      confirmation.showModal();
    });
    remove.setAttribute("aria-label", t("حذف حساب {0}", account.username));
    row.append(remove);
  }
  return row;
}

async function loadAccounts(append = false, success = "") {
  if (loadingAccounts) return;
  loadingAccounts = more.disabled = search.elements.query.disabled = search.querySelector("button").disabled = true;
  const list = $("admin-account-list");
  const params = new URLSearchParams({ q: accountQuery });
  if (append && nextPage) params.set("after", nextPage);
  status("admin-account-status", "در حال ارتباط…");
  try {
    const result = await request(accountsPath + "?" + params);
    if (!result) return;
    if (result.error) throw new Error(result.error);
    const rows = result.users.map(accountRow);
    if (append) list.append(...rows);
    else list.replaceChildren(...rows);
    nextPage = result.next;
    more.hidden = !nextPage;
    panel.hidden = false;
    status("admin-status", "");
    status("admin-account-status", success || (list.childElementCount ? "" : "حسابی پیدا نشد."));
  } catch {
    status(panel.hidden ? "admin-status" : "admin-account-status", "فهرست حساب‌ها بارگذاری نشد. دوباره تلاش کنید.", true);
  } finally {
    loadingAccounts = more.disabled = search.elements.query.disabled = search.querySelector("button").disabled = false;
  }
}

search.addEventListener("submit", event => {
  event.preventDefault();
  accountQuery = search.elements.query.value.trim();
  void loadAccounts();
});
more.addEventListener("click", () => void loadAccounts(true));
cancel.addEventListener("click", () => confirmation.close());
confirmation.addEventListener("cancel", event => {
  if (confirm.disabled) event.preventDefault();
});
confirm.addEventListener("click", async () => {
  if (!selectedAccount || confirm.disabled) return;
  confirm.disabled = cancel.disabled = true;
  status("admin-delete-status", "در حال ارتباط…");
  try {
    const { username, tag } = selectedAccount;
    const result = await request(accountsPath, "DELETE", { username, tag });
    if (!result) return;
    if (result.error) {
      status("admin-delete-status", result.error === "protected_account" ? "حساب مدیر قابل حذف نیست." :
        "این حساب تغییر کرده است. فهرست را دوباره بارگذاری کنید.", true);
      return;
    }
    confirmation.close();
    await loadAccounts(false, "حساب حذف شد.");
    if (!panel.hidden) search.elements.query.focus({ preventScroll: true });
  } catch {
    status("admin-delete-status", "حذف حساب انجام نشد. دوباره تلاش کنید.", true);
  } finally {
    confirm.disabled = cancel.disabled = false;
  }
});

const tabs = [...document.querySelectorAll("[data-admin-tab]")];
for (const tab of tabs) tab.addEventListener("click", async () => {
  for (const item of tabs) {
    item.setAttribute("aria-pressed", String(item === tab));
    $(item.getAttribute("aria-controls")).hidden = item !== tab;
  }
  if (tab.dataset.adminTab !== "promotion" || promotionLoaded || loadingPromotion) return;
  loadingPromotion = true;
  $("promotion-fields").disabled = true;
  status("promotion-status", "در حال ارتباط…");
  try {
    const result = await request(promotionPath);
    if (result) {
      showPromotion(result.promotion);
      promotionLoaded = true;
    }
  } catch {
    status("promotion-status", "پیام بارگذاری نشد. دوباره تلاش کنید.", true);
  } finally {
    loadingPromotion = false;
    $("promotion-fields").disabled = !promotionLoaded;
  }
});

form.addEventListener("input", preview);
form.addEventListener("submit", async event => {
  event.preventDefault();
  const payload = {
    title: fields.title.value,
    description: fields.description.value,
    url: fields.url.value,
    mediaType: fields.mediaType.value,
    mediaUrl: fields.mediaType.value ? fields.mediaUrl.value.trim() : "",
    linkLabel: fields.linkLabel.value,
    startsAt: fields.startsAt.value ? new Date(fields.startsAt.value).getTime() : null,
    endsAt: fields.endsAt.value ? new Date(fields.endsAt.value).getTime() : null,
    enabled: fields.enabled.checked
  };
  $("promotion-fields").disabled = true;
  try {
    const result = await request(promotionPath, "PUT", payload);
    if (!result) return;
    if (result.error) {
      status("promotion-status", "عنوان، لینک‌های HTTPS و بازهٔ نمایش را بررسی کنید.", true);
    } else showPromotion(result.promotion);
  } catch {
    status("promotion-status", "پیام ذخیره نشد. دوباره تلاش کنید.", true);
  } finally {
    $("promotion-fields").disabled = false;
  }
});

await loadAccounts();
