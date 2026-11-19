import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import {
  defaultCalendar,
  language,
  locale,
  selectLanguage,
  t,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import { accentOf } from "../../../product-assets/public/medication/styles/theme.js";
import {
  ageAt,
  canEnableCycle,
  cycleIsEnabled,
  genders,
  validPersonalProfile,
} from "@medora/domain/browser/profile";
import { familyPlacementOf } from "@medora/domain/browser/family";
import {
  sleepDefaults,
  sleepIsEnabled,
  validSleepSettings,
} from "@medora/domain/browser/sleep";
import type { CareState } from "../productState";
import {
  AppointmentPreferences,
  WaterPreferences,
} from "./ReminderPreferences";
import { clearFeature, paintFeature } from "../renderer";

export interface PersonalProfile {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
}

export interface PanelProps {
  state: CareState;
  refreshFields(container: HTMLElement): void;
  reportError(message: string): void;
  save(
    control: HTMLButtonElement,
    change: (state: CareState) => void,
    success: string,
    schedule?: boolean,
  ): Promise<boolean>;
  invalidateDisplay(): void;
}
export type PreferencePanel = keyof typeof components;

function formSubmission(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form = event.currentTarget;
  const trigger = form.querySelector<HTMLButtonElement>('[type="submit"]');
  if (!trigger || trigger.disabled) return null;
  const data = new FormData(form);
  return {
    trigger,
    value: (name: string) => String(data.get(name) ?? "").trim(),
    values: (name: string) => data.getAll(name),
    has: (name: string) => data.has(name),
  };
}

function Display({ state, save }: PanelProps) {
  const berry = cycleIsEnabled(state);
  return (
    <form
      id="display-form"
      onSubmit={async (event) => {
        const form = formSubmission(event);
        if (!form) return;
        const theme = form.value("theme");
        const calendar = form.value("calendar");
        const accent = form.value("accent");
        const familyPlacement = familyPlacementOf(
          form.value("familyPlacement"),
        );
        const nextLanguage = form.value("language");
        if (
          await save(
            form.trigger,
            (current) => {
              current.theme =
                theme === "light" || theme === "dark" ? theme : "system";
              current.accent = accentOf(accent, cycleIsEnabled(current));
              current.calendar = calendar === "persian" ? "persian" : "gregory";
              current.familyPlacement = familyPlacement;
            },
            t("ui.display-settings-saved"),
          )
        )
          selectLanguage(nextLanguage);
      }}
    >
      <fieldset className="settings-themes">
        <legend>{t("ui.appearance")}</legend>
        {["system", "light", "dark"].map((theme) => (
          <label key={theme}>
            <input
              type="radio"
              name="theme"
              value={theme}
              defaultChecked={theme === (state.theme ?? "system")}
            />
            <span
              className="theme-sample"
              data-theme-sample={theme}
              aria-hidden="true"
            />
            <span>{t(`ui.${theme}`)}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="settings-themes settings-accents">
        <legend>{t("ui.accent-color")}</legend>
        <div className="settings-accent-options">
          {["blue", "green", "lilac", "coral", "amber", "berry"].map(
            (accent) => {
              const unavailable = accent === "berry" && !berry;
              return (
                <label
                  key={accent}
                  id={accent === "berry" ? "settings-berry-choice" : undefined}
                  hidden={unavailable}
                >
                  <input
                    type="radio"
                    name="accent"
                    value={accent}
                    defaultChecked={accent === accentOf(state.accent, berry)}
                    disabled={unavailable}
                  />
                  <span
                    className="accent-sample"
                    data-accent-sample={accent}
                    aria-hidden="true"
                  />
                  <span>{t(`ui.${accent}`)}</span>
                </label>
              );
            },
          )}
        </div>
      </fieldset>
      <label>
        {t("ui.calendar")}
        <select
          id="calendar-setting"
          name="calendar"
          defaultValue={state.calendar ?? defaultCalendar}
        >
          <option value="persian">{t("ui.solar-hijri")}</option>
          <option value="gregory">{t("ui.gregorian")}</option>
        </select>
      </label>
      <label>
        {t("ui.app-language")}
        <select id="app-language" name="language" defaultValue={language}>
          <option value="fa" lang="fa">
            فارسی
          </option>
          <option value="en" lang="en">
            English
          </option>
        </select>
      </label>
      <label>
        {t("ui.active-group-bar-placement")}
        <select
          id="settings-family-placement"
          name="familyPlacement"
          defaultValue={familyPlacementOf(state.familyPlacement)}
        >
          <option value="top">{t("ui.top-of-today")}</option>
          <option value="bottom">{t("ui.bottom-of-today")}</option>
          <option value="hidden">{t("ui.hidden")}</option>
        </select>
      </label>
      <button type="submit" className="block-action">
        {t("ui.save-changes")}
      </button>
    </form>
  );
}

function Profile({
  state,
  refreshFields,
  reportError,
  save,
  invalidateDisplay,
}: PanelProps) {
  const [birth, setBirth] = useState(state.personalProfile?.birthDate ?? "");
  const [gender, setGender] = useState(
    genders.includes(state.gender ?? "") ? (state.gender ?? "") : "",
  );
  const [cycle, setCycle] = useState(Boolean(cycleIsEnabled(state)));
  const dialogForm = useRef<HTMLFormElement>(null);
  const now = new Date();
  const max = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  const age = ageAt(birth, now);
  const canTrack = canEnableCycle({ gender });
  useLayoutEffect(() => {
    if (dialogForm.current) refreshFields(dialogForm.current);
  });
  return (
    <form
      id="profile-form"
      className="medora-profile-form"
      ref={dialogForm}
      onSubmit={async (event) => {
        const form = formSubmission(event);
        if (!form) return;
        const profile: PersonalProfile = {};
        const firstName = form.value("firstName"),
          lastName = form.value("lastName");
        const height = form.value("heightCm"),
          weight = form.value("weightKg");
        if (firstName) profile.firstName = firstName;
        if (lastName) profile.lastName = lastName;
        if (birth) profile.birthDate = birth;
        if (height) profile.heightCm = Number(height);
        if (weight) profile.weightKg = Number(weight);
        if (!validPersonalProfile(profile)) {
          reportError(t("ui.check-your-name-date-of-birth-height-and-weight"));
          return;
        }
        const selectedGender = genders.includes(gender) ? gender : "";
        await save(
          form.trigger,
          (current) => {
            current.personalProfile = profile;
            current.gender = selectedGender;
            current.cycleEnabled =
              cycle && canEnableCycle({ gender: selectedGender });
            invalidateDisplay();
          },
          t("ui.profile-saved"),
          true,
        );
      }}
    >
      <div className="family-hero">
        <img
          src="/design/optical-glass/control-user.webp"
          data-art="control-user"
          alt=""
          width={86}
          height={86}
        />
        <h3>{t("ui.my-profile")}</h3>
      </div>
      <div className="family-field-pair">
        <label>
          {t("نام")}
          <input
            id="profile-first-name"
            name="firstName"
            maxLength={60}
            autoComplete="given-name"
            dir="auto"
            defaultValue={state.personalProfile?.firstName}
          />
        </label>
        <label>
          {t("ui.last-name")}
          <input
            id="profile-last-name"
            name="lastName"
            maxLength={60}
            autoComplete="family-name"
            dir="auto"
            defaultValue={state.personalProfile?.lastName}
          />
        </label>
      </div>
      <div className="family-field-pair">
        <div className="picker-control" data-picker-host="">
          <label>
            {t("ui.date-of-birth")}
            <input
              id="profile-birth-date"
              type="date"
              autoComplete="bday"
              hidden
              max={max}
              value={birth}
              onInput={(event) => setBirth(event.currentTarget.value)}
            />
          </label>
          <button type="button" className="secondary picker-field" />
        </div>
        <p className="family-age">
          <span>{t("ui.age")}</span>
          <output id="profile-age" htmlFor="profile-birth-date">
            {age === null
              ? "—"
              : t(
                  "ui.value-years-old",
                  new Intl.NumberFormat(locale).format(age),
                )}
          </output>
        </p>
      </div>
      <div className="family-field-pair">
        <label>
          {t("ui.height-cm")}
          <input
            id="profile-height"
            name="heightCm"
            type="number"
            inputMode="decimal"
            min={0.1}
            max={300}
            step={0.1}
            dir="ltr"
            defaultValue={state.personalProfile?.heightCm}
          />
        </label>
        <label>
          {t("ui.weight-kg")}
          <input
            id="profile-weight"
            name="weightKg"
            type="number"
            inputMode="decimal"
            min={0.1}
            max={650}
            step={0.1}
            dir="ltr"
            defaultValue={state.personalProfile?.weightKg}
          />
        </label>
      </div>
      <label>
        {t("ui.gender-optional")}
        <select
          id="profile-gender"
          value={gender}
          onChange={(event) => {
            const gender = event.target.value;
            setGender(gender);
            if (!canEnableCycle({ gender })) setCycle(false);
          }}
        >
          <option value="">{t("ui.not-selected")}</option>
          <option value="female">{t("ui.woman")}</option>
          <option value="male">{t("ui.man")}</option>
          <option value="undisclosed">{t("ui.prefer-not-to-say")}</option>
        </select>
      </label>
      <label className="feature-head editor-switch settings-switch profile-cycle-switch">
        {t("ui.menstrual-cycle")}
        <input
          id="profile-cycle-enabled"
          type="checkbox"
          role="switch"
          aria-describedby="profile-cycle-hint"
          disabled={!canTrack}
          checked={cycle}
          onChange={(event) => setCycle(event.target.checked)}
        />
      </label>
      <p id="profile-cycle-hint" className="quiet">
        {t(
          canTrack
            ? "چرخه اختیاری است. خاموش‌کردن آن سوابق را پاک نمی‌کند."
            : "با انتخاب «آقا»، چرخه غیرفعال است.",
        )}
      </p>
      <button type="submit" className="block-action">
        {t("ui.save-profile")}
      </button>
    </form>
  );
}

function SleepPreferences({
  state,
  refreshFields,
  reportError,
  save,
}: PanelProps) {
  const form = useRef<HTMLFormElement>(null);
  const preferences = { ...sleepDefaults, ...state.sleepSettings };
  const weekdays = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  });
  useLayoutEffect(() => {
    if (form.current) refreshFields(form.current);
  }, [refreshFields]);
  return (
    <form
      id="sleep-settings-form"
      className="settings-form"
      ref={form}
      onSubmit={(event) => {
        const fields = formSubmission(event);
        if (!fields) return;
        const options = {
          goal: Number(fields.value("goal")) * 60,
          mask: fields
            .values("day")
            .reduce<number>((mask, value) => mask | Number(value), 0),
          bedtime: fields.value("bedtime"),
          wake: fields.value("wake"),
          paused: fields.has("paused"),
        };
        if (!validSleepSettings(options)) {
          reportError(t("ui.sleep-check-settings"));
          return;
        }
        void save(
          fields.trigger,
          (current) => {
            current.sleepEnabled = fields.has("enabled");
            current.sleepCardSize =
              fields.value("size") === "compact" ? "compact" : "wide";
            current.sleepSettings = { ...current.sleepSettings, ...options };
          },
          t("ui.sleep-settings-saved"),
          true,
        );
      }}
    >
      <label className="editor-switch settings-switch">
        {t("ui.sleep-enable")}
        <input
          id="sleep-enabled"
          type="checkbox"
          name="enabled"
          role="switch"
          defaultChecked={sleepIsEnabled(state)}
        />
      </label>
      <label>
        {t("ui.today-card-size")}
        <select
          id="sleep-card-size"
          name="size"
          defaultValue={state.sleepCardSize ?? "wide"}
        >
          <option value="wide">{t("ui.wide-card")}</option>
          <option value="compact">{t("ui.compact-card")}</option>
        </select>
      </label>
      <label>
        {t("ui.sleep-goal")}
        <input
          id="sleep-goal"
          name="goal"
          type="number"
          min={0.5}
          max={24}
          step={0.5}
          inputMode="decimal"
          defaultValue={preferences.goal ? preferences.goal / 60 : ""}
        />
      </label>
      <fieldset className="sleep-reminder-settings">
        <legend>{t("ui.reminders")}</legend>
        <div className="settings-time-grid">
          {[
            ["bed", "bedtime"],
            ["wake", "wake"],
          ].map(([id, field]) => {
            const defaultValue =
              field === "bedtime" ? preferences.bedtime : preferences.wake;
            return (
              <div className="picker-control" data-picker-host="" key={id}>
                <label>
                  {t(`ui.sleep-reminder-${id}`)}
                  <input
                    id={`sleep-reminder-${id}`}
                    name={field}
                    type="time"
                    hidden
                    defaultValue={defaultValue}
                  />
                </label>
                <button type="button" className="secondary picker-field" />
              </div>
            );
          })}
        </div>
        <fieldset id="sleep-reminder-days" className="settings-choices">
          <legend>{t("ui.sleep-reminder-days")}</legend>
          <div id="sleep-weekday-options">
            {Array.from({ length: 7 }, (_, index) => {
              const day = (index + (language === "fa" ? 6 : 0)) % 7;
              const value = 1 << day;
              return (
                <label key={day}>
                  <input
                    type="checkbox"
                    name="day"
                    value={value}
                    defaultChecked={Boolean(preferences.mask & value)}
                  />
                  {" " + weekdays.format(Date.UTC(2026, 10, 15 + day))}
                </label>
              );
            })}
          </div>
        </fieldset>
        <label className="editor-switch settings-switch">
          {t("ui.sleep-pause")}
          <input
            id="sleep-reminder-pause"
            name="paused"
            type="checkbox"
            role="switch"
            defaultChecked={preferences.paused}
          />
        </label>
      </fieldset>
      <button type="submit" className="block-action">
        {t("ui.save-changes")}
      </button>
    </form>
  );
}

export const components = {
  "display-settings": Display,
  "profile-settings": Profile,
  "sleep-settings": SleepPreferences,
  "appointment-settings": AppointmentPreferences,
  "water-settings": WaterPreferences,
};
export function renderPreferences(
  host: HTMLElement,
  panel: PreferencePanel,
  props: PanelProps,
) {
  const Panel = components[panel];
  clearFeature(host);
  paintFeature(host, <Panel {...props} />);
}
