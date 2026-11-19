import { useEffect } from "react";
import { paintFeature } from "./renderer";

const periods = [
  [6, "sleep"],
  [11, "morning"],
  [14, "noon"],
  [17, "late-afternoon"],
  [19, "afternoon"],
  [23, "night"],
  [24, "sleep"],
] as const;

export function TodayStory({
  host,
  date,
  displayDate,
  dateLabel,
  title,
  summary,
}: {
  host: HTMLElement;
  date: string;
  displayDate: string;
  dateLabel: string;
  title: string;
  summary: string;
}) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    function update() {
      clearTimeout(timer);
      const now = new Date();
      const nextPeriod = periods.find(([hour]) => now.getHours() < hour);
      if (!nextPeriod) return;
      const [hour, period] = nextPeriod;
      host.dataset.storyPeriod = period;
      if (document.hidden) return;
      const boundary = new Date(now);
      boundary.setHours(hour, 0, 0, 0);
      timer = setTimeout(
        update,
        Math.min(60_000, boundary.getTime() - now.getTime()),
      );
    }

    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    update();
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, [host]);

  return (
    <>
      <div className="story-copy">
        <time
          id="story-date"
          className="story-label"
          dateTime={date}
          aria-label={dateLabel}
        >
          {displayDate}
        </time>
        <h2 id="story-title">{title}</h2>
        <p id="story-summary">{summary}</p>
      </div>
      <img
        className="story-art"
        src="/medication/assets/illustrations/care.svg"
        width={560}
        height={350}
        alt=""
      />
    </>
  );
}

export function renderStory(
  host: HTMLElement,
  date: string,
  displayDate: string,
  dateLabel: string,
  title: string,
  summary: string,
) {
  paintFeature(
    host,
    <TodayStory
      host={host}
      date={date}
      displayDate={displayDate}
      dateLabel={dateLabel}
      title={title}
      summary={summary}
    />,
  );
}
