import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  appointmentDefaults,
  localZone,
  waterDefaults,
} from "../../../product-assets/public/medication/domain/care-plan.js";
import {
  locale,
  t,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { integer } from "../../../product-assets/public/medication/shared/ui/input-values.js";
import { timeZoneCity } from "../../../product-assets/public/medication/shared/ui/time-zone-picker.js";
import { TimeZoneChoices } from "./TimeZoneChoices";
import type { PanelProps } from "./Preferences";

function ClockField({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: string;
}) {
  return (
    <div className="picker-control" data-picker-host="">
      <label>
        {t(label)}
        <input
          id={id}
          type="time"
          name={id}
          required
          hidden
          defaultValue={value}
        />
      </label>
      <button type="button" className="secondary picker-field" />
    </div>
  );
}

export function AppointmentPreferences({
  state,
  refreshFields,
  reportError,
  save,
}: PanelProps) {
  const form = useRef<HTMLFormElement>(null);
  const device = localZone() ?? "UTC";
  const [automatic, setAutomatic] = useState(!state.clinicTimeZone);
  const [visited, setVisited] = useState(Boolean(state.clinicTimeZone));
  const [zone, setZone] = useState(state.clinicTimeZone ?? device);
  const appointment = state.appointmentReminders ?? appointmentDefaults;

  useLayoutEffect(() => {
    if (form.current) refreshFields(form.current);
  }, [refreshFields]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const start = String(data.get("appointment-reminders-start") ?? "");
    const interval = Number(data.get("interval"));
    if (!start || ![60, 120].includes(interval))
      return reportError(t("ui.check-the-reminder-start-time-and-interval"));
    const trigger = document.getElementById("save-appointment-settings");
    if (!(trigger instanceof HTMLButtonElement)) return;
    await save(
      trigger,
      (current) => {
        current.appointmentReminders = {
          ...current.appointmentReminders,
          start,
          interval,
        };
        if (automatic) delete current.clinicTimeZone;
        else current.clinicTimeZone = zone;
      },
      t("ui.appointment-settings-saved"),
      true,
    );
  }

  return (
    <form
      id="appointment-settings-form"
      noValidate
      ref={form}
      onSubmit={submit}
    >
      <fieldset className="clinic-zone-settings">
        <legend>{t("ui.clinic-time-zone")}</legend>
        <p className="quiet">{t("ui.clinic-zone-default-description")}</p>
        <label className="editor-switch">
          <span id="clinic-zone-automatic-label">
            {t("ui.clinic-zone-follow-device-value", timeZoneCity(device))}
          </span>
          <input
            id="clinic-zone-automatic"
            type="checkbox"
            role="switch"
            checked={automatic}
            onChange={(event) => {
              setAutomatic(event.target.checked);
              if (!event.target.checked) setVisited(true);
            }}
          />
        </label>
        <div id="clinic-zone-custom" hidden={automatic}>
          {visited && (
            <TimeZoneChoices
              id="clinic-zone"
              initial={state.clinicTimeZone ?? device}
              device={device}
              value={zone}
              onChange={setZone}
            />
          )}
        </div>
      </fieldset>
      <ClockField
        id="appointment-reminders-start"
        label="ui.start-reminders-on-the-appointment-day"
        value={appointment.start}
      />
      <label>
        {t("ui.repeat-until-the-appointment")}
        <select
          id="appointment-reminders-interval"
          name="interval"
          defaultValue={appointment.interval}
        >
          <option value={60}>{t("ui.every-hour")}</option>
          <option value={120}>{t("ui.every-two-hours")}</option>
        </select>
      </label>
      <p className="quiet">
        {t("ui.if-an-appointment-is-before-the-start-time-medora-sends-o")}
      </p>
    </form>
  );
}

const optionsFor = (
  choices: ReadonlyArray<readonly [number, string]>,
  value: number,
) => (
  <>
    {choices.map(([option, label]) => (
      <option key={option} value={option}>
        {t(label)}
      </option>
    ))}
    {!choices.some(([option]) => option === value) && (
      <option value={value} data-restored="">
        {t("ui.value-min", new Intl.NumberFormat(locale).format(value))}
      </option>
    )}
  </>
);

export function WaterPreferences({
  state,
  refreshFields,
  reportError,
  save,
}: PanelProps) {
  const [saved, setSaved] = useState(state.waterReminders ?? waterDefaults);
  const [enabled, setEnabled] = useState(saved.enabled);
  const [now, setNow] = useState(Date.now);
  const form = useRef<HTMLFormElement>(null);
  const goal = useRef<HTMLInputElement>(null);
  const repeatField = useRef<HTMLSelectElement>(null);
  const paused = saved.pauseUntil > now;

  useLayoutEffect(() => {
    if (form.current) refreshFields(form.current);
  });
  useEffect(() => {
    const remaining = saved.pauseUntil - Date.now();
    if (!saved.enabled || remaining <= 0) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(remaining, 2 ** 31 - 1),
    );
    return () => clearTimeout(timer);
  }, [now, saved.enabled, saved.pauseUntil]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const node = event.currentTarget;
    const submit = node.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    if (!submit) return;
    const data = new FormData(node);
    const goalMl = integer(String(data.get("goal") ?? ""));
    if (!(goalMl >= 1 && goalMl <= 20_000)) {
      goal.current?.focus();
      return reportError(t("ui.enter-a-water-goal-from-1-to-20-000-ml"));
    }
    const start = String(data.get("water-reminders-start") ?? "");
    const end = String(data.get("water-reminders-end") ?? "");
    const interval = Number(data.get("interval"));
    const repeat = Number(data.get("repeat"));
    if (enabled && (!start || !end || start >= end)) {
      node
        .querySelector<HTMLElement>('[data-for="water-reminders-end"]')
        ?.focus();
      return reportError(t("ui.the-end-time-must-be-after-the-start-time"));
    }
    if (
      enabled &&
      !(interval >= 15 && interval <= 240 && repeat >= 0 && repeat < interval)
    ) {
      const details = repeatField.current?.closest("details");
      if (details) details.open = true;
      repeatField.current?.focus();
      return reportError(
        t("ui.the-follow-up-must-come-before-the-next-reminder"),
      );
    }
    let next = saved;
    if (
      await save(
        submit,
        (current) => {
          const previous = current.waterReminders ?? waterDefaults;
          next = enabled
            ? { ...previous, start, end, interval, repeat, enabled }
            : { ...previous, enabled };
          current.waterGoal = goalMl;
          current.waterReminders = next;
        },
        t("ui.water-settings-saved"),
        true,
      )
    ) {
      setSaved(next);
      if (!enabled) {
        node.reset();
        if (goal.current) goal.current.value = String(goalMl);
        // Turning reminders off retains the last saved schedule.
        for (const [id, value] of [
          ["water-reminders-start", next.start],
          ["water-reminders-end", next.end],
          ["water-reminders-interval", next.interval],
          ["water-reminders-repeat", next.repeat],
        ] as const) {
          const field = node.querySelector<
            HTMLInputElement | HTMLSelectElement
          >("#" + id);
          if (field) field.value = String(value);
        }
        refreshFields(node);
      }
      setNow(Date.now());
    }
  }

  async function pause(control: HTMLButtonElement) {
    const time = Date.now();
    let next = saved;
    if (
      await save(
        control,
        (current) => {
          if (!current.waterReminders?.enabled)
            throw new Error("water reminders disabled");
          next = {
            ...current.waterReminders,
            pauseUntil: paused ? 0 : time + 3_600_000,
          };
          current.waterReminders = next;
        },
        t(
          paused
            ? "ui.water-reminders-resumed"
            : "ui.water-reminders-paused-for-one-hour",
        ),
        true,
      )
    ) {
      setSaved(next);
      setNow(time);
    }
  }

  return (
    <>
      <form id="water-goal-form" noValidate ref={form} onSubmit={submit}>
        <label>
          {t("ui.daily-goal-ml")}
          <input
            id="water-goal"
            ref={goal}
            name="goal"
            dir="ltr"
            inputMode="numeric"
            maxLength={5}
            defaultValue={state.waterGoal ?? 2000}
            required
          />
        </label>
        <label className="feature-head editor-switch settings-switch">
          {t("ui.water-reminders")}
          <input
            id="water-reminders-enabled"
            type="checkbox"
            role="switch"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
        </label>
        <div id="water-reminder-fields" hidden={!enabled}>
          <div className="settings-time-grid">
            <ClockField
              id="water-reminders-start"
              label="ui.start-reminders"
              value={saved.start}
            />
            <ClockField
              id="water-reminders-end"
              label="ui.end-reminders"
              value={saved.end}
            />
          </div>
          <label>
            {t("ui.reminder-interval")}
            <select
              id="water-reminders-interval"
              name="interval"
              defaultValue={saved.interval}
            >
              {optionsFor(
                [
                  [30, "ui.30-minutes"],
                  [60, "ui.one-hour"],
                  [120, "ui.two-hours"],
                ],
                saved.interval,
              )}
            </select>
          </label>
          <details className="editor-options">
            <summary>{t("ui.more-options")}</summary>
            <label>
              {t("ui.repeat-once")}
              <select
                id="water-reminders-repeat"
                ref={repeatField}
                name="repeat"
                defaultValue={saved.repeat}
              >
                {optionsFor(
                  [
                    [0, "ui.off"],
                    [5, "ui.after-5-minutes"],
                    [10, "ui.after-10-minutes"],
                    [15, "ui.after-15-minutes"],
                  ],
                  saved.repeat,
                )}
              </select>
            </label>
          </details>
        </div>
        <button type="submit" className="block-action">
          {t("ui.save-water-settings")}
        </button>
      </form>
      <div
        id="water-pause-card"
        className="settings-callout"
        hidden={!saved.enabled}
      >
        <h3>{t("ui.temporary-pause")}</h3>
        <p id="water-pause-status" className="quiet">
          {paused
            ? t(
                "ui.water-reminders-are-paused-until-value",
                new Intl.DateTimeFormat(locale, {
                  hour: "numeric",
                  minute: "2-digit",
                }).format(saved.pauseUntil),
              )
            : t("ui.water-reminders-resume-automatically-after-one-hour")}
        </p>
        <button
          id="water-reminders-pause"
          type="button"
          className="secondary"
          onClick={(event) => void pause(event.currentTarget)}
        >
          {t(paused ? "ui.resume-reminders" : "ui.pause-for-one-hour")}
        </button>
      </div>
    </>
  );
}
