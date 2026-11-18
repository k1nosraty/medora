import { element } from "../../shared/ui/dom.js";
import { t } from "../../shared/i18n/locale.js";

export function renderStats(host, stats) {
  host.replaceChildren(...stats.map(([label, value, tone]) => {
    const tile = element("div");
    if (tone) tile.dataset.tone = tone;
    tile.append(element("dt", t(label)), element("dd", value));
    return tile;
  }));
}
