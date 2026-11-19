import { Fragment } from "react";
import {
  localDigits,
  t,
} from "../../../product-assets/public/medication/shared/i18n/locale.js";
import {
  isoDay,
  type createCareIndex,
} from "../../../product-assets/public/medication/domain/care-index.js";
import { timeZoneCity } from "../../../product-assets/public/medication/shared/ui/time-zone-picker.js";
import { Icon, PlanDayCard, PlanOptions } from "../PlanCard";
import { clearFeature, mountCard, paintFeature } from "../renderer";
import type { CareState, FamilyView } from "../product";
import type { installDeletion } from "../DeleteConfirmation";
import { categoryLabel, categoryOf } from "./categories";
import {
  saveVisit,
  visitColor,
  type LocalVisit,
  type Visit,
  type VisitTarget,
} from "./model";
import { VisitArtwork, VisitEditor } from "./VisitEditor";

type Variant = "shelf" | "next" | "calendar" | "day-featured" | "day";
type Index = ReturnType<typeof createCareIndex>;
type VisitOptions = {
  today(): number;
  getState(): CareState | undefined;
  getFamilyView(): FamilyView | null;
  selectedDate(): number | undefined;
  formatDay(day: number, weekday?: boolean): string;
  formatDayNumber(day: number): string;
  formatShortMonth(day: number): string;
  requestDeletion: ReturnType<typeof installDeletion>;
  render(): void;
  refreshFields(host: HTMLElement): void;
  mutate(
    change: (state: CareState) => void,
    success: string,
    scheduleChanged?: boolean,
  ): Promise<boolean>;
};

function cardAttributes(local: LocalVisit, variant: Variant) {
  const day =
    variant === "day" || variant === "day-featured" || variant === "calendar";
  return {
    className:
      "visit visit-card " +
      (day ? "day-card" : "plan-panel-row visit-panel-row"),
    "data-focus-scope": "visit:" + local.visit.id,
    "data-ink": visitColor(local.visit.color),
    "data-card-kind": day ? "visit" : undefined,
    "data-featured": variant === "day-featured" ? "" : undefined,
  };
}

export function installAppointments(options: VisitOptions) {
  const {
    today,
    getState,
    getFamilyView,
    mutate,
    requestDeletion,
    refreshFields,
    formatDay,
    selectedDate,
    render,
  } = options;
  const editor = document.querySelector<HTMLDialogElement>("#visit-dialog")!;
  const chooser = document.querySelector<HTMLDialogElement>(
    "#visit-category-dialog",
  )!;
  const list = document.getElementById("visits")!;
  const summary = document.getElementById("visits-summary")!;
  let filter = "all";
  const pageSize = 20;
  let limit = pageSize;

  function close() {
    if (chooser.open) chooser.close();
    if (editor.open) editor.close();
  }
  for (const dialog of [editor, chooser])
    dialog.addEventListener("close", () => {
      if (!dialog.open) clearFeature(dialog);
    });

  function removeVisit(id: string, parent?: string) {
    const visit = getState()?.visits?.[id];
    if (!visit || getFamilyView()) return;
    requestDeletion({
      title: t("ui.delete-appointment"),
      message: t(
        "ui.delete-value-its-reminders-will-also-be-cancelled",
        visit.name,
      ),
      success: t("ui.appointment-deleted"),
      ...(parent ? { parent } : {}),
      change(state) {
        delete state.visits?.[id];
      },
    });
  }
  function openVisit(visit?: Visit, target?: VisitTarget) {
    const state = getState();
    if (!state || editor.open || (getFamilyView() && !target)) return;
    editor.toggleAttribute("data-family-editor", Boolean(target));
    paintFeature(
      editor,
      <VisitEditor
        dialog={editor}
        categoryDialog={chooser}
        visit={visit}
        target={target}
        state={state}
        selectedDay={selectedDate()}
        formatDay={formatDay}
        refreshFields={refreshFields}
        save={(plan, editing) =>
          mutate(
            (state) => saveVisit(state, plan, editing),
            t("ui.appointment-saved"),
            true,
          )
        }
        remove={(id) => removeVisit(id, editor.id)}
        failure={() => document.getElementById("status")?.textContent ?? ""}
      />,
    );
    editor.showModal();
  }
  function attend(visit: Visit) {
    void mutate(
      (state) => {
        const saved = state.visits?.[visit.id];
        if (!saved || saved.cancelled) return;
        saved.completed = !visit.completed;
        if (saved.completed) saved.resolvedAt ??= Date.now();
        else delete saved.resolvedAt;
      },
      t("ui.appointment-status-saved"),
      true,
    );
  }
  function cancel(visit: Visit) {
    void mutate(
      (state) => {
        const saved = state.visits?.[visit.id];
        if (!saved) return;
        saved.cancelled = !saved.cancelled;
        if (saved.cancelled) {
          delete saved.completed;
          delete saved.resolvedAt;
        }
      },
      t("ui.appointment-status-saved"),
      true,
    );
  }

  function contents(
    local: LocalVisit,
    zone: string,
    actionable: boolean,
    variant: Variant,
    focusStatus?: string,
  ) {
    const { visit } = local;
    const view = getFamilyView();
    const calendar = variant === "calendar";
    const featured = variant === "day-featured";
    const day = featured || calendar || variant === "day";
    const category = categoryOf(visit.category);
    const title =
      category === "custom" && visit.categoryName
        ? visit.categoryName
        : categoryLabel(category);
    const time = localDigits(local.time);
    const dateTime = new Date(local.instant).toISOString();
    const art = (
      <VisitArtwork category={category} color={visitColor(visit.color)} />
    );
    const note = visit.note || visit.notes || visit.sharedNote;
    const contact = visit.contact || visit.sharedContact;
    const notes = (
      <>
        {note && <p>{note}</p>}
        {contact && <p className="quiet">{t("ui.contact-value", contact)}</p>}
      </>
    );
    const details = (
      <>
        {category !== "general" &&
          (day ? <bdi>{title}</bdi> : <small>{title}</small>)}
        {visit.zone && visit.zone !== zone && (
          <p className="quiet">
            {t(
              "ui.clinic-time-value-value-value",
              formatDay(visit.day),
              localDigits(visit.time),
              timeZoneCity(visit.zone),
            )}
          </p>
        )}
        {visit.place && (
          <p className="quiet">{t("ui.location-value", visit.place)}</p>
        )}
        {visit.cancelled ? (
          <p className="badge">{t("ui.cancelled-appointment")}</p>
        ) : visit.completed ? (
          <p className="badge visit-attended">{t("ui.attended")}</p>
        ) : (
          calendar && (
            <p className="badge">
              {t(
                local.instant > Date.now()
                  ? "برنامه‌ریزی‌شده"
                  : "بدون ثبت حضور",
              )}
            </p>
          )
        )}
        {!calendar && notes}
        {view && visit.recordedBy && (
          <small className="family-stamp">
            {t("ui.recorded-by-value", view.authorName(visit))}
          </small>
        )}
      </>
    );
    let actions;
    const label = t("ui.appointment-options");
    if (view) {
      const hasNotes = calendar && Boolean(note || contact);
      const canRecord =
        !visit.completed &&
        !visit.cancelled &&
        view.canRecord("visit", local.day);
      if (canRecord || hasNotes)
        actions = (
          <>
            {hasNotes && <PlanOptions label={label}>{notes}</PlanOptions>}
            {canRecord && (
              <button
                className="secondary care-record-action"
                type="button"
                onClick={() =>
                  view.record({
                    kind: "visit",
                    day: local.day,
                    id: visit.id,
                    title: visit.name,
                  })
                }
              >
                {featured && <Icon name="check" />}
                {t("ثبت حضور")}
              </button>
            )}
          </>
        );
    } else if (actionable) {
      const canAttend = !visit.cancelled && local.day <= today();
      const attendance = canAttend && (
        <button
          className={
            "secondary" + (!visit.completed ? " care-record-action" : "")
          }
          type="button"
          aria-pressed={Boolean(visit.completed)}
          onClick={() => attend(visit)}
        >
          {featured && !visit.completed && <Icon name="check" />}
          {visit.completed
            ? t("ui.undo-attendance")
            : t(day ? "حضور یافتم" : "ثبت حضور")}
        </button>
      );
      const menu = (
        <PlanOptions label={label}>
          {calendar && notes}
          {!featured && visit.completed && attendance}
          <button
            type="button"
            className="secondary"
            onClick={() => openVisit(visit)}
          >
            {t("ui.edit")}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => cancel(visit)}
          >
            {t(
              visit.cancelled
                ? "ui.reinstate-appointment"
                : "ui.cancel-appointment",
            )}
          </button>
          <button
            type="button"
            className="text-button danger-link"
            onClick={() => removeVisit(visit.id)}
          >
            {t("ui.delete-appointment")}
          </button>
        </PlanOptions>
      );
      actions = featured ? (
        <>
          {attendance}
          {menu}
        </>
      ) : (
        <>
          {menu}
          {!visit.completed && attendance}
        </>
      );
    }
    if (day)
      return (
        <PlanDayCard
          label={t("ui.appointment")}
          title={visit.name}
          time={time}
          dateTime={dateTime}
          art={art}
          details={details}
          actions={actions}
          focusStatus={focusStatus}
        />
      );
    return (
      <>
        <span className="plan-panel-art" aria-hidden="true">
          {art}
        </span>
        <div className="plan-panel-copy">
          {variant === "next" && (
            <small className="visit-next-label">
              {t("ui.next-appointment")}
            </small>
          )}
          <h3 dir="auto" className="visit-title">
            {visit.name}
          </h3>
          <small className="visit-row-when">
            <time
              dateTime={isoDay(local.day)}
              aria-label={formatDay(local.day, true)}
            >
              {options.formatDayNumber(local.day)}{" "}
              {options.formatShortMonth(local.day)}
            </time>
            {" · "}
            <time dateTime={dateTime} dir="ltr">
              {time}
            </time>
          </small>
          {details}
        </div>
        {actions && <div className="plan-panel-actions">{actions}</div>}
      </>
    );
  }

  function visitCard(
    local: LocalVisit,
    zone: string,
    actionable: boolean,
    variant: Variant = "shelf",
    focusStatus?: string,
  ) {
    return mountCard(
      cardAttributes(local, variant),
      contents(local, zone, actionable, variant, focusStatus),
    );
  }
  function dayVisits(index: Index, day: number) {
    const rows: LocalVisit[] = index.visitsOn(day);
    return rows
      .filter(({ visit }) => !visit.cancelled)
      .map((local) => ({
        key: `visit:${local.visit.id}`,
        title: local.visit.name,
        time: local.instant,
        state: local.visit.completed ? ("done" as const) : ("pending" as const),
        resolvedAt: local.visit.resolvedAt,
        render: (featured: boolean, focusStatus?: string) =>
          visitCard(
            local,
            index.zone,
            day <= today(),
            featured ? "day-featured" : "day",
            focusStatus,
          ),
      }));
  }
  function renderVisits(index: Index, day: number) {
    const now = Date.now();
    const sorted: LocalVisit[] = [...index.allVisits()].sort(
      (a, b) => a.instant - b.instant,
    );
    const upcoming = sorted.filter(
      ({ visit, instant }) =>
        !visit.cancelled && !visit.completed && instant >= now,
    );
    summary.textContent = upcoming.length
      ? t("ui.upcoming-appointment-count", localDigits(upcoming.length))
      : t("ui.no-upcoming-appointments");
    document.querySelector('[data-visit-filter="day"]')!.textContent = t(
      day === today() ? "ui.today" : "ui.this-day",
    );
    const rows =
      filter === "day" ? sorted.filter((local) => local.day === day) : [];
    const scheduled = filter === "all" || filter === "upcoming" ? upcoming : [];
    const history =
      filter === "all" || filter === "past"
        ? sorted
            .filter(
              ({ visit, instant }) =>
                visit.cancelled || visit.completed || instant < now,
            )
            .reverse()
        : [];
    function cards(visits: LocalVisit[], next = false) {
      return visits.slice(0, limit).map((local, i) => {
        const variant = next && i === 0 ? "next" : "shelf";
        return (
          <Fragment key={local.visit.id}>
            {next && i === 1 && <h2>{t("ui.later-appointments")}</h2>}
            <article {...cardAttributes(local, variant)}>
              {contents(local, index.zone, true, variant)}
            </article>
          </Fragment>
        );
      });
    }
    paintFeature(
      list,
      <>
        {cards(rows)}
        {cards(scheduled, true)}
        {history.length > 0 && filter === "all" && (
          <h2>{t("ui.past-and-cancelled")}</h2>
        )}
        {cards(history)}
        {!rows.length && !scheduled.length && !history.length && (
          <p className="empty">{t("ui.no-appointments-in-this-view")}</p>
        )}
        {Math.max(rows.length, scheduled.length, history.length) > limit && (
          <button
            id="visits-more"
            className="secondary"
            type="button"
            onClick={() => {
              limit += pageSize;
              render();
              (
                document.getElementById("visits-more") ??
                list.lastElementChild?.querySelector("button")
              )?.focus({ preventScroll: true });
            }}
          >
            {t("ui.show-more-appointments")}
          </button>
        )}
      </>,
    );
  }
  return {
    openVisit,
    visitCard,
    dayVisits,
    renderVisits,
    close,
    isDayFiltered: () => filter === "day",
    setFilter(value: string | undefined) {
      filter = value ?? "all";
      limit = pageSize;
    },
  };
}
