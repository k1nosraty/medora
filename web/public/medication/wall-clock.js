export const dayMs = 86_400_000;

export function timezone(zone) {
  const fixed = /^(?:UTC|GMT)?([+-])(\d{2})(?::?(\d{2}))?$/.exec(zone);
  if (fixed) {
    const hours = Number(fixed[2]);
    const minutes = Number(fixed[3] ?? 0);
    if (hours > 18 || minutes > 59 || hours === 18 && minutes > 0) throw new RangeError("Timezone offset");
    return { offset: (fixed[1] === "-" ? -1 : 1) * (hours * 60 + minutes) * 60_000 };
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone === "Z" ? "UTC" : zone, calendar: "gregory", numberingSystem: "latn", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

export function localWall(at, clock) {
  if (Object.hasOwn(clock, "offset")) return Math.floor(at / 60_000) * 60_000 + clock.offset;
  const part = Object.fromEntries(clock.formatToParts(at).map(({ type, value }) => [type, Number(value)]));
  const date = new Date(0);
  date.setUTCFullYear(part.year, part.month - 1, part.day);
  date.setUTCHours(part.hour, part.minute);
  return date.getTime();
}

export function instantForWall(wall, clock, offsetsByDay) {
  const day = Math.floor(wall / dayMs);
  let offsets = offsetsByDay.get(day);
  if (!offsets) {
    offsets = new Set([-dayMs, 0, 2 * dayMs].map(delta => {
      const probe = day * dayMs + delta;
      return localWall(probe, clock) - probe;
    }));
    offsetsByDay.set(day, offsets);
  }
  const options = [...offsets].map(offset => wall - offset).sort((a, b) => a - b);
  // During a repeated hour use its earlier instant. Move a missing local time forward by the gap.
  const mapped = options.map(at => ({ at, difference: localWall(at, clock) - wall }));
  return mapped.find(option => option.difference === 0)?.at ??
    mapped.filter(option => option.difference > 0).sort((a, b) => a.difference - b.difference)[0]?.at;
}
