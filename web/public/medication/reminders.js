import { accessCare } from "./storage.js";
import { scheduleForPush, localZone } from "./care-plan.js";

export { scheduleForPush };

const $ = id => document.getElementById(id);
const api = "/api/reminders";
const dayMs = 86_400_000;
const formatDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short" });
let registration;
let subscription;
let publicKey;
let operation = Promise.resolve();

export function changeReminderRevision(state) {
  if (state.reminders?.enabled) state.reminders.revision += 1;
}

function status(text) { $("push-status").textContent = text; }
const kindText = kinds => (kinds ?? []).map(kind => ({ dose: "دارو", water: "آب", appointment: "قرار" })[kind]).filter(Boolean).join(" و ");

function controls(settings) {
  $("push-enable").disabled = !registration || !publicKey || settings?.enabled;
  $("push-disable").disabled = !settings?.enabled;
  $("push-check").disabled = !settings?.token;
  $("push-test").disabled = !settings?.enabled;
  $("push-code-row").hidden = Boolean(settings?.enabled);
  const todayReminders = $("today-reminders");
  if (todayReminders) todayReminders.hidden = Boolean(settings?.enabled);
}

function serialize(action) {
  operation = operation.catch(() => {}).then(action);
  return operation;
}

async function request(path, method, token, body) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { method, headers, body: body && JSON.stringify(body), cache: "no-store" });
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}));
    throw new Error(error || "server");
  }
  return response.json();
}

async function endpointId(endpoint) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(hash, 0, 16), byte => byte.toString(16).padStart(2, "0")).join("");
}

function localDay() {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / dayMs;
}

function deliveryText(result) {
  const details = result.providerStatus ? ` (${new Intl.NumberFormat("fa-IR").format(result.providerStatus)}${result.reason ? `، ${result.reason}` : ""})` : "";
  switch (result.status) {
    case "accepted": return "سرویس Push پیام را پذیرفت. نمایش را روی گوشی بررسی کنید.";
    case "rejected": return `سرویس Push پیام را رد کرد${details}.`;
    case "failed": return "ارسال به سرویس Push انجام نشد.";
    case "expired": return "مهلت ارسال این نوبت گذشته بود.";
    case "gone": return "اشتراک اعلان منقضی شده است.";
    case "rate_limit": return "برای آزمایش بعدی یک دقیقه صبر کنید.";
    case "superseded": return "برنامه حین آزمایش تغییر کرد. دوباره بررسی کنید.";
    default: return "ابتدا اعلان نوبت‌ها را فعال کنید.";
  }
}

async function sync(check = false) {
  let state = await accessCare();
  let settings = state.reminders;
  controls(settings);
  if (!settings?.token) return;
  const zone = localZone();

  if (settings.enabled && registration) {
    subscription = await registration.pushManager.getSubscription();
    const validSubscription = subscription && Notification.permission !== "denied" &&
      settings.token.startsWith(`${await endpointId(subscription.endpoint)}.`);
    if (settings.zone !== zone || settings.planVersion !== 2 || !validSubscription) {
      state = await accessCare(current => {
        const reminder = current.reminders;
        if (reminder.token !== settings.token || !reminder.enabled) return;
        reminder.zone = zone;
        reminder.planVersion = 2;
        reminder.revision += 1;
        if (!validSubscription) reminder.enabled = false;
      });
      settings = state.reminders;
    }
  }

  try {
    let remote;
    if (settings.revision > (settings.synced ?? 0)) {
      status("در حال همگام‌سازی اعلان…");
      if (settings.enabled && !subscription) return status("در حال آماده‌سازی اشتراک اعلان…");
      const plan = settings.enabled ? { ...scheduleForPush(state, zone, localDay()), subscription: subscription.toJSON() } : {};
      remote = await request(api, "PUT", settings.token, { revision: settings.revision, enabled: settings.enabled, ...plan });
      await accessCare(current => {
        const reminder = current.reminders;
        if (reminder.token === settings.token) reminder.synced = Math.max(reminder.synced ?? 0, settings.revision);
      });
    } else if (check) {
      remote = await request(api, "GET", settings.token);
    }
    if (!remote) return;

    const latest = (await accessCare()).reminders;
    if (latest.token !== settings.token || latest.revision !== settings.revision) return;
    const lastKind = kindText(remote.last?.kinds);
    $("push-delivery").textContent = remote.last
      ? `آخرین نوبت ${lastKind ? lastKind + " " : ""}${formatDate.format(remote.last.at)} · ${deliveryText(remote.last)}`
      : "هنوز برای این اشتراک نتیجهٔ ارسال نوبت ثبت نشده است.";
    if (remote.revision > settings.revision) {
      status("برنامهٔ جدیدتری روی سرور وجود دارد. اعلان را دوباره فعال کنید.");
      $("push-enable").disabled = !registration || !publicKey;
      return;
    } else if (settings.enabled && !remote.enabled && remote.last?.status === "gone") {
      await subscription?.unsubscribe().catch(() => {});
      subscription = null;
      const updated = await accessCare(current => {
        if (current.reminders.token === settings.token && current.reminders.revision === settings.revision) current.reminders.enabled = false;
      });
      controls(updated.reminders);
      status("اشتراک اعلان منقضی شده است. دوباره اعلان را فعال کنید.");
    } else if (remote.enabled) {
      const nextKind = kindText(remote.nextKinds);
      const next = remote.next ? `یادآوری بعدی ${nextKind ? nextKind + " · " : ""}${formatDate.format(remote.next)}` : "اعلان فعال است. نوبت آینده‌ای در برنامه نیست.";
      status(next);
    } else {
      status("اعلان نوبت‌ها خاموش است.");
    }
  } catch (error) {
    status(error.message === "bad_schedule"
      ? "زمان‌بندی روی سرور ثبت نشد. تعداد مرحله‌ها و نوبت‌های آینده را بررسی کنید."
      : "همگام‌سازی اعلان انجام نشد. پس از اتصال، «بررسی وضعیت» را بزنید.");
  }
  controls((await accessCare()).reminders);
}

export function syncReminders(check = false) {
  return serialize(() => sync(check)).catch(() => status("خواندن وضعیت اعلان انجام نشد."));
}

export async function initializeReminders() {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS && !matchMedia("(display-mode: standalone)").matches && navigator.standalone !== true) {
    return status("برای اعلان آیفون، مدورا را به صفحهٔ اصلی اضافه کنید و از آیکون آن وارد شوید.");
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return status("اعلان وب در این مرورگر در دسترس نیست.");
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
    const settings = (await accessCare()).reminders;
    controls(settings);
    if (settings?.token) await syncReminders(true);
    else status("برای دریافت اعلان، کد فعال‌سازی را وارد کنید.");
  } catch {
    status("راه‌اندازی اعلان انجام نشد. پس از اتصال، برنامه را دوباره باز کنید.");
  }
}

$("push-enable").addEventListener("click", () => {
  // Safari requires subscribe to start during the button's user gesture.
  if (!registration || !publicKey) return;
  const code = $("push-code").value.trim();
  if (code && !/^[a-f0-9]{36}$/.test(code)) return status("کد فعال‌سازی را بررسی کنید.");
  const ready = subscription ? Promise.resolve(subscription) : registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
  ready.catch(() => {});
  $("push-enable").disabled = true;
  void serialize(async () => {
    try {
      subscription = await ready;
      const id = await endpointId(subscription.endpoint);
      const old = (await accessCare()).reminders;
      const existingToken = old?.token?.startsWith(`${id}.`) ? old.token : null;
      if (!existingToken && !code) throw new Error("code_needed");
      const token = existingToken ?? (await request(`${api}/enroll`, "POST", code, { id })).token;
      const remote = await request(api, "GET", token);
      const updated = await accessCare(state => {
        const previous = state.reminders;
        const revision = Math.max(previous?.token === token ? previous.revision : 0, remote.revision) + 1;
        state.reminders = { token, revision, synced: 0, enabled: true, zone: localZone(), planVersion: 2 };
      });
      $("push-code").value = "";
      controls(updated.reminders);
      await sync();
    } catch (error) {
      status(error.message === "code_needed" ? "برای این اشتراک کد فعال‌سازی را وارد کنید." :
        error.message === "bad_code" ? "کد فعال‌سازی درست نیست." : "فعال‌کردن اعلان انجام نشد. اتصال و مجوز اعلان را بررسی کنید.");
      controls((await accessCare()).reminders);
    }
  }).catch(() => status("فعال‌کردن اعلان انجام نشد."));
});

$("push-disable").addEventListener("click", () => {
  void serialize(async () => {
    const state = await accessCare(current => {
      changeReminderRevision(current);
      current.reminders.enabled = false;
    });
    controls(state.reminders);
    await sync();
  }).catch(() => status("خاموش‌کردن اعلان انجام نشد."));
});

$("push-check").addEventListener("click", () => void syncReminders(true));
$("push-test").addEventListener("click", () => {
  $("push-test").disabled = true;
  $("push-test-result").textContent = "در حال ارسال اعلان آزمایشی…";
  void serialize(async () => {
    try {
      const settings = (await accessCare()).reminders;
      const result = await request(`${api}/test`, "POST", settings.token, {});
      $("push-test-result").textContent = deliveryText(result);
    } catch {
      $("push-test-result").textContent = "آزمون ارسال انجام نشد. اتصال را بررسی کنید.";
    } finally {
      controls((await accessCare()).reminders);
    }
  }).catch(() => {});
});
window.addEventListener("online", () => void (registration ? syncReminders(true) : initializeReminders()));
