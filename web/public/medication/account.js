import { language, t } from "./locale.js";
import { $, fitDialogToViewport } from "./dom.js";
const errors = {
  email: t("نشانی ایمیل را بررسی کنید."),
  rate_limit: t("درخواست‌های زیادی ثبت شده است. کمی بعد دوباره تلاش کنید."),
  invalid_code: t("کد معتبر نیست یا منقضی شده است. کد را بررسی کنید یا دوباره کد بگیرید."),
  delivery: t("ایمیل ارسال نشد. کمی بعد دوباره تلاش کنید."),
  unavailable: t("ورود ایمیلی هنوز در دسترس نیست.")
};

export function installAccount() {
  const dialog = $("account-dialog");
  const adminLink = $("open-admin");
  const fit = fitDialogToViewport(dialog);
  let email = "";
  let challenge = "";
  let busy = false;
  const controls = [...$("account-dialog").querySelectorAll('button[type="submit"]'), $("email-change"), $("email-logout")];

  function view(state, account) {
    $("email-start").hidden = state !== "email";
    $("email-verify").hidden = state !== "code";
    $("account-session").hidden = state !== "signed-in";
    $("account-address").textContent = account?.email ?? "";
    if (adminLink) adminLink.hidden = !account?.admin;
    $("account-dismiss").textContent = state === "signed-in" ? t("بازگشت به مدورا") : t("ادامه بدون ورود");
  }
  function status(text = "", error = false) {
    $("account-status").textContent = text;
    $("account-status").toggleAttribute("data-error", error);
  }
  async function request(route, body) {
    if (busy) return null;
    busy = true;
    controls.forEach(control => { control.disabled = true; });
    status(t("در حال ارتباط…"));
    try {
      const response = await fetch(`/api/auth/${route}`, body ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      } : {});
      const data = await response.json();
      if (!response.ok) {
        status(errors[data.error] ?? t("ارتباط برقرار نشد. دوباره تلاش کنید."), true);
        return null;
      }
      status();
      return data;
    } catch {
      status(t("ارتباط برقرار نشد. اتصال اینترنت را بررسی کنید."), true);
      return null;
    } finally {
      busy = false;
      controls.forEach(control => { control.disabled = false; });
    }
  }

  async function open() {
    if (busy || dialog.open) return;
    view("loading");
    dialog.showModal();
    fit();
    const data = await request("session");
    if (data?.email) view("signed-in", data);
    else if (data?.available) {
      view(challenge ? "code" : "email");
      if (dialog.open) $(challenge ? "account-code" : "account-email").focus();
    }
    else if (data) status(errors.unavailable);
  }
  for (const button of document.querySelectorAll("[data-open-account]")) button.addEventListener("click", open);
  $("email-start").addEventListener("submit", async event => {
    event.preventDefault();
    const address = $("account-email").value.trim();
    const data = await request("start", { email: address, ...(language === "en" ? { language } : {}) });
    if (!data) return;
    email = address;
    challenge = data.challenge;
    $("account-recipient").textContent = email;
    $("account-code").value = "";
    view("code");
    if ($("account-dialog").open) $("account-code").focus();
  });
  $("email-verify").addEventListener("submit", async event => {
    event.preventDefault();
    const code = $("account-code").value.replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) & 15));
    const data = await request("verify", { email, challenge, code });
    if (!data) return;
    challenge = email = "";
    $("email-verify").reset();
    $("email-start").reset();
    $("account-recipient").textContent = "";
    view("signed-in", data);
    if ($("account-dialog").open) $("account-dismiss").focus();
  });
  $("email-change").addEventListener("click", () => {
    challenge = "";
    status();
    view("email");
    $("account-email").focus();
  });
  $("email-logout").addEventListener("click", async () => {
    if (!await request("logout", {})) return;
    view("email");
    status(t("از حساب خارج شدید."));
    if ($("account-dialog").open) $("account-email").focus();
  });
  return open;
}
