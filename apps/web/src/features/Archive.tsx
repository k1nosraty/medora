import { useNavigate } from "react-router-dom";
import { importProfile } from "../storage/profiles";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useApp } from "../context";
import { archiveDevice, DeviceArchive } from "../storage/archive";
import { captureLegacy } from "../storage/legacy";
import { project } from "../storage/project";
import { restoreFile, exportProfile } from "../storage/backup";
import { journal } from "../storage/journal";

import CloudBackups from "./CloudBackups";
export default function Archive() {
  const { t, locale, owner, setOwner, notice } = useApp();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const device = owner === "device" || owner.startsWith("restore:");
  const legacy = useQuery({
    queryKey: ["legacy"],
    enabled: device,
    queryFn: async () => project(await captureLegacy(localStorage)),
  });
  const copies = useQuery({
    queryKey: ["archive-images"],
    enabled: device,
    queryFn: async () => {
      const db = new DeviceArchive();
      try {
        return (await db.images.toArray()).filter((x) => x.checked);
      } finally {
        db.close();
      }
    },
  });
  const openCopy = useMutation({
    mutationFn: async (id: string) => {
      const db = new DeviceArchive();
      try {
        return await importProfile(db, journal, id);
      } finally {
        db.close();
      }
    },
    onSuccess: (scope) => {
      setOwner(scope);
      navigate("/water");
    },
    onError: () => setMessage(t.error),
  });
  const archive = useMutation({
    mutationFn: archiveDevice,
    onSuccess: (r) => {
      setMessage(
        new Intl.NumberFormat(locale).format(r.count) + " " + t.copied,
      );
      void copies.refetch();
    },
    onError: () => setMessage(t.error),
  });
  const fileWork = useMutation({
    mutationFn: async (data: FormData) => {
      const password = String(data.get("password") ?? "");
      const file = data.get("file");
      if (data.get("action") === "restore") {
        if (!(file instanceof File) || !file.size)
          throw new Error("file_required");
        const db = new DeviceArchive();
        try {
          const result = await restoreFile(file, password, db);
          setMessage(
            new Intl.NumberFormat(locale).format(result.count) + " " + t.copied,
          );
          void copies.refetch();
        } finally {
          db.close();
        }
      } else {
        const cycle = data.get("action") === "cycle";
        const url = URL.createObjectURL(
          await exportProfile(
            journal,
            owner,
            password,
            cycle ? "cycle" : "device",
          ),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = cycle
          ? "medora-cycle.medoracycle"
          : "medora-care.medora";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        notice(t.complete);
      }
    },
    onError: () => setMessage(t.error),
  });
  return (
    <>
      <h1>{t.archive}</h1>
      {device && (
        <section className="panel">
          <h2>{t.old}</h2>
          <p>{t.backupHelp}</p>
          <button disabled={archive.isPending} onClick={() => archive.mutate()}>
            {t.backup}
          </button>
          {legacy.isError ? (
            <p role="alert">{t.error}</p>
          ) : (
            legacy.data && (
              <dl>
                {(["medicines", "visits", "routines"] as const).map((k) => (
                  <div key={k}>
                    <dt>{t[k]}</dt>
                    <dd>
                      {new Intl.NumberFormat(locale).format(
                        Object.keys(legacy.data.settings[k] ?? {}).length,
                      )}
                    </dd>
                  </div>
                ))}
                <div>
                  <dt>{t.legacyWater}</dt>
                  <dd>
                    {new Intl.NumberFormat(locale).format(
                      legacy.data.water.length,
                    )}
                  </dd>
                </div>
              </dl>
            )
          )}
        </section>
      )}
      {!device && <CloudBackups />}
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          data.set(
            "action",
            (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ??
              "restore",
          );
          fileWork.mutate(data, { onSuccess: () => form.reset() });
        }}
      >
        <h2>{t.files}</h2>
        <label>
          {t.files}
          <input name="file" type="file" accept=".medora,.medoracycle" />
        </label>
        <label>
          {t.unlock}
          <input
            type="password"
            name="password"
            required
            autoComplete="off"
            maxLength={128}
          />
        </label>
        <button disabled={fileWork.isPending} type="submit" value="restore">
          {t.open}
        </button>
        <button
          className="secondary"
          disabled={fileWork.isPending}
          type="submit"
          value="export"
        >
          {t.download}
        </button>
        <button
          className="secondary"
          disabled={fileWork.isPending}
          type="submit"
          value="cycle"
        >
          {t.exportCycle}
        </button>
      </form>
      {device &&
        copies.data?.map((m) => (
          <button
            key={m.id}
            className="secondary"
            disabled={openCopy.isPending}
            onClick={() => openCopy.mutate(m.id)}
          >
            {t.useCopy} · <bdi>{m.id.slice(0, 8)}</bdi>
          </button>
        ))}
      <p role="status">{message}</p>
    </>
  );
}
