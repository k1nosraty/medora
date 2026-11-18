import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../context";
import { civilDay } from "../i18n";
interface Group {
  id: string;
  label: string;
  manager: boolean;
  members: {
    id: string;
    name: string;
    self: boolean;
    shared: boolean;
    canRead: boolean;
  }[];
}
export default function Family() {
  const { owner, t, notice, locale } = useApp(),
    client = useQueryClient();
  const [total, setTotal] = useState<{ label: string; amount: number } | null>(
    null,
  );
  const call = async (body?: unknown) => {
    const r = await fetch("/api/v2/families", {
      method: body ? "POST" : "GET",
      cache: "no-store",
      headers: { "X-Medora-Owner": owner, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!r.ok) throw Error("unavailable");
    return r.json();
  };
  const home = useQuery({
    queryKey: ["families", owner],
    queryFn: () =>
      call() as Promise<{
        groups: Group[];
        invitations: { id: string; label: string }[];
      }>,
    networkMode: "online",
    staleTime: 0,
  });
  const act = useMutation({
    mutationFn: async ({ body, label }: { body: unknown; label?: string }) => {
      const r = await call(body);
      if (label) setTotal({ label, amount: r.result.amount });
      else setTotal(null);
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["families", owner] }),
    onError: () => {
      setTotal(null);
      notice(t.error);
    },
  });
  return (
    <>
      <h1>{t.family}</h1>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          act.mutate(
            {
              body: {
                action: "create",
                label: String(new FormData(form).get("name")),
              },
            },
            { onSuccess: () => form.reset() },
          );
        }}
      >
        <label>
          {t.groupName}
          <input name="name" required maxLength={60} />
        </label>
        <button disabled={act.isPending}>{t.createGroup}</button>
      </form>
      {home.isError && <p role="alert">{t.error}</p>}
      {home.data?.invitations.map((i) => (
        <section key={i.id}>
          <h2 dir="auto">{i.label}</h2>
          <button
            disabled={act.isPending}
            onClick={() =>
              act.mutate({ body: { action: "accept", invite: i.id } })
            }
          >
            {t.accept}
          </button>
        </section>
      ))}
      {home.data?.groups.map((g) => (
        <section className="panel" key={g.id}>
          <h2 dir="auto">{g.label}</h2>
          {g.manager && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                act.mutate(
                  {
                    body: {
                      action: "invite",
                      family: g.id,
                      email: String(new FormData(form).get("email")),
                    },
                  },
                  { onSuccess: () => form.reset() },
                );
              }}
            >
              <label>
                {t.email}
                <input name="email" type="email" required />
              </label>
              <button disabled={act.isPending}>{t.invite}</button>
            </form>
          )}
          <ul>
            {g.members.map((m) => (
              <li key={m.id}>
                <bdi>{m.name}</bdi>
                {!m.self && (
                  <button
                    aria-pressed={m.shared}
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate({
                        body: {
                          action: "grant",
                          family: g.id,
                          viewer: m.id,
                          allow: !m.shared,
                        },
                      })
                    }
                  >
                    {m.shared ? t.stopSharing : t.shareWater}
                  </button>
                )}
                {m.canRead && (
                  <button
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate({
                        body: {
                          action: "water",
                          family: g.id,
                          owner: m.id,
                          day: civilDay(),
                        },
                        label: m.name,
                      })
                    }
                  >
                    {t.daily}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {total && (
        <output>
          <bdi>{total.label}</bdi> ·{" "}
          {new Intl.NumberFormat(locale).format(total.amount)} {t.unit}
        </output>
      )}
    </>
  );
}
