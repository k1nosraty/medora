import { monitorUpdates, refreshApp } from "./app/update.js";

const status = document.getElementById("boot-status");
const retry = document.getElementById("boot-retry");
let pressedControl;

function releasePress() {
  pressedControl?.removeAttribute("data-pressing");
  pressedControl = null;
}

// Touch browsers can delay :active while deciding whether the user is scrolling.
document.addEventListener("pointerdown", event => {
  if (!event.isPrimary || event.pointerType === "mouse") return;
  releasePress();
  pressedControl = event.target.closest('button, summary, label:has(> input:is([type="radio"], [type="checkbox"]))');
  pressedControl?.setAttribute("data-pressing", "");
}, { passive: true });
for (const type of ["pointerup", "pointercancel"]) {
  window.addEventListener(type, event => {
    if (event.isPrimary && event.pointerType !== "mouse") releasePress();
  }, { capture: true, passive: true });
}
window.addEventListener("blur", releasePress);

retry.addEventListener("click", async () => {
  retry.disabled = true;
  try { await refreshApp({ reload: true }); }
  catch { retry.disabled = false; }
});
monitorUpdates();

try {
  await import("./app/medora.js");
} catch {
  let english = document.documentElement.lang === "en";
  try {
    english ||= localStorage.getItem("medora-language") === "en";
  } catch {
    // Storage may be unavailable during startup.
  }
  status.textContent = english ? "Medora couldn’t load. Try again." : "مدورا باز نشد. دوباره تلاش کنید.";
  retry.textContent = english ? "Reload" : "بارگذاری دوباره";
}

if (!status.hidden) retry.hidden = false;
