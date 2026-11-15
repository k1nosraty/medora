import { listSeparator, locale, localDigits, t } from "../../shared/i18n/locale.js";
import { $, action, dayCardOptions, element } from "../../shared/ui/dom.js";
import { mountDayCard } from "../../shared/ui/day-card.js";
import { recordAction } from "../family/context.js";
import { localZone, minuteMs } from "../../domain/care-plan.js";
import { compilePhases, createCareIndex, doseId, doseTime, timeText, trackSchedule } from "../../domain/care-index.js";
import * as engine from "../../domain/medication-rules.js";
import { medicationBadge, medicationBanner, medicineColorOf } from "./appearance.js";
import { amountText, doseUnit, quantity } from "./quantity.js";
import { nextPlannedDose } from "./next-dose.js";

const doseStates = { taken: t("ui.taken"), skipped: t("ui.skipped"), snoozed: t("ui.snoozed") };
const percentFormat = new Intl.NumberFormat(locale, { style: "percent" });

export function installMedicineView({ getState, today, getFamilyView, mutate, requestDeletion, openEditor, formatDay }) {
  function slotsFor(medicine, day) {
    if (medicine.dates?.length && !medicine.dates.includes(day)) return [];
    return engine.medicationSlots(compilePhases(engine, medicine.phases), day);
  }

  function deleteMedicine(id, parent) {
    const medicine = getState().medicines[id];
    if (!medicine) return;
    requestDeletion({
      title: t("ui.delete-medicine"),
      message: t("ui.delete-the-schedule-for-value-your-intake-history-will-be", medicine.name),
      success: t("ui.medication-schedule-deleted"),
      parent,
      change(state) {
        const saved = state.medicines[id];
        if (!saved) return;
        const now = Date.now();
        trackSchedule(state, "medicines", saved, null, now);
        for (const [key, dose] of Object.entries(state.doses)) {
          if (dose.medicineId !== id) continue;
          const unrecorded = !dose.status || dose.status === "snoozed";
          if (unrecorded && doseTime(dose.day, dose.minute) > now) {
            delete state.doses[key];
            continue;
          }
          dose.name ??= saved.name;
          dose.instructions ??= saved.instructions;
          dose.unit ??= saved.unit;
          dose.icon = saved.icon ?? dose.icon;
          dose.color = saved.color ?? dose.color;
          if (dose.status === "snoozed") {
            dose.status = null;
            dose.snoozeUntil = 0;
          }
        }
        delete state.medicines[id];
      }
    });
  }

  function nextAmount(medicine) {
    const next = nextPlannedDose(medicine.phases, medicine.dates, medicine.effectiveFrom,
      (day, minute) => Boolean(getState().doses[doseId(medicine, day, minute)]?.status));
    return next ? next.slot.milliUnits ?? 0 : null;
  }

  function renderMedicine(medicine) {
    const card = element("article");
    card.className = "medicine treatment";
    card.dataset.ink = medicineColorOf(medicine.color);
    card.dataset.search = medicine.name;
    card.dataset.focusScope = "medicine:" + medicine.id;
    const heading = action(medicine.name, () => openMedicine(medicine));
    heading.dir = "auto";
    heading.className = "text-button treatment-name";
    const toggle = element("input");
    toggle.type = "checkbox";
    toggle.role = "switch";
    toggle.checked = !medicine.paused;
    toggle.setAttribute("aria-label", t("ui.active-schedule-for-value", medicine.name));
    toggle.addEventListener("change", async () => {
      const paused = !toggle.checked;
      if (!await mutate(state => {
        const saved = state.medicines[medicine.id];
        const next = { ...saved, paused, revision: saved.revision + 1 };
        trackSchedule(state, "medicines", saved, next, Date.now());
        state.medicines[medicine.id] = next;
      }, paused ? t("ui.medication-schedule-paused") : t("ui.medication-schedule-resumed"), true)) toggle.checked = !toggle.checked;
    });
    const top = element("div");
    top.className = "feature-head";
    top.append(heading);
    if (!getFamilyView()) top.append(toggle);
    const status = element("p", medicine.paused ? t("ui.schedule-paused") : t("ui.schedule-active"));
    status.className = "quiet";
    const profile = element("div");
    profile.className = "treatment-profile";
    const details = element("div");
    details.className = "treatment-details";
    details.append(top, status);
    if (medicine.instructions) details.append(element("p", medicine.instructions));
    if (medicine.phased || medicine.phases.length > 1) details.append(element("p", t("ui.value-stage-s", localDigits(medicine.phases.length))));
    else details.append(element("p", t("ui.dose-times-value", medicine.phases[0].slots.map(slot => localDigits(timeText(slot.minute))).join(" · "))));
    details.append(element("p", t("ui.starts-value", formatDay(medicine.phases[0].start))));
    profile.append(medicationBanner(medicine.icon, medicine.color), details);
    card.append(profile);
    if (medicine.stock != null) {
      const upcoming = medicine.paused ? null : nextAmount(medicine);
      const low = upcoming !== null && engine.isLowStock(medicine.stock, medicine.threshold, upcoming);
      const balance = element("p", t("ui.stock-value-value-value", amountText(medicine.stock), doseUnit(medicine.unit, medicine.stock), low ? t("ui.time-to-refill") : ""));
      balance.dataset.warning = String(low);
      card.append(balance);
    }
    if (getFamilyView()) return card;
    if (medicine.stock != null) {
      const purchase = element("form");
      const label = element("label", t("ui.amount-purchased"));
      const amount = element("input");
      amount.dir = "ltr";
      amount.inputMode = "decimal";
      amount.maxLength = 11;
      amount.required = true;
      label.append(amount);
      const submit = element("button", t("ui.log-purchase"));
      submit.type = "submit";
      purchase.append(label, submit);
      purchase.addEventListener("submit", event => {
        event.preventDefault();
        try {
          const added = quantity(amount);
          if (added === 0) throw new Error(t("ui.enter-a-purchase-amount-greater-than-zero"));
          void mutate(state => {
            const saved = state.medicines[medicine.id];
            saved.stock = engine.updateStock(saved.stock, 0, 0, added);
          }, t("ui.purchase-added-to-stock"));
        } catch (error) {
          $("status").textContent = error.message;
        }
      });
      const refill = element("details");
      refill.className = "editor-options refill";
      refill.append(element("summary", t("ui.refill-stock")), purchase);
      card.append(refill);
    }
    const edit = action(t("ui.edit"), () => openEditor(medicine), true);
    edit.className = "text-button";
    const remove = action(t("ui.delete-medicine"), () => deleteMedicine(medicine.id));
    remove.className = "text-button danger-link";
    const actions = element("div");
    actions.className = "buttons";
    actions.append(edit, remove);
    card.append(actions);
    return card;
  }

  function filterCabinet() {
    const normalize = value => value.trim().normalize("NFKC").toLocaleLowerCase(locale).replaceAll("ي", "ی").replaceAll("ك", "ک");
    const query = normalize($("cabinet-search").value);
    const cards = Array.from($("plans").querySelectorAll("[data-search]"));
    for (const card of cards) card.hidden = !normalize(card.dataset.search).includes(query);
    $("cabinet-search-wrap").hidden = !query && cards.length < 2;
    $("cabinet-empty").hidden = cards.length === 0 || cards.some(card => !card.hidden);
  }

  function openMedicine(medicine) {
    $("medicine-details-title").textContent = medicine.name;
    $("medicine-details-icon").replaceChildren(medicationBadge(medicine.icon, medicine.color));
    const entries = Object.values(getState().doses).filter(dose => dose.medicineId === medicine.id && dose.status)
      .sort((a, b) => b.day - a.day || b.minute - a.minute);
    const summary = element("p", medicine.instructions || t("ui.no-instructions-added"));
    const edit = action(t("ui.edit-medicine"), () => { $("medicine-details").close(); openEditor(medicine); });
    const heading = element("h3", t("ui.dose-history"));
    const history = element("ul");
    history.className = "dose-history";
    for (const dose of entries) {
      const status = doseStates[dose.status];
      history.append(element("li", `${formatDay(dose.day)}، ${localDigits(timeText(dose.minute))} · ${status}`));
    }
    const remove = action(t("ui.delete-medicine"), () => deleteMedicine(medicine.id, "medicine-details"));
    remove.className = "text-button danger-link";
    const view = getFamilyView();
    $("medicine-details-body").replaceChildren(medicationBanner(medicine.icon, medicine.color), summary,
      ...(!view ? [edit, remove] : []),
      ...(!view || view.has("doses") ? [heading, entries.length ? history : element("p", t("ui.no-doses-logged-yet"))] : []));
    $("medicine-details").showModal();
  }

  function renderDose(medicine, dose, variant) {
    const view = getFamilyView();
    const scheduledAt = view?.timeOf ?? doseTime;
    const dayCard = Boolean(variant);
    const featured = variant === "featured";
    const calendar = variant === "calendar";
    const compactDay = dayCard && !featured;
    const card = element("article", "", "medicine dose-card");
    const plan = dose.historyPlan ?? medicine;
    const unit = dose.unit ?? plan?.unit ?? "";
    const color = medicineColorOf(medicine?.color ?? dose.color ?? plan?.color);
    const icon = medicine?.icon ?? dose.icon ?? plan?.icon;
    card.dataset.focusScope = `dose:${dose.medicineId}:${dose.day}:${dose.minute}`;
    card.dataset.ink = color;
    const heading = element("h3", dose.name || plan?.name || t("ui.medicine"));
    heading.dir = "auto";
    const instructions = dose.instructions ?? plan?.instructions;
    const planned = dose.planned === null ? "" : `${amountText(dose.planned)} ${doseUnit(unit, dose.planned)}`;
    let recorded = doseStates[dose.status] ?? t(calendar ?
      (scheduledAt(dose.day, dose.minute) > Date.now() ? "برنامه‌ریزی‌شده" : "بدون ثبت") : "در انتظار ثبت");
    if (dose.status === "taken" && dose.actual != null) recorded += `${listSeparator}${amountText(dose.actual)} ${doseUnit(unit, dose.actual)}`;
    const badge = element("p", recorded);
    badge.className = "badge";
    badge.dataset.status = dose.status ?? "pending";
    const snoozedTime = featured && dose.status === "snoozed" ? dose.snoozeUntil : null;
    const time = snoozedTime ? new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(snoozedTime) : localDigits(timeText(dose.minute));
    const layout = dayCard ? mountDayCard(card, {
      kind: "medicine", label: t("ui.medicine"), image: medicationBadge(icon, color),
      title: heading, time, dateTime: snoozedTime ? new Date(snoozedTime).toISOString() : timeText(dose.minute),
      summary: featured ? planned : "", featured
    }) : null;
    const info = layout?.details ?? element("div", "", "dose-info");
    if (!layout) {
      info.append(heading, element("p", t("ui.at-value", time)));
      const header = element("div", "", "dose-header");
      header.append(medicationBadge(icon, color), info);
      card.append(header);
    }
    const result = element("div");
    result.className = "dose-result";
    if (!featured && (!view || view.has("doses"))) result.append(badge);
    if (planned && !featured) result.append(element("p", planned));
    if (instructions) result.append(element("p", instructions));
    if (result.childElementCount) info.append(result);
    if (view) {
      if (dose.recordedBy) info.append(element("small", t("ui.recorded-by-value", view.authorName(dose)), "family-stamp"));
      if (view.canRecord("medicine", dose.day) && medicine && (!medicine.paused || dose.historyPlan) &&
          !["taken", "skipped"].includes(dose.status) && scheduledAt(dose.day, dose.minute) <= Date.now()) {
        const control = recordAction("ثبت مصرف", () => view.record({ kind: "medicine", day: dose.day,
          id: medicine.id, minute: dose.minute, amount: dose.planned, title: heading.textContent, unit }));
        if (layout) layout.addActions(control);
        else {
          const footer = element("div", "", "dose-quick");
          footer.append(control);
          card.append(footer);
        }
      }
      return card;
    }
    if (dose.day > today() || !medicine || (medicine.paused && !dose.historyPlan)) return card;
    const canSnooze = dose.day === today() && !medicine.paused && !dose.historyPlan &&
      slotsFor(medicine, dose.day).some(slot => slot.minuteOfDay === dose.minute);
    const label = element("label", t("ui.actual-dose-taken"));
    const amount = element("input");
    amount.dir = "ltr";
    amount.inputMode = "decimal";
    amount.maxLength = 11;
    if (dose.actual != null) amount.value = amountText(dose.actual);
    if (dose.planned != null) amount.placeholder = amountText(dose.planned);
    label.append(amount);
    const amountForm = element("form", "", "day-card-dose-form");
    const amountError = element("p", "", "field-error");
    amountError.setAttribute("role", "status");
    async function record(status) {
      try {
        amountError.textContent = "";
        const entered = status === "taken" ? quantity(amount, true) : null;
        if (entered === 0) throw new Error(t("ui.enter-an-amount-greater-than-zero"));
        await mutate(state => {
          const saved = state.medicines[medicine.id];
          if (!saved) throw new Error(t("ui.this-schedule-is-paused"));
          const id = doseId(saved, dose.day, dose.minute);
          const existing = state.doses[id];
          const current = createCareIndex(state, engine, localZone(), today()).dosesOn(dose.day)
            .find(slot => slot.medicineId === saved.id && slot.minute === dose.minute);
          if (!current) throw new Error(t("ui.this-dose-changed-refresh-the-page"));
          const archived = current.historyPlan;
          if (saved.paused && !archived) throw new Error(t("ui.this-schedule-is-paused"));
          if (status === "snoozed" && (dose.day !== today() || archived ||
            !slotsFor(saved, dose.day).some(slot => slot.minuteOfDay === dose.minute))) throw new Error(t("ui.this-dose-can-no-longer-be-snoozed"));
          const planned = current.planned;
          const actual = status === "taken" ? entered ?? existing?.actual ?? planned : null;
          const scheduled = doseTime(dose.day, dose.minute);
          const tracked = saved.stock !== null && (existing?.unit ?? archived?.unit ?? saved.unit) === saved.unit &&
            scheduled >= (saved.stockTrackedFrom ?? 0);
          if (tracked && status === "taken" && actual === null) {
            throw new Error(t("ui.enter-the-amount-taken-to-deduct-it-from-your-stock"));
          }
          const debit = tracked ? actual ?? 0 : 0;
          if (saved.stock !== null) saved.stock = engine.updateStock(saved.stock, existing?.debit ?? 0, debit, 0);
          const snoozeUntil = status === "snoozed" ? Math.max(Date.now(), scheduled, existing?.snoozeUntil ?? 0) +
            (state.medicationSnoozeMinutes ?? 10) * minuteMs : 0;
          const resolvedAt = status === "taken" || status === "skipped" ? existing?.resolvedAt ?? Date.now() : null;
          state.doses[id] = { ...existing, medicineId: saved.id, day: dose.day, minute: dose.minute, planned, status, actual, debit, snoozeUntil, resolvedAt };
          if (archived) state.doses[id].unit ??= archived.unit;
        }, status === "snoozed" ? t("ui.dose-snoozed") : t("ui.dose-status-saved"), true, dose.day);
      } catch (error) {
        $("status").textContent = error.message;
        amountError.textContent = error.message;
      }
    }

    const pending = !dose.status || dose.status === "snoozed";
    const takenLabel = t(dose.status === "taken" ? "ui.edit-intake" : "ui.mark-as-taken");
    const taken = action(takenLabel, () => record("taken"), !pending);
    if (pending) taken.classList.add("care-record-action");
    const saveAmount = element("button", takenLabel, "secondary");
    saveAmount.type = "submit";
    amountForm.append(label, saveAmount, amountError);
    amountForm.addEventListener("submit", event => {
      event.preventDefault();
      void record("taken");
    });
    const snooze = () => action(t("ui.in-value-min", localDigits(getState().medicationSnoozeMinutes ?? 10)), () => record("snoozed"), true);
    const options = dayCardOptions(t("ui.dose-options"), amountForm,
      ...(canSnooze ? [snooze()] : []),
      ...(dose.status !== "skipped" ? [action(t("ui.skip-dose"), () => record("skipped"), true)] : []),
      ...(dose.status ? [action(t("ui.undo-log"), () => record(null), true)] : []));
    if (layout) {
      taken.classList.add("secondary");
      if (compactDay) {
        layout.addActions(options, ...(pending ? [taken] : []));
      } else {
        const postpone = pending && canSnooze ? snooze() : null;
        postpone?.classList.add("day-card-snooze");
        layout.addActions(taken, ...(postpone ? [postpone] : []), options);
      }
    } else {
      card.append(options);
      if (pending) {
        const quick = element("div", "", "action-pair dose-quick");
        quick.append(taken);
        if (canSnooze) quick.append(snooze());
        card.append(quick);
      }
    }
    if (dose.status === "snoozed") {
      const reminder = element("p", t("ui.next-reminder-value", new Intl.DateTimeFormat(locale, {
        dateStyle: "medium", timeStyle: "short"
      }).format(dose.snoozeUntil)));
      reminder.className = "dose-snoozed";
      (layout ? info : card).append(reminder);
    }
    return card;
  }

  function renderMedications(daily) {
    const medicines = Object.values(getState().medicines);
    $("cabinet-count").textContent = medicines.length === 1 ? t("ui.1-medicine") : t("ui.value-medicines", localDigits(medicines.length));
    const noPlans = element("p", t("ui.no-medicines-scheduled-yet"), "empty");
    $("plans").replaceChildren(...(medicines.length ? medicines.map(renderMedicine) : [noPlans]));
    filterCabinet();
    $("plans-heading").parentElement.hidden = getFamilyView()?.has("medicines") === false;
    const consumed = daily.filter(dose => dose.status === "taken").length;
    const doseCard = dose => renderDose(getState().medicines[dose.medicineId], dose);
    const percent = daily.length ? Math.round(consumed * 100 / daily.length) : 0;
    $("med-day-summary").hidden = daily.length === 0 || getFamilyView()?.has("doses") === false;
    $("med-day-count").textContent = t("ui.value-of-value-taken", localDigits(consumed), localDigits(daily.length));
    $("med-day-ring").style.setProperty("--percent", percent);
    $("med-day-ring").firstElementChild.textContent = percentFormat.format(percent / 100);
    const noDoses = element("p", t("ui.no-medication-doses-scheduled-for-this-day"));
    noDoses.className = "empty";
    $("med-day-doses").replaceChildren(...(daily.length ? daily.map(doseCard) : [noDoses]));
  }

  $("cabinet-search").addEventListener("input", () => {
    filterCabinet();
    $("plans").scrollLeft = 0;
  });
  return { renderDose, renderMedications, deleteMedicine };
}
