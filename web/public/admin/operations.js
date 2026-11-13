import { $, element } from "/medication/shared/ui/dom.js";
import { t, locale } from "/medication/shared/i18n/locale.js";

const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });
const names = { dose: "دارو", water: "آب", routine: "روتین", appointment: "قرار" };
const outcomes = { accepted: "پذیرفته‌شده", rejected: "ردشده", failed: "خطای ارسال", gone: "اشتراک منقضی", expired: "مهلت گذشته" };
const actions = { account_removed: "حذف حساب", sessions_revoked: "خروج از نشست‌ها", operations_updated: "ویرایش اطلاعیه یا قابلیت‌ها",
  ticket_updated: "به‌روزرسانی گزارش پشتیبانی", campaign_updated: "ویرایش کمپین", campaign_archived: "آرشیو کمپین",
  campaign_removed: "حذف کمپین" };
function metricLabel(metric) {
  const [kind, key, status] = metric.split(":");
  if (kind === "push") return t(names[key] ?? key) + " · " + t(outcomes[status] ?? status);
  if (kind === "push-http") return t("کد پاسخ Push") + " " + key;
  if (kind === "release") return t("اعلان انتشار") + " · " + t(outcomes[key] ?? key);
  if (kind === "email") return t(key === "accepted" ? "ایمیل پذیرفته‌شده" : "خطای ایمیل");
  return t(key === "success" ? "ورود موفق" : "ورود ناموفق");
}

const local = time => time == null ? "" : new Date(time - new Date(time).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const audienceNames = ["promotions", "support"];
function audience(name, value) {
  const select = $(name + "-audience");
  const input = $("operations-form").elements[name];
  if (value !== undefined) {
    select.value = value === 100 || value === 0 ? String(value) : "custom";
    input.value = select.value === "custom" ? value : "";
  }
  input.disabled = select.value !== "custom";
  input.required = !input.disabled;
  input.closest("[data-audience-percent]").hidden = input.disabled;
  return Number(input.disabled ? select.value : input.value);
}
for (const name of audienceNames) $(name + "-audience").addEventListener("change", () => audience(name));
async function api(path, body) {
  const response = await fetch("/api/admin/operations" + path, body ? {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  } : {});
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

export async function loadOperations() {
  const status = $("operations-status");
  const form = $("operations-form");
  status.textContent = t("در حال ارتباط…");
  form.hidden = true;
  $("operations-metrics").replaceChildren();
  $("operations-audit").replaceChildren();
  $("operations-config").textContent = "";
  $("operations-activity").replaceChildren();
  $("operations-storage").replaceChildren();
  try {
    const { notice, flags, configured, counters, audit, activity = [], storage = {} } = await api("");
    for (const [name, value] of Object.entries({ title: notice?.title, message: notice?.message,
      start: local(notice?.start), end: local(notice?.end) })) form.elements[name].value = value ?? "";
    for (const name of audienceNames) audience(name, flags[name]);
    form.elements.enabled.checked = notice?.enabled ?? false;
    $("operations-config").textContent = [
      t(configured.push ? "ارسال Push پیکربندی شده است." : "ارسال Push پیکربندی نشده است."),
      t(configured.email ? "ارسال ایمیل پیکربندی شده است." : "ارسال ایمیل پیکربندی نشده است."),
      t("حساب‌های پشتیبانی: {0}", configured.supportAccounts)
    ].join(" · ");
    $("operations-metrics").replaceChildren(...counters.filter(row => row.metric !== "activity:open").map(row => element("li",
      metricLabel(row.metric) + " · " + new Intl.NumberFormat(locale).format(row.count))));
    if (!counters.length) $("operations-metrics").append(element("li", t("هنوز آماری ثبت نشده است.")));
    const date = new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "short", day: "numeric" });
    const number = new Intl.NumberFormat(locale);
    $("operations-activity").replaceChildren(...activity.map(row => element("li", date.format(row.day * 86_400_000) + " · " + number.format(row.count))));
    if (!activity.length) $("operations-activity").append(element("li", t("هنوز آماری ثبت نشده است.")));
    const labels = { promotions: "تبلیغات و فایل‌ها", accounts: "فهرست حساب‌ها", operations: "پشتیبانی و آمار" };
    $("operations-storage").replaceChildren(...Object.entries(storage).map(([key, bytes]) =>
      element("li", t(labels[key]) + " · " + number.format(Math.ceil(bytes / 1024)) + " KB")));
    $("operations-audit").replaceChildren(...audit.map(row => element("li",
      [dateTime.format(row.at), t(actions[row.action] ?? row.action), row.actor].join(" · "))));
    form.hidden = false;
    status.textContent = "";
  } catch {
    status.textContent = t("وضعیت سرویس در دسترس نیست.");
  }
}

export async function loadTickets() {
  const status = $("tickets-status");
  const list = $("admin-tickets");
  status.textContent = t("در حال ارتباط…");
  list.replaceChildren();
  try {
    const { tickets } = await api("/tickets");
    for (const ticket of tickets) {
      const row = element("form", "", "admin-ticket");
      const title = element("strong", ticket.email + " · " + dateTime.format(ticket.at));
      const reply = element("textarea");
      reply.value = ticket.reply;
      reply.maxLength = 1000;
      reply.rows = 3;
      reply.setAttribute("aria-label", t("پاسخ پشتیبانی"));
      const closed = element("input");
      closed.type = "checkbox";
      closed.checked = ticket.status === "closed";
      const label = element("label", t("بسته‌شده"), "admin-toggle");
      label.prepend(closed);
      const save = element("button", t("ذخیرهٔ پاسخ"));
      save.type = "submit";
      row.append(title, element("p", ticket.message));
      const details = JSON.parse(ticket.diagnostics ?? "null");
      if (details) row.append(element("p", [details.platform, details.permission, details.version].filter(Boolean).join(" · "), "quiet"));
      row.append(reply, label, save);
      row.addEventListener("submit", async event => {
        event.preventDefault();
        save.disabled = true;
        try {
          await api("/tickets", { id: ticket.id, reply: reply.value, status: closed.checked ? "closed" : "open" });
          status.textContent = t("پاسخ ذخیره شد.");
        } catch {
          status.textContent = t("پاسخ ذخیره نشد.");
        } finally { save.disabled = false; }
      });
      list.append(row);
    }
    status.textContent = tickets.length ? "" : t("گزارشی وجود ندارد.");
  } catch {
    status.textContent = t("فهرست گزارش‌ها در دسترس نیست.");
  }
}

$("operations-refresh").addEventListener("click", loadOperations);
$("tickets-refresh").addEventListener("click", loadTickets);
$("operations-form").addEventListener("submit", async event => {
  event.preventDefault();
  const fields = event.currentTarget.elements;
  const save = event.submitter;
  const value = key => fields[key].value ? new Date(fields[key].value).getTime() : null;
  save.disabled = true;
  try {
    await api("", { notice: { title: fields.title.value, message: fields.message.value, start: value("start"), end: value("end"), enabled: fields.enabled.checked },
      flags: Object.fromEntries(audienceNames.map(name => [name, audience(name)])) });
    await loadOperations();
    $("operations-status").textContent = t("تنظیمات سرویس ذخیره شد.");
  } catch {
    $("operations-status").textContent = t("متن اطلاعیه، تاریخ‌ها و درصدها را بررسی کنید.");
  } finally { save.disabled = false; }
});
