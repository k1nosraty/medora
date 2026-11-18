import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Pencil, Trash2 } from "lucide-react";
import { journal, type WaterRow } from "../storage/journal";
import { civilDay, clockTime, displayDay } from "../i18n";
import { useApp } from "../context";

export default function Water() {
  const { owner, t, locale, calendar, notice } = useApp();
  const [day, setDay] = useState(civilDay);
  const [edit, setEdit] = useState<WaterRow | null>(null);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["entries", owner, day],
    queryFn: () => journal.entries(owner, day),
  });
  const conflicts = useQuery({
    queryKey: ["entries", owner, "conflicts"],
    queryFn: () => journal.unresolved(owner),
  });
  const resolve = useMutation({
    mutationFn: async ({
      r,
      choice,
    }: {
      r: WaterRow;
      choice: "local" | "remote";
    }) => journal.resolve(owner, r.id, r.revision, choice),
    onSuccess: () => client.invalidateQueries({ queryKey: ["entries", owner] }),
    onError: () => notice(t.conflict),
  });
  const form = useForm<{ amount: number; time: string }>({
    defaultValues: { amount: 250, time: clockTime() },
  });
  const mutation = useMutation({
    mutationFn: async (action: {
      row: WaterRow | null;
      body: { amount: number; day: number; time: string } | null;
    }) => {
      await journal.save(
        owner,
        action.row?.id ?? crypto.randomUUID(),
        action.body,
        action.row?.revision ?? 0,
      );
    },
    onSuccess: async () => {
      setEdit(null);
      form.reset({ amount: 250, time: clockTime() });
      await client.invalidateQueries({ queryKey: ["entries", owner] });
      notice(t.complete);
    },
    onError: () => notice(t.conflict),
  });
  const number = new Intl.NumberFormat(locale);
  const dateString = new Date(day * 86400000).toISOString().slice(0, 10);
  return (
    <>
      <h1>{t.water}</h1>
      <label>
        {t.date}
        <input
          type="date"
          value={dateString}
          max={new Date(civilDay() * 86400000).toISOString().slice(0, 10)}
          onChange={(e) => {
            const next = e.target.valueAsNumber / 86400000;
            if (Number.isInteger(next) && next <= civilDay()) {
              setDay(next);
              setEdit(null);
              form.reset({ amount: 250, time: clockTime() });
            }
          }}
        />
      </label>
      <section className="water-summary">
        <div>
          <h2>{displayDay(day, locale, calendar)}</h2>
          <strong>
            {number.format(
              (query.data ?? []).reduce((n, r) => n + (r.body?.amount ?? 0), 0),
            )}{" "}
            {t.unit}
          </strong>
        </div>
        <img width="84" height="84" src="./art/water.webp" alt="" />
      </section>
      <form
        className="panel"
        onSubmit={form.handleSubmit((data) =>
          mutation.mutate({ row: edit, body: { ...data, day } }),
        )}
      >
        <h2>{edit ? t.edit : t.add}</h2>
        <div className="fields">
          <label>
            {t.amount}
            <input
              type="number"
              min="1"
              max="10000"
              required
              {...form.register("amount", { valueAsNumber: true })}
            />
          </label>
          <label>
            {t.time}
            <input type="time" required {...form.register("time")} />
          </label>
        </div>
        <button disabled={mutation.isPending}>{edit ? t.save : t.add}</button>
        {edit && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setEdit(null);
              form.reset({ amount: 250, time: clockTime() });
            }}
          >
            {t.cancel}
          </button>
        )}
      </form>
      {conflicts.data?.map((r) => (
        <section className="panel" key={r.id}>
          <h2>{t.conflict}</h2>
          <p>
            {t.server} ·{" "}
            {r.body
              ? number.format(r.body.amount) +
                " " +
                t.unit +
                " · " +
                r.body.time
              : t.deleted}
          </p>
          <button
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ r, choice: "local" })}
          >
            {t.keepLocal}
          </button>
          <button
            className="secondary"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ r, choice: "remote" })}
          >
            {t.keepRemote}
          </button>
        </section>
      ))}
      <section>
        <h2>{t.history}</h2>
        {query.isError ? (
          <p role="alert">{t.error}</p>
        ) : query.isPending ? (
          <p>{t.loading}</p>
        ) : !query.data.length ? (
          <p>{t.empty}</p>
        ) : (
          <ul>
            {[...query.data]
              .sort((a, b) => b.body!.time.localeCompare(a.body!.time))
              .map((row) => (
                <li key={row.id}>
                  <bdi>{row.body!.time}</bdi>
                  <span>
                    {number.format(row.body!.amount)} {t.unit}
                  </span>
                  {row.pending ? (
                    <small>{t.pending}</small>
                  ) : (
                    <>
                      <button
                        className="icon"
                        aria-label={t.edit + " " + row.body!.time}
                        onClick={() => {
                          setEdit(row);
                          form.reset(row.body!);
                          form.setFocus("amount");
                        }}
                      >
                        <Pencil />
                      </button>
                      <button
                        className="icon"
                        disabled={mutation.isPending}
                        aria-label={t.remove + " " + row.body!.time}
                        onClick={() => {
                          if (window.confirm(t.confirm))
                            mutation.mutate({ row, body: null });
                        }}
                      >
                        <Trash2 />
                      </button>
                    </>
                  )}
                </li>
              ))}
          </ul>
        )}
      </section>
    </>
  );
}
