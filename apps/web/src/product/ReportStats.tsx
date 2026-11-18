import { t } from "../../../../web/public/medication/shared/i18n/locale.js";
import { renderStats as initialPaint } from "../../../../web/public/medication/features/reports/stats.js";
import { paintFeature } from "./lazy-renderer";

type Stat = [label: string, value: string, tone?: string];
export function renderStats(host: HTMLElement, stats: Stat[]) {
  const tiles = stats.map(([label, value, tone]) => (
    <div key={label} data-tone={tone}>
      <dt>{t(label)}</dt>
      <dd>{value}</dd>
    </div>
  ));
  paintFeature(host, tiles, () => initialPaint(host, stats));
}
