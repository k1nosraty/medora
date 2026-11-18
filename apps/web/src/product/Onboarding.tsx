import {
  language,
  selectLanguage,
  t,
} from "../../../../web/public/medication/shared/i18n/locale.js";

import { paintFeature } from "./renderer";

type IntroState = {
  intro?: string;
  medicines: object;
  doses: object;
  water?: unknown[];
  visits?: object;
  routines?: object;
  routineLogs?: object;
  reminders?: unknown;
  theme?: string;
  calendar?: string;
  waterGoal?: number;
};
type Save = (
  change: (state: IntroState) => void,
  message: string,
) => Promise<boolean>;

function Welcome({ start }: { start: () => void }) {
  const persian = language === "fa";
  return (
    <>
      <svg className="intro-landscape" aria-hidden="true">
        <use href="#i-landscape" />
      </svg>
      <div className="intro-content">
        <div className="welcome-top">
          <span className="brand-mark">
            <svg aria-hidden="true">
              <use href="#i-mark" />
            </svg>
          </span>
          <button
            type="button"
            className="language-switch secondary"
            data-language-switch=""
            lang={persian ? "en" : "fa"}
            aria-label={persian ? "Switch to English" : "تغییر زبان به فارسی"}
            onClick={() => selectLanguage(persian ? "en" : "fa")}
          >
            {persian ? "English" : "فارسی"}
          </button>
        </div>
        <img
          className="welcome-art"
          src="/medication/assets/illustrations/care.svg"
          alt=""
          width="560"
          height="350"
        />
        <h1>{t("ui.medora")}</h1>
        <h2>{t("ui.your-health-every-day")}</h2>
        <p>{t("ui.reminders-for-medicines-water-and-appointments")}</p>
        <button
          type="button"
          id="welcome-start"
          className="block-action"
          onClick={start}
        >
          {t("ui.get-started")}
        </button>
        <p className="quiet">{t("ui.your-records-stay-on-this-device")}</p>
      </div>
    </>
  );
}

export function showIntro(care: IntroState, save: Save) {
  const welcome = document.getElementById("welcome-screen")!;
  function show(done: boolean) {
    document.querySelector<HTMLElement>(".app-bar")!.hidden = !done;
    document.getElementById("care-main")!.hidden = !done;
    document.getElementById("app")!.hidden = !done;
    welcome.hidden = done;
  }
  const existing = [
    care.medicines,
    care.doses,
    care.visits,
    care.routines,
    care.routineLogs,
  ].some((records) => Object.keys(records ?? {}).length > 0);
  const done = Boolean(
    care.intro === "done" ||
    existing ||
    care.water?.length ||
    care.reminders ||
    care.theme ||
    care.calendar ||
    care.waterGoal,
  );
  show(done);
  if (done) return;
  const start = async () => {
    if (
      await save((state) => {
        state.intro = "done";
      }, "")
    ) {
      show(true);
      document.getElementById("screen-title")!.focus();
    }
  };
  paintFeature(welcome, <Welcome start={() => void start()} />);
}
