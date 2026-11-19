import { listBackups, putBackup, getBackup } from "../services/backups";
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
  const backups = useQuery({
    queryKey: ["backups", owner],
    queryFn: () => listBackups(owner),
  });
  const save = useMutation({
    mutationFn: async (password: string) => {
      const file = await exportProfile(journal, owner, password, "cloud");
      await putBackup(owner, file);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["backups", owner] });
      notice(t.complete);
    },
    onError: () => notice(t.error),
  });
  const restore = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const file = await getBackup(owner, id);
      const db = new DeviceArchive();
      try {
        const copy = await restoreFile(file, password, db);
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
