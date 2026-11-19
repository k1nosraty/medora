import { cycleOptionDefaults, cycleDataFields } from "../../domain/cycle.js";
import { isoDay } from "../../domain/care-index.js";
import { today } from "../../shared/ui/dates.js";
import { $, element } from "../../shared/ui/dom.js";
import { showFeedback } from "../../shared/ui/controls.js";
import { t } from "../../shared/i18n/locale.js";
import { readCycleArchive, writeCycleArchive } from "./archive.js";

const isoToday = () => isoDay(today());

export function installCycleSettings({ getState, saveSettings, refreshFields, mutate }) {
  const settings = $("cycle-settings-form");
  const file = $("cycle-private-import-file");
  const list = $("cycle-routine-list");
  const dialog = $("cycle-backup-dialog");
  let importFile;
  function load() {
    const state = getState();
    const options = state.cycleOptions ?? cycleOptionDefaults;
    $("cycle-hide-today").checked = options.hideToday;
    $("cycle-card-size").value = state.cycleCardSize ?? "wide";
    $("cycle-local-only").checked = Boolean(state.cycleLocalOnly);
    $("cycle-local-reminder-hint").hidden = !state.cycleLocalOnly;
    $("cycle-reminder-time").value = options.minute === null ? "" :
      String(Math.floor(options.minute / 60)).padStart(2, "0") + ":" + String(options.minute % 60).padStart(2, "0");
    $("cycle-checklist-items").value = (state.cycleChecklist ?? []).join("\n");
    $("cycle-support-input").value = state.cycleSupport ?? "";
    $("cycle-support-input").disabled = Boolean(state.cycleLocalOnly);
    list.replaceChildren(...Object.values(state.routines ?? {}).filter(row => !row.paused).map(row => {
      const label = element("label");
      const input = element("input");
      input.type = "checkbox";
      input.value = row.id;
      input.checked = options.routines.includes(row.id);
      label.append(input, " " + row.name);
      return label;
    }));
    if (!list.children.length) list.append(element("p", t("ui.cycle-no-routines"), "quiet"));
    refreshFields(settings);
  }
  settings.addEventListener("submit", async event => {
    event.preventDefault();
    const clock = $("cycle-reminder-time").value;
    const localOnly = $("cycle-local-only").checked;
    const routines = [...list.querySelectorAll("input:checked")].map(input => input.value);
    const hideToday = $("cycle-hide-today").checked;
    const cardSize = $("cycle-card-size").value;
    const checklist = [...new Set($("cycle-checklist-items").value.split(/\r?\n/u).map(value => value.trim()).filter(Boolean))].slice(0, 20);
    if (await saveSettings(event.submitter, state => {
      state.cycleOptions = { hideToday,
        minute: clock ? Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5)) : null, routines,
        since: state.cycleOptions?.since ?? today() };
      state.cycleLocalOnly = localOnly;
      state.cycleCardSize = cardSize;
      state.cycleChecklist = checklist;
      if (localOnly) delete state.cycleSupport;
    }, t("ui.display-settings-saved"), true)) load();
  });
  $("cycle-support-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (getState().cycleLocalOnly) return;
    const message = $("cycle-support-input").value.trim();
    await saveSettings(event.submitter, state => {
      if (state.cycleLocalOnly) return;
      if (message) state.cycleSupport = message;
      else delete state.cycleSupport;
    }, t("ui.display-settings-saved"));
  });

  function backupDialog(selected) {
    importFile = selected;
    $("cycle-backup-form").reset();
    $("cycle-backup-status").textContent = "";
    $("cycle-backup-title").textContent = t(selected ? "ui.cycle-import-private" : "ui.cycle-export-private");
    dialog.showModal();
  }
  $("cycle-private-export").addEventListener("click", () => backupDialog());
  $("cycle-private-import").addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    if (file.files[0]) backupDialog(file.files[0]);
    file.value = "";
  });
  dialog.addEventListener("close", () => { $("cycle-backup-form").reset(); importFile = null; });
  $("cycle-backup-form").addEventListener("submit", async event => {
    event.preventDefault();
    const submit = event.submitter;
    const status = $("cycle-backup-status");
    const password = $("cycle-backup-password").value;
    if (password.length < 15) { showFeedback(status, t("ui.cycle-backup-short"), "error"); return; }
    const selected = importFile;
    submit.disabled = true;
    try {
      if (selected) {
        const checked = await readCycleArchive(selected, password);
        const imported = await mutate(state => {
          for (const key of cycleDataFields) state[key] = { ...checked[key], ...state[key] };
        }, t("ui.cycle-backup-imported"), true);
        if (!imported) throw new Error("storage");
      } else {
        const bytes = await writeCycleArchive(getState(), password);
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
        const link = element("a");
        link.href = url;
        link.download = `medora-cycle-${isoToday()}.medoracycle`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
      dialog.close();
    } catch { showFeedback(status, t("ui.cycle-backup-error"), "error"); }
    finally { submit.disabled = false; }
  });
  $("cycle-private-delete").addEventListener("click", async event => {
    if (!confirm(t("ui.cycle-delete-all"))) return;
    await saveSettings(event.currentTarget, state => {
      for (const key of cycleDataFields) delete state[key];
      delete state.cycleFollowup;
      delete state.cyclePreparation;
      delete state.cycleSupport;
    }, t("ui.cycle-deleted-all"), true);
  });
  return load;
}
