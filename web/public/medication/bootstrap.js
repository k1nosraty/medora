const status = document.getElementById("boot-status");
const retry = document.getElementById("boot-retry");

retry.addEventListener("click", () => {
  const url = new URL(location.href);
  url.searchParams.set("retry", Date.now());
  location.replace(url);
});

try {
  await import("./medication.js");
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
