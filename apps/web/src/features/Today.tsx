import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Droplets, Archive, CalendarDays, UserRound } from "lucide-react";
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
      <Link className="archive-link" to="/archive">
        <Archive />
        {t.archive}
      </Link>
    </>
  );
}
