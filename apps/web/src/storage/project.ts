import type { Image } from "./legacy";
type Fields = Record<string, unknown>;
const fields = (x: unknown): Fields => {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw new Error("invalid_source");
  return x as Fields;
};

export interface DeviceView {
  settings: Fields;
  days: Map<number, Fields>;
  water: Fields[];
}
export function project(image: Image): DeviceView {
  if (image.version > 3) throw new Error("newer_schema");
  const value = image.rows.find(
    (row) => row.store === "care" && row.key === "state",
  )?.value;
  const days = new Map<number, Fields>();
  const water: Fields[] = [];
  if (image.version > 1)
    for (const r of image.rows.filter((x) => x.store === "days")) {
      const bucket = fields(r.value);
      if (
        typeof bucket.day !== "number" ||
        bucket.day !== r.key ||
        !Array.isArray(bucket.water)
      )
        throw new Error("invalid_day");
      days.set(bucket.day, bucket);
      for (const w of bucket.water) water.push(fields(w));
    }
  if (value === undefined && days.size) throw new Error("missing_settings");
  const raw = value === undefined ? {} : fields(value);
  const settings =
    image.version >= 2 && value !== undefined ? fields(raw.settings) : raw;
  if (image.version === 1 && settings.water !== undefined) {
    if (!Array.isArray(settings.water)) throw new Error("invalid_water");
    for (const w of settings.water) water.push(fields(w));
  }
  return { settings, days, water };
}
