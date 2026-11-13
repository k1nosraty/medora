import { language, listSeparator, locale, localDigits, t } from "../../shared/i18n/locale.js";
import { $, action, dayCardOptions, element } from "../../shared/ui/dom.js";
import { today } from "../../shared/ui/dates.js";
import { localZone, minuteMs } from "../../domain/care-plan.js";
import { compilePhases, createCareIndex, doseId, doseTime, timeText, trackSchedule } from "../../domain/care-index.js";
import * as engine from "../../domain/medication-rules.js";
import { medicationBadge, medicationBanner, medicineColorOf } from "./appearance.js";
import { amountText, doseUnit, quantity } from "./quantity.js";
import { nextPlannedDose } from "./next-dose.js";

const doseStates = { taken: t("مصرف شد"), skipped: t("مصرف نشد"), snoozed: t("به تعویق افتاد") };
const percentFormat = new Intl.NumberFormat(locale, { style: "percent" });

export function installMedicineView({ getState, mutate, requestDeletion, openEditor, formatDay }) {
  function slotsFor(medicine, day) {
    if (medicine.dates?.length && !medicine.dates.includes(day)) return [];
    return engine.medicationSlots(compilePhases(engine, medicine.phases), day);
  }

  function deleteMedicine(id, parent) {
    const medicine = getState().medicines[id];
    if (!medicine) return;
    requestDeletion({
      title: t("حذف دارو"),
      message: t("برنامهٔ «{0}» حذف شود؟ سوابق مصرف حفظ می‌شوند.", medicine.name),
      success: t("برنامهٔ دارو حذف شد."),
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
    card.dataset.color = card.dataset.ink = medicineColorOf(medicine.color);
    card.dataset.search = medicine.name;
    const heading = action(medicine.name, () => openMedicine(medicine));
    heading.dir = "auto";
    heading.className = "text-button treatment-name";
    const toggle = element("input");
    toggle.type = "checkbox";
    toggle.role = "switch";
    toggle.checked = !medicine.paused;
    toggle.setAttribute("aria-label", t("برنامهٔ {0} فعال است", medicine.name));
    toggle.addEventListener("change", async () => {
      const paused = !toggle.checked;
      if (!await mutate(state => {
        const saved = state.medicines[medicine.id];
        const next = { ...saved, paused, revision: saved.revision + 1 };
        trackSchedule(state, "medicines", saved, next, Date.now());
        state.medicines[medicine.id] = next;
      }, paused ? t("برنامهٔ دارو متوقف شد.") : t("برنامهٔ دارو فعال شد."), true)) toggle.checked = !toggle.checked;
    });
    const top = element("div");
    top.className = "feature-head";
    top.append(heading, toggle);
    const status = element("p", medicine.paused ? t("برنامه متوقف است") : t("برنامه فعال است"));
    status.className = "quiet";
    const profile = element("div");
    profile.className = "treatment-profile";
    const details = element("div");
    details.className = "treatment-details";
    details.append(top, status);
    if (medicine.instructions) details.append(element("p", medicine.instructions));
    if (medicine.phased || medicine.phases.length > 1) details.append(element("p", t("{0} مرحلهٔ مصرف", localDigits(medicine.phases.length))));
    else details.append(element("p", t("ساعت‌های مصرف: {0}", medicine.phases[0].slots.map(slot => localDigits(timeText(slot.minute))).join(" · "))));
    details.append(element("p", t("شروع از {0}", formatDay(medicine.phases[0].start))));
    profile.append(medicationBanner(medicine.icon, medicine.color), details);
    card.append(profile);
    if (medicine.stock !== null) {
      const upcoming = medicine.paused ? null : nextAmount(medicine);
      const low = upcoming !== null && engine.isLowStock(medicine.stock, medicine.threshold, upcoming);
      const balance = element("p", t("موجودی {0} {1}{2}", amountText(medicine.stock), doseUnit(medicine.unit, medicine.stock), low ? t("، زمان تهیهٔ دارو") : ""));
      balance.dataset.warning = String(low);
      card.append(balance);
      const purchase = element("form");
      const label = element("label", t("مقدار خریداری‌شده"));
      const amount = element("input");
      amount.dir = "ltr";
      amount.inputMode = "decimal";
      amount.maxLength = 11;
      amount.required = true;
      label.append(amount);
      const submit = element("button", t("خریدم"));
      submit.type = "submit";
      purchase.append(label, submit);
      purchase.addEventListener("submit", event => {
        event.preventDefault();
        try {
          const added = quantity(amount);
          if (added === 0) throw new Error(t("مقدار خرید باید بیشتر از صفر باشد."));
          void mutate(state => {
            const saved = state.medicines[medicine.id];
            saved.stock = engine.updateStock(saved.stock, 0, 0, added);
          }, t("موجودی خریداری‌شده ثبت شد."));
        } catch (error) {
          $("status").textContent = error.message;
        }
      });
      const refill = element("details");
      refill.className = "editor-options refill";
      refill.append(element("summary", t("ثبت خرید")), purchase);
      card.append(refill);
    }
    const edit = action(t("ویرایش"), () => openEditor(medicine), true);
    edit.className = "text-button";
    const remove = action(t("حذف دارو"), () => deleteMedicine(medicine.id));
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
    const summary = element("p", medicine.instructions || t("دستور مصرف ثبت نشده است."));
    const edit = action(t("ویرایش دارو"), () => { $("medicine-details").close(); openEditor(medicine); });
    const heading = element("h3", t("سابقهٔ مصرف"));
    const history = element("ul");
    history.className = "dose-history";
    for (const dose of entries) {
      const status = doseStates[dose.status];
      history.append(element("li", `${formatDay(dose.day)}، ${localDigits(timeText(dose.minute))} · ${status}`));
    }
    const remove = action(t("حذف دارو"), () => deleteMedicine(medicine.id, "medicine-details"));
    remove.className = "text-button danger-link";
    $("medicine-details-body").replaceChildren(medicationBanner(medicine.icon, medicine.color), summary, edit, remove, heading,
      entries.length ? history : element("p", t("هنوز مصرفی ثبت نشده است.")));
    $("medicine-details").showModal();
  }

  function renderDose(medicine, dose, variant) {
    const dayCard = Boolean(variant);
    const featured = variant === "featured";
    const calendar = variant === "calendar";
    const compactDay = dayCard && !featured;
    const card = element("article", "", dayCard ? "medicine dose-card day-card" : "medicine dose-card");
    const plan = dose.historyPlan ?? medicine;
    const unit = dose.unit ?? plan?.unit ?? "";
    const color = medicineColorOf(plan?.color ?? dose.color);
    card.dataset.color = color;
    card.dataset.ink = color;
    const heading = element("h3", dose.name || plan?.name || t("دارو"));
    heading.dir = "auto";
    const instructions = dose.instructions ?? plan?.instructions;
    const planned = dose.planned === null ? "" : `${amountText(dose.planned)} ${doseUnit(unit, dose.planned)}`;
    let recorded = doseStates[dose.status] ?? t(calendar ?
      (doseTime(dose.day, dose.minute) > Date.now() ? "برنامه‌ریزی‌شده" : "بدون ثبت") : "در انتظار ثبت");
    if (dose.status === "taken" && dose.actual != null) recorded += `${listSeparator}${amountText(dose.actual)} ${doseUnit(unit, dose.actual)}`;
    const badge = element("p", recorded);
    badge.className = "badge";
    badge.dataset.status = dose.status ?? "pending";
    const info = element("div");
    info.className = "dose-info";
    if (featured) {
      const due = dose.snoozeUntil || doseTime(dose.day, dose.minute);
      const eyebrow = element("p", dose.status === "snoozed" ? t("نوبت به‌تعویق‌افتاده") : due >= Date.now() ? t("نوبت بعدی") : t("نوبت ثبت‌نشده"));
      eyebrow.className = "hero-kicker";
      const time = dose.snoozeUntil ? new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(due) : localDigits(timeText(dose.minute));
      const meta = element("div");
      meta.className = "dose-meta";
      meta.append(eyebrow, element("p", time));
      info.append(meta, heading);
    } else info.append(heading, element("p", t("ساعت {0}", localDigits(timeText(dose.minute)))));
    const header = element("div");
    header.className = dayCard ? "dose-header day-card-content" : "dose-header";
    if (dayCard) {
      const art = medicationBanner(plan?.icon ?? dose.icon, color);
      art.classList.add("day-card-art");
      art.removeAttribute("aria-hidden");
      art.append(element("span", calendar && language === "en" ? "Med" : t("دارو"), "day-card-kind"));
      card.append(art);
    } else header.append(medicationBadge(medicine?.icon ?? dose.icon, color));
    header.append(info);
    card.append(header);
    const result = element("div");
    result.className = "dose-result";
    if (!featured) result.append(badge);
    if (planned) result.append(element("p", planned));
    if (instructions) result.append(element("p", instructions));
    if (result.childElementCount) info.append(result);
    if (dose.day > today() || !medicine || (medicine.paused && !dose.historyPlan)) return card;
    const canSnooze = dose.day === today() && !medicine.paused && !dose.historyPlan &&
      slotsFor(medicine, dose.day).some(slot => slot.minuteOfDay === dose.minute);
    const label = element("label", t("مقدار مصرف واقعی"));
    const amount = element("input");
    amount.dir = "ltr";
    amount.inputMode = "decimal";
    amount.maxLength = 11;
    if (dose.actual != null) amount.value = amountText(dose.actual);
    if (dose.planned != null) amount.placeholder = amountText(dose.planned);
    label.append(amount);
    async function record(status) {
      try {
        const entered = status === "taken" ? quantity(amount, true) : null;
        if (entered === 0) throw new Error(t("مقدار مصرف باید بیشتر از صفر باشد."));
        await mutate(state => {
          const saved = state.medicines[medicine.id];
          if (!saved) throw new Error(t("برنامهٔ این دارو متوقف شده است."));
          const id = doseId(saved, dose.day, dose.minute);
          const existing = state.doses[id];
          const current = createCareIndex(state, engine, localZone(), today()).dosesOn(dose.day)
            .find(slot => slot.medicineId === saved.id && slot.minute === dose.minute);
          if (!current) throw new Error(t("برنامهٔ این نوبت تغییر کرده است. صفحه را تازه کنید."));
          const archived = current.historyPlan;
          if (saved.paused && !archived) throw new Error(t("برنامهٔ این دارو متوقف شده است."));
          if (status === "snoozed" && (dose.day !== today() || archived ||
            !slotsFor(saved, dose.day).some(slot => slot.minuteOfDay === dose.minute))) throw new Error(t("این نوبت دیگر قابل تعویق نیست."));
          const planned = current.planned;
          const actual = status === "taken" ? entered ?? existing?.actual ?? planned : null;
          const scheduled = doseTime(dose.day, dose.minute);
          const tracked = saved.stock !== null && (existing?.unit ?? archived?.unit ?? saved.unit) === saved.unit &&
            scheduled >= (saved.stockTrackedFrom ?? 0);
          if (tracked && status === "taken" && actual === null) {
            throw new Error(t("برای کم‌کردن از موجودی، مقدار مصرف را وارد کنید."));
          }
          const debit = tracked ? actual ?? 0 : 0;
          if (saved.stock !== null) saved.stock = engine.updateStock(saved.stock, existing?.debit ?? 0, debit, 0);
          const snoozeUntil = status === "snoozed" ? Math.max(Date.now(), scheduled, existing?.snoozeUntil ?? 0) +
            (state.medicationSnoozeMinutes ?? 10) * minuteMs : 0;
          const resolvedAt = status === "taken" || status === "skipped" ? existing?.resolvedAt ?? Date.now() : null;
          state.doses[id] = { ...existing, medicineId: saved.id, day: dose.day, minute: dose.minute, planned, status, actual, debit, snoozeUntil, resolvedAt };
          if (archived) state.doses[id].unit ??= archived.unit;
        }, status === "snoozed" ? t("نوبت به تعویق افتاد.") : t("وضعیت نوبت ثبت شد."), true, dose.day);
      } catch (error) {
        $("status").textContent = error.message;
      }
    }

    const controls = element("div");
    controls.className = "buttons";
    const pending = !dose.status || dose.status === "snoozed";
    const taken = action(dose.status === "taken" ? t("اصلاح ثبت مصرف") : t("مصرف کردم"), () => record("taken"), !pending);
    if (pending) taken.classList.add("care-record-action");
    const snooze = () => action(t("{0} دقیقه بعد", localDigits(getState().medicationSnoozeMinutes ?? 10)), () => record("snoozed"), true);
    const skipped = action(t("مصرف نکردم"), () => record("skipped"), true);
    controls.append(...(pending || dayCard ? [skipped] : [taken, skipped]));
    if ((!pending || compactDay) && canSnooze) controls.append(snooze());
    if (dose.status) controls.append(action(t("برگشت ثبت"), () => record(null), true));
    if (dayCard) {
      const footer = element("div", "", "day-card-actions");
      taken.className = "secondary";
      const options = dayCardOptions(t("گزینه‌های نوبت"), label, controls);
      if (compactDay) {
        if (!pending) controls.prepend(taken);
        footer.append(options);
        if (pending) footer.append(taken);
      } else {
        footer.append(taken);
        if (pending && canSnooze) footer.append(snooze());
        footer.append(options);
      }
      card.append(footer);
    } else {
      const actual = element("details", "", "dose-options");
      const more = element("summary", "⋮");
      more.setAttribute("aria-label", t("گزینه‌های نوبت"));
      actual.append(more, label, controls);
      card.append(actual);
      if (pending) {
        const quick = element("div", "", "action-pair dose-quick");
        quick.append(taken);
        if (canSnooze) quick.append(snooze());
        card.append(quick);
      }
    }
    if (dose.status === "snoozed") {
      const reminder = element("p", t("یادآوری بعدی {0}", new Intl.DateTimeFormat(locale, {
        dateStyle: "medium", timeStyle: "short"
      }).format(dose.snoozeUntil)));
      reminder.className = "dose-snoozed";
      (compactDay ? info : card).append(reminder);
    }
    return card;
  }

  function renderMedications(daily) {
    const medicines = Object.values(getState().medicines);
    $("cabinet-count").textContent = medicines.length === 1 ? t("۱ دارو") : t("{0} دارو", localDigits(medicines.length));
    const noPlans = element("p", t("برنامهٔ دارویی ثبت نشده است."), "empty");
    $("plans").replaceChildren(...(medicines.length ? medicines.map(renderMedicine) : [noPlans]));
    filterCabinet();
    const consumed = daily.filter(dose => dose.status === "taken").length;
    const doseCard = dose => renderDose(getState().medicines[dose.medicineId], dose);
    const percent = daily.length ? Math.round(consumed * 100 / daily.length) : 0;
    $("med-day-summary").hidden = daily.length === 0;
    $("med-day-count").textContent = t("{0} از {1} نوبت", localDigits(consumed), localDigits(daily.length));
    $("med-day-ring").style.setProperty("--percent", percent);
    $("med-day-ring").firstElementChild.textContent = percentFormat.format(percent / 100);
    const noDoses = element("p", t("برای این روز نوبت مصرف دارو ثبت نشده است."));
    noDoses.className = "empty";
    $("med-day-doses").replaceChildren(...(daily.length ? daily.map(doseCard) : [noDoses]));
  }

  $("cabinet-search").addEventListener("input", () => {
    filterCabinet();
    $("plans").scrollLeft = 0;
  });
  return { renderDose, renderMedications, deleteMedicine };
}
