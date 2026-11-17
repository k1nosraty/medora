import { defaultCalendar, language, locale, t } from "../../shared/i18n/locale.js";
import { accessCare, accessCareSettings } from "../../shared/storage.js";
import { scheduleForPush, localZone } from "../../domain/care-plan.js";
import { validSchedule, reminderRequestLimit } from "../../domain/reminder-schedule.js";
import { matchesSubscriptionId } from "../../domain/subscription-id.js";

export { scheduleForPush };

const $ = id => document.getElementById(id);
const api = "/api/reminders";
const dayMs = 86_400_000;
const planVersion = 7;
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
const kindText = kinds => (kinds ?? []).map(kind => ({ dose: t("ui.medicine"), water: t("ui.water"), appointment: t("ui.appointment"), routine: t("ui.routine"), sleepBed: t("ui.sleep"), sleepWake: t("ui.sleep"), cycle: t("ui.cycle") })[kind]).filter(Boolean).join(t("ui.and"));

function controls(settings) {
  const enabled = Boolean(settings?.enabled);
  const canCheck = Boolean(settings?.token);
  $("push-enable").hidden = enabled;
  $("push-enable").disabled = !registration || !publicKey || enabled;
  $("push-disable").hidden = $("push-disable").disabled = !enabled;
  $("push-check").hidden = $("push-check").disabled = !canCheck;
  $("push-check").textContent = t("ui.check-status");
  $("push-test").hidden = $("push-test").disabled = !enabled;
  settingsBadge(enabled ? t("ui.on") : t("ui.off"), enabled);
  const todayReminders = $("today-reminders");
  if (todayReminders) todayReminders.hidden = !todayReminders.hasAttribute("data-eligible") || Boolean(settings?.enabled);
}

function serialize(action) {
  operation = operation.catch(() => {}).then(action);
  return operation;
}

async function request(path, method, token, body) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { method, headers, body: body && JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(12_000) });
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
  const details = result.providerStatus ? ` (${new Intl.NumberFormat(locale).format(result.providerStatus)})` : "";
  switch (result.status) {
    case "accepted": return t("ui.the-push-service-accepted-the-message-check-your-device");
    case "rejected": return t("ui.the-push-service-rejected-the-message-value", details);
    case "failed": return t("ui.could-not-reach-the-push-service");
    case "expired": return t("ui.the-delivery-window-for-this-reminder-has-passed");
    case "gone": return t("ui.the-notification-subscription-has-expired");
    case "rate_limit": return t("ui.wait-one-minute-before-testing-again");
    case "superseded": return t("ui.the-schedule-changed-during-the-test-try-again");
    default: return t("ui.turn-on-reminders-first");
  }
}

async function sync(check = false, snapshot) {
  let state = await accessCareSettings();
  let settings = state.reminders;
  $("push-show-details").checked = settings?.details ?? (state.reminderDetails === true);
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
        reminder.details ??= current.reminderDetails === true;
        reminder.revision += 1;
        if (!validSubscription) reminder.enabled = false;
      });
      settings = state.reminders;
    }
  }

  try {
    let remote;
    let latest;
    if (settings.clearing && registration) {
      const currentSubscription = await registration.pushManager.getSubscription().catch(() => null);
      if (currentSubscription && await matchesSubscriptionId(settings.token.split(".")[0], currentSubscription.toJSON())) {
        await currentSubscription.unsubscribe().catch(() => false);
        subscription = null;
      }
    }
    if (settings.revision > (settings.synced ?? 0)) {
      status(t("ui.syncing-reminders"));
      if (settings.enabled && !subscription) return status(t("ui.setting-up-the-notification-subscription"));
      let plan = {};
      if (settings.enabled) {
        const current = await accessCare(undefined, { snapshot });
        if (current.reminders?.token !== settings.token || current.reminders.revision !== settings.revision) return;
        const details = settings.details ?? (current.reminderDetails === true);
        plan = { ...scheduleForPush({ ...current, reminderDetails: details }, zone, localDay()), language, subscription: subscription.toJSON() };
        const link = current.accountCare;
        if (link?.enabled && link.sessionValid !== false && link.owner && link.revision > 0) {
          plan.account = { owner: link.owner, revision: link.revision, details };
        }
      }
      const body = { revision: settings.revision, enabled: settings.enabled, ...(settings.clearing && { revoke: true }), ...plan };
      if (settings.enabled && (!validSchedule(body) ||
          new TextEncoder().encode(JSON.stringify(body)).length > reminderRequestLimit)) throw new Error("bad_schedule");
      remote = await request(api, "PUT", settings.token, body);
      latest = (await accessCareSettings(current => {
        const reminder = current.reminders;
        if (reminder?.token !== settings.token) return;
        if (settings.clearing && reminder.revision === settings.revision && remote.revoked === true) {
          delete current.reminders;
        } else if (!settings.clearing) {
          reminder.synced = Math.max(reminder.synced ?? 0, settings.revision);
        } else if (remote.revision >= settings.revision) {
          reminder.revision = remote.revision + 1;
        }
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
      ? t("ui.last-delivery-value-value-value", lastKind ? lastKind + " " : "", formatDate.format(remote.last.at), deliveryText(remote.last))
      : t("ui.no-deliveries-recorded-for-this-subscription-yet");
    if (remote.revision > settings.revision) {
      status(t("ui.a-newer-schedule-is-on-the-server-enable-notifications-ag"));
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
      status(t("ui.the-notification-subscription-expired-enable-notification"));
    } else if (remote.accountSchedule?.status === "pending") {
      status(t("ui.syncing-reminders"));
      settingsBadge(t("ui.syncing-reminders"));
    } else if (remote.accountPlanError) {
      status(t("ui.could-not-save-the-schedule-check-your-stages-and-upcomin"));
      settingsBadge(t("اعلان‌ها به‌روز نیستند"));
    } else if (remote.enabled) {
      const nextKind = kindText(remote.nextKinds);
      const next = remote.next ? t("ui.next-reminder-value-value", nextKind ? nextKind + " · " : "", formatDate.format(remote.next)) : t("ui.notifications-are-on-nothing-is-scheduled");
      status(next);
    } else {
      status(t("ui.reminders-are-off"));
    }
  } catch (error) {
    status(error.message === "rate_limit" ? t("ui.too-many-requests-check-again-in-one-minute") : error.message === "bad_schedule"
      ? t("ui.could-not-save-the-schedule-check-your-stages-and-upcomin")
      : t("ui.could-not-sync-reminders-reconnect-and-select-check-statu"));
    controls((await accessCareSettings()).reminders);
    if (settings.enabled && settings.revision > (settings.synced ?? 0)) settingsBadge(t("اعلان‌ها به‌روز نیستند"));
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
  }).catch(() => status(t("ui.could-not-check-notification-status")));
  return queued.promise;
}

$("push-show-details")?.addEventListener("change", async event => {
  const control = event.currentTarget;
  const showDetails = control.checked;
  control.disabled = true;
  try {
    await accessCareSettings(state => {
      state.reminderDetails = showDetails;
      if (state.reminders) state.reminders.details = showDetails;
      changeReminderRevision(state);
    });
    void syncReminders();
  } catch {
    control.checked = !showDetails;
    status(t("ui.could-not-save-try-again"));
  } finally {
    control.disabled = false;
  }
});

export async function initializeReminders() {
  const state = await accessCareSettings().catch(() => null);
  if (state) $("push-show-details").checked = state.reminders?.details ?? (state.reminderDetails === true);
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS && !matchMedia("(display-mode: standalone)").matches && navigator.standalone !== true) {
    settingsBadge(t("ui.installation-required"));
    return status(t("ui.for-iphone-notifications-add-medora-to-your-home-screen-a"));
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    settingsBadge(t("ui.unavailable"));
    return status(t("ui.web-notifications-are-unavailable-in-this-browser"));
  }
  try {
    const [root, config] = await Promise.all([navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }), fetch("/api/config")]);
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
    else status(t("ui.select-enable-notifications-and-allow-them-on-your-device"));
  } catch {
    settingsBadge(t("ui.setup-failed"));
    status(t("ui.notification-setup-failed-check-your-connection-and-try-a"));
    $("push-check").textContent = t("ui.try-again");
    $("push-check").hidden = $("push-check").disabled = false;
  }
}

$("push-enable").addEventListener("click", () => {
  // Safari requires subscribe to start during the button's user gesture.
  if (!registration || !publicKey) return;
  if (Notification.permission === "denied") return status(t("ui.allow-medora-notifications-in-your-device-settings"));
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
        state.reminders = { token, revision, synced: 0, enabled: true, zone: localZone(), planVersion, language,
          details: previous?.details ?? (state.reminderDetails === true) };
      });
      controls(updated.reminders);
      await sync();
    } catch (error) {
      if (error.message === "unauthorized" && subscription) {
        await subscription.unsubscribe().catch(() => {});
        subscription = null;
      }
      status(error.message === "rate_limit" ? t("ui.too-many-requests-try-again-in-one-minute") :
        t("ui.could-not-enable-notifications-check-your-connection-and"));
      controls((await accessCareSettings()).reminders);
    }
  }).catch(() => status(t("ui.could-not-enable-notifications")));
});

$("push-disable").addEventListener("click", () => {
  void serialize(async () => {
    const state = await accessCareSettings(current => {
      changeReminderRevision(current);
      current.reminders.enabled = false;
    });
    controls(state.reminders);
    await sync();
  }).catch(() => status(t("ui.could-not-turn-off-notifications")));
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
  $("push-test-result").textContent = t("ui.sending-a-test-notification");
  void serialize(async () => {
    try {
      const settings = (await accessCareSettings()).reminders;
      const result = await request(`${api}/test`, "POST", settings.token, {});
      $("push-test-result").textContent = deliveryText(result);
    } catch {
      $("push-test-result").textContent = t("ui.could-not-send-the-test-check-your-connection");
    } finally {
      controls((await accessCareSettings()).reminders);
    }
  }).catch(() => {});
});
window.addEventListener("online", () => void (registration ? syncReminders(true) : initializeReminders()));
