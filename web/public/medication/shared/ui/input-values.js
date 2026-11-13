export function integer(input) {
  const digits = input.trim().replace(/[۰-۹٠-٩]/g, char => String((char.charCodeAt(0) & 15)));
  return /^\d{1,5}$/.test(digits) ? Number(digits) : NaN;
}
export function localClock() {
  const now = new Date();
  return [now.getHours(), now.getMinutes()].map(n => String(n).padStart(2, "0")).join(":");
}
