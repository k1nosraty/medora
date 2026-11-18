import { useState } from "react";
import { paintFeature } from "./renderer";

type Locale = "fa" | "en";
declare const MEDORA_WELCOME_COPY: Record<
  Locale,
  Record<
    "title" | "subtitle" | "description" | "start" | "privacy" | "error",
    string
  >
>;

function preferredLanguage(): Locale {
  try {
    return localStorage.getItem("medora-language") === "en" ? "en" : "fa";
  } catch {
    return "fa";
  }
}

function switchLanguage(next: Locale) {
  try {
    localStorage.setItem("medora-language", next);
  } catch {
    return;
  }
  location.reload();
}

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

function Welcome({
  language,
  start,
}: {
  language: Locale;
  start: () => Promise<boolean>;
}) {
  const persian = language === "fa";
  const text = MEDORA_WELCOME_COPY[language];
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function advance() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      setFailed(!(await start()));
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
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
            onClick={() => switchLanguage(persian ? "en" : "fa")}
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
        <h1>{text.title}</h1>
        <h2>{text.subtitle}</h2>
        <p>{text.description}</p>
        <button
          type="button"
          id="welcome-start"
          className="block-action"
          disabled={pending}
          onClick={() => void advance()}
        >
          {text.start}
        </button>
        {failed && <p role="alert">{text.error}</p>}
        <p className="quiet">{text.privacy}</p>
      </div>
    </>
  );
}

export function hasStarted(care: IntroState) {
  const existing = [
    care.medicines,
    care.doses,
    care.visits,
    care.routines,
    care.routineLogs,
  ].some((records) => Object.keys(records ?? {}).length > 0);
  return Boolean(
    care.intro === "done" ||
    existing ||
    care.water?.length ||
    care.reminders ||
    care.theme ||
    care.calendar ||
    care.waterGoal,
  );
}

function show(done: boolean) {
  document.querySelector<HTMLElement>(".app-bar")!.hidden = !done;
  document.getElementById("care-main")!.hidden = !done;
  document.getElementById("app")!.hidden = !done;
  document.getElementById("welcome-screen")!.hidden = done;
}

export function showWelcome(start: () => Promise<boolean>) {
  const language = preferredLanguage();
  document.documentElement.lang = language;
  document.documentElement.dir = language === "en" ? "ltr" : "rtl";
  const manifest = document.querySelector<HTMLLinkElement>(
    'link[rel="manifest"]',
  );
  if (manifest && language === "en") manifest.href = "/manifest.en.webmanifest";
  paintFeature(
    document.getElementById("welcome-screen")!,
    <Welcome start={start} language={language} />,
  );
  show(false);
}

export function showIntro(care: IntroState, save: Save) {
  if (hasStarted(care)) show(true);
  else showWelcome(() => finishIntro(save));
}

export async function finishIntro(save: Save) {
  const saved = await save((state) => {
    state.intro = "done";
  }, "");
  if (saved) {
    show(true);
    document.getElementById("screen-title")!.focus();
  }
  return saved;
}
