export function installTodayStory(story) {
  let timer;

  function update() {
    clearTimeout(timer);
    const now = new Date();
    const hour = now.getHours();
    const period = hour < 6 || hour >= 19 ? "night" : hour < 15 ? "morning" : "afternoon";
    if (story.dataset.storyPeriod !== period) story.dataset.storyPeriod = period;
    if (document.hidden) return;

    const next = new Date(now);
    next.setHours(hour < 6 ? 6 : hour < 15 ? 15 : hour < 19 ? 19 : 30, 0, 0, 0);
    timer = setTimeout(update, Math.min(60_000, next - now));
  }

  document.addEventListener("visibilitychange", update);
  window.addEventListener("focus", update);
  update();
}
