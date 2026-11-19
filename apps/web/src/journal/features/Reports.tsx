import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { journal } from "../storage/journal";
import { useApp } from "../context";
import { civilDay, displayDay } from "../i18n";
export default function Reports() {
  const { owner, locale, t, calendar } = useApp();
  const [length, period] = useState(7),
    [end, last] = useState(civilDay);
  const first = end - length + 1;
  const query = useQuery({
    queryKey: ["entries", owner, "report", first, end],
    queryFn: () => journal.report(owner, first, end),
    staleTime: 0,
  });
  const number = new Intl.NumberFormat(locale),
    iso = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
  return (
    <>
      <h1>{t.reports}</h1>
      <div className="fields">
        <label>
          {t.period}
          <select
            value={length}
            onChange={(e) => period(Number(e.target.value))}
          >
            {[7, 30, 90].map((n) => (
              <option key={n} value={n}>
                {number.format(n)} {t.days}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.rangeEnd}
          <input
            type="date"
            value={iso(end)}
            max={iso(civilDay())}
            onChange={(e) => {
              const n = e.target.valueAsNumber / 86400000;
              if (Number.isInteger(n) && n <= civilDay()) last(n);
            }}
          />
        </label>
      </div>
      {query.isError ? (
        <p role="alert">{t.error}</p>
      ) : query.isPending ? (
        <p role="status">{t.loading}</p>
      ) : (
        <>
          <h2>
            {t.totalWater} ·{" "}
            {number.format(query.data.reduce((n, row) => n + row.water, 0))}{" "}
            {t.unit}
          </h2>
          <div className="table-scroll">
            <table>
              <caption>
                {displayDay(first, locale, calendar)} –{" "}
                {displayDay(end, locale, calendar)}
              </caption>
              <thead>
                <tr>
                  {[
                    t.date,
                    t.water + " (" + t.unit + ")",
                    t.taken,
                    t.skipped,
                    t.visits,
                  ].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data.map((row) => (
                  <tr key={row.day}>
                    <th scope="row">{displayDay(row.day, locale, calendar)}</th>
                    {[row.water, row.taken, row.skipped, row.visits].map(
                      (value, index) => (
                        <td key={index}>{number.format(value)}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
