import type { CSSProperties } from "react";
import {
  renderSleepChart as initialChart,
  renderSleepHistory as initialHistory,
} from "../../../../web/public/medication/features/sleep/history.js";
import { paintFeature } from "./lazy-renderer";

interface Cell {
  day: number;
  label: string;
  number: string;
  selected: boolean;
  size: string;
  choose(): void;
}
interface Night {
  id: string;
  title: string;
  when: string;
  quality: string;
  note: string;
  actions: {
    editLabel: string;
    removeLabel: string;
    edit(): void;
    remove(): void;
  } | null;
}

export function renderSleepChart(host: HTMLElement, cells: Cell[]) {
  paintFeature(
    host,
    cells.map((cell) => (
      <li key={cell.day}>
        <button
          type="button"
          className="secondary"
          aria-label={cell.label}
          data-focus-key={"sleep-chart-" + cell.day}
          aria-pressed={cell.selected}
          onClick={cell.choose}
        >
          <span
            aria-hidden="true"
            style={{ "--sleep-bar": cell.size } as CSSProperties}
          />
          {cell.number}
        </button>
      </li>
    )),
    () => initialChart(host, cells),
  );
}

export function renderSleepHistory(host: HTMLElement, entries: Night[]) {
  paintFeature(
    host,
    entries.map((night) => (
      <article key={night.id} className="sleep-history-row">
        <div>
          <strong>{night.title}</strong>
          <p className="quiet">{night.when}</p>
          {night.quality && <p className="quiet">{night.quality}</p>}
          {night.note && <p className="quiet">{night.note}</p>}
        </div>
        {night.actions && (
          <>
            <button
              type="button"
              className="text-button"
              onClick={night.actions.edit}
            >
              {night.actions.editLabel}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={night.actions.remove}
            >
              {night.actions.removeLabel}
            </button>
          </>
        )}
      </article>
    )),
    () => initialHistory(host, entries),
  );
}
