import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import {
  defaultCalendar,
  language,
  locale,
  t,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import {
  appointmentDefaults,
  localZone,
  waterDefaults,
} from "../../../product-assets/public/medication/domain/care-plan.js";
import { timeZoneCity } from "../../../product-assets/public/medication/shared/ui/time-zone-picker.js";
import {
  accentOf,
  accentLabel,
} from "../../../product-assets/public/medication/styles/theme.js";
import { cycleIsEnabled } from "../../../product-assets/public/medication/domain/profile.js";
import { sleepIsEnabled } from "../../../product-assets/public/medication/domain/sleep.js";
import { fitDialogToViewport } from "../../../product-assets/public/medication/shared/ui/dom.js";
import { BackupPanel } from "../backups/BackupPanel";
import type { BackupOperations } from "../backups/backupOperations";
import { MedicationSnooze } from "../medication/MedicationSnooze";
import { Icon, PlanArtwork } from "../PlanCard";
import type { CareState } from "../product";
import { paintFeature } from "../renderer";
import { CyclePreferences, type MutateSettings } from "./CyclePreferences";
import { DeviceNotifications, NotificationBadge } from "./DeviceNotifications";
import { components, type PanelProps } from "./Preferences";

const panels = {
  "": [
    "ui.medora-settings",
    "ui.appearance-reminders-and-data",
    "control-settings",
  ],
  "profile-settings": [
    "ui.profile",
    "ui.personal-information-and-cycle",
    "control-user",
  ],
  "display-settings": [
    "ui.appearance-and-language",
    "ui.theme-calendar-and-app-language",
    "control-sun",
  ],
  "notification-settings": [
    "ui.notifications-on-this-device",
    "ui.medicine-water-appointment-and-routine-reminders",
    "notification",
  ],
  "cycle-settings": [
    "ui.cycle-tracking-settings",
    "ui.cycle-share-summary",
    "cycle",
  ],
  "sleep-settings": ["ui.sleep", "ui.sleep-settings-subtitle", "sleep"],
  "water-settings": ["ui.water", "ui.daily-goal-and-reminder-times", "water"],
  "snooze-settings": [
    "ui.medication-reminder-snooze",
    "ui.medication-snooze-duration",
    "bottle",
  ],
  "appointment-settings": [
    "ui.appointment-settings",
    "ui.appointment-settings-description",
    "visit-main",
  ],
  "backup-settings": [
    "ui.backups",
    "ui.create-or-restore-an-encrypted-backup",
    "backup",
  ],
} as const;

type Panel = keyof typeof panels;
type Section = Exclude<Panel, "">;
type Notice = { text: string; state: "error" | "success" };
const ids = Object.keys(panels).filter((key): key is Section => key !== "");
const number = new Intl.NumberFormat(locale).format;

interface Options {
  getState(): CareState | undefined;
  mutate: MutateSettings;
  refreshFields(container: HTMLElement): void;
  backup: BackupOperations;
}

function SleepArt() {
  return (
    <img
      className="glass-object"
      src="/medication/assets/illustrations/sleep.webp"
      alt=""
      width="256"
      height="256"
    />
  );
}

function SettingsHome({
  state,
  hidden,
  select,
}: {
  state: CareState | undefined;
  hidden: boolean;
  select(panel: Section): void;
}) {
  const water = state?.waterReminders ?? waterDefaults;
  const cycleEnabled = Boolean(state && cycleIsEnabled(state));
  const [, tick] = useState(0);
  useEffect(() => {
    const time = water.pauseUntil - Date.now();
    if (hidden || !water.enabled || time <= 0) return;
    const timer = setTimeout(() => tick((value) => value + 1), time);
    return () => clearTimeout(timer);
  }, [hidden, water.enabled, water.pauseUntil]);
  const waterStatus = !water.enabled
    ? "ui.reminders-off"
    : water.pauseUntil > Date.now()
      ? "ui.reminders-paused"
      : "ui.reminders-on";
  const appointment = state?.appointmentReminders ?? appointmentDefaults;
  const theme =
    state?.theme === "light"
      ? "ui.light"
      : state?.theme === "dark"
        ? "ui.dark"
        : "ui.system";
  const calendar =
    (state?.calendar ?? defaultCalendar) === "persian"
      ? "ui.solar-hijri"
      : "ui.gregorian";
  const row = (
    id: Section,
    summary: string,
    options?: { className?: string; linkId?: string; hide?: boolean },
  ) => (
    <button
      type="button"
      className={`settings-row${options?.className ? " " + options.className : ""}`}
      id={options?.linkId}
      hidden={options?.hide}
      data-settings-panel={id}
      onClick={() => select(id)}
    >
      <span className="settings-icon">
        {id === "sleep-settings" ? (
          <SleepArt />
        ) : (
          <PlanArtwork id={panels[id][2]} />
        )}
      </span>
      <span>
        {t(panels[id][0])}
        <small
          id={
            ["water", "sleep", "snooze", "appointment", "display"].includes(
              id.split("-")[0]!,
            )
              ? id.replace(/(.*)-settings/, "settings-$1-summary")
              : undefined
          }
        >
          {summary}
        </small>
      </span>
      <svg className="settings-chevron" aria-hidden="true">
        <use href="#i-back" />
      </svg>
    </button>
  );
  return (
    <div id="settings-home" hidden={hidden}>
      <button
        type="button"
        className="settings-hero"
        data-settings-panel="notification-settings"
        onClick={() => select("notification-settings")}
      >
        <span className="settings-hero-copy">
          <strong>{t(panels["notification-settings"][0])}</strong>
          <small>{t(panels["notification-settings"][1])}</small>
          <NotificationBadge />
        </span>
        <span className="settings-hero-art" aria-hidden="true">
          <PlanArtwork id="notification" />
        </span>
      </button>
      <h3>{t("ui.reminders")}</h3>
      <div className="settings-group">
        {row(
          "water-settings",
          t("ui.goal-value-ml", number(state?.waterGoal ?? 2000)) +
            " · " +
            t(waterStatus),
          { className: "water-row" },
        )}
        {row(
          "sleep-settings",
          t(
            !state || sleepIsEnabled(state)
              ? "ui.sleep-settings-subtitle"
              : "ui.sleep-disabled",
          ),
          { className: "sleep-row" },
        )}
        {row(
          "snooze-settings",
          t("ui.value-min", number(state?.medicationSnoozeMinutes ?? 10)),
          { className: "medicine-row" },
        )}
        {row(
          "appointment-settings",
          [
            timeZoneCity(state?.clinicTimeZone ?? localZone() ?? "UTC"),
            t(
              "ui.from-value-value",
              appointment.start.replace(/\d/g, (digit) =>
                number(Number(digit)),
              ),
              appointment.interval === 60
                ? t("ui.every-hour")
                : t("ui.every-two-hours"),
            ),
          ].join(" · "),
          { className: "visit-row" },
        )}
      </div>
      <h3>{t("ui.app-and-data")}</h3>
      <div className="settings-group">
        {row("profile-settings", t("ui.gender-and-cycle-visibility"))}
        {row("cycle-settings", t("ui.cycle-share-summary"), {
          linkId: "settings-open-cycle",
          hide: !cycleEnabled,
        })}
        {row(
          "display-settings",
          [
            t(theme),
            t(accentLabel(accentOf(state?.accent, cycleEnabled))),
            t(calendar),
            language === "fa" ? "فارسی" : "English",
          ].join(" · "),
        )}
        <button
          type="button"
          className="settings-row"
          id="settings-open-family"
          aria-haspopup="dialog"
          aria-controls="family-dialog"
        >
          <span className="settings-icon">
            <PlanArtwork id="control-user" />
          </span>
          <span>
            {t("ui.care-groups")}
            <small>{t("ui.groups-and-members")}</small>
          </span>
          <svg className="settings-chevron" aria-hidden="true">
            <use href="#i-back" />
          </svg>
        </button>
        {row("backup-settings", t("ui.create-or-restore-an-encrypted-backup"))}
        <button type="button" className="settings-row" data-open-account>
          <span className="settings-icon">
            <PlanArtwork id="control-user" />
          </span>
          <span>
            {t("ui.medora-account")}
            <small>{t("ui.optional-sign-in-with-a-username")}</small>
          </span>
          <svg className="settings-chevron" aria-hidden="true">
            <use href="#i-back" />
          </svg>
        </button>
      </div>
      <button
        id="open-support"
        type="button"
        className="secondary block-action"
      >
        {t("ui.report-an-issue-and-view-replies")}
      </button>
    </div>
  );
}

type SettingsHandle = { open(panel: Panel): void };

function SettingsDialog({
  dialog,
  getState,
  mutate,
  refreshFields,
  backup,
  fit,
  control,
}: Options & {
  dialog: HTMLDialogElement;
  fit(): void;
  control: Ref<SettingsHandle>;
}) {
  const [panel, setPanel] = useState<Panel>("");
  const [state, setState] = useState<CareState>();
  const [loaded, setLoaded] = useState<Partial<Record<Section, CareState>>>({});
  const [notice, setNotice] = useState<Notice>();
  const [session, setSession] = useState(0);
  const current = useRef({ panel, session, opening: false });
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const previous = useRef<Panel>("");
  const scroll = useRef(0);

  useImperativeHandle(control, () => ({
    open(destination) {
      const value = getState();
      if (!value) return;
      current.current = {
        panel: destination,
        session: current.current.session + 1,
        opening: true,
      };
      setSession(current.current.session);
      setLoaded(destination ? { [destination]: value } : {});
      setPanel(destination);
      setState(value);
      setNotice(undefined);
      scroll.current = 0;
    },
  }));

  function select(destination: Panel) {
    if (content.current && !panel) scroll.current = content.current.scrollTop;
    const value = getState();
    if (!value) return;
    previous.current = panel;
    current.current.panel = destination;
    setPanel(destination);
    setState(value);
    setNotice(undefined);
    if (destination)
      setLoaded((items) =>
        items[destination] ? items : { ...items, [destination]: value },
      );
  }

  useLayoutEffect(() => {
    dialog.dataset.panel = panel;
    if (content.current) content.current.scrollTop = panel ? 0 : scroll.current;
    if (current.current.opening) {
      current.current.opening = false;
      if (!dialog.open) dialog.showModal();
      fit();
    } else if (panel) heading.current?.focus({ preventScroll: true });
    else if (previous.current)
      dialog
        .querySelector<HTMLElement>(
          `[data-settings-panel="${previous.current}"]`,
        )
        ?.focus({ preventScroll: true });
  }, [dialog, fit, panel, session]);

  useEffect(() => {
    function cancel(event: Event) {
      if (!current.current.panel) return;
      event.preventDefault();
      select("");
    }
    function closed() {
      if (!dialog.open) setLoaded({});
    }
    dialog.addEventListener("cancel", cancel);
    dialog.addEventListener("close", closed);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.removeEventListener("close", closed);
    };
  });

  const reportError = (text: string) => setNotice({ text, state: "error" });
  const save: PanelProps["save"] = async (
    trigger,
    change,
    success,
    schedule,
  ) => {
    if (trigger.disabled) return false;
    const before = { ...current.current };
    trigger.disabled = true;
    setNotice(undefined);
    try {
      const saved = await mutate(change, success, schedule);
      const active =
        dialog.open &&
        before.session === current.current.session &&
        before.panel === current.current.panel;
      if (active) {
        setNotice({
          text: saved ? success : t("ui.could-not-save-try-again"),
          state: saved ? "success" : "error",
        });
        trigger.scrollIntoView({ block: "nearest" });
      }
      if (saved && dialog.open && !current.current.panel) setState(getState());
      return saved && active;
    } finally {
      trigger.disabled = false;
    }
  };

  function section(id: Section): ReactNode {
    if (id === "notification-settings") return <DeviceNotifications />;
    if (id === "backup-settings")
      return panel === id ? <BackupPanel {...backup} /> : null;
    const initial = loaded[id];
    if (!initial) return null;
    const props: PanelProps = {
      state: initial,
      save,
      refreshFields,
      reportError,
      invalidateDisplay: () =>
        setLoaded((values) => {
          const remaining = { ...values };
          delete remaining["display-settings"];
          return remaining;
        }),
    };
    if (id === "cycle-settings")
      return (
        <CyclePreferences {...props} getState={getState} mutate={mutate} />
      );
    if (id === "snooze-settings")
      return (
        <MedicationSnooze
          minutes={initial.medicationSnoozeMinutes ?? 10}
          save={(trigger, minutes) =>
            save(
              trigger,
              (item) => {
                item.medicationSnoozeMinutes = minutes;
              },
              t("ui.snooze-duration-saved"),
            )
          }
          invalid={() =>
            reportError(t("ui.enter-a-snooze-duration-from-1-to-1-440-minutes"))
          }
        />
      );
    const View = components[id];
    return <View {...props} />;
  }

  const [title, subtitle, artwork] = panels[panel];
  return (
    <>
      <div className="sheet-header">
        <span id="settings-heading-art" aria-hidden="true">
          {artwork === "sleep" ? <SleepArt /> : <PlanArtwork id={artwork} />}
        </span>
        <button
          type="button"
          id="settings-back"
          className="icon-button"
          aria-label={t("ui.back-to-settings")}
          hidden={!panel}
          onClick={() => select("")}
        >
          <Icon name="back" />
        </button>
        <div>
          <h2 id="settings-title" tabIndex={-1} ref={heading}>
            {t(title)}
          </h2>
          <p id="settings-subtitle">{t(subtitle)}</p>
        </div>
        <button
          className="icon-button"
          type="button"
          data-close="settings-dialog"
          aria-label={t("ui.close")}
          onClick={() => dialog.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      <div
        id="settings-content"
        className="sheet-body"
        ref={content}
        onInput={() => setNotice(undefined)}
      >
        <SettingsHome state={state} hidden={Boolean(panel)} select={select} />
        {ids.map((id) => (
          <section
            id={id}
            key={id}
            className={
              "settings-panel" +
              (id === "water-settings"
                ? " water-panel"
                : id === "cycle-settings" || id === "sleep-settings"
                  ? " health-settings"
                  : "")
            }
            hidden={panel !== id}
          >
            {section(id)}
          </section>
        ))}
      </div>
      <button
        id="save-appointment-settings"
        type="submit"
        form="appointment-settings-form"
        className="block-action"
        hidden={panel !== "appointment-settings"}
      >
        {t("ui.save-appointment-settings")}
      </button>
      <p
        id="settings-status"
        role="status"
        className="settings-message"
        data-state={notice?.state}
      >
        {notice?.text}
      </p>
    </>
  );
}

export function installSettingsDialog(options: Options) {
  const dialog = document.querySelector<HTMLDialogElement>("#settings-dialog")!;
  const control = { current: null as SettingsHandle | null };
  const fit = fitDialogToViewport(dialog);
  paintFeature(
    dialog,
    <SettingsDialog {...options} control={control} dialog={dialog} fit={fit} />,
  );
  return (notifications = false, section?: Section) =>
    control.current?.open(
      section ?? (notifications ? "notification-settings" : ""),
    );
}
