export function cycleForecast(records) {
  const starts = Object.keys(records ?? {}).map(Number).sort((a, b) => a - b);
  if (starts.length < 3) return null;
  const recent = starts.slice(-4);
  const intervals = recent.slice(1).map((day, index) => day - recent[index]);
  const last = recent.at(-1);
  return { first: last + Math.min(...intervals), last: last + Math.max(...intervals) };
}
