import { defaultCalendar, language, listSeparator, locale, t } from "../../shared/i18n/locale.js";
import { accessCare, accessCareSettings } from "../../shared/storage.js";
import { scheduleForPush, localZone } from "../../domain/care-plan.js";
import { matchesSubscriptionId } from "./subscription-id.js";

export { scheduleForPush };

const $ = id => document.getElementById(id);
const api = "/api/reminders";
const dayMs = 86_400_000;
const planVersion = 6;
let registration;
let subscription;
let publicKey;
let operation = Promise.resolve();
let pendingSync;

export function changeReminderRevision(state) {
  if (state.reminders?.enabled) state.reminders.revision += 1;
}

function status(text) { $("push-status").textContent = text; }
function settingsBadge(text, enabled = false) {
  const badge = $("settings-notification-state");
  badge.textContent = text;
  badge.dataset.enabled = String(enabled);
}
const kindText = kinds => (kinds ?? []).map(kind => ({ dose: t("دارو"), water: t("آب"), appointment: t("قرار"), routine: t("روتین") })[kind]).filter(Boolean).join(t(" و "));

function controls(settings) {
  const enabled = Boolean(settings?.enabled);
  const canCheck = Boolean(settings?.token);
  $("push-enable").hidden = enabled;
  $("push-enable").disabled = !registration || !publicKey || enabled;
  $("push-disable").hidden = $("push-disable").disabled = !enabled;
  $("push-check").hidden = $("push-check").disabled = !canCheck;
  $("push-check").textContent = t("بررسی وضعیت");
  $("push-test").hidden = $("push-test").disabled = !enabled;
  settingsBadge(enabled ? t("فعال") : t("خاموش"), enabled);
  const todayReminders = $("today-reminders");
  if (todayReminders) todayReminders.hidden = Boolean(settings?.enabled);
}

function serialize(action) {
  operation = operation.catch(() => {}).then(action);
  return operation;
}

async function request(path, method, token, body) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { method, headers, body: body && JSON.stringify(body), cache: "no-store" });
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}));
    throw new Error(error || "server");
  }
  return response.json();
}

function localDay() {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / dayMs;
}

function deliveryText(result) {
  const details = result.providerStatus ? ` (${new Intl.NumberFormat(locale).format(result.providerStatus)}${result.reason ? listSeparator + result.reason : ""})` : "";
  switch (result.status) {
    case "accepted": return t("سرویس Push پیام را پذیرفت. نمایش را روی گوشی بررسی کنید.");
    case "rejected": return t("سرویس Push پیام را رد کرد{0}.", details);
    case "failed": return t("ارسال به سرویس Push انجام نشد.");
    case "expired": return t("مهلت ارسال این نوبت گذشته بود.");
    case "gone": return t("اشتراک اعلان منقضی شده است.");
    case "rate_limit": return t("برای آزمایش بعدی یک دقیقه صبر کنید.");
    case "superseded": return t("برنامه حین آزمایش تغییر کرد. دوباره بررسی کنید.");
    default: return t("ابتدا اعلان نوبت‌ها را فعال کنید.");
  }
}

async function sync(check = false, snapshot) {
  let state = await accessCareSettings();
  let settings = state.reminders;
  $("push-show-details").checked = state.reminderDetails === true;
  controls(settings);
  if (!settings?.token) return;
  const zone = localZone();

  if (settings.enabled && registration) {
    subscription = await registration.pushManager.getSubscription();
    const validSubscription = subscription && Notification.permission !== "denied" &&
      await matchesSubscriptionId(settings.token.split(".")[0], subscription.toJSON());
    if (settings.zone !== zone || settings.planVersion !== planVersion || (settings.language ?? "fa") !== language || !validSubscription) {
      state = await accessCareSettings(current => {
        const reminder = current.reminders;
        if (reminder.token !== settings.token || !reminder.enabled) return;
        reminder.zone = zone;
        reminder.planVersion = planVersion;
        reminder.language = language;
        reminder.revision += 1;
        if (!validSubscription) reminder.enabled = false;
      });
      settings = state.reminders;
    }
  }

  try {
    let remote;
    let latest;
    if (settings.revision > (settings.synced ?? 0)) {
      status(t("در حال همگام‌سازی اعلان…"));
      if (settings.enabled && !subscription) return status(t("در حال آماده‌سازی اشتراک اعلان…"));
      let plan = {};
      if (settings.enabled) {
        const current = await accessCare(undefined, { snapshot });
        if (current.reminders?.token !== settings.token || current.reminders.revision !== settings.revision) return;
        plan = { ...scheduleForPush(current, zone, localDay()), language, subscription: subscription.toJSON() };
      }
      remote = await request(api, "PUT", settings.token, { revision: settings.revision, enabled: settings.enabled, ...plan });
      latest = (await accessCareSettings(current => {
        const reminder = current.reminders;
        if (reminder?.token === settings.token) reminder.synced = Math.max(reminder.synced ?? 0, settings.revision);
      })).reminders;
    } else if (check) {
      remote = await request(api, "GET", settings.token);
    }
    if (!remote) return;

    if (!latest) latest = (await accessCareSettings()).reminders;
    if (latest?.token !== settings.token || latest.revision !== settings.revision) return;
    controls(latest);
    const formatDate = new Intl.DateTimeFormat(`${locale}-u-ca-${state.calendar ?? defaultCalendar}`, { dateStyle: "medium", timeStyle: "short" });
    const lastKind = kindText(remote.last?.kinds);
    $("push-delivery").textContent = remote.last
      ? t("آخرین نوبت {0}{1} · {2}", lastKind ? lastKind + " " : "", formatDate.format(remote.last.at), deliveryText(remote.last))
      : t("هنوز برای این اشتراک نتیجهٔ ارسال نوبت ثبت نشده است.");
    if (remote.revision > settings.revision) {
      status(t("برنامهٔ جدیدتری روی سرور وجود دارد. اعلان را دوباره فعال کنید."));
      $("push-enable").hidden = false;
      $("push-enable").disabled = !registration || !publicKey;
      return;
    } else if (settings.enabled && !remote.enabled && remote.last?.status === "gone") {
      await subscription?.unsubscribe().catch(() => {});
      subscription = null;
      const updated = await accessCareSettings(current => {
        if (current.reminders.token === settings.token && current.reminders.revision === settings.revision) current.reminders.enabled = false;
      });
      controls(updated.reminders);
      status(t("اشتراک اعلان منقضی شده است. دوباره اعلان را فعال کنید."));
    } else if (remote.enabled) {
      const nextKind = kindText(remote.nextKinds);
      const next = remote.next ? t("یادآوری بعدی {0}{1}", nextKind ? nextKind + " · " : "", formatDate.format(remote.next)) : t("اعلان فعال است. نوبت آینده‌ای در برنامه نیست.");
      status(next);
    } else {
      status(t("اعلان نوبت‌ها خاموش است."));
    }
  } catch (error) {
    status(error.message === "rate_limit" ? t("تعداد درخواست‌ها زیاد است. یک دقیقه بعد دوباره بررسی کنید.") : error.message === "bad_schedule"
      ? t("زمان‌بندی روی سرور ثبت نشد. تعداد مرحله‌ها و نوبت‌های آینده را بررسی کنید.")
      : t("همگام‌سازی اعلان انجام نشد. پس از اتصال، «بررسی وضعیت» را بزنید."));
    controls((await accessCareSettings()).reminders);
  }
}

export function syncReminders(check = false, snapshot) {
  if (pendingSync) {
    pendingSync.check ||= check;
    pendingSync.snapshot = snapshot ?? pendingSync.snapshot;
    return pendingSync.promise;
  }
  const queued = { check, snapshot };
  pendingSync = queued;
  queued.promise = serialize(() => {
    pendingSync = null;
    return sync(queued.check, queued.snapshot);
  }).catch(() => status(t("خواندن وضعیت اعلان انجام نشد.")));
  return queued.promise;
}

$("push-show-details")?.addEventListener("change", async event => {
  const control = event.currentTarget;
  const showDetails = control.checked;
  control.disabled = true;
  try {
    await accessCareSettings(state => {
      state.reminderDetails = showDetails;
      changeReminderRevision(state);
    });
    void syncReminders();
  } catch {
    control.checked = !showDetails;
    status(t("ذخیره انجام نشد. دوباره تلاش کنید."));
  } finally {
    control.disabled = false;
  }
});

export async function initializeReminders() {
  const state = await accessCareSettings().catch(() => null);
  if (state) $("push-show-details").checked = state.reminderDetails === true;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS && !matchMedia("(display-mode: standalone)").matches && navigator.standalone !== true) {
    settingsBadge(t("نیاز به نصب"));
    return status(t("برای اعلان آیفون، مدورا را به صفحهٔ اصلی اضافه کنید و از آیکون آن وارد شوید."));
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    settingsBadge(t("در دسترس نیست"));
    return status(t("اعلان وب در این مرورگر در دسترس نیست."));
  }
  try {
    const [root, config] = await Promise.all([navigator.serviceWorker.register("/sw.js", { scope: "/" }), fetch("/api/config")]);
    if (!config.ok) throw new Error("config");
    const { publicKey: key } = await config.json();
    publicKey = Uint8Array.from(atob(key.replaceAll("-", "+").replaceAll("_", "/")), char => char.charCodeAt(0));
    if (!root.active) {
      const worker = root.installing ?? root.waiting;
      if (!worker) throw new Error("service worker");
      await new Promise((resolve, reject) => {
        const check = () => {
          if (worker.state === "activated") resolve();
          if (worker.state === "redundant") reject(new Error("service worker"));
        };
        worker.addEventListener("statechange", check);
        check();
      });
    }
    subscription = await root.pushManager.getSubscription();
    registration = root;
    const settings = (await accessCareSettings()).reminders;
    controls(settings);
    if (settings?.token) await syncReminders(true);
    else status(t("برای دریافت یادآوری، «فعال‌کردن اعلان» را بزنید و مجوز گوشی را تأیید کنید."));
  } catch {
    settingsBadge(t("راه‌اندازی ناموفق"));
    status(t("راه‌اندازی اعلان انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید."));
    $("push-check").textContent = t("تلاش دوباره");
    $("push-check").hidden = $("push-check").disabled = false;
  }
}

$("push-enable").addEventListener("click", () => {
  // Safari requires subscribe to start during the button's user gesture.
  if (!registration || !publicKey) return;
  if (Notification.permission === "denied") return status(t("مجوز اعلان مدورا را در تنظیمات گوشی فعال کنید."));
  const ready = subscription ? Promise.resolve(subscription) : registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
  ready.catch(() => {});
  $("push-enable").disabled = true;
  void serialize(async () => {
    try {
      subscription = await ready;
      const push = subscription.toJSON();
      const old = (await accessCareSettings()).reminders;
      const existingToken = old?.token && await matchesSubscriptionId(old.token.split(".")[0], push) ? old.token : null;
      const token = existingToken ?? (await request(`${api}/enroll`, "POST", null, { subscription: push })).token;
      const remote = await request(api, "GET", token);
      const updated = await accessCareSettings(state => {
        const previous = state.reminders;
        const revision = Math.max(previous?.token === token ? previous.revision : 0, remote.revision) + 1;
        state.reminders = { token, revision, synced: 0, enabled: true, zone: localZone(), planVersion, language };
      });
      controls(updated.reminders);
      await sync();
    } catch (error) {
      status(error.message === "rate_limit" ? t("تعداد درخواست‌ها زیاد است. یک دقیقه بعد دوباره تلاش کنید.") :
        t("فعال‌کردن اعلان انجام نشد. اتصال و مجوز اعلان را بررسی کنید."));
      controls((await accessCareSettings()).reminders);
    }
  }).catch(() => status(t("فعال‌کردن اعلان انجام نشد.")));
});

$("push-disable").addEventListener("click", () => {
  void serialize(async () => {
    const state = await accessCareSettings(current => {
      changeReminderRevision(current);
      current.reminders.enabled = false;
    });
    controls(state.reminders);
    await sync();
  }).catch(() => status(t("خاموش‌کردن اعلان انجام نشد.")));
});

$("push-check").addEventListener("click", () => {
  if (registration) void syncReminders(true);
  else {
    $("push-check").disabled = true;
    void initializeReminders();
  }
});
$("push-test").addEventListener("click", () => {
  $("push-test").disabled = true;
  $("push-test-result").textContent = t("در حال ارسال اعلان آزمایشی…");
  void serialize(async () => {
    try {
      const settings = (await accessCareSettings()).reminders;
      const result = await request(`${api}/test`, "POST", settings.token, {});
      $("push-test-result").textContent = deliveryText(result);
    } catch {
      $("push-test-result").textContent = t("آزمون ارسال انجام نشد. اتصال را بررسی کنید.");
    } finally {
      controls((await accessCareSettings()).reminders);
    }
  }).catch(() => {});
});
window.addEventListener("online", () => void (registration ? syncReminders(true) : initializeReminders()));
