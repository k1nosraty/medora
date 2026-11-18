import { useLayoutEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { $ } from "../../../../web/public/medication/shared/ui/dom.js";
import {
  chartHosts,
  chartTarget,
  clearWaterChart as resetHosts,
  renderWaterChart as firstPaint,
  waterChartModel,
} from "../../../../web/public/medication/features/reports/water-chart.js";
import { clearFeature, paintFeature } from "./lazy-renderer";

type Model = ReturnType<typeof waterChartModel>;
interface Props {
  model: Model;
  hosts: {
    chart: HTMLElement;
    selection: HTMLElement;
    picker: HTMLSelectElement;
    dates: HTMLElement;
    previous: HTMLElement;
    next: HTMLElement;
  };
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
    previous.setAttribute("aria-disabled", String(selected === 0));
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
            <span>{bar.date}</span>
            <strong>{bar.value}</strong>
            {bar.average && <small>{bar.average}</small>}
          </>,
          selection,
        )}
    </>
  );
}

const mounted = new WeakSet<HTMLElement>();

export function renderWaterChart(...input: Parameters<typeof waterChartModel>) {
  const model = waterChartModel(...input);
  const hosts = chartHosts() as Props["hosts"];
  if (hosts.chart.dataset.chartKey === model.key) return;
  paintFeature(
    hosts.chart,
    <WaterChart model={model} hosts={hosts} key={model.key} />,
    () => firstPaint(...input),
    () => {
      // Only the cold-rendered children are unmanaged. React owns later paints.
      if (!mounted.has(hosts.chart)) {
        for (const host of [hosts.picker, hosts.dates, hosts.selection])
          host.replaceChildren();
        mounted.add(hosts.chart);
      }
      const trend = $("report-water-trend")!;
      trend.dir = model.direction;
      hosts.chart.style.setProperty("--goal", model.goal);
      hosts.chart.dataset.chartKey = model.key;
    },
  );
}
export function clearWaterChart() {
  resetHosts(clearFeature);
}
