const triggers = {
  medicine: "[data-open-medication]",
  visit: "[data-open-visit]",
  routine: "[data-open-routine]",
  water: "[data-open-water], [data-water-add], #today-water-quick",
  cycle: "#cycle-add, #quick-cycle",
  sleep: "#quick-sleep",
};
const selector = Object.values(triggers).join(", ");

type Kind = keyof typeof triggers;
interface FamilyView {
  canRecord: (kind: "water" | "cycle", day: number) => boolean;
  record: (action: { kind: "water" | "cycle"; day: number }) => void;
  canAdd: (kind: Kind) => boolean;
  add: (kind: Kind, day: number) => void;
}
interface EntryActions {
  currentView: () => FamilyView | null;
  currentDay: () => number;
  open: (kind: Kind, control: HTMLElement | undefined) => void;
  addWater: (amount: number, day: number) => unknown;
  quickWater: () => unknown;
  familyWater: (
    view: FamilyView,
    day: number,
    amount: number,
    control: HTMLElement | undefined,
  ) => unknown;
}

export function installEntryActions({
  currentView,
  currentDay,
  open,
  addWater,
  quickWater,
  familyWater,
}: EntryActions) {
  const quick = document.querySelector<HTMLDialogElement>("#quick-dialog")!;

  function entry(kind: Kind, control?: HTMLElement) {
    const view = currentView();
    const day = currentDay();
    const todayWater = control?.id === "today-water-quick";
    const amount = todayWater ? 250 : Number(control?.dataset.waterAdd);
    if (view) {
      if (kind === "water" || kind === "cycle") {
        if (!view.canRecord(kind, day)) return;
        if (kind === "water" && amount)
          void familyWater(view, day, amount, control);
        else view.record({ kind, day });
      } else if (view.canAdd(kind)) view.add(kind, day);
    } else if (kind === "water" && amount) {
      if (todayWater) void quickWater();
      else void addWater(amount, day);
    } else open(kind, control);
  }

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const launcher = event.target.closest("#open-quick, [data-open-quick]");
    if (launcher) {
      if (!quick.open) quick.showModal();
      return;
    }
    const control = event.target.closest<HTMLElement>(selector);
    if (!control || ("disabled" in control && control.disabled)) return;
    const kind = (Object.keys(triggers) as Kind[]).find((key) =>
      control.matches(triggers[key]),
    );
    if (!kind) return;
    if (control.closest("#quick-dialog")) quick.close();
    entry(kind, control);
  });
  return entry;
}
