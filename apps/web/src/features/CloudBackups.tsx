import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../context";
import { exportProfile, restoreFile } from "../storage/backup";
import { DeviceArchive } from "../storage/archive";
import { importProfile } from "../storage/profiles";
import { journal } from "../storage/journal";
import { useNavigate } from "react-router-dom";

export default function CloudBackups() {
  const { owner, t, locale, notice, setOwner } = useApp(),
    client = useQueryClient(),
    navigate = useNavigate();
  const headers = { "X-Medora-Owner": owner };
  const backups = useQuery({
    queryKey: ["backups", owner],
    queryFn: async () => {
      const r = await fetch("/api/v2/backups", { headers, cache: "no-store" });
      if (!r.ok) throw Error("network");
      return (await r.json()).backups as {
        id: string;
        bytes: number;
        created_at: string;
      }[];
    },
  });
  const save = useMutation({
    mutationFn: async (password: string) => {
      const file = await exportProfile(journal, owner, password);
      const r = await fetch("/api/v2/backups", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/octet-stream" },
        body: file,
      });
      if (!r.ok) throw Error("failed");
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["backups", owner] });
      notice(t.complete);
    },
    onError: () => notice(t.error),
  });
  const restore = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const response = await fetch(
        "/api/v2/backups/" + encodeURIComponent(id),
        { headers, cache: "no-store" },
      );
      if (!response.ok) throw Error("failed");
      const db = new DeviceArchive();
      try {
        const copy = await restoreFile(await response.blob(), password, db);
        return await importProfile(db, journal, copy.id);
      } finally {
        db.close();
      }
    },
    onSuccess: (id) => {
      setOwner(id);
      navigate("/records");
    },
    onError: () => notice(t.error),
  });
  return (
    <section className="panel">
      <h2>{t.cloudBackups}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = e.currentTarget;
          save.mutate(String(new FormData(f).get("password")), {
            onSuccess: () => f.reset(),
          });
        }}
      >
        <label>
          {t.archivePassword}
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={15}
            maxLength={128}
            required
          />
        </label>
        <button disabled={save.isPending}>{t.saveAccountBackup}</button>
      </form>
      {backups.isError ? (
        <p role="alert">{t.error}</p>
      ) : (
        backups.data?.map((r) => (
          <form
            key={r.id}
            onSubmit={(e) => {
              e.preventDefault();
              restore.mutate({
                id: r.id,
                password: String(new FormData(e.currentTarget).get("password")),
              });
            }}
          >
            <h3>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(r.created_at))}
            </h3>
            <label>
              {t.unlock}
              <input
                name="password"
                type="password"
                autoComplete="off"
                required
              />
            </label>
            <button disabled={restore.isPending}>{t.useCopy}</button>
          </form>
        ))
      )}
    </section>
  );
}
