import { language, t } from "./locale.js";
import { $, fitDialogToViewport } from "./dom.js";

const errors = {
  email: "نشانی ایمیل را بررسی کنید.",
  rate_limit: "درخواست‌های زیادی ثبت شده است. کمی بعد دوباره تلاش کنید.",
  invalid_code: "کد معتبر نیست یا منقضی شده است. کد را بررسی کنید یا دوباره کد بگیرید.",
  delivery: "ایمیل ارسال نشد. کمی بعد دوباره تلاش کنید.",
  unavailable: "ورود فعلاً در دسترس نیست.",
  credentials: "نام کاربری یا رمز عبور درست نیست.",
  username: "نام کاربری باید ۳ تا ۳۲ حرف انگلیسی، عدد یا زیرخط باشد.",
  password: "رمز عبور باید حداقل ۱۵ نویسه داشته باشد.",
  username_taken: "این نام کاربری قبلاً انتخاب شده. نام دیگری وارد کن.",
  already_registered: "برای این ایمیل قبلاً نام کاربری ثبت شده. از بخش ورود استفاده کن.",
  setup_expired: "مهلت ساخت حساب تموم شده. دوباره ایمیل رو تأیید کن."
};
const screens = {
  login: ["password-login", "حساب مدورا", "برای ورود، نام کاربری و رمز عبورت رو وارد کن.", "login-username"],
  email: ["email-start", "ساخت حساب مدورا", "مرحلهٔ ۱ از ۳ · نشانی ایمیل", "account-email"],
  code: ["email-verify", "تأیید ایمیل", "مرحلهٔ ۲ از ۳ · کد تأیید", "account-code"],
  setup: ["password-register", "نام کاربری و رمز", "مرحلهٔ ۳ از ۳ · مشخصات ورود", "register-username"],
  session: ["account-session", "حساب مدورا", "به حساب مدورا وارد شده‌ای."],
  loading: [null, "حساب مدورا", ""]
};

export function installAccount() {
  const dialog = $("account-dialog");
  const fit = fitDialogToViewport(dialog);
  const controls = [...dialog.querySelectorAll('button:not([data-close]):not([data-reveal-password])')];
  let state = "loading";
  let email = "";
  let challenge = "";
  let grant = "";
  let account;
  let registrationAvailable = false;
  let busy = false;

  function view(next, focus = true) {
    state = next;
    const [panel, title, intro, field] = screens[next];
    for (const [id] of Object.values(screens)) if (id) $(id).hidden = id !== panel;
    $("account-title").textContent = t(title);
    $("account-intro").textContent = t(next === "setup" && account ? "برای ورودهای بعدی، مشخصات ورودت رو بساز." : intro);
    $("account-intro").hidden = !intro;
    $("account-modes").hidden = !registrationAvailable || !["login", "email"].includes(next);
    for (const button of dialog.querySelectorAll("[data-account-mode]")) {
      button.setAttribute("aria-pressed", String(button.dataset.accountMode === next));
    }
    $("account-address").textContent = account?.email ?? "";
    $("account-username").textContent = account?.username ?? "";
    $("account-username").hidden = !account?.username;
    $("legacy-setup").hidden = !account || Boolean(account.username);
    $("open-admin").hidden = !account?.admin;
    $("account-dismiss").textContent = t(account ? "بازگشت به مدورا" : "ادامه بدون ورود");
    $("account-local-note").hidden = Boolean(account) || next === "code" || next === "setup";
    if (dialog.open && focus) $(field ?? "account-dismiss").focus({ preventScroll: true });
  }
  function status(message = "", error = false) {
    $("account-status").textContent = t(message);
    $("account-status").toggleAttribute("data-error", error);
  }
  async function request(route, body) {
    if (busy) return null;
    busy = true;
    controls.forEach(control => { control.disabled = true; });
    status("در حال ارتباط…");
    try {
      const response = await fetch(`/api/auth/${route}`, body ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      } : {});
      const data = await response.json();
      if (!response.ok) {
        const message = data.error === "unavailable" && route === "register-code" ?
          "ارسال کد تأیید فعلاً در دسترس نیست." : errors[data.error];
        status(message ?? "ارتباط برقرار نشد. دوباره تلاش کنید.", true);
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
      controls.forEach(control => { control.disabled = false; });
    }
  }

  function signedIn(data) {
    account = data;
    email = challenge = grant = "";
    $("login-username").value = data.username ?? "";
    $("account-email").value = $("account-code").value = $("register-username").value = "";
    view("session");
  }

  async function open() {
    if (busy || dialog.open) return;
    const previous = state;
    view("loading", false);
    dialog.showModal();
    fit();
    const data = await request("session");
    registrationAvailable = Boolean(data?.registrationAvailable);
    if (data?.email) signedIn(data);
    else if (data?.available) {
      account = undefined;
      const pending = grant ? "setup" : challenge ? "code" : null;
      view(pending ?? (registrationAvailable && previous === "email" ? "email" : "login"), false);
    } else {
      account = undefined;
      view("login", false);
      if (data) status(errors.unavailable, true);
    }
  }
  for (const button of document.querySelectorAll("[data-open-account]")) button.addEventListener("click", open);
  for (const button of dialog.querySelectorAll("[data-account-mode]")) {
    button.addEventListener("click", () => {
      status();
      view(button.dataset.accountMode);
    });
  }

  async function sendCode(address) {
    const data = await request("register-code", { email: address, language });
    if (!data) return;
    email = address;
    challenge = data.challenge;
    $("account-recipient").textContent = email;
    $("account-code").value = "";
    view("code");
  }
  $("email-start").addEventListener("submit", event => {
    event.preventDefault();
    void sendCode($("account-email").value.trim());
  });
  $("email-change").addEventListener("click", () => {
    challenge = "";
    status();
    view("email");
  });
  $("email-resend").addEventListener("click", () => void sendCode(email));
  $("email-verify").addEventListener("submit", async event => {
    event.preventDefault();
    const code = $("account-code").value.replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) & 15));
    const data = await request("confirm-email", { email, challenge, code });
    if (!data) return;
    grant = data.grant;
    challenge = $("account-code").value = "";
    view("setup");
  });
  $("legacy-setup").addEventListener("click", () => {
    status();
    view("setup");
  });
  $("setup-back").addEventListener("click", () => {
    grant = "";
    clearPasswords();
    status();
    view(account ? "session" : "login");
  });

  for (const button of dialog.querySelectorAll("[data-reveal-password]")) {
    button.addEventListener("click", () => {
      const field = $(button.dataset.revealPassword);
      field.type = field.type === "password" ? "text" : "password";
      button.textContent = t(field.type === "password" ? "نمایش" : "پنهان کردن");
    });
  }
  function clearPasswords() {
    for (const button of dialog.querySelectorAll("[data-reveal-password]")) {
      const field = $(button.dataset.revealPassword);
      field.value = "";
      field.type = "password";
      button.textContent = t("نمایش");
    }
  }
  dialog.addEventListener("close", clearPasswords);
  $("password-login").addEventListener("submit", async event => {
    event.preventDefault();
    const data = await request("login", { username: $("login-username").value, password: $("login-password").value });
    clearPasswords();
    if (data) signedIn(data);
  });
  $("password-register").addEventListener("submit", async event => {
    event.preventDefault();
    const data = await request("register", {
      ...(grant ? { email, grant } : {}),
      username: $("register-username").value,
      password: $("register-password").value
    });
    if (data) {
      clearPasswords();
      signedIn(data);
    }
  });
  $("email-logout").addEventListener("click", async () => {
    if (!await request("logout", {})) return;
    account = undefined;
    view("login");
    status("از حساب خارج شدید.");
  });
  return open;
}
