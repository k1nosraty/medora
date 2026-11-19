import { t } from "../../shared/i18n/locale.js";
import {
  checkReminders, disableReminders, enableReminders, initializeReminders,
  reminderView, setReminderDetails, syncReminders, testReminders, watchReminders,
} from "./service.js";

export { changeReminderRevision, initializeReminders, scheduleForPush, syncReminders } from "./service.js";

const $ = id => document.getElementById(id);
function paint() {
  const view = reminderView();
  $("push-status").textContent = view.status;
  $("push-delivery").textContent = view.delivery;
  $("push-test-result").textContent = view.testResult;
  $("push-show-details").checked = view.showDetails;
  $("push-show-details").disabled = view.detailsBusy;
  $("push-enable").hidden = view.enabled && !view.reenable;
  $("push-enable").disabled = !view.canEnable || view.busy;
  $("push-disable").hidden = !view.enabled;
  $("push-disable").disabled = !view.enabled || view.busy;
  $("push-check").hidden = !view.canCheck && !view.retry;
  $("push-check").disabled = $("push-check").hidden || view.busy;
  $("push-check").textContent = t(view.retry ? "ui.try-again" : "ui.check-status");
  $("push-test").hidden = !view.enabled;
  $("push-test").disabled = !view.enabled || view.testBusy;
  $("settings-notification-state").textContent = view.badge;
  $("settings-notification-state").dataset.enabled = String(view.badgeEnabled);
  const today = $("today-reminders");
  if (today) today.hidden = !today.hasAttribute("data-eligible") || view.enabled;
}

$("push-show-details")?.addEventListener("change", event => void setReminderDetails(event.currentTarget.checked));
$("push-enable").addEventListener("click", enableReminders);
$("push-disable").addEventListener("click", disableReminders);
$("push-check").addEventListener("click", checkReminders);
$("push-test").addEventListener("click", testReminders);
watchReminders(paint);
window.addEventListener("online", () => void (reminderView().canEnable ? syncReminders(true) : initializeReminders()));
