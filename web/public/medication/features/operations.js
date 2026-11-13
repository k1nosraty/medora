import { $, element } from "../shared/ui/dom.js";
import { t } from "../shared/i18n/locale.js";

export async function loadOperations() {
  try {
    const response = await fetch("/api/operations", { credentials: "omit", signal: AbortSignal.timeout(3000) });
    if (!response.ok) return true;
    const { flags, notice } = await response.json();
    const bucket = Number(localStorage.getItem("medora-rollout") ?? -1);
    const assigned = bucket >= 0 && bucket < 100 ? bucket : crypto.getRandomValues(new Uint16Array(1))[0] % 100;
    if (assigned !== bucket) localStorage.setItem("medora-rollout", String(assigned));
    $("open-support").hidden = assigned >= flags.support;
    if (notice) {
      const banner = $("service-notice");
      banner.querySelector("strong").textContent = notice.title;
      banner.querySelector("p").textContent = notice.message;
      banner.hidden = false;
    }
    return assigned < flags.promotions;
  } catch {
    return true;
  }
}

export function installSupport() {
  const dialog = $("support-dialog");
  const status = $("support-status");
  const history = $("support-history");
  const form = $("support-form");
  const show = async () => {
    status.textContent = "";
    history.replaceChildren();
    $("support-sign-in").hidden = true;
    try {
      const response = await fetch("/api/support", { cache: "no-store" });
      if (response.status === 401) {
        $("support-sign-in").hidden = false;
        status.textContent = t("برای ارسال گزارش مشکل وارد حساب مدورا شوید.");
        return;
      }
      if (!response.ok) throw new Error();
      const { tickets } = await response.json();
      for (const ticket of tickets) {
        const row = element("article", "", "support-ticket");
        row.append(element("strong", t(ticket.status === "closed" ? "بسته‌شده" : "در حال پیگیری")),
          element("p", ticket.message), ...(ticket.reply ? [element("p", ticket.reply)] : []));
        history.append(row);
      }
    } catch {
      status.textContent = t("پشتیبانی در دسترس نیست.");
    }
  };
  $("open-support").addEventListener("click", () => {
    $("settings-dialog").close();
    dialog.showModal();
    void show();
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = event.submitter;
    const body = { message: $("support-message").value };
    submit.disabled = true;
    try {
      if ($("support-diagnostics").checked) {
        let version = "";
        try {
          const sw = await fetch("/medication/sw.js", { cache: "no-store", signal: AbortSignal.timeout(1500) });
          version = (await sw.text()).match(/medora-medication-shell-([a-f0-9]+)/)?.[1] ?? "";
        } catch {}
        const agent = navigator.userAgent;
        body.diagnostics = { version, platform: /iPhone|iPad/.test(agent) ? "iOS" : /Android/.test(agent) ? "Android" : "Other",
          permission: globalThis.Notification?.permission ?? "unavailable" };
      }
      const response = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (response.status === 401) {
        $("support-sign-in").hidden = false;
        status.textContent = t("برای ارسال گزارش مشکل وارد حساب مدورا شوید.");
      } else if (response.ok) {
        form.reset();
        await show();
        status.textContent = t("گزارش ارسال شد.");
      } else status.textContent = t(response.status === 409 ? "سقف ارسال گزارش پر شده است." : "گزارش ارسال نشد.");
    } catch {
      status.textContent = t("گزارش ارسال نشد.");
    } finally {
      submit.disabled = false;
    }
  });
}


export async function reportDailyOpen() {
  const key = "medora-last-open-report";
  let day;
  try {
    day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", dateStyle: "short" }).format(new Date());
    if (localStorage.getItem(key) === day) return;
    localStorage.setItem(key, day);
    const response = await fetch("/api/operations/activity", { method: "POST", credentials: "omit", keepalive: true });
    if (!response.ok) throw new Error();
  } catch {
    try {
      if (day && localStorage.getItem(key) === day) localStorage.removeItem(key);
    } catch {
      // Metrics must never interrupt the app.
    }
  }
}
