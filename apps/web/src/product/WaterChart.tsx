import { useLayoutEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { waterChartModel } from "./waterChartModel";
import { clearFeature, paintFeature } from "./renderer";

function chartTarget(
  key: string,
  index: number,
  last: number,
  direction: string,
) {
  const rtl = direction === "rtl";
  switch (key) {
    case "ArrowLeft":
      return index + (rtl ? 1 : -1);
    case "ArrowRight":
      return index + (rtl ? -1 : 1);
    case "Home":
      return 0;
    case "End":
      return last;
  }
}

function chartHosts() {
  return {
    chart: document.getElementById("report-chart")!,
    selection: document.getElementById("report-chart-selection")!,
    picker: document.querySelector<HTMLSelectElement>("#report-chart-pick")!,
    dates: document.getElementById("report-chart-dates")!,
    previous: document.getElementById("report-chart-previous")!,
    next: document.getElementById("report-chart-next")!,
  };
}

type Model = ReturnType<typeof waterChartModel>;
interface Props {
  model: Model;
  hosts: ReturnType<typeof chartHosts>;
}

function WaterChart({ model, hosts }: Props) {
  const { chart, selection, picker, dates, previous, next } = hosts;
  const [selected, select] = useState(model.initial);
  const bar = model.bars[selected];
  useLayoutEffect(() => {
    picker.onchange = () => select(picker.selectedIndex);
    previous.onclick = () => select((index) => Math.max(0, index - 1));
    next.onclick = () =>
      select((index) => Math.min(model.bars.length - 1, index + 1));
    return () => {
      picker.onchange = previous.onclick = next.onclick = null;
    };
  }, [picker, previous, next, model.bars.length]);
  useLayoutEffect(() => {
    picker.selectedIndex = selected;
    previous.setAttribute("aria-disabled", String(selected <= 0));
    next.setAttribute(
      "aria-disabled",
      String(selected === model.bars.length - 1),
    );
  }, [picker, previous, next, model.bars.length, selected]);

  return (
    <>
      {model.bars.map((item, index) => (
        <button
          className="secondary"
          type="button"
          key={index}
          aria-label={item.label}
          aria-pressed={index === selected}
          tabIndex={index === selected ? 0 : -1}
          data-logged={String(item.logged)}
          style={{ "--bar": item.size, "--days": item.days } as CSSProperties}
          onClick={() => select(index)}
          onKeyDown={(event) => {
            const target = chartTarget(
              event.key,
              index,
              model.bars.length - 1,
              model.direction,
            );
            if (target === undefined) return;
            event.preventDefault();
            if (model.bars[target]) {
              select(target);
              chart.querySelectorAll("button")[target]?.focus();
            }
          }}
        />
      ))}
      {createPortal(
        model.bars.map((item, index) => (
          <option key={index}>{item.option}</option>
        )),
        picker,
      )}
      {createPortal(
        <>
          <span>{model.first}</span>
          <span>{model.last}</span>
        </>,
        dates,
      )}
      {bar &&
        createPortal(
          <>
            <span className="report-chart-date">{bar.date}</span>
            <strong>{bar.value}</strong>
            {bar.average && <small>{bar.average}</small>}
          </>,
          selection,
        )}
    </>
  );
}

export function renderWaterChart(...input: Parameters<typeof waterChartModel>) {
  const model = waterChartModel(...input);
  const hosts = chartHosts();
  if (hosts.chart.dataset.chartKey === model.key) return;
  document.getElementById("report-water-trend")!.dir = model.direction;
  hosts.chart.style.setProperty("--goal", model.goal);
  hosts.chart.dataset.chartKey = model.key;
  paintFeature(
    hosts.chart,
    <WaterChart model={model} hosts={hosts} key={model.key} />,
  );
}
export function clearWaterChart() {
  const { chart } = chartHosts();
  clearFeature(chart);
  delete chart.dataset.chartKey;
}
