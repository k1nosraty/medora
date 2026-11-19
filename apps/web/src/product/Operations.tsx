import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  language,
  t,
} from "../../product-assets/public/medication/shared/i18n/locale.js";
import { accountTransport } from "./accountTransport";
import { paintFeature } from "./renderer";
import { readTickets, sendTicket, type Ticket } from "./supportApi";
import { SupportTickets } from "./SupportTickets";

export async function loadOperations() {
  try {
    const response = await accountTransport("/api/operations", {
      credentials: "omit",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return true;
    const {
      flags,
      notice,
    }: {
      flags: { support: number; promotions: number };
      notice: { title: string; message: string } | null;
    } = await response.json();
    const bucket = Number(localStorage.getItem("medora-rollout") ?? -1);
    const assigned =
      bucket >= 0 && bucket < 100
        ? bucket
        : crypto.getRandomValues(new Uint16Array(1))[0]! % 100;
    if (assigned !== bucket)
      localStorage.setItem("medora-rollout", String(assigned));
    document.getElementById("open-support")!.hidden = assigned >= flags.support;
    if (notice) {
      const banner = document.getElementById("service-notice")!;
      banner.querySelector("strong")!.textContent = notice.title;
      banner.querySelector("p")!.textContent = notice.message;
      banner.hidden = false;
    }
    return assigned < flags.promotions;
  } catch {
    return true;
  }
}

export function installSupport() {
  const dialog = document.querySelector<HTMLDialogElement>("#support-dialog")!;
  const trigger = document.getElementById("open-support")!;
  paintFeature(dialog, <SupportDialog dialog={dialog} trigger={trigger} />);
}

function SupportDialog({
  dialog,
  trigger,
}: {
  dialog: HTMLDialogElement;
  trigger: HTMLElement;
}) {
  const [message, setMessage] = useState("");
  const [diagnostics, setDiagnostics] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [signIn, setSignIn] = useState(false);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const historyRequest = useRef<AbortController>(null);

  async function refreshHistory(reportSent = false) {
    historyRequest.current?.abort();
    const request = new AbortController();
    historyRequest.current = request;
    setStatus(t(reportSent ? "ui.report-sent" : "ui.checking"));
    try {
      const history = await readTickets(request.signal);
      if (request.signal.aborted) return;
      setSignIn(history === null);
      setTickets(history);
      setStatus(
        t(
          history === null
            ? "ui.sign-in-to-report-an-issue"
            : reportSent
              ? "ui.report-sent"
              : "",
        ),
      );
    } catch {
      if (!request.signal.aborted && !reportSent)
        setStatus(t("ui.support-is-unavailable"));
    }
  }

  useEffect(() => {
    const settings =
      document.querySelector<HTMLDialogElement>("#settings-dialog")!;
    const open = () => {
      setSignIn(false);
      setTickets(null);
      settings.close();
      dialog.showModal();
      void refreshHistory();
    };
    const close = () => {
      historyRequest.current?.abort();
      document
        .querySelector<HTMLElement>('.app-bar [data-destination="settings"]')
        ?.focus({ preventScroll: true });
    };
    trigger.addEventListener("click", open);
    dialog.addEventListener("close", close);
    return () => {
      historyRequest.current?.abort();
      trigger.removeEventListener("click", open);
      dialog.removeEventListener("close", close);
    };
  }, [dialog, trigger]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    historyRequest.current?.abort();
    setSending(true);
    setStatus("");
    try {
      const response = await sendTicket(message, diagnostics);
      if (response.status === 401) {
        setTickets(null);
        setSignIn(true);
        setStatus(t("ui.sign-in-to-report-an-issue"));
      } else if (response.ok) {
        setMessage((draft) => (draft === message ? "" : draft));
        setDiagnostics((checked) =>
          checked === diagnostics ? false : checked,
        );
        if (dialog.open) await refreshHistory(true);
      } else
        setStatus(
          t(
            response.status === 409
              ? "سقف ارسال گزارش پر شده است."
              : "گزارش ارسال نشد.",
          ),
        );
    } catch {
      setStatus(t("ui.report-could-not-be-sent"));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="sheet-header">
        <h2 id="support-title">{t("ui.medora-support")}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t("ui.close")}
          onClick={() => dialog.close()}
        >
          <svg aria-hidden="true">
            <use href="#i-close" />
          </svg>
        </button>
      </div>
      <div className="sheet-body">
        <form id="support-form" onSubmit={submit} aria-busy={sending}>
          <label>
            {t("ui.describe-the-issue")}
            <textarea
              id="support-message"
              rows={4}
              maxLength={1000}
              required
              dir="auto"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <p className="quiet">
            {t("ui.please-leave-health-information-and-account-passwords-out")}
          </p>
          <label>
            <input
              id="support-diagnostics"
              type="checkbox"
              checked={diagnostics}
              onChange={(event) => setDiagnostics(event.target.checked)}
            />
            {t("ui.include-app-version-device-type-and-notification-permissi")}
          </label>
          <button type="submit" className="block-action" disabled={sending}>
            {t("ui.send-report")}
          </button>
        </form>
        <p id="support-status" role="status">
          {status}
        </p>
        <a
          id="support-sign-in"
          href="/medication/?view=account"
          hidden={!signIn}
        >
          {t("ui.sign-in-to-medora-2")}
        </a>
        <div id="support-history">
          {tickets &&
            (tickets.length ? (
              <SupportTickets tickets={tickets} />
            ) : (
              <p className="quiet">
                {language === "fa"
                  ? "هنوز گزارشی ثبت نکرده‌اید."
                  : "You haven’t sent any reports yet."}
              </p>
            ))}
        </div>
      </div>
    </>
  );
}

export async function reportDailyOpen() {
  const key = "medora-last-open-report";
  let day: string | undefined;
  try {
    day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
      dateStyle: "short",
    }).format(new Date());
    if (localStorage.getItem(key) === day) return;
    localStorage.setItem(key, day);
    const response = await accountTransport("/api/operations/activity", {
      method: "POST",
      credentials: "omit",
      keepalive: true,
    });
    if (!response.ok) throw Error("Activity report unavailable");
  } catch {
    try {
      if (day && localStorage.getItem(key) === day)
        localStorage.removeItem(key);
    } catch {
      // Metrics must never interrupt the app.
    }
  }
}
