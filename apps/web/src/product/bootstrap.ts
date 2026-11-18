import { monitorUpdates, refreshApp } from "./updates";

const status = document.getElementById("boot-status")!;
const retry = document.querySelector<HTMLButtonElement>("#boot-retry")!;
let pressedControl: Element | undefined;

function releasePress() {
  pressedControl?.removeAttribute("data-pressing");
  pressedControl = undefined;
}

// Touch browsers can delay :active until they distinguish a press from scroll.
document.addEventListener(
  "pointerdown",
  (event) => {
    if (!event.isPrimary || event.pointerType === "mouse") return;
    releasePress();
    if (!(event.target instanceof Element)) return;
    pressedControl =
      event.target.closest(
        'button, summary, label:has(> input:is([type="radio"], [type="checkbox"]))',
      ) ?? undefined;
    pressedControl?.setAttribute("data-pressing", "");
  },
  { passive: true },
);
for (const type of ["pointerup", "pointercancel"] as const) {
  window.addEventListener(
    type,
    (event) => {
      if (event.isPrimary && event.pointerType !== "mouse") releasePress();
    },
    { capture: true, passive: true },
  );
}
window.addEventListener("blur", releasePress);

retry.addEventListener("click", async () => {
  retry.disabled = true;
  try {
    await refreshApp({ reload: true });
  } catch {
    retry.disabled = false;
  }
});
monitorUpdates();

const url = new URL(location.href);
const release = url.searchParams.get("release");
if (release && /^[a-f0-9]{40}$/.test(release)) {
  const current =
    document.querySelector<HTMLMetaElement>('meta[name="medora-release"]')
      ?.content === release;
  const settled =
    current ||
    (await refreshApp().then(
      (result) => result === false,
      () => false,
    ));
  if (settled) {
    url.searchParams.delete("release");
    history.replaceState(history.state, "", url);
  }
}

try {
  await import("./product");
} catch {
  let english = document.documentElement.lang === "en";
  try {
    english ||= localStorage.getItem("medora-language") === "en";
  } catch {
    // Disabled storage must not prevent the retry prompt.
  }
  status.textContent = english
    ? "Medora couldn’t load. Try again."
    : "مدورا باز نشد. دوباره تلاش کنید.";
  retry.textContent = english ? "Reload" : "بارگذاری دوباره";
}

if (!status.hidden) retry.hidden = false;
