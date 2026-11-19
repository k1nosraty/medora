import type { FormEvent } from "react";
import { showFeedback } from "../../product-assets/public/medication/shared/ui/controls.js";
import {
  language,
  t,
} from "../../product-assets/public/medication/shared/i18n/locale.js";
import { fitDialogToViewport } from "../../product-assets/public/medication/shared/ui/dom.js";
import { accountTransport } from "./accountTransport";
import {
  AccountCredentials,
  type AccountScreen,
  type CredentialAction,
  type CredentialForm,
} from "./AccountCredentials";
import { AccountSync, type CareSync } from "./AccountSync";
import { paintFeature } from "./renderer";

const errors: Record<string, string> = {
  reset_retry: "ui.password-reset-retry",
  email: "نشانی ایمیل را بررسی کنید.",
  rate_limit: "درخواست‌های زیادی ثبت شده است. کمی بعد دوباره تلاش کنید.",
  invalid_code:
    "کد معتبر نیست یا منقضی شده است. کد را بررسی کنید یا دوباره کد بگیرید.",
  delivery: "ایمیل ارسال نشد. کمی بعد دوباره تلاش کنید.",
  unavailable: "ورود فعلاً در دسترس نیست.",
  credentials: "نام کاربری یا رمز عبور درست نیست.",
  username: "نام کاربری باید ۳ تا ۳۲ حرف انگلیسی، عدد یا زیرخط باشد.",
  password: "رمز عبور باید حداقل ۱۵ نویسه داشته باشد.",
  username_taken: "این نام کاربری قبلاً انتخاب شده. نام دیگری وارد کن.",
  already_registered:
    "برای این ایمیل قبلاً نام کاربری ثبت شده. از بخش ورود استفاده کن.",
  setup_expired: "مهلت ساخت حساب تموم شده. دوباره ایمیل رو تأیید کن.",
};
const screens: Record<
  AccountScreen,
  [string | null, string, string, string | undefined]
> = {
  login: [
    "password-login",
    "حساب مدورا",
    "برای ورود، نام کاربری و رمز عبورت رو وارد کن.",
    "login-username",
  ],
  email: [
    "email-start",
    "ساخت حساب مدورا",
    "مرحلهٔ ۱ از ۳ · نشانی ایمیل",
    "account-email",
  ],
  code: [
    "email-verify",
    "تأیید ایمیل",
    "مرحلهٔ ۲ از ۳ · کد تأیید",
    "account-code",
  ],
  setup: [
    "password-register",
    "نام کاربری و رمز",
    "مرحلهٔ ۳ از ۳ · مشخصات ورود",
    "register-username",
  ],
  resetEmail: [
    "reset-email-form",
    "بازیابی رمز عبور",
    "ایمیلی رو وارد کن که باهاش ثبت‌نام کردی.",
    "reset-email",
  ],
  resetCode: [
    "reset-password-form",
    "انتخاب رمز تازه",
    "کد ایمیل و رمز تازه‌ات رو وارد کن.",
    "reset-code",
  ],
  session: [
    "account-session",
    "حساب مدورا",
    "به حساب مدورا وارد شده‌ای.",
    undefined,
  ],
  loading: [null, "حساب مدورا", "", undefined],
};

interface AccountSession {
  email?: string;
  username?: string;
  admin?: boolean;
  available?: boolean;
  registrationAvailable?: boolean;
  error?: string;
  challenge?: string;
  grant?: string;
}
interface Options {
  sync: CareSync;
  formatDay(day: number): string;
  onSignIn(data: AccountSession): void;
  onSignOut(): void;
  onShortcut(panel: string): void;
}
type Route =
  | "session"
  | "register-code"
  | "confirm-email"
  | "register"
  | "login"
  | "logout"
  | "reset-code"
  | "reset-password";

const get = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id)! as T;
const field = (id: string) => get<HTMLInputElement>(id);
const codeFrom = (id: string) =>
  field(id).value.replace(/[۰-۹٠-٩]/g, (digit) =>
    String(digit.charCodeAt(0) & 15),
  );

export function installAccount({
  sync,
  formatDay,
  onSignIn,
  onSignOut,
  onShortcut,
}: Options) {
  const dialog = get<HTMLDialogElement>("account-dialog");
  const fit = fitDialogToViewport(dialog);
  const host = get("account-react");
  let screen: AccountScreen = "loading";
  let email = "";
  let challenge = "";
  let grant = "";
  let resetAddress = "";
  let resetChallenge = "";
  let resetSentAt = 0;
  let account: AccountSession | undefined;
  let registrationAvailable = false;
  let busy = false;
  let passwordReset = 0;

  function renderCredentials() {
    paintFeature(
      host,
      <>
        <AccountCredentials
          screen={screen}
          recipient={email}
          registrationAvailable={registrationAvailable}
          busy={busy}
          navigate={(next) => {
            status();
            view(next);
          }}
          submit={(event, form) => void submit(event, form)}
          action={(name) => void act(name)}
          passwordReset={passwordReset}
        />
        <div
          id="account-session"
          className="account-session"
          hidden={screen !== "session"}
        >
          <div className="account-identity">
            <span
              className="account-avatar"
              id="account-avatar"
              aria-hidden="true"
            >
              {(account?.username || account?.email || "")
                .slice(0, 1)
                .toUpperCase()}
            </span>
            <div>
              <strong
                id="account-username"
                dir="auto"
                hidden={!account?.username}
              >
                {account?.username}
              </strong>
              <bdi id="account-address">{account?.email}</bdi>
            </div>
          </div>
          <AccountSync
            sync={sync}
            dialog={dialog}
            formatDay={formatDay}
            hidden={!account?.username}
          />
          <div className="account-shortcuts">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              data-account-shortcut="notification-settings"
              onClick={() => shortcut("notification-settings")}
            >
              <svg aria-hidden="true">
                <use href="#i-bell" />
              </svg>
              {t("ui.notifications")}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              data-account-shortcut="backup-settings"
              onClick={() => shortcut("backup-settings")}
            >
              <svg aria-hidden="true">
                <use href="#i-lock" />
              </svg>
              {t("ui.backups")}
            </button>
          </div>
          <button
            type="button"
            className="block-action account-primary"
            id="legacy-setup"
            hidden={!account || Boolean(account.username)}
            disabled={busy}
            onClick={() => {
              status();
              view("setup");
            }}
          >
            {t("ui.set-username-and-password")}
          </button>
          <div className="buttons">
            <a id="open-admin" href="/admin/" hidden={!account?.admin}>
              {t("ui.admin-panel")}
            </a>
            <button
              type="button"
              id="email-logout"
              className="secondary"
              disabled={busy}
              onClick={() => void signOut()}
            >
              {t("ui.sign-out")}
            </button>
          </div>
        </div>
      </>,
    );
  }

  function shortcut(panel: string) {
    dialog.close();
    onShortcut(panel);
  }

  async function signOut() {
    if (!(await request("logout", {}))) return;
    account = undefined;
    view("login");
    status("از حساب خارج شدید.");
    onSignOut();
  }

  function view(next: AccountScreen, focus = true) {
    screen = next;
    renderCredentials();
    const [, title, intro, focusField] = screens[next];
    get("account-title").textContent = t(title);
    get("account-intro").textContent = t(
      next === "setup" && account
        ? "برای ورودهای بعدی، مشخصات ورودت رو بساز."
        : intro,
    );
    get("account-intro").hidden = !intro;
    get("account-dismiss").textContent = t(
      account ? "بازگشت به مدورا" : "ادامه بدون ورود",
    );
    get("account-local-note").hidden =
      Boolean(account) ||
      ["code", "setup", "resetEmail", "resetCode"].includes(next);
    if (dialog.open && focus)
      get(focusField ?? "account-dismiss").focus({ preventScroll: true });
  }

  function status(message = "", error = false) {
    showFeedback(get("account-status"), t(message), error ? "error" : "");
  }

  async function request(route: Route, body?: Record<string, string>) {
    if (busy) return null;
    busy = true;
    renderCredentials();
    status("در حال ارتباط…");
    try {
      const response = await accountTransport(
        "/api/auth/" + route,
        body
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {},
      );
      const data: AccountSession = await response.json();
      if (!response.ok) {
        const message =
          data.error === "unavailable" &&
          (route === "register-code" || route === "reset-code")
            ? "ارسال کد تأیید فعلاً در دسترس نیست."
            : data.error && errors[data.error];
        status(message || "ارتباط برقرار نشد. دوباره تلاش کنید.", true);
        if (data.error === "setup_expired" && !account) {
          grant = challenge = "";
          view("email");
        }
        if (data.error === "already_registered") {
          grant = challenge = "";
          clearPasswords();
          account = undefined;
          view("login");
        }
        return null;
      }
      status();
      return data;
    } catch {
      status("ارتباط برقرار نشد. اتصال اینترنت را بررسی کنید.", true);
      return null;
    } finally {
      busy = false;
      renderCredentials();
    }
  }

  function signedIn(data: AccountSession) {
    account = data;
    onSignIn(data);
    email = challenge = grant = "";
    field("login-username").value = data.username ?? "";
    field("account-email").value =
      field("account-code").value =
      field("register-username").value =
        "";
    view("session");
  }

  async function open() {
    if (busy || dialog.open) return;
    const previous = screen;
    view("loading", false);
    dialog.showModal();
    fit();
    const data = await request("session");
    registrationAvailable = Boolean(data?.registrationAvailable);
    if (data?.email) signedIn(data);
    else if (data?.available) {
      account = undefined;
      const pending = grant ? "setup" : challenge ? "code" : null;
      const reset =
        previous === "resetCode" && resetChallenge
          ? "resetCode"
          : previous === "resetEmail"
            ? "resetEmail"
            : null;
      view(
        reset ??
          pending ??
          (registrationAvailable && previous === "email" ? "email" : "login"),
        false,
      );
    } else {
      account = undefined;
      view("login", false);
      if (data) status(errors.unavailable, true);
    }
  }

  async function sendCode(address: string) {
    const data = await request("register-code", { email: address, language });
    if (!data?.challenge) return;
    email = address;
    challenge = data.challenge;
    field("account-code").value = "";
    view("code");
  }

  async function sendResetCode(address: string) {
    if (address === resetAddress && Date.now() - resetSentAt < 60_000) {
      view("resetCode");
      status("برای ارسال دوباره یک دقیقه صبر کن.", true);
      return;
    }
    const data = await request("reset-code", { email: address, language });
    if (!data?.challenge) return;
    resetAddress = address;
    resetChallenge = data.challenge;
    resetSentAt = Date.now();
    field("reset-code").value = "";
    view("resetCode");
  }

  function clearPasswords() {
    passwordReset++;
    renderCredentials();
  }

  function act(name: CredentialAction) {
    if (busy) return;
    if (name === "email-resend") return sendCode(email);
    if (name === "reset-resend") return sendResetCode(resetAddress);
    status();
    if (name === "email-change") {
      challenge = "";
      return view("email");
    }
    clearPasswords();
    if (name === "forgot-password" || name === "reset-change-email")
      return view("resetEmail");
    if (name === "setup-back") {
      grant = "";
      return view(account ? "session" : "login");
    }
    field("reset-code").value = "";
    view("login");
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
    form: CredentialForm,
  ) {
    event.preventDefault();
    if (busy || screen !== form) return;
    switch (form) {
      case "email":
        return sendCode(field("account-email").value.trim());
      case "resetEmail":
        return sendResetCode(field("reset-email").value.trim().toLowerCase());
      case "code": {
        const data = await request("confirm-email", {
          email,
          challenge,
          code: codeFrom("account-code"),
        });
        if (!data?.grant) return;
        grant = data.grant;
        challenge = field("account-code").value = "";
        view("setup");
        return;
      }
      case "resetCode": {
        const data = await request("reset-password", {
          email: resetAddress,
          challenge: resetChallenge,
          code: codeFrom("reset-code"),
          password: field("reset-password").value,
        });
        if (!data) return;
        clearPasswords();
        resetAddress =
          resetChallenge =
          field("reset-code").value =
          field("reset-email").value =
            "";
        resetSentAt = 0;
        view("login");
        status("رمز تازه ذخیره شد. حالا با نام کاربری و رمز تازه وارد شو.");
        return;
      }
      case "login": {
        const data = await request("login", {
          username: field("login-username").value,
          password: field("login-password").value,
        });
        clearPasswords();
        if (!data) return;
        const destination = new URLSearchParams(location.search).get("return");
        if (data.admin && destination === "preview")
          location.assign("/admin/preview/");
        else if (destination === "admin") location.assign("/admin/");
        else signedIn(data);
        return;
      }
      case "setup": {
        const data = await request("register", {
          ...(grant ? { email, grant } : {}),
          username: field("register-username").value,
          password: field("register-password").value,
        });
        if (data) {
          clearPasswords();
          signedIn(data);
        }
      }
    }
  }

  renderCredentials();
  dialog.addEventListener("close", clearPasswords);
  return open;
}
