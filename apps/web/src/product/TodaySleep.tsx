import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../../product-assets/public/medication/shared/i18n/locale.js";
import type { CareState } from "./productState";

export interface TodaySleepOptions {
  host: HTMLElement;
  day: number;
  today: number;
  visible: boolean;
  compact: boolean;
  personal: boolean;
  active: boolean;
  summary: string;
  detail: string;
  draft: CareState["sleepDraftWake"];
  start(): Promise<boolean>;
  wake(): Promise<boolean>;
  manual(): void;
  history(): void;
}

export function TodaySleep({
  host,
  day,
  today,
  visible,
  compact,
  personal,
  active,
  summary,
  detail,
  draft,
  start,
  wake,
  manual,
  history,
}: TodaySleepOptions) {
  const [pending, setPending] = useState<"start" | "wake">();
  const startButton = useRef<HTMLButtonElement>(null);
  const wakeButton = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const quick = personal && day === today;
  useLayoutEffect(() => {
    host.hidden = !visible || compact;
  }, [host, visible, compact]);
  async function save(
    action: () => Promise<boolean>,
    focus: HTMLButtonElement | null,
    source: "start" | "wake",
  ) {
    if (!quick || busy.current) return;
    busy.current = true;
    setPending(source);
    try {
      if (await action()) focus?.focus({ preventScroll: true });
    } finally {
      busy.current = false;
      setPending(undefined);
    }
  }
  return (
    <>
      <span className="tracker-art sleep-today-art" aria-hidden="true">
        <img
          src="/medication/assets/illustrations/sleep.webp"
          width="256"
          height="256"
          alt=""
        />
      </span>
      <div className="tracker-body">
        <h2 id="today-sleep-label">{t("ui.sleep")}</h2>
        <p id="today-sleep-detail">
          {[summary, detail].filter(Boolean).join(" · ") || t("ui.not-logged")}
        </p>
        <div className="tracker-actions">
          <button
            type="button"
            className="tracker-primary"
            id="today-sleep-start"
            hidden={!quick || active}
            disabled={pending === "start"}
            ref={startButton}
            onClick={() => void save(start, wakeButton.current, "start")}
          >
            {t("ui.sleep-quick-start")}
          </button>
          <button
            type="button"
            className="tracker-primary"
            id="today-sleep-wake"
            hidden={!quick || !active}
            disabled={pending === "wake"}
            ref={wakeButton}
            onClick={() => void save(wake, startButton.current, "wake")}
          >
            {t("ui.sleep-wake-now")}
          </button>
          <button
            type="button"
            className="secondary"
            id="today-sleep-manual"
            hidden={!personal || day > today}
            onClick={manual}
          >
            {t(
              quick && !active && draft
                ? "ui.sleep-finish-draft"
                : "ui.sleep-log",
            )}
          </button>
          <button
            type="button"
            className="secondary"
            id="today-sleep-history"
            data-destination="sleep"
            aria-label={t("ui.sleep-history")}
            onClick={(event) => {
              event.stopPropagation();
              history();
            }}
          >
            {t("ui.history")}
          </button>
        </div>
      </div>
      {createPortal(
        visible && compact ? summary : "",
        document.getElementById("program-sleep-summary")!,
      )}
    </>
  );
}
