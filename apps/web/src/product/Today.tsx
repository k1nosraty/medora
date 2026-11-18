import { useCallback, type KeyboardEvent } from "react";
import { clearFeature, paintFeature } from "./renderer";
import { glassObject } from "../../../../web/public/medication/design/three-dimensional.js";
import {
  localDigits,
  t,
} from "../../../../web/public/medication/shared/i18n/locale.js";
import { routineComplete } from "../../../../web/public/medication/domain/routine-plan.js";
import { doseTime } from "../../../../web/public/medication/domain/care-index.js";
import { element } from "../../../../web/public/medication/shared/ui/dom.js";

interface TimelineEvent {
  key: string;
  title: string;
  state: "done" | "pending" | "inactive";
  time: number | null;
  resolvedAt?: number | undefined;
  render: (featured: boolean) => HTMLElement;
}

interface Selection {
  day: number;
  slot: number | null;
  index: number;
  key: string;
}

interface Medicine {
  name: string;
  paused?: boolean;
}

interface Dose {
  medicineId: string;
  day: number;
  minute: number;
  status?: string;
  name?: string;
  historyPlan?: { name: string };
  snoozeUntil?: number;
  resolvedAt?: number;
}

interface Routine {
  id: string;
  name: string;
  minute?: number | null;
  resolvedAt?: number;
}

interface Care {
  medicines: Record<string, Medicine>;
  routines?: Record<string, { paused?: boolean }>;
  waterGoal?: number;
  waterReminders?: { enabled?: boolean };
}

interface FamilyView {
  timeOf?: (day: number, minute: number) => number;
  has: (scope: "water" | "doses") => boolean;
  canView: (section: "medications" | "appointments" | "routines") => boolean;
  synced: boolean;
}

function $<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id)! as T;
}

const slotOf = (event: TimelineEvent) =>
  event.time == null ? null : Math.floor(event.time / 60_000);
let selectedSlot: Selection | null;

export function renderToday(
  care: Care,
  day: number,
  today: number,
  daily: Dose[],
  visits: TimelineEvent[],
  routines: Routine[],
  waterTotal: number,
  renderDose: (
    medicine: Medicine | undefined,
    dose: Dose,
    variant: "featured" | "day",
  ) => HTMLElement,
  renderRoutine: (
    routine: Routine,
    day: number,
    options: { dayCard: true; featured: boolean },
  ) => HTMLElement,
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
          : scheduledAt(dose.day, dose.minute),
      resolvedAt: dose.resolvedAt,
      render: (featured) =>
        renderDose(medicine, dose, featured ? "featured" : "day"),
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
      time: entry.minute == null ? null : scheduledAt(day, entry.minute),
      resolvedAt: entry.resolvedAt,
      render: (featured) =>
        renderRoutine(entry, day, { dayCard: true, featured }),
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
  const progress = $("today-count");
  progress.hidden =
    !total || day > today || (view?.has("doses") === false && daily.length > 0);
  progress.textContent = t(
    "ui.value-of-value-items-handled",
    localDigits(resolved),
    localDigits(total),
  );
  progress.style.setProperty(
    "--day-progress",
    total ? `${(100 * resolved) / total}%` : "0%",
  );
  const previousSlot = selectedSlot?.day === day ? selectedSlot : null;
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
  selectedSlot = null;
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
  $("program-medications").textContent = doseLabel;
  $("program-appointments").textContent = visitLabel;
  $("program-routines").textContent = routineLabel;
  const labels = [
    [daily.length, doseLabel, "medications"],
    [visits.length, visitLabel, "appointments"],
    [routines.length, routineLabel, "routines"],
  ] as const;
  $("story-summary").textContent = labels.some(([count]) => count)
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
  const focus = $("today-focus");
  const controls = $("day-focus-navigation");
  clearFeature(focus);
  if (group.length < 2) clearFeature(controls);
  controls.hidden = group.length < 2;
  if (grouped) {
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
    selectedSlot = { day, slot, index, key: group[index]!.key };
    renderGroup(focus, controls, group, selectedSlot);
  } else if (focused) {
    const heading =
      focused.time == null || focused.time < now
        ? t("ui.still-pending")
        : t("ui.up-next");
    focus.append(featuredCard(focused, heading));
  } else if (day === today) {
    const completed = total > 0 && resolved === total;
    const title = completed
      ? t("ui.today-s-plan-is-complete")
      : total
        ? t("ui.later-today")
        : t("ui.plan-your-day");
    const summary = completed
      ? t("ui.everything-on-today-s-plan-has-been-logged")
      : total
        ? t(
            "ui.value-items-left-on-today-s-plan",
            localDigits(total - resolved),
          )
        : t(
            view
              ? "برای این روز برنامه‌ای ثبت نشده است."
              : "ui.add-a-medicine-appointment-or-routine-to-your-plan",
          );
    const state = { completed, title, summary, add: !total && !view };
    paintFeature(focus, <TodayState {...state} />);
  }
  focus.hidden = day !== today;
  const queue = [
    ...pending.filter((event) => grouped || event !== focused),
    ...inactive,
  ];
  const order = $<HTMLSelectElement>("timeline-order");
  order.closest<HTMLElement>(".timeline-sort")!.hidden =
    !queue.length && !done.length;
  if (order.value !== "default") {
    const direction = order.value === "latest" ? -1 : 1;
    const compare = (a: TimelineEvent, b: TimelineEvent) =>
      a.time == null || b.time == null
        ? byTime(a, b)
        : direction * byTime(a, b);
    queue.sort(compare);
    done.sort(compare);
  }
  const cards = queue.map(timelineCard);
  if (done.length) {
    cards.push(
      element("h4", t("ui.handled"), "day-queue-heading day-queue-done"),
    );
    for (const event of done) cards.push(timelineCard(event));
  }
  $("timeline-title").textContent =
    focused && !grouped
      ? t("ui.the-rest-of-the-day")
      : t("ui.doses-appointments-and-routines");
  $("doses").closest<HTMLElement>(".timeline")!.hidden =
    day === today && !cards.length;
  $("doses").replaceChildren(
    ...(cards.length
      ? cards
      : [element("p", t("ui.nothing-planned-for-this-day"), "empty")]),
  );
}

function timelineCard(event: TimelineEvent) {
  const card = event.render(false);
  card.dataset.focusScope = event.key;
  if (event.state === "done") card.dataset.dayState = "done";
  return card;
}

function renderGroup(
  focus: HTMLElement,
  controls: HTMLElement,
  group: TimelineEvent[],
  selection: Selection,
) {
  const viewport: HTMLDivElement = element("div", "", "day-focus-viewport");
  focus.append(viewport);
  const rtl = document.documentElement.dir === "rtl";
  const swipeOffset = (dx: number) => Math.sign(dx) * (rtl ? 1 : -1);
  const status = t(
    (group[0]?.time ?? 0) < Date.now() ? "ui.still-pending" : "ui.up-next",
  );

  function show(index: number, source?: string) {
    const event = group[index];
    if (!event) return;
    const offset = Math.sign(index - selection.index);
    selection.index = index;
    selection.key = event.key;
    const card = featuredCard(event, status);
    const record = card.querySelector<HTMLElement>(".care-record-action");
    if (record) record.dataset.focusKey = "day-focus-record";
    if (offset) {
      card.style.setProperty(
        "--day-focus-entry",
        offset === (rtl ? 1 : -1) ? "-1.1rem" : "1.1rem",
      );
      card.classList.add("day-focus-enter");
    }
    if (group.length > 1) {
      controls.setAttribute("role", "group");
      controls.setAttribute(
        "aria-label",
        t(
          "ui.same-time-plans",
          t(
            "ui.value-of-value",
            localDigits(index + 1),
            localDigits(group.length),
          ),
        ),
      );
      const select = (option: number) =>
        show(option, "day-focus-dot-" + option);
      const previous = rtl ? 1 : -1;
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
      const dots = { options, index, select, previous };
      paintFeature(controls, <FocusDots {...dots} />);
    }
    viewport.replaceChildren(card);
    if (source)
      controls
        .querySelector<HTMLElement>(`[data-focus-key="${source}"]`)
        ?.focus({ preventScroll: true });
  }
  show(selection.index);
  if (group.length < 2) return;
  viewport.classList.add("day-focus-swipe");

  let gesture: { id: number; x: number; y: number } | null;
  viewport.addEventListener("pointerdown", (event) => {
    if (
      !event.isPrimary ||
      event.pointerType === "mouse" ||
      (event.target instanceof Element &&
        event.target.closest(
          "button, summary, input, select, textarea, a, .day-card-more[open]",
        ))
    )
      return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  viewport.addEventListener("pointermove", (event) => {
    if (gesture?.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    if (Math.abs(dx) <= Math.abs(event.clientY - gesture.y) || Math.abs(dx) < 8)
      return;
    const limit = group[selection.index + swipeOffset(dx)] ? 72 : 15;
    viewport.classList.add("day-focus-dragging");
    viewport.style.setProperty(
      "--day-focus-drag",
      `${Math.max(-limit, Math.min(limit, dx * 0.65))}px`,
    );
  });
  function endGesture(event: PointerEvent) {
    if (gesture?.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture = null;
    viewport.classList.remove("day-focus-dragging");
    viewport.style.removeProperty("--day-focus-drag");
    if (
      event.type === "pointerup" &&
      Math.abs(dx) >= 45 &&
      Math.abs(dx) > Math.abs(dy) * 1.25
    ) {
      show(selection.index + swipeOffset(dx));
    }
  }
  viewport.addEventListener("pointerup", endGesture);
  viewport.addEventListener("pointercancel", endGesture);
  viewport.addEventListener("lostpointercapture", endGesture);
}

function featuredCard(event: TimelineEvent, status: string) {
  const card = event.render(true);
  card.dataset.focusScope = event.key;
  const media = element("div", "", "day-focus-media");
  const art = card.querySelector(".day-card-art")!;
  art.before(media);
  media.append(art);
  const content = card.querySelector(".day-card-content")!;
  media.append(content.querySelector(".day-card-kind")!);
  const context = element("div", "", "day-focus-context");
  const time = content.querySelector("time");
  if (time) context.append(time);
  context.append(element("span", status, "day-focus-status"));
  content.prepend(context);
  const copy = element("div", "", "day-focus-copy");
  const actions = card.querySelector(".day-card-actions");
  content.before(copy);
  copy.append(content);
  if (actions) copy.append(actions);
  return card;
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
  const attachArt = useCallback(
    (host: HTMLSpanElement | null) => {
      host?.replaceChildren(
        glassObject(completed ? "complete" : "control-calendar", "image"),
      );
    },
    [completed],
  );
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
      <span className="today-state-art" aria-hidden="true" ref={attachArt} />
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
