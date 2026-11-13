export function cycleForecast(records) {
  const starts = Object.keys(records ?? {}).map(Number).sort((a, b) => a - b);
  if (starts.length < 3) return null;
  const recent = starts.slice(-4);
  const intervals = recent.slice(1).map((day, index) => day - recent[index]);
  const last = recent.at(-1);
  return { first: last + Math.min(...intervals), last: last + Math.max(...intervals) };
}

export function cycleTotals(records, first, last) {
  let starts = 0;
  let latestStart = null;
  const loggedDays = new Set();
  for (const [key, record] of Object.entries(records ?? {})) {
    const start = Number(key);
    if (start >= first && start <= last) {
      starts++;
      latestStart = Math.max(latestStart ?? start, start);
    }
    const end = Math.min(record.end ?? start, last);
    for (let day = Math.max(start, first); day <= end; day++) loggedDays.add(day);
  }
  return { starts, days: loggedDays.size, latestStart };
}
