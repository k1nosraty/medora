const storyPeriods = [
  { endHour: 6, period: "sleep" },
  { endHour: 11, period: "morning" },
  { endHour: 14, period: "noon" },
  { endHour: 17, period: "late-afternoon" },
  { endHour: 19, period: "afternoon" },
  { endHour: 23, period: "night" },
  { endHour: 24, period: "sleep" }
];

export function installTodayStory(story) {
  let timer;

  function update() {
    clearTimeout(timer);
    const now = new Date();
    const { endHour, period } = storyPeriods.find(({ endHour }) => now.getHours() < endHour);
    if (story.dataset.storyPeriod !== period) story.dataset.storyPeriod = period;
    if (document.hidden) return;

    const next = new Date(now);
    next.setHours(endHour, 0, 0, 0);
    timer = setTimeout(update, Math.min(60_000, next - now));
  }

  document.addEventListener("visibilitychange", update);
  window.addEventListener("focus", update);
  update();
}
