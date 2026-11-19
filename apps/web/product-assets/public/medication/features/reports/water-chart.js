import { locale,t } from "../../shared/i18n/locale.js";
import {$,button,element} from "../../shared/ui/dom.js";
const number=new Intl.NumberFormat(locale).format;

/** @param {number[]} range @param {number} first @param {number} goal @param {boolean} groupByMonth
 * @param {(day:number)=>string} formatShortDate @param {(day:number)=>string} formatDay
 * @param {(day:number)=>number} monthStart */
export function waterChartModel(range, first, goal, groupByMonth, formatShortDate, formatDay, monthStart) {
  const last = first + range.length - 1;
  const bars = [];
  for (let start = first; start <= last;) {
    let end = start;
    if (groupByMonth) {
      const month = monthStart(start);
      end = Math.min(last, monthStart(month + 32) - 1);
    }
    const amounts = range.slice(start - first, end - first + 1).filter(Boolean);
    bars.push({ start, end, count: amounts.length, value: amounts.length ? amounts.reduce((total,value)=>total+value,0) / amounts.length : 0 });
    start = end + 1;
  }

  const direction = document.documentElement.dir;
  const dateLabel = (bar, long = false) => {
    const format = long ? formatDay : formatShortDate;
    return bar.start === bar.end ? format(bar.start) : t("ui.from-value-to-value", format(bar.start), format(bar.end));
  };
  const valueLabel = bar => bar.count ? t("ui.value-ml", number(Math.round(bar.value))) : t("ui.not-logged");
  const key = JSON.stringify([goal, groupByMonth, direction, bars.map(bar => [dateLabel(bar, true), bar.value, bar.count])]);
  const max = Math.max(goal, ...bars.map(bar => bar.value));
  return {
    key, direction, goal: `${goal / max * 100}%`,
    first: formatShortDate(first), last: formatShortDate(last),
    initial: bars.findLastIndex(bar => bar.count),
    bars: bars.map(bar=>({
      label: t("ui.value-value", dateLabel(bar,true),valueLabel(bar)),
      option: t("ui.value-value", dateLabel(bar),valueLabel(bar)),
      date: dateLabel(bar), value: valueLabel(bar),
      average: bar.end > bar.start && bar.count ? t("ui.average-across-value-logged-days",number(bar.count)) : null,
      size: `${bar.value / max * 100}%`, days:bar.end-bar.start+1, logged:Boolean(bar.count),
    })),
  };
}

export function chartHosts() {
  return {
    chart:$("report-chart"), selection:$("report-chart-selection"), picker:$("report-chart-pick"),
    previous:$("report-chart-previous"), next:$("report-chart-next"), dates:$("report-chart-dates"),
  };
}

export function chartTarget(key,index,last,direction) {
  const rtl=direction==="rtl";
  return {ArrowLeft:index+(rtl?1:-1),ArrowRight:index+(rtl?-1:1),Home:0,End:last}[key];
}

export function renderWaterChart(...input) {
  const model=waterChartModel(...input);
  const {chart,selection,picker,previous,next,dates}=chartHosts();
  if(chart.dataset.chartKey===model.key) return;
  chart.dataset.chartKey=model.key;
  $("report-water-trend").dir=model.direction;
  chart.style.setProperty("--goal",model.goal);
  const {bars,initial}=model;
  let selected=initial;
  const controls = bars.map((bar, i) => {
    const control = button("", () => select(i));
    control.setAttribute("aria-label", bar.label);
    control.style.setProperty("--bar", bar.size);
    control.style.setProperty("--days", bar.days);
    control.dataset.logged = String(bar.logged);
    control.addEventListener("keydown", event => {
      const target=chartTarget(event.key,i,bars.length-1,model.direction);
      if (target === undefined) return;
      event.preventDefault();
      if (controls[target]) {
        select(target);
        controls[target].focus();
      }
    });
    return control;
  });
  function select(index) {
    selected = index;
    controls.forEach((control, i) => {
      control.setAttribute("aria-pressed", String(i === selected));
      control.tabIndex = i === selected ? 0 : -1;
    });
    const bar = bars[selected];
    picker.selectedIndex = index;
    selection.replaceChildren(element("span", bar.date),
      element("strong",bar.value),
      ...(bar.average ? [element("small",bar.average)] : []));
    previous.setAttribute("aria-disabled", String(selected === 0));
    next.setAttribute("aria-disabled", String(selected === bars.length - 1));
  }
  previous.onclick = () => { if (selected > 0) select(selected - 1); };
  next.onclick = () => { if (selected < bars.length - 1) select(selected + 1); };
  picker.replaceChildren(...bars.map(bar => new Option(bar.option)));
  picker.onchange = () => select(picker.selectedIndex);
  chart.replaceChildren(...controls);
  dates.replaceChildren(element("span",model.first), element("span",model.last));
  select(initial);
}

export function clearWaterChart(clear = host=>host.replaceChildren()) {
  const {chart,picker,dates,previous,next}=chartHosts();
  clear(chart);
  dates.replaceChildren();
  picker.replaceChildren();
  delete chart.dataset.chartKey;
  picker.onchange = previous.onclick = next.onclick = null;
}
