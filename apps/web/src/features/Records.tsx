import { useQuery } from "@tanstack/react-query";
import { useApp } from "../context";
import { journal } from "../storage/journal";
import { displayDay } from "../i18n";
const kinds = [
  "medicines",
  "visits",
  "routines",
  "doses",
  "routineLogs",
  "sleepRecords",
  "cycleDays",
  "cycleRecords",
] as const;
export default function Records() {
  const { owner, t, locale, calendar } = useApp();
  const query = useQuery({
    queryKey: ["records", owner],
    queryFn: () => journal.profile(owner).then((r) => r.settings),
  });
  return (
    <>
      <h1>{t.restored}</h1>
      {query.isError ? (
        <p role="alert">{t.error}</p>
      ) : query.isPending ? (
        <p>{t.loading}</p>
      ) : (
        kinds.map((kind) => {
          const entries = Object.entries(query.data[kind] ?? {}) as [
            string,
            Record<string, unknown>,
          ][];
          if (!entries.length) return null;
          return (
            <section className="panel" key={kind}>
              <h2>{t[kind]}</h2>
              <ul>
                {entries.map(([id, r]) => (
                  <li key={id}>
                    <span dir="auto">
                      {typeof r.name === "string"
                        ? r.name
                        : typeof r.day === "number"
                          ? displayDay(r.day, locale, calendar)
                          : /^-?\d+$/.test(id)
                            ? displayDay(Number(id), locale, calendar)
                            : id}
                    </span>
                    {typeof r.time === "string" && <bdi>{r.time}</bdi>}
                    {typeof r.status === "string" && <span>{r.status}</span>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}
