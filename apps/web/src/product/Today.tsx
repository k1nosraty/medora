import {
  cloneElement,
  Fragment,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { paintFeature } from "./renderer";
import { Icon, PlanArtwork } from "./PlanCard";
import type { RoutineEntry } from "./routines/model";
import type { Dose, MedicinePlan } from "./medication/model";
import {
  localDigits,
  t,
} from "../../product-assets/public/medication/shared/i18n/locale.js";
import { routineComplete } from "../../product-assets/public/medication/domain/routine-plan.js";
import { doseTime } from "../../product-assets/public/medication/domain/care-index.js";

interface TimelineEvent {
  key: string;
  title: string;
  state: "done" | "pending" | "inactive";
  time: number | null;
  resolvedAt?: number | null | undefined;
  render: (featured: boolean, focusStatus?: string) => ReactNode;
}

interface Selection {
  day: number;
  slot: number | null;
  index: number;
  key: string;
}

interface Care {
  medicines: Record<string, MedicinePlan>;
  routines?: Record<string, { paused?: boolean }>;
  waterGoal?: number;
  waterReminders?: { enabled?: boolean };
}

interface FamilyView {
  timeOf?: (day: number, minute: number) => number | undefined;
  has: (scope: "water" | "doses") => boolean;
  canView: (section: "medications" | "appointments" | "routines") => boolean;
  synced: boolean;
}

function $<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id)! as T;
}

const slotOf = (event: TimelineEvent) =>
  event.time == null ? null : Math.floor(event.time / 60_000);

export function renderToday(
  care: Care,
  day: number,
  today: number,
  daily: Dose[],
  visits: TimelineEvent[],
  routines: RoutineEntry[],
  waterTotal: number,
  renderDose: (
    medicine: MedicinePlan | undefined,
    dose: Dose,
    featured: boolean,
    status?: string,
  ) => ReactNode,
  renderRoutine: (
    routine: RoutineEntry,
    day: number,
    options: {
      dayCard: true;
      featured: boolean;
      focusStatus?: string | undefined;
    },
  ) => ReactNode,
  view?: FamilyView | null,
) {
  const scheduledAt = view?.timeOf ?? doseTime;
  const events = daily.map<TimelineEvent>((dose) => {
    const medicine = care.medicines[dose.medicineId];
    const done = dose.status === "taken" || dose.status === "skipped";
    return {
      key: `dose:${dose.medicineId}:${dose.day}:${dose.minute}`,
      title:
        dose.name ||
        dose.historyPlan?.name ||
        medicine?.name ||
        t("ui.medicine"),
      state: done
        ? "done"
        : medicine && !medicine.paused
          ? "pending"
          : "inactive",
      time:
        dose.status === "snoozed" && dose.snoozeUntil
          ? dose.snoozeUntil
          : (scheduledAt(dose.day, dose.minute) ?? null),
      resolvedAt: dose.resolvedAt,
      render: (featured, focusStatus) =>
        renderDose(medicine, dose, featured, focusStatus),
    };
  });
  events.push(...visits);
  for (const entry of routines) {
    const plan = care.routines?.[entry.id];
    events.push({
      key: `routine:${entry.id}`,
      title: entry.name,
      state: routineComplete(entry)
        ? "done"
        : plan && !plan.paused
          ? "pending"
          : "inactive",
      time:
        entry.minute == null ? null : (scheduledAt(day, entry.minute) ?? null),
      resolvedAt: entry.resolvedAt,
      render: (featured, focusStatus) =>
        renderRoutine(entry, day, { dayCard: true, featured, focusStatus }),
    });
  }

  const now = Date.now();
  const pending = events.filter((event) => event.state === "pending");
  const inactive = events
    .filter((event) => event.state === "inactive")
    .sort(byTime);
  const done = events
    .filter((event) => event.state === "done")
    .sort((a, b) => (a.resolvedAt ?? 0) - (b.resolvedAt ?? 0) || byTime(a, b));
  pending.sort(
    day === today
      ? (a, b) => {
          const aOverdue = a.time != null && a.time < now;
          const bOverdue = b.time != null && b.time < now;
          if (a.time == null || b.time == null) return byTime(a, b);
          if (aOverdue !== bOverdue) return aOverdue ? 1 : -1;
          return aOverdue ? byTime(b, a) : byTime(a, b);
        }
      : byTime,
  );

  const scheduled = pending.length + done.length;
  const includeWater =
    view?.has("water") !== false &&
    day <= today &&
    (waterTotal > 0 ||
      care.waterGoal != null ||
      care.waterReminders?.enabled === true ||
      (day === today && scheduled > 0));
  const waterItems = includeWater ? 1 : 0;
  const waterResolved =
    includeWater && waterTotal >= (care.waterGoal ?? 2000) ? 1 : 0;
  const resolved = done.length + waterResolved;
  const total = scheduled + waterItems;
  const doseLabel =
    daily.length === 1
      ? t("ui.1-dose")
      : t("ui.value-doses", localDigits(daily.length));
  const visitLabel =
    visits.length === 1
      ? t("ui.1-appointment")
      : t("ui.value-appointments", localDigits(visits.length));
  const routineLabel =
    routines.length === 1
      ? t("ui.1-routine")
      : t("ui.value-routines", localDigits(routines.length));
  const labels = [
    [daily.length, doseLabel, "medications"],
    [visits.length, visitLabel, "appointments"],
    [routines.length, routineLabel, "routines"],
  ] as const;
  const storySummary = labels.some(([count]) => count)
    ? labels
        .filter(([count, , section]) =>
          view
            ? view.canView(section) && count
            : section !== "routines" || count,
        )
        .map(([, label]) => label)
        .join(" · ")
    : t(
        view && !view.synced
          ? "هنوز سابقه‌ای از این حساب همگام نشده است."
          : "برای این روز برنامه‌ای ثبت نشده است.",
      );
  paintFeature(
    $("today-timeline-react"),
    <Timeline
      key={view ? "family" : "personal"}
      day={day}
      today={today}
      now={now}
      pending={pending}
      inactive={inactive}
      done={done}
      resolved={resolved}
      total={total}
      hideCount={
        !total ||
        day > today ||
        (view?.has("doses") === false && daily.length > 0)
      }
      family={Boolean(view)}
    />,
  );
  return { storySummary, doseLabel, visitLabel, routineLabel };
}

interface TimelineProps {
  day: number;
  today: number;
  now: number;
  pending: TimelineEvent[];
  inactive: TimelineEvent[];
  done: TimelineEvent[];
  resolved: number;
  total: number;
  hideCount: boolean;
  family: boolean;
}

function Timeline({
  day,
  today,
  now,
  pending,
  inactive,
  done,
  resolved,
  total,
  hideCount,
  family,
}: TimelineProps) {
  const [selection, select] = useState<Selection | null>(null);
  const [order, setOrder] = useState("default");
  const [movement, setMovement] = useState(0);
  const [drag, setDrag] = useState<number>();
  const lastDot = useRef<number | undefined>(undefined);
  const viewport = useRef<HTMLDivElement>(null);
  const dots = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const rtl = document.documentElement.dir === "rtl";
  const previous = rtl ? 1 : -1;
  const previousSlot = selection?.day === day ? selection : null;
  const candidates = day === today ? pending : [];
  const focused =
    candidates.find(
      (event) => previousSlot && slotOf(event) === previousSlot.slot,
    ) ?? candidates[0];
  const slot = focused ? slotOf(focused) : null;
  const group =
    slot === null ? [] : pending.filter((event) => slotOf(event) === slot);
  const grouped =
    group.length > 1 || (group.length > 0 && previousSlot?.slot === slot);
  const sameSlot = previousSlot !== null && previousSlot.slot === slot;
  const previousIndex = sameSlot
    ? group.findIndex((event) => event.key === previousSlot.key)
    : -1;
  const index =
    previousIndex >= 0
      ? previousIndex
      : sameSlot && previousSlot.index < group.length
        ? previousSlot.index
        : 0;
  const selected = grouped ? group[index] : undefined;

  useLayoutEffect(() => {
    const key = selected?.key;
    if (
      key &&
      (!selection ||
        selection.day !== day ||
        selection.key !== key ||
        selection.index !== index)
    )
      select({ day, slot, key, index });
    else if (!key && selection) select(null);
    const record = viewport.current?.querySelector<HTMLElement>(
      ".care-record-action",
    );
    if (record) record.dataset.focusKey = "day-focus-record";
    if (lastDot.current !== undefined) {
      dots.current
        ?.querySelector<HTMLElement>(
          `[data-focus-key="day-focus-dot-${lastDot.current}"]`,
        )
        ?.focus({ preventScroll: true });
      lastDot.current = undefined;
    }
  });

  function change(option: number, focus = false) {
    const event = group[option];
    if (!event) return;
    if (focus && option === index) return;
    if (focus) lastDot.current = option;
    setMovement(Math.sign(option - index));
    select({ day, slot, key: event.key, index: option });
  }

  function endGesture(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (current?.id !== event.pointerId) return;
    gesture.current = null;
    setDrag(undefined);
    const dx = event.clientX - current.x,
      dy = event.clientY - current.y;
    if (
      event.type === "pointerup" &&
      Math.abs(dx) >= 45 &&
      Math.abs(dx) > Math.abs(dy) * 1.25
    )
      change(index + Math.sign(dx) * previous);
  }

  const queue = [
    ...pending.filter((event) => grouped || event !== focused),
    ...inactive,
  ];
  const handled = [...done];
  if (order !== "default") {
    const direction = order === "latest" ? -1 : 1;
    const compare = (a: TimelineEvent, b: TimelineEvent) =>
      a.time == null || b.time == null
        ? byTime(a, b)
        : direction * byTime(a, b);
    queue.sort(compare);
    handled.sort(compare);
  }
  const hasQueue = queue.length > 0 || handled.length > 0;
  const status = (time: number | null | undefined) =>
    t(time == null || time < now ? "ui.still-pending" : "ui.up-next");
  const isComplete = total > 0 && resolved === total;
  const ordinary = focused && !grouped;
  const options = group.map((event, option) => ({
    key: event.key,
    text:
      event.title +
      " · " +
      t(
        "ui.value-of-value",
        localDigits(option + 1),
        localDigits(group.length),
      ),
  }));
  return (
    <>
      <div className="daily-main">
        <div className="daily-heading">
          <h2 id="day-title">{t("ui.daily-timeline")}</h2>
          <output
            id="today-count"
            aria-label={t("ui.daily-plan-progress")}
            hidden={hideCount}
            style={
              {
                "--day-progress": total ? `${(100 * resolved) / total}%` : "0%",
              } as CSSProperties
            }
          >
            {t(
              "ui.value-of-value-items-handled",
              localDigits(resolved),
              localDigits(total),
            )}
          </output>
        </div>
        <div id="today-focus" hidden={day !== today}>
          {selected ? (
            <div
              className={`day-focus-viewport${group.length > 1 ? " day-focus-swipe" : ""}${drag !== undefined ? " day-focus-dragging" : ""}`}
              style={
                drag === undefined
                  ? undefined
                  : ({ "--day-focus-drag": `${drag}px` } as CSSProperties)
              }
              ref={viewport}
              onPointerDown={(event) => {
                if (
                  group.length < 2 ||
                  !event.isPrimary ||
                  event.pointerType === "mouse" ||
                  (event.target instanceof Element &&
                    event.target.closest(
                      "button, summary, input, select, textarea, a, .day-card-more[open]",
                    ))
                )
                  return;
                gesture.current = {
                  id: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                };
              }}
              onPointerMove={(event) => {
                const current = gesture.current;
                if (current?.id !== event.pointerId) return;
                const dx = event.clientX - current.x;
                if (
                  Math.abs(dx) <= Math.abs(event.clientY - current.y) ||
                  Math.abs(dx) < 8
                )
                  return;
                const limit = group[index + Math.sign(dx) * previous] ? 72 : 15;
                setDrag(Math.max(-limit, Math.min(limit, dx * 0.65)));
              }}
              onPointerUp={endGesture}
              onPointerCancel={endGesture}
              onLostPointerCapture={endGesture}
            >
              <Featured
                event={selected}
                status={status(group[0]?.time)}
                movement={rtl ? -movement : movement}
              />
            </div>
          ) : focused ? (
            <Featured
              event={focused}
              status={status(focused.time)}
              movement={0}
            />
          ) : (
            day === today && (
              <TodayState
                completed={isComplete}
                add={!total && !family}
                title={t(
                  isComplete
                    ? "ui.today-s-plan-is-complete"
                    : total
                      ? "ui.later-today"
                      : "ui.plan-your-day",
                )}
                summary={
                  isComplete
                    ? t("ui.everything-on-today-s-plan-has-been-logged")
                    : total
                      ? t(
                          "ui.value-items-left-on-today-s-plan",
                          localDigits(total - resolved),
                        )
                      : t(
                          family
                            ? "برای این روز برنامه‌ای ثبت نشده است."
                            : "ui.add-a-medicine-appointment-or-routine-to-your-plan",
                        )
                }
              />
            )
          )}
        </div>
        <div
          id="day-focus-navigation"
          className="day-focus-controls"
          role={group.length > 1 ? "group" : undefined}
          hidden={group.length < 2}
          aria-label={
            group.length > 1
              ? t(
                  "ui.same-time-plans",
                  t(
                    "ui.value-of-value",
                    localDigits(index + 1),
                    localDigits(group.length),
                  ),
                )
              : undefined
          }
          ref={dots}
        >
          {group.length > 1 && (
            <FocusDots
              options={options}
              index={index}
              select={(option) => change(option, true)}
              previous={previous}
            />
          )}
        </div>
      </div>
      <div className="daily-timeline">
        <p id="future-schedule" className="quiet" hidden={day <= today}>
          {t("ui.upcoming-schedule-you-can-log-doses-on-or-after-the-sched")}
        </p>
        <section
          className="timeline"
          aria-labelledby="timeline-title"
          hidden={day === today && !hasQueue}
        >
          <div className="timeline-heading">
            <h3 id="timeline-title">
              {t(
                ordinary
                  ? "ui.the-rest-of-the-day"
                  : "ui.doses-appointments-and-routines",
              )}
            </h3>
            <label className="timeline-sort" hidden={!hasQueue}>
              <Icon name="sort" />
              <select
                id="timeline-order"
                aria-label={t("ui.sort-day-schedule")}
                value={order}
                onChange={(event) => setOrder(event.currentTarget.value)}
              >
                <option value="default">
                  {t("ui.schedule-default-order")}
                </option>
                <option value="earliest">{t("ui.earliest-first")}</option>
                <option value="latest">{t("ui.latest-first")}</option>
              </select>
            </label>
          </div>
          <div id="doses" className="compact-card-list">
            {queue.map((event) => (
              <Fragment key={event.key}>{event.render(false)}</Fragment>
            ))}
            {handled.length > 0 && (
              <h4 className="day-queue-heading day-queue-done">
                {t("ui.handled")}
              </h4>
            )}
            {handled.map((event) => (
              <Fragment key={event.key}>{event.render(false)}</Fragment>
            ))}
            {!hasQueue && (
              <p className="empty">{t("ui.nothing-planned-for-this-day")}</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function Featured({
  event,
  status,
  movement,
}: {
  event: TimelineEvent;
  status: string;
  movement: number;
}) {
  const content = event.render(true, status);
  if (!isValidElement<{ className?: string; style?: CSSProperties }>(content))
    return content;
  if (!movement) return <Fragment key={event.key}>{content}</Fragment>;
  return cloneElement(content, {
    key: event.key,
    className: content.props.className + " day-focus-enter",
    style: {
      ...content.props.style,
      "--day-focus-entry": movement < 0 ? "-1.1rem" : "1.1rem",
    } as CSSProperties,
  });
}

function byTime(a: TimelineEvent, b: TimelineEvent) {
  if (a.time === b.time) return 0;
  return (a.time ?? Infinity) - (b.time ?? Infinity);
}

interface TodayStateProps {
  completed: boolean;
  title: string;
  summary: string;
  add: boolean;
}

function TodayState({ completed, title, summary, add }: TodayStateProps) {
  return (
    <div className="today-state" data-complete={String(completed)}>
      <div>
        <h3>{title}</h3>
        <p>{summary}</p>
        {add && (
          <button className="primary-action" type="button" data-open-quick="">
            {t("ui.add-your-first-plan")}
          </button>
        )}
      </div>
      <span className="today-state-art" aria-hidden="true">
        <PlanArtwork id={completed ? "complete" : "control-calendar"} />
      </span>
    </div>
  );
}

interface FocusDotsProps {
  options: { key: string; text: string }[];
  index: number;
  select: (index: number) => void;
  previous: number;
}

function navigateDots(
  event: Pick<KeyboardEvent, "key" | "preventDefault">,
  { options, index, select, previous }: FocusDotsProps,
) {
  let destination: number;
  switch (event.key) {
    case "ArrowLeft":
      destination = index + previous;
      break;
    case "ArrowRight":
      destination = index - previous;
      break;
    case "Home":
      destination = 0;
      break;
    case "End":
      destination = options.length - 1;
      break;
    default:
      return;
  }
  if (!options[destination]) return;
  event.preventDefault();
  select(destination);
}

function FocusDots(props: FocusDotsProps) {
  return props.options.map(({ key, text }, option) => (
    <button
      key={key}
      type="button"
      className="day-focus-dot"
      data-focus-key={`day-focus-dot-${option}`}
      aria-label={text}
      aria-pressed={option === props.index}
      tabIndex={option === props.index ? 0 : -1}
      onClick={() => props.select(option)}
      onKeyDown={(event) => navigateDots(event, props)}
    />
  ));
}
