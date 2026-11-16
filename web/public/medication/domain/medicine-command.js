import { trackSchedule } from "./care-index.js";

export function saveMedicinePlan(state, plan, editingRevision, at) {
  const previous = state.medicines[plan.id];
  if (editingRevision !== null && (!previous || previous.revision !== editingRevision)) return false;
  const next = {
    ...previous,
    ...plan,
    unit: previous?.stock != null ? previous.unit : plan.unit,
    stock: previous?.stock ?? plan.stock,
    ...(previous && previous.stock == null && plan.stock !== null && { stockTrackedFrom: at }),
    revision: (previous?.revision ?? 0) + 1
  };
  state.medicines[plan.id] = next;
  trackSchedule(state, "medicines", previous, next, at);
  return true;
}
