const triggers = {
  medicine: "[data-open-medication]", visit: "[data-open-visit]", routine: "[data-open-routine]",
  water: "[data-open-water], [data-water-add], #today-water-quick", cycle: "#cycle-add, #quick-cycle"
};
const selector = Object.values(triggers).join(", ");

export function installEntryActions({ currentView, currentDay, open, addWater, quickWater, familyWater }) {
  const quick = document.getElementById("quick-dialog");

  function entry(kind, control) {
    const view = currentView();
    const day = currentDay();
    const todayWater = control?.id === "today-water-quick";
    const amount = todayWater ? 250 : Number(control?.dataset.waterAdd);
    if (view) {
      if (kind === "water" || kind === "cycle") {
        if (!view.canRecord(kind, day)) return;
        if (kind === "water" && amount) void familyWater(view, day, amount, control);
        else view.record({ kind, day });
      } else if (view.canAdd(kind)) view.add(kind, day);
    } else if (kind === "water" && amount) {
      if (todayWater) void quickWater();
      else void addWater(amount, day);
    } else open(kind, control);
  }

  document.addEventListener("click", event => {
    const launcher = event.target.closest("#open-quick, [data-open-quick]");
    if (launcher) {
      if (!quick.open) quick.showModal();
      return;
    }
    const control = event.target.closest(selector);
    if (!control || control.disabled) return;
    const kind = Object.keys(triggers).find(key => control.matches(triggers[key]));
    if (control.closest("#quick-dialog")) quick.close();
    entry(kind, control);
  });
  return entry;
}
