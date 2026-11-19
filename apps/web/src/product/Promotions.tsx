import { useState } from "react";
import { t } from "../../product-assets/public/medication/shared/i18n/locale.js";
import { accountTransport } from "./accountTransport";
import { clearFeature, paintFeature } from "./renderer";

interface Promotion {
  id: string;
  creativeId?: string;
  title: string;
  description?: string;
  url?: string;
  linkLabel?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  frequency?: number;
  endsAt?: number;
}

function PromotionBanner({
  title,
  select,
}: {
  title: string;
  select(open: boolean): void;
}) {
  return (
    <>
      <p id="today-promotion-label" className="quiet">
        {t("ui.sponsored-message")}
      </p>
      <p id="today-promotion-title" dir="auto">
        {title}
      </p>
      <div className="buttons">
        <button
          id="today-promotion-open"
          type="button"
          className="secondary"
          aria-haspopup="dialog"
          onClick={() => select(true)}
        >
          {t("ui.promotion-open")}
        </button>
        <button
          id="today-promotion-dismiss"
          type="button"
          className="text-button"
          onClick={() => select(false)}
        >
          {t("ui.promotion-dismiss")}
        </button>
      </div>
    </>
  );
}

function PromotionDialog({
  promotion,
  close,
  click,
}: {
  promotion: Promotion;
  close(): void;
  click(): void;
}) {
  const [mediaFailed, setMediaFailed] = useState(false);
  const { title, description, url, linkLabel, mediaType, mediaUrl } = promotion;
  const onError = () => setMediaFailed(true);
  let creative;
  if (mediaUrl && !mediaFailed && mediaType === "video") {
    creative = (
      <video
        src={mediaUrl}
        controls
        playsInline
        preload="none"
        aria-label={title}
        onError={onError}
      />
    );
  } else if (mediaUrl && !mediaFailed && mediaType === "image") {
    const image = (
      <img
        src={mediaUrl}
        alt={title}
        referrerPolicy="no-referrer"
        onError={onError}
      />
    );
    creative = url ? (
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={click}>
        {image}
      </a>
    ) : (
      image
    );
  }
  return (
    <>
      <div className="sheet-header">
        <p className="quiet">{t("ui.sponsored-message")}</p>
      </div>
      <div className="sheet-body">
        <h2 id="promotion-title" data-promotion-title="" dir="auto">
          {title}
        </h2>
        <div
          id="promotion-creative"
          data-promotion-creative=""
          className="promotion-creative"
        >
          {creative}
        </div>
        <p id="promotion-description" data-promotion-description="" dir="auto">
          {description}
        </p>
        <div className="buttons">
          <button
            type="button"
            className="secondary"
            data-close="promotion-dialog"
            onClick={close}
          >
            {t("ui.skip")}
          </button>
          <a
            id="promotion-link"
            data-promotion-link=""
            className="promotion-action"
            rel="noreferrer"
            target="_blank"
            hidden={!url}
            href={url}
            onClick={click}
          >
            {linkLabel || t("ui.view-details")}
          </a>
        </div>
      </div>
    </>
  );
}

export function installPromotion(loadOperations: () => Promise<boolean>) {
  const dialog = document.querySelector<HTMLDialogElement>("#promotion-dialog");
  const today = document.querySelector<HTMLElement>('[data-screen="today"]');
  const app = document.getElementById("app");
  const banner = document.getElementById("today-promotion");
  if (!dialog || !today || !banner || !app) return;
  const hosts = { dialog, today, banner, app };
  const allowed = loadOperations();
  const key = "medora-promotion";
  const historyKey = "medora-promotion-history";
  let history: Record<string, string | number> = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fetching = false;
  let lastAttempt = 0;
  let retryAfter = 0;
  let retries = 0;
  let pending: { promotion: Promotion; expires: number } | undefined;
  let offer:
    | { promotion: Promotion; creativeId: string; day: string; expires: number }
    | undefined;

  function displayHistory() {
    try {
      const stored: typeof history = JSON.parse(
        localStorage.getItem(historyKey) ?? "{}",
      );
      const legacy = localStorage.getItem(key);
      if (legacy) {
        const id = legacy.slice(legacy.lastIndexOf(" ") + 1);
        if (!Object.hasOwn(stored, id)) stored[id] = 1;
      }
      return { ...stored, ...history };
    } catch {
      return history;
    }
  }

  function eligible() {
    return (
      navigator.onLine &&
      !document.hidden &&
      !hosts.app.hidden &&
      !hosts.today.hidden &&
      !document.querySelector("dialog[open]")
    );
  }

  function schedule() {
    clearTimeout(timer);
    if (!eligible()) return;
    const now = new Date();
    if (offer?.day === now.toDateString() && Date.now() < offer.expires) {
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(
        () => void check(),
        Math.min(offer.expires, +midnight) - +now,
      );
      return;
    }
    const after = Math.max(retryAfter, pending ? 0 : lastAttempt + 15_000);
    timer = setTimeout(() => void check(), Math.max(0, after - Date.now()));
  }

  async function check() {
    if (fetching || !eligible()) return;
    const day = new Date().toDateString();
    if (offer && (offer.day !== day || Date.now() >= offer.expires)) {
      hosts.banner.hidden = true;
      offer = undefined;
    }
    if (offer || displayHistory().day === day) return;
    try {
      if (localStorage.getItem(key)?.startsWith(day + " ")) return;
    } catch {
      // A blocked storage API leaves the in-memory display history available.
    }
    fetching = true;
    try {
      if (!(await allowed) || !eligible()) return;
      if (!pending || Date.now() >= pending.expires) {
        lastAttempt = Date.now();
        const response = await accountTransport("/api/promotion", {
          credentials: "omit",
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error("promotion_unavailable");
        retries = 0;
        const { promotion }: { promotion?: Promotion | null } =
          await response.json();
        if (!promotion) return;
        pending = {
          promotion,
          expires: Math.min(Date.now() + 15_000, promotion.endsAt ?? Infinity),
        };
      }
      if (!eligible() || Date.now() >= pending.expires) return;
      const { promotion } = pending;
      pending = undefined;
      const creativeId = promotion.creativeId ?? promotion.id;
      const seen = displayHistory();
      const previous = Number(
        Object.hasOwn(seen, creativeId) ? seen[creativeId] : 0,
      );
      if (seen.day === day || previous >= (promotion.frequency ?? 1)) return;
      offer = {
        promotion,
        creativeId,
        day,
        expires: promotion.endsAt ?? Infinity,
      };
      paintFeature(
        hosts.banner,
        <PromotionBanner title={promotion.title} select={selectOffer} />,
      );
      hosts.banner.hidden = false;
      schedule();
    } catch {
      retryAfter = Date.now() + 15_000;
      if (++retries <= 2) schedule();
    } finally {
      fetching = false;
    }
  }

  function selectOffer(open: boolean) {
    if (!offer) return;
    const { promotion, creativeId, day, expires } = offer;
    offer = undefined;
    const finish = () => {
      hosts.banner.hidden = true;
      document
        .querySelector<HTMLElement>(".dock button:not([hidden])")
        ?.focus({ preventScroll: true });
    };
    const seen = displayHistory();
    const previous = Number(
      Object.hasOwn(seen, creativeId) ? seen[creativeId] : 0,
    );
    if (
      day !== new Date().toDateString() ||
      Date.now() >= expires ||
      seen.day === day ||
      previous >= (promotion.frequency ?? 1)
    ) {
      finish();
      schedule();
      return;
    }
    history = { ...seen, [creativeId]: previous + Number(open), day };
    try {
      localStorage.setItem(historyKey, JSON.stringify(history));
    } catch {
      // The current tab still remembers the choice.
    }
    if (!open) {
      finish();
      return;
    }
    const count = (event: "click" | "impression") =>
      void accountTransport("/api/promotion/events", {
        method: "POST",
        credentials: "omit",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: promotion.id, event }),
      }).catch(() => {});
    let clicked = false;
    const click = () => {
      if (!clicked) count("click");
      clicked = true;
    };
    paintFeature(
      hosts.dialog,
      <PromotionDialog
        promotion={promotion}
        close={() => hosts.dialog.close()}
        click={click}
      />,
    );
    hosts.dialog.showModal();
    hosts.dialog.querySelector("button")?.focus({ preventScroll: true });
    hosts.dialog.addEventListener(
      "close",
      () => {
        if (!hosts.dialog.open) clearFeature(hosts.dialog);
        finish();
      },
      { once: true },
    );
    count("impression");
  }

  const observer = new MutationObserver(schedule);
  observer.observe(app, { attributeFilter: ["hidden"] });
  observer.observe(today, { attributeFilter: ["hidden"] });
  document.addEventListener("close", schedule, true);
  document.addEventListener("visibilitychange", schedule);
  window.addEventListener("online", schedule);
  schedule();
}
