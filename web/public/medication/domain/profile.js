export const genders = ["", "female", "male", "undisclosed"];
export const finishes = ["glass", "matte"];

export const canEnableCycle = state => state.gender !== "male";
export const cycleIsEnabled = state => canEnableCycle(state) && state.cycleEnabled === true;
export const finishOf = value => value === "matte" ? "matte" : "glass";

export function ageAt(birthDate, date) {
  if (typeof birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [year, month, day] = birthDate.split("-").map(Number);
  const parsed = new Date(birthDate + "T00:00:00Z");
  if (year < 1 || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== birthDate) return null;
  const beforeBirthday = date.getMonth() + 1 < month || (date.getMonth() + 1 === month && date.getDate() < day);
  const age = date.getFullYear() - year - Number(beforeBirthday);
  return age >= 0 && age <= 130 ? age : null;
}

export function validPersonalProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, value]) => {
    if (["firstName", "lastName"].includes(key)) return typeof value === "string" && value.length <= 60 && !/\p{Cc}/u.test(value);
    if (key === "birthDate") return ageAt(value, new Date()) !== null;
    if (key === "heightCm") return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 300;
    if (key === "weightKg") return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 650;
    return false;
  });
}
