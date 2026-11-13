const accents = [
  { id: "blue", label: "آبی" },
  { id: "green", label: "سبز" },
  { id: "lilac", label: "یاسی" },
  { id: "coral", label: "مرجانی" },
  { id: "berry", label: "اناری", requiresCycle: true }
];

export function availableAccents(cycleEnabled = false) {
  return accents.filter(accent => !accent.requiresCycle || cycleEnabled);
}

export const isBaseAccent = value => accents.some(accent => accent.id === value && !accent.requiresCycle);

export function accentOf(value, cycleEnabled = false) {
  return availableAccents(cycleEnabled).find(accent => accent.id === value)?.id ?? "blue";
}

export function accentLabel(value) {
  return accents.find(accent => accent.id === value)?.label ?? accents[0].label;
}
