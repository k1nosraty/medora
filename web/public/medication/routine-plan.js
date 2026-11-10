export const maxRoutines = 64;
export const maxRoutineAmount = 99999;
export const maxRoutineSteps = 12;

export const routineWeekday = day => ((day + 3) % 7 + 7) % 7;

export function routineOccurs(routine, day) {
  return !routine.paused && day >= routine.start &&
    Math.floor((day - routine.start) / 7) % routine.interval === 0 &&
    Boolean(routine.mask & (1 << routineWeekday(day)));
}

export function routineComplete(entry) {
  if (entry.mode === "quantity") return entry.amount >= entry.target;
  if (entry.mode === "steps") return entry.checked?.length === entry.steps.length;
  return entry.done === true;
}

export function routineEntriesOn(state, day, today, plans = Object.values(state.routines ?? {})) {
  const recorded = state.routineLogs?.[day] ?? {};
  const entries = Object.entries(recorded).map(([id, entry]) => ({ ...entry, id }));
  if (day >= today) {
    for (const routine of plans) {
      if (!Object.hasOwn(recorded, routine.id) && routineOccurs(routine, day)) entries.push(routine);
    }
  }
  return entries.sort((a, b) => (a.minute ?? 1440) - (b.minute ?? 1440));
}

export function routineLog(routine, result) {
  const { name, category, minute, mode } = routine;
  const entry = { name, category, color: routine.color ?? "gold", minute, mode };
  if (mode === "quantity") {
    if (!Number.isInteger(result) || result < 1 || result > maxRoutineAmount) return null;
    return { ...entry, target: routine.target, unit: routine.unit, amount: result };
  }
  if (mode === "steps") {
    if (!Array.isArray(result)) return null;
    const checked = [...new Set(result)].filter(step => Number.isInteger(step) && step >= 0 && step < routine.steps.length).sort((a, b) => a - b);
    return checked.length ? { ...entry, steps: routine.steps, checked } : null;
  }
  return result === true ? { ...entry, done: true } : null;
}
