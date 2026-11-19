export async function sendReleaseNotice(send, plan, version, stillCurrent) {
  const english = plan.language === "en";
  const outcome = await send(
    plan.subscription,
    {
      title: english ? "Medora has been updated" : "مدورا به‌روز شد",
      body: english
        ? "Tap to open the latest version."
        : "برای باز کردن نسخهٔ تازه، روی اعلان بزنید.",
      tag: "medora-release",
      release: version,
      day: new Date().toISOString().slice(0, 10),
    },
    43_200,
    stillCurrent,
  );
  const retry =
    ["failed", "superseded", "paused"].includes(outcome.status) ||
    outcome.providerStatus === 429 ||
    outcome.providerStatus >= 500;
  return { status: outcome.status, retry };
}
