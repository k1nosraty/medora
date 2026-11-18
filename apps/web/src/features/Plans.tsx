import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  collection,
  kinds,
  addPlan,
  markDose,
  timeline,
  completeRoutine,
  type Fields,
  type Kind,
} from "../../../../packages/domain/src/care";
import { journal } from "../storage/journal";
import { useApp } from "../context";
import { civilDay, displayDay, clockTime } from "../i18n";
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const iso = (d: number) => new Date(d * 86400000).toISOString().slice(0, 10);
const clock = (m: number) =>
  [Math.floor(m / 60), m % 60].map((x) => String(x).padStart(2, "0")).join(":");
export default function Plans() {
  const { owner, t, locale, calendar, notice } = useApp(),
    client = useQueryClient();
  const route = useParams().kind;
  const kind = kinds.includes(route as Kind) ? (route as Kind) : "medicines";
  const [day, selectDay] = useState(civilDay);
  const today = civilDay();
  const query = useQuery({
    queryKey: ["plans", owner],
    queryFn: () => journal.profile(owner),
  });
  const mutation = useMutation({
    mutationFn: async (change: (state: Fields) => void) => {
      if (!query.data) throw Error("loading");
      await journal.updateProfile(owner, query.data.revision, change);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["plans", owner] });
      notice(t.complete);
    },
    onError: async (error) => {
      await client.invalidateQueries({ queryKey: ["plans", owner] });
      notice(error.message === "conflict" ? t.conflict : t.invalid);
    },
  });
  if (!query.data)
    return <p role="status">{query.isError ? t.error : t.loading}</p>;
  const state = query.data.settings,
    rows = collection(state, kind);
  const doses = kind === "medicines" ? timeline(state, day, zone(), today) : [];
  return (
    <>
      <h1>{t.plans}</h1>
      <div className="program-links">
        {kinds.map((k) => (
          <Link
            key={k}
            aria-current={k === kind ? "page" : undefined}
            to={"/plans/" + k}
          >
            {t[k]}
          </Link>
        ))}
      </div>
      <h2>{t[kind]}</h2>
      {kind === "cycleDays" && (
        <label>
          <input
            type="checkbox"
            checked={state.cycleLocalOnly === true}
            disabled={mutation.isPending}
            onChange={(e) => {
              const value = e.target.checked;
              mutation.mutate((s) => {
                s.cycleLocalOnly = value;
              });
            }}
          />
          {t.privateCycle}
        </label>
      )}
      <label>
        {t.date}
        <input
          type="date"
          value={iso(day)}
          onChange={(e) => {
            const n = e.target.valueAsNumber / 86400000;
            if (Number.isInteger(n)) selectDay(n);
          }}
        />
      </label>
      {kind === "medicines" && doses.length > 0 && (
        <section className="panel">
          <h2>{displayDay(day, locale, calendar)}</h2>
          <ul>
            {doses.map((d) => (
              <li key={d.medicineId + "-" + d.minute}>
                <bdi>{clock(d.minute)}</bdi>
                <span dir="auto">
                  {String(rows[d.medicineId]?.name ?? d.medicineId)}{" "}
                  {d.status &&
                    " · " +
                      (d.status === "taken"
                        ? t.taken
                        : d.status === "skipped"
                          ? t.skipped
                          : d.status)}
                </span>
                {day <= today && rows[d.medicineId] && (
                  <>
                    <button
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate((s) =>
                          markDose(
                            s,
                            d.medicineId,
                            day,
                            d.minute,
                            "taken",
                            zone(),
                            today,
                            Date.now(),
                          ),
                        )
                      }
                    >
                      {t.taken}
                    </button>
                    <button
                      className="secondary"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate((s) =>
                          markDose(
                            s,
                            d.medicineId,
                            day,
                            d.minute,
                            "skipped",
                            zone(),
                            today,
                            Date.now(),
                          ),
                        )
                      }
                    >
                      {t.skipped}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <details className="panel" key={kind}>
        <summary>{t.addRecord}</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              data = new FormData(form),
              str = (key: string) => String(data.get(key) ?? "");
            const [h, m] = str("time").split(":").map(Number);
            const input = {
              kind,
              name: str("name"),
              day,
              minute: (h ?? 0) * 60 + (m ?? 0),
              zone: str("zone") || zone(),
              start: new Date(str("start")).getTime(),
              end: new Date(str("end")).getTime(),
              flow: str("flow"),
              unit: str("unit"),
              quantity: str("quantity"),
              stock: str("stock"),
            };
            mutation.mutate(
              (s) => addPlan(s, input, crypto.randomUUID(), Date.now(), today),
              { onSuccess: () => form.reset() },
            );
          }}
        >
          <label>
            {kind === "cycleDays" || kind === "sleepRecords" ? t.note : t.name}
            <input
              name="name"
              dir="auto"
              maxLength={
                kind === "cycleDays" || kind === "sleepRecords" ? 500 : 200
              }
              required={kind !== "cycleDays" && kind !== "sleepRecords"}
            />
          </label>
          {["visits", "medicines", "routines"].includes(kind) && (
            <label>
              {t.time}
              <input
                type="time"
                name="time"
                required
                defaultValue={clockTime()}
              />
            </label>
          )}
          {kind === "medicines" && (
            <>
              <label>
                {t.unitName}
                <input name="unit" dir="auto" maxLength={40} />
              </label>
              <label>
                {t.doseQuantity}
                <input name="quantity" inputMode="decimal" />
              </label>
              <label>
                {t.stock}
                <input name="stock" inputMode="decimal" />
              </label>
            </>
          )}
          {kind === "visits" && (
            <label>
              {t.timezone}
              <input name="zone" dir="ltr" defaultValue={zone()} required />
            </label>
          )}
          {kind === "sleepRecords" && (
            <>
              <label>
                {t.start}
                <input type="datetime-local" name="start" required />
              </label>
              <label>
                {t.end}
                <input type="datetime-local" name="end" required />
              </label>
            </>
          )}
          {kind === "cycleDays" && (
            <label>
              {t.flow}
              <select name="flow">
                {(
                  ["none", "spotting", "light", "medium", "heavy"] as const
                ).map((f) => (
                  <option key={f} value={f}>
                    {t[f]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button disabled={mutation.isPending}>{t.save}</button>
        </form>
      </details>
      {!Object.keys(rows).length ? (
        <p>{t.noRecords}</p>
      ) : (
        <ul>
          {Object.entries(rows).map(([id, row]) => (
            <li key={id}>
              <span dir="auto">
                {String(
                  row.name ??
                    (kind === "sleepRecords"
                      ? new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(Number(row.start))
                      : displayDay(Number(id), locale, calendar)),
                )}
              </span>
              {kind === "visits" && (
                <bdi>
                  {displayDay(Number(row.day), locale, calendar)} ·{" "}
                  {String(row.time)} · {String(row.zone ?? zone())}
                </bdi>
              )}
              {kind === "cycleDays" && (
                <span>
                  {t[String(row.flow) as keyof typeof t] ??
                    (row.flow as string)}
                </span>
              )}
              {kind === "routines" && row.mode === "done" && day <= today && (
                <button
                  disabled={
                    mutation.isPending ||
                    Boolean(collection(state, "routineLogs")[String(day)]?.[id])
                  }
                  onClick={() =>
                    mutation.mutate((s) => completeRoutine(s, id, day))
                  }
                >
                  {t.complete}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
