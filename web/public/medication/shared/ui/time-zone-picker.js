import { localWall, timezone } from "../../domain/wall-clock.js";
import { element } from "./dom.js";
import { language, locale, t } from "../i18n/locale.js";

const persianNames = {
  "Asia/Tehran": ["تهران", "ایران", "اصفهان", "شیراز", "مشهد", "تبریز"],
  "Asia/Dubai": ["دبی", "دوبی"],
  "Asia/Kabul": ["کابل"],
  "Asia/Tokyo": ["توکیو"],
  "Europe/Istanbul": ["استانبول"],
  "Europe/Berlin": ["برلین"],
  "Europe/London": ["لندن"],
  "Europe/Paris": ["پاریس"],
  "America/Toronto": ["تورنتو"],
  "America/New_York": ["نیویورک"],
  "America/Los_Angeles": ["لس‌آنجلس", "لس آنجلس"],
  "Australia/Sydney": ["سیدنی"]
};

const searchKey = text => text.normalize("NFKD").toLowerCase()
  .replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[^\p{L}\p{N}]/gu, "");
const cityOf = zone => zone.split("/").at(-1).replaceAll("_", " ");
export const timeZoneCity = zone => (language === "fa" && persianNames[zone]?.[0]) || cityOf(zone);
const cities = new Intl.Collator(locale, { sensitivity: "base" });

function utcOffset(zone, now) {
  const minutes = (localWall(now, timezone(zone)) - Math.floor(now / 60_000) * 60_000) / 60_000;
  const absolute = Math.abs(minutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const remainder = String(absolute % 60).padStart(2, "0");
  return `UTC${minutes < 0 ? "-" : "+"}${hours}:${remainder}`;
}

export function installTimeZonePicker(search, options, empty) {
  let rows = [];
  function filter() {
    const query = searchKey(search.value);
    let matches = 0;
    for (const { row, key } of rows) {
      row.hidden = !key.includes(query);
      if (!row.hidden) matches++;
    }
    empty.hidden = matches > 0;
    options.scrollTop = 0;
  }

  search.addEventListener("input", filter);

  return {
    get value() { return options.querySelector("input:checked")?.value; },
    load(saved, device, now) {
      const selected = saved ?? device;
      const pinned = new Set([device, "Asia/Tehran", "UTC", selected]);
      const others = (Intl.supportedValuesOf?.("timeZone") ?? []).filter(zone => !pinned.has(zone))
        .sort((a, b) => cities.compare(timeZoneCity(a), timeZoneCity(b)) || cities.compare(a, b));
      rows = [...pinned, ...others].map(zone => {
        const city = cityOf(zone);
        const aliases = persianNames[zone] ?? [];
        const name = timeZoneCity(zone);
        const title = zone === device ? t("ui.sync-device-zone-option", name) : name;
        const row = element("label", "", "time-zone-option");
        const radio = element("input");
        radio.type = "radio";
        radio.name = options.id;
        radio.value = zone;
        radio.checked = zone === selected;
        const text = element("span", "", "time-zone-name");
        text.append(element("bdi", title));
        const region = zone.split("/").slice(0, -1).join(" / ").replaceAll("_", " ");
        if (region) text.append(element("small", region, "time-zone-region"));
        const offset = element("bdi", utcOffset(zone, now), "time-zone-offset");
        offset.dir = "ltr";
        row.append(radio, text, offset);
        return { row, key: searchKey([zone, city, ...aliases].join(" ")) };
      });
      options.replaceChildren(...rows.map(({ row }) => row));
      search.value = "";
      filter();
    }
  };
}
