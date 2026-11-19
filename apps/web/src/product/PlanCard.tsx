import { useRef, type ReactNode } from "react";
import { t } from "../../product-assets/public/medication/shared/i18n/locale.js";
import { artworkPath } from "../../product-assets/public/medication/design/three-dimensional.js";

export function Icon({ name }: { name: string }) {
  return (
    <svg aria-hidden="true">
      <use href={"#i-" + name} />
    </svg>
  );
}

export function PlanArtwork({
  id,
  color,
  fallback,
  className,
  eager = false,
}: {
  id: string;
  color?: string | undefined;
  fallback?: string | undefined;
  className?: string;
  eager?: boolean;
}) {
  return (
    <img
      src={artworkPath(id, document.body.dataset.finish, color)}
      alt=""
      width={256}
      height={256}
      className={"glass-object" + (className ? " " + className : "")}
      data-art={id}
      data-art-color={color}
      decoding="async"
      loading={eager ? "eager" : "lazy"}
      onError={(event) => {
        if (!fallback) return;
        const image = event.currentTarget;
        const source = artworkPath(
          fallback,
          document.body.dataset.finish,
          undefined,
        );
        if (image.getAttribute("src") !== source) image.src = source;
      }}
    />
  );
}

export function PlanOptions({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const trigger = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDetailsElement>(null);
  function close() {
    if (!panel.current?.open) return;
    if (panel.current.contains(document.activeElement))
      trigger.current?.focus({ preventScroll: true });
    panel.current.open = false;
  }
  return (
    <details
      className="day-card-more"
      name="day-card-options"
      ref={panel}
      onKeyDown={(event) => {
        if (event.key === "Escape" && panel.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <summary ref={trigger} aria-label={label}>
        ⋯
      </summary>
      <div
        className="day-card-menu"
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("button:not([type=submit]), a[href]")
          )
            close();
        }}
      >
        {children}
      </div>
    </details>
  );
}

export function PlanDayCard({
  label,
  title,
  titleId,
  titleDirection = "auto",
  time,
  dateTime,
  art,
  details,
  actions,
  focusStatus,
  summary,
  untimed,
}: {
  label: string;
  title: string;
  titleId?: string | undefined;
  titleDirection?: "auto" | "inherit";
  time: string | null;
  dateTime?: string | undefined;
  art: ReactNode;
  details: ReactNode;
  actions?: ReactNode;
  focusStatus?: string | undefined;
  summary?: string | undefined;
  untimed?: boolean;
}) {
  const image = (
    <div className="day-card-art" aria-hidden="true">
      {art}
    </div>
  );
  const kind = <small className="day-card-kind">{label}</small>;
  const clock = time ? (
    <time className="day-card-time" dateTime={dateTime}>
      <bdi dir="ltr">{time}</bdi>
    </time>
  ) : untimed ? (
    <span
      className="day-card-time"
      role="img"
      aria-label={t("ui.no-scheduled-time")}
    >
      <Icon name="clock-off" />
    </span>
  ) : null;
  const copy = (
    <div className="day-card-content">
      {focusStatus ? (
        <div className="day-focus-context">
          {time && clock}
          <span className="day-focus-status">{focusStatus}</span>
        </div>
      ) : (
        kind
      )}
      <h3
        id={titleId}
        className="day-card-title"
        dir={titleDirection === "inherit" ? undefined : titleDirection}
      >
        {title}
      </h3>
      {!focusStatus && clock}
      {summary && <small className="day-card-summary">{summary}</small>}
      <div className="day-card-details">{details}</div>
    </div>
  );
  const controls = actions && <div className="day-card-actions">{actions}</div>;
  return focusStatus ? (
    <>
      <div className="day-focus-media">
        {image}
        {kind}
      </div>
      <div className="day-focus-copy">
        {copy}
        {controls}
      </div>
    </>
  ) : (
    <>
      {image}
      {copy}
      {controls}
    </>
  );
}
