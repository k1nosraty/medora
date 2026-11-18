import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChartColumn,
  Droplets,
  Archive,
  CalendarDays,
  UserRound,
} from "lucide-react";
import { civilDay, displayDay } from "../i18n";
import { journal } from "../storage/journal";
import { useApp } from "../context";
export default function Today() {
  const { locale, calendar, t, owner } = useApp();
  const day = civilDay();
  const query = useQuery({
    queryKey: ["entries", owner, day],
    queryFn: () => journal.entries(owner, day),
  });
  const schedule = useQuery({
    queryKey: ["plans", owner, "agenda", day],
    queryFn: async () => {
      const profile = await journal.profile(owner);
      if (!Object.keys(profile.settings).length) return [];
      const { agenda } = await import("../../../../packages/domain/src/care");
      return agenda(
        profile.settings,
        day,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        day,
      );
    },
  });
  return (
    <>
      <section className="cover">
        <div>
          <h1>{t.today}</h1>
          <p>{displayDay(day, locale, calendar)}</p>
        </div>
        <img src="./art/today.webp" alt="" />
      </section>
      <section className="water-summary">
        <div>
          <h2>{t.waterTitle}</h2>
          {query.isError ? (
            <p role="alert">{t.error}</p>
          ) : query.data ? (
            <strong>
              {new Intl.NumberFormat(locale).format(
                query.data.reduce((n, r) => n + (r.body?.amount ?? 0), 0),
              )}{" "}
              {t.unit}
            </strong>
          ) : (
            <p>{t.loading}</p>
          )}
          <Link to="/water" className="action">
            <Droplets size={19} />
            {t.add}
          </Link>
        </div>
        <img src="./art/water.webp" alt="" width="106" height="106" />
      </section>
      {schedule.isError && <p role="alert">{t.error}</p>}
      {Boolean(schedule.data?.length) && (
        <section className="panel">
          <h2>{t.agenda}</h2>
          <ul>
            {schedule.data?.map((item) => (
              <li key={item.kind + item.id}>
                <bdi>{item.time}</bdi>
                <Link to={"/plans/" + item.kind} dir="auto">
                  {item.label}
                </Link>
                <small>{t[item.kind]}</small>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link className="archive-link" to="/plans/medicines">
        <CalendarDays />
        {t.plans}
      </Link>
      {owner !== "device" && !owner.startsWith("restore:") && (
        <Link className="archive-link" to="/family">
          <UserRound />
          {t.family}
        </Link>
      )}
      <Link className="archive-link" to="/reports">
        <ChartColumn />
        {t.reports}
      </Link>
      <Link className="archive-link" to="/archive">
        <Archive />
        {t.archive}
      </Link>
    </>
  );
}
