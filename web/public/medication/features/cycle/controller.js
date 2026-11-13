import { $, button, element } from "../../shared/ui/dom.js";
import { t } from "../../shared/i18n/locale.js";
import { dayNumber } from "../../shared/ui/dates.js";
import { isoDay } from "../../domain/care-index.js";
import { cycleForecast } from "../../domain/cycle.js";
import { cycleIsEnabled } from "../../domain/profile.js";

export function installCycle({ getState, mutate, today, formatDay, requestDeletion, refreshFields }) {
  const dialog = $("cycle-dialog");
  const start = $("cycle-start");
  const end = $("cycle-end");
  const flow = $("cycle-flow");
  const note = $("cycle-note");
  const error = $("cycle-error");
  let editing;

  function open(day) {
    if (!cycleIsEnabled(getState())) return;
    editing = day;
    const record = getState().cycleRecords?.[day];
    start.max = end.max = isoDay(today());
    start.value = isoDay(day ?? today());
    end.value = record?.end == null ? "" : isoDay(record.end);
    flow.value = record?.flow ?? "";
    note.value = record?.note ?? "";
    error.textContent = "";
    refreshFields(dialog);
    dialog.showModal();
  }

  $("cycle-add").addEventListener("click", () => open());
  $("quick-cycle").addEventListener("click", () => open());
  $("cycle-form").addEventListener("submit", async event => {
    event.preventDefault();
    const previous = editing;
    let day, last;
    try {
      day = dayNumber(start.value);
      last = end.value ? dayNumber(end.value) : null;
    } catch {
      error.textContent = t("تاریخ شروع و پایان چرخه را بررسی کنید.");
      return;
    }
    if (!Number.isInteger(day) || day > today() || (last !== null && (last < day || last > today()))) {
      error.textContent = t("تاریخ شروع و پایان چرخه را بررسی کنید.");
      return;
    }
    const entry = { end: last, flow: flow.value, note: note.value.trim() };
    const submit = event.submitter;
    submit.disabled = true;
    try {
      if (await mutate(state => {
        if (!cycleIsEnabled(state)) throw new Error(t("چرخه غیرفعال است."));
        state.cycleRecords ??= {};
        if (day !== previous && Object.hasOwn(state.cycleRecords, day)) throw new Error(t("برای این تاریخ قبلاً چرخه ثبت شده است."));
        if (previous !== undefined && !Object.hasOwn(state.cycleRecords, previous)) throw new Error(t("این ثبت دیگر در دسترس نیست."));
        if (previous !== undefined) delete state.cycleRecords[previous];
        state.cycleRecords[day] = entry;
      }, t("چرخه ذخیره شد."))) dialog.close();
      else error.textContent = $("status").textContent;
    } finally { submit.disabled = false; }
  });

  function render(state) {
    const records = state.cycleRecords ?? {};
    const forecast = cycleForecast(records);
    const output = $("cycle-forecast");
    output.textContent = !forecast ? t("پس از ثبت سه تاریخ شروع، بازهٔ تخمینی نمایش داده می‌شود.")
      : forecast.last < today() ? t("برای به‌روزرسانی تخمین، شروع جدید را ثبت کنید.")
      : t("تخمینی: {0} تا {1}", formatDay(forecast.first), formatDay(forecast.last));
    const history = $("cycle-history");
    const dates = Object.keys(records).map(Number).sort((a, b) => b - a);
    history.replaceChildren(...dates.map(day => {
      const record = records[day];
      const row = element("article", "", "cycle-record");
      const copy = element("div");
      copy.append(element("strong", formatDay(day)));
      if (record.end !== null) copy.append(element("p", t("تا {0}", formatDay(record.end))));
      if (record.flow) copy.append(element("p", t({ light: "کم", medium: "متوسط", heavy: "زیاد" }[record.flow])));
      if (record.note) copy.append(element("p", record.note));
      const actions = element("div", "", "buttons");
      actions.append(button(t("ویرایش"), () => open(day)), button(t("حذف"), () => {
        requestDeletion({
          title: t("ثبت چرخه حذف شود؟"),
          message: formatDay(day),
          change: state => {
            if (!cycleIsEnabled(state)) throw new Error(t("چرخه غیرفعال است."));
            delete state.cycleRecords?.[day];
          },
          success: t("ثبت چرخه حذف شد."),
          scheduleChanged: false
        });
      }));
      row.append(copy, actions);
      return row;
    }));
    if (!dates.length) history.append(element("p", t("هنوز چرخه‌ای ثبت نشده است."), "quiet"));
  }
  return { render };
}
