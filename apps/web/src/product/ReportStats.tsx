import { t } from "../../product-assets/public/medication/shared/i18n/locale.js";
import { paintFeature } from "./renderer";

type Stat = [label: string, value: string, tone?: string];
export function renderStats(host: HTMLElement, stats: Stat[]) {
  const tiles = stats.map(([label, value, tone]) => (
    <div key={label} data-tone={tone}>
      <dt>{t(label)}</dt>
      <dd>{value}</dd>
    </div>
  ));
  paintFeature(host, tiles);
}
