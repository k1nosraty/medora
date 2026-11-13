import { $ } from "../medication/shared/ui/dom.js";
import { glassObject } from "./glass.js";

const panelArt = {
  "": "control-settings",
  "notification-settings": "notification",
  "water-settings": "water",
  "snooze-settings": "bottle",
  "appointment-settings": "visit",
  "display-settings": "control-sun",
  "backup-settings": "backup"
};

function installDisplayPreview(settings, text, calendar) {
  const form = $("display-form");
  const berry = form.querySelector(".settings-accents label").cloneNode(true);
  berry.className = "gallery-berry-choice";
  berry.querySelector("input").value = "berry";
  berry.querySelector(".accent-sample").dataset.accentSample = "berry";
  berry.lastElementChild.textContent = text("اناری", "Berry");
  form.querySelector(".settings-accents").append(berry);

  const finish = document.createElement("label");
  const finishSelect = $("finish").cloneNode(true);
  finishSelect.id = "gallery-settings-finish";
  finish.append(text("سبک طراحی", "Style"), finishSelect);
  form.prepend(finish);

  const names = ["theme", "accent", "finish"];
  const fields = { theme: form.elements.theme, accent: form.elements.accent, finish: finishSelect };
  function sync() {
    if (settings.dataset.panel === "display-settings") {
      berry.hidden = !$("cycle-preview").checked;
      for (const name of names) fields[name].value = $(name).value;
    } else if (!settings.dataset.panel) {
      const summary = $("settings-display-summary");
      const parts = summary.textContent.split(" · ");
      parts[1] = $("accent").selectedOptions[0].textContent;
      summary.textContent = parts.join(" · ");
    }
  }
  new MutationObserver(sync).observe(settings, { attributeFilter: ["data-panel"] });

  form.addEventListener("submit", event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const url = new URL(location.href);
    const nextCalendar = $("calendar-setting").value;
    const nextLanguage = $("app-language").value;
    for (const name of names) {
      $(name).value = fields[name].value;
      $(name).dispatchEvent(new Event("change"));
      url.searchParams.set(name, fields[name].value);
    }
    if (nextCalendar !== calendar || nextLanguage !== $("gallery-language").value) {
      url.searchParams.set("lang", nextLanguage);
      url.searchParams.set("calendar", nextCalendar);
      url.searchParams.set("cycle", $("cycle-preview").checked ? "on" : "off");
      location.assign(url);
    } else {
      $("settings-back").click();
    }
  }, { capture: true });
}

export function installPanelPreview({ openSettings, openAccount, text, calendar }) {
  const settings = $("settings-dialog");
  const art = id => glassObject(id, "control", { className: "gallery-panel-art" });
  const headerArt = document.createElement("span");
  headerArt.className = "gallery-settings-heading-art";
  $("settings-mark").after(headerArt);
  const updateHeader = () => headerArt.replaceChildren(art(panelArt[settings.dataset.panel || ""]));
  new MutationObserver(updateHeader).observe(settings, { attributeFilter: ["data-panel"] });
  updateHeader();

  for (const row of settings.querySelectorAll(".settings-row")) {
    row.querySelector(".settings-icon").replaceChildren(art(panelArt[row.dataset.settingsPanel] ?? "control-user"));
  }
  settings.querySelector(".settings-hero-art").replaceChildren(art("notification"));
  settings.querySelector("[data-open-account]").addEventListener("click", () => openAccount());
  $("settings-notification-state").textContent = text("پیش‌نمایش", "Preview");
  $("push-status").textContent = text("ارسال اعلان در گالری غیرفعال است.", "Notifications are disabled in the gallery.");
  installDisplayPreview(settings, text, calendar);

  const open = $("gallery-open-settings");
  open.replaceChildren(art(panelArt[""]));
  open.addEventListener("click", () => openSettings());

  const water = $("water-dialog");
  const amount = water.querySelector(".water-amount-field");
  const hero = document.createElement("div");
  hero.className = "gallery-water-hero";
  amount.before(hero);
  hero.append(amount, art("water"));
  water.querySelector(".sheet-header > svg").remove();
}
