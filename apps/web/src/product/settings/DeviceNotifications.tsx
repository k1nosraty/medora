import { useSyncExternalStore } from "react";
import { t } from "../../../product-assets/public/medication/shared/i18n/locale.js";
import {
  checkReminders,
  disableReminders,
  enableReminders,
  reminderView,
  setReminderDetails,
  testReminders,
  watchReminders,
} from "../../../product-assets/public/medication/features/reminders/service.js";

export function NotificationBadge() {
  const { badge, badgeEnabled } = useSyncExternalStore(
    watchReminders,
    reminderView,
  );
  return (
    <span
      id="settings-notification-state"
      className="settings-state"
      data-enabled={badgeEnabled}
    >
      {badge}
    </span>
  );
}

export function DeviceNotifications() {
  const view = useSyncExternalStore(watchReminders, reminderView);
  return (
    <>
      <div className="settings-callout">
        <h3>{t("ui.device-notification-status")}</h3>
        <p id="push-status" role="status">
          {view.status}
        </p>
      </div>
      <div className="settings-push-actions" aria-busy={view.busy}>
        <button
          id="push-enable"
          type="button"
          className="primary-action"
          hidden={view.enabled && !view.reenable}
          disabled={!view.canEnable || view.busy}
          onClick={enableReminders}
        >
          {t("ui.enable-notifications")}
        </button>
        <button
          id="push-test"
          type="button"
          className="primary-action"
          hidden={!view.enabled}
          disabled={!view.enabled || view.testBusy}
          onClick={testReminders}
        >
          {t("ui.test-this-device")}
        </button>
        <button
          id="push-check"
          type="button"
          className="secondary"
          hidden={!view.canCheck && !view.retry}
          disabled={(!view.canCheck && !view.retry) || view.busy}
          onClick={checkReminders}
        >
          {t(view.retry ? "ui.try-again" : "ui.check-status")}
        </button>
      </div>
      <label className="routine-check">
        <input
          id="push-show-details"
          type="checkbox"
          aria-describedby="push-privacy"
          checked={view.showDetails}
          disabled={view.detailsBusy}
          onChange={(event) =>
            void setReminderDetails(event.currentTarget.checked)
          }
        />
        {t("ui.show-names-and-details-in-notifications")}
      </label>
      <p id="push-privacy" className="quiet">
        {t("ui.these-details-are-sent-to-the-notification-server-and-may")}
      </p>
      <p id="push-test-result" className="settings-message" role="status">
        {view.testResult}
      </p>
      <details id="push-details" className="editor-options">
        <summary>{t("ui.delivery-details")}</summary>
        <p id="push-delivery" className="quiet" role="status">
          {view.delivery}
        </p>
        <p className="quiet">
          {t("ui.medora-sends-your-schedule-and-whether-you-met-your-water")}
        </p>
      </details>
      <button
        id="push-disable"
        type="button"
        className="text-button danger-link block-action"
        hidden={!view.enabled}
        disabled={!view.enabled || view.busy}
        onClick={disableReminders}
      >
        {t("ui.turn-off-notifications")}
      </button>
    </>
  );
}
