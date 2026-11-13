import { loadOperations, loadTickets } from "./operations.js";
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
let campaigns = [];
let currentCampaign;
let mediaId = "";
let previewKey;

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
  $("preview-description").textContent = fields.description.value;
  const mediaType = fields.mediaType.value;
  const mediaField = $("promotion-media-field");
  mediaField.hidden = !mediaType;
  $("promotion-upload-field").hidden = !mediaType;
  $("promotion-remove-media").hidden = !mediaType || !mediaId;
  fields.mediaUrl.disabled = !mediaType || Boolean(mediaId);
  fields.mediaUrl.required = Boolean(mediaType && !mediaId);
  $("promotion-media-hint").textContent = t(mediaType === "video" ? "لینک مستقیم MP4 را وارد کنید." : "لینک مستقیم JPG، PNG، WebP یا GIF را وارد کنید.");
  const url = httpsUrl(fields.url.value);
  const link = $("preview-link");
  link.hidden = !url;
  if (url) link.href = url;
  else link.removeAttribute("href");
  link.textContent = fields.linkLabel.value.trim() || t("مشاهدهٔ جزئیات");
  const mediaStatus = $("preview-media-status");
  const creative = {
    mediaType, mediaUrl: mediaId ? promotionPath + "/media/" + mediaId : httpsUrl(fields.mediaUrl.value),
    url, title: $("preview-title").textContent
  };
  const key = JSON.stringify([creative.mediaType, creative.mediaUrl, creative.url]);
  if (key === previewKey) {
    const media = $("preview-creative").querySelector("img, video");
    if (media instanceof HTMLImageElement) media.alt = creative.title;
    else media?.setAttribute("aria-label", creative.title);
    return;
  }
  previewKey = key;
  mediaStatus.hidden = true;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => renderCreative($("preview-creative"), { ...creative, title: $("preview-title").textContent }, () => {
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
  currentCampaign = promotion;
  previewKey = undefined;
  mediaId = promotion?.mediaId ?? "";
  $("promotion-upload").value = "";
  $("promotion-upload-status").textContent = mediaId ? t("فایل آپلودشده انتخاب شده است.") : "";
  $("promotion-archive").hidden = !promotion;
  $("promotion-delete").hidden = !promotion?.archived;
  $("promotion-archive").textContent = t(promotion?.archived ? "بازگرداندن به پیش‌نویس" : "آرشیو کمپین");
  fields.enabled.disabled = Boolean(promotion?.archived);
  const toggle = $("promotion-toggle");
  toggle.hidden = !promotion || Boolean(promotion.archived);
  toggle.textContent = t(promotion?.enabled ? "توقف نمایش" : "فعال‌کردن نمایش");
  const stats = promotion?.stats;
  $("promotion-stats").textContent = stats ? t("{0} نمایش · {1} کلیک · نرخ کلیک {2}", stats.impression, stats.click,
    new Intl.NumberFormat(document.documentElement.lang, { style: "percent", maximumFractionDigits: 1 }).format(stats.impression ? stats.click / stats.impression : 0)) : "";

  for (const name of ["title", "description", "url", "mediaType", "mediaUrl", "linkLabel"]) fields[name].value = promotion?.[name] ?? "";
  for (const name of ["startsAt", "endsAt"]) fields[name].value = localDateTime(promotion?.[name]);
  fields.enabled.checked = promotion?.enabled ?? false;
  preview();
  const now = Date.now();
  status("promotion-status", promotion?.archived ? "آرشیوشده" : !promotion?.enabled ? "در حال حاضر پیامی نمایش داده نمی‌شود."
    : promotion.startsAt > now ? "نمایش زمان‌بندی شده است."
    : promotion.endsAt != null && promotion.endsAt <= now ? "بازهٔ نمایش تمام شده است."
    : "پیام فعال است.");
}
function showCampaigns(result) {
  campaigns = result.campaigns ?? (result.promotion ? [result.promotion] : []);
  const options = campaigns.map(row => new Option(row.title + " · " + t(row.archived ? "آرشیوشده" : row.enabled ? "روشن" : "پیش‌نویس"), row.id));
  $("promotion-campaign").replaceChildren(new Option(t("کمپین جدید"), ""), ...options);
  $("promotion-campaign").value = result.promotion?.id ?? "";
  showPromotion(result.promotion);
}
$("promotion-campaign").addEventListener("change", event => {
  showPromotion(campaigns.find(row => row.id === event.target.value));
});
async function request(path, method = "GET", body) {
  const response = await fetch(path, {
    method,
    ...(body instanceof File ? { headers: { "X-Medora-Filename": encodeURIComponent(body.name.slice(0, 100)) }, body } : body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {})
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
  if (account.emailVerified) identity.append(element("small", t("ایمیل تأیید شده"), "quiet"));
  if (account.createdAt != null) identity.append(element("small", t("ساخت حساب: {0}",
    new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: "medium" }).format(account.createdAt)), "quiet"));
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
    const revoke = button(t("خروج از همهٔ نشست‌ها"), async () => {
      if (!window.confirm(t("همهٔ نشست‌های این کاربر بسته شوند؟"))) return;
      revoke.disabled = true;
      try {
        const result = await request(accountsPath, "PATCH", { username: account.username, tag: account.tag });
        if (result) status("admin-account-status", result.error ? "خروج از نشست‌ها انجام نشد." : "همهٔ نشست‌ها بسته شدند.", Boolean(result.error));
      } catch {
        status("admin-account-status", "خروج از نشست‌ها انجام نشد.", true);
      } finally { revoke.disabled = false; }
    });
    revoke.className = "secondary";
    const actions = element("div", "", "buttons admin-account-actions");
    actions.append(revoke, remove);
    row.append(actions);
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
  if (tab.dataset.adminTab === "operations") void loadOperations();
  if (tab.dataset.adminTab === "tickets") void loadTickets();
  if (tab.dataset.adminTab !== "promotion" || promotionLoaded || loadingPromotion) return;
  loadingPromotion = true;
  $("promotion-fields").disabled = true;
  status("promotion-status", "در حال ارتباط…");
  try {
    const result = await request(promotionPath);
    if (result) {
      showCampaigns(result);
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
fields.mediaType.addEventListener("change", () => {
  mediaId = "";
  $("promotion-upload").value = "";
  status("promotion-upload-status", "");
  preview();
});
$("promotion-remove-media").addEventListener("click", () => {
  mediaId = "";
  $("promotion-upload").value = "";
  status("promotion-upload-status", "");
  preview();
  fields.mediaUrl.focus();
});
$("promotion-upload").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    event.target.value = "";
    status("promotion-upload-status", "فرمت فایل یا حجم آن معتبر نیست.", true);
    return;
  }
  $("promotion-toggle").disabled = $("promotion-fields").disabled = $("promotion-campaign").disabled = true;
  status("promotion-upload-status", "در حال آپلود…");
  try {
    const result = await request(promotionPath + "/media", "POST", file);
    if (!result || result.error) {
      status("promotion-upload-status", result?.error === "media_limit" ? "ظرفیت فایل‌های تبلیغ پر شده است." : "فرمت فایل یا حجم آن معتبر نیست.", true);
      return;
    }
    mediaId = result.id;
    fields.mediaType.value = result.mediaType;
    fields.mediaUrl.value = "";
    status("promotion-upload-status", "فایل آپلودشده انتخاب شده است.");
    if ($("promotion-library").open) void loadLibrary();
  } catch {
    status("promotion-upload-status", "آپلود انجام نشد. دوباره تلاش کنید.", true);
  } finally {
    $("promotion-upload").value = "";
    $("promotion-toggle").disabled = $("promotion-fields").disabled = $("promotion-campaign").disabled = false;
    preview();
  }
});

function payload() {
  return {
    title: fields.title.value,
    description: fields.description.value,
    url: fields.url.value,
    mediaType: fields.mediaType.value,
    mediaUrl: fields.mediaType.value && !mediaId ? fields.mediaUrl.value.trim() : "",
    mediaId,
    linkLabel: fields.linkLabel.value,
    startsAt: fields.startsAt.value ? new Date(fields.startsAt.value).getTime() : null,
    endsAt: fields.endsAt.value ? new Date(fields.endsAt.value).getTime() : null,
    enabled: fields.enabled.checked
  };
}
async function savePromotion(mode) {
  if (["save", "preview"].includes(mode) && !form.reportValidity()) return;
  const body = ["archive", "toggle"].includes(mode) ? { ...currentCampaign } : payload();
  const isPreview = mode === "preview";
  if (isPreview) body.enabled = false;
  else if (currentCampaign) {
    body.id = currentCampaign.id;
    body.archived = mode === "archive" ? !currentCampaign.archived : Boolean(currentCampaign.archived);
    if (mode === "archive") body.enabled = false;
    if (mode === "toggle") body.enabled = !currentCampaign.enabled;
  } else body.create = true;
  $("promotion-toggle").disabled = $("promotion-fields").disabled = $("promotion-campaign").disabled = true;
  try {
    const result = await request(promotionPath + (isPreview ? "/preview" : ""), "PUT", body);
    if (!result) return;
    if (result.error) {
      status("promotion-status", result.error === "campaign_limit_or_missing" ?
        "کمپین پیدا نشد یا ظرفیت کمپین‌ها پر شده است." : "عنوان، لینک‌های HTTPS و بازهٔ نمایش را بررسی کنید.", true);
    } else if (isPreview) {
      $("promotion-private-link").hidden = false;
      status("promotion-status", "پیش‌نمایش خصوصی آماده است.");
    } else showCampaigns(result);
    if ($("promotion-library").open) void loadLibrary();
  } catch {
    status("promotion-status", "پیام ذخیره نشد. دوباره تلاش کنید.", true);
  } finally {
    $("promotion-toggle").disabled = $("promotion-fields").disabled = $("promotion-campaign").disabled = false;
  }
}
form.addEventListener("submit", event => { event.preventDefault(); void savePromotion("save"); });
$("promotion-private").addEventListener("click", () => void savePromotion("preview"));
$("promotion-toggle").addEventListener("click", () => void savePromotion("toggle"));
$("promotion-archive").addEventListener("click", () => void savePromotion("archive"));
$("promotion-delete").addEventListener("click", async () => {
  if (!currentCampaign?.archived || !window.confirm(t("کمپین و آمار آن حذف شوند؟"))) return;
  $("promotion-toggle").disabled = $("promotion-fields").disabled = $("promotion-campaign").disabled = true;
  try {
    const result = await request(promotionPath, "DELETE", { id: currentCampaign.id });
    if (result && !result.error) showCampaigns(result);
    else if (result) status("promotion-status", "کمپین حذف نشد.", true);
  } catch {
    status("promotion-status", "کمپین حذف نشد.", true);
  } finally {
    $("promotion-toggle").disabled = $("promotion-fields").disabled = $("promotion-campaign").disabled = false;
  }
});
$("promotion-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(new URL("/admin/preview/", location.origin).href);
    status("promotion-status", "لینک کپی شد.");
  } catch {
    status("promotion-status", "لینک پیش‌نمایش را از نشانی صفحه کپی کنید.");
  }
});

function showLibrary(assets) {
  const rows = assets.map(asset => {
    const row = element("li", "", "admin-asset");
    const url = promotionPath + "/media/" + asset.id;
    const link = element("a", asset.name || asset.type || t("فایل تبلیغ"));
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const description = element("small", new Intl.NumberFormat(document.documentElement.lang).format(Math.ceil(asset.size / 1024)) + " KB", "quiet");
    const choose = button(t("استفاده در این کمپین"), () => {
      if ($("promotion-fields").disabled) return;
      mediaId = asset.id;
      fields.mediaType.value = asset.type.startsWith("video/") ? "video" : "image";
      fields.mediaUrl.value = "";
      status("promotion-upload-status", "فایل آپلودشده انتخاب شده است.");
      preview();
    });
    const remove = button(t("حذف فایل"), async () => {
      if (!window.confirm(t(asset.inPreview ? "فایل و پیش‌نمایش خصوصی حذف شوند؟" : "فایل حذف شود؟"))) return;
      remove.disabled = true;
      try {
        const response = await request(promotionPath + "/media", "DELETE", { id: asset.id });
        if (!response || response.error) throw new Error();
        if (mediaId === asset.id) $("promotion-remove-media").click();
        showLibrary(response.assets);
      } catch {
        status("library-status", "حذف فایل انجام نشد. ممکن است به یک کمپین متصل باشد.", true);
        remove.disabled = false;
      }
    });
    remove.disabled = asset.campaigns.length > 0;
    const actions = element("div", "", "buttons");
    actions.append(choose, remove);
    row.append(link, description);
    if (asset.campaigns.length) row.append(element("p", t("در کمپین: {0}", asset.campaigns.join("، ")), "quiet"));
    if (asset.inPreview) row.append(element("p", t("در پیش‌نمایش خصوصی"), "quiet"));
    row.append(actions);
    return row;
  });
  $("library-assets").replaceChildren(...rows);
  status("library-status", rows.length ? "" : "فایلی آپلود نشده است.");
}

async function loadLibrary() {
  try {
    const response = await request(promotionPath + "/media");
    if (response?.assets && $("promotion-library").open) showLibrary(response.assets);
  } catch {
    status("library-status", "فهرست فایل‌ها بارگذاری نشد.", true);
  }
}
$("promotion-library").addEventListener("toggle", event => {
  if (event.currentTarget.open) void loadLibrary();
});


{
  const access = await fetch("/api/admin/operations/access").then(response => response.ok ? response.json() : null).catch(() => null);
  if (access?.role === "support") {
    panel.hidden = false;
    tabs.filter(item => item.dataset.adminTab !== "tickets").forEach(item => { item.hidden = true; });
    tabs.find(item => item.dataset.adminTab === "tickets").click();
    status("admin-status", "");
  } else await loadAccounts();
}
