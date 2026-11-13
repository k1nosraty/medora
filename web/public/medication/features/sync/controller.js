import { $ } from "../../shared/ui/dom.js";
import { t } from "../../shared/i18n/locale.js";
import { accessCare, accessCareSettings } from "../../shared/storage.js";
import { portable } from "../backups/web-format.js";
import { applyPortable, mergeCare } from "./merge.js";

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const path = "/api/account/care";

export function installCareSync({ reload, remindersChanged }) {
  const status = $("account-sync-status");
  const enable = $("account-sync-enable");
  const disable = $("account-sync-disable");
  let running = false;
  let timer;
  let message = "";
  let pendingSignIn = false;

  function schedule(delay = 1500) {
    clearTimeout(timer);
    timer = setTimeout(() => void sync(), delay);
  }

  async function sync(activate = false, signedIn = false) {
    if (running) {
      pendingSignIn ||= signedIn;
      return;
    }
    if (!navigator.onLine) {
      if (activate) {
        message = "برای فعال‌کردن همگام‌سازی به اینترنت وصل شوید.";
        await refresh();
      }
      return;
    }
    running = enable.disabled = disable.disabled = true;
    message = "در حال همگام‌سازی سوابق…";
    void refresh();
    try {
      if (!activate && !signedIn && !(await accessCareSettings()).accountCare?.enabled) {
        message = "";
        return;
      }
      const local = await accessCare();
      const binding = local.accountCare;
      if (!activate && !signedIn && !binding?.enabled) { message = ""; return; }
      const response = await fetch(path, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
      if (response.status === 401) {
        message = "برای ادامهٔ همگام‌سازی دوباره وارد حساب شوید.";
        return;
      }
      if (!response.ok) throw new Error();
      const remote = await response.json();
      if (binding?.owner && binding.owner !== remote.owner) {
        message = "سوابق این مرورگر به حساب دیگری متصل‌اند. برای حساب جدید از نمایهٔ جداگانهٔ مرورگر استفاده کنید.";
        return;
      }
      const original = portable(local);
      const autoRestore = signedIn && !binding && remote.records && ![
        original.medicines, original.doses, original.visits, original.routines, original.water,
        original.routineLogs, original.cycleRecords, original.scheduleHistory
      ].some(records => Object.keys(records ?? {}).length);
      if (!activate && !binding?.enabled && !autoRestore) { message = ""; return; }
      const candidate = autoRestore ? remote.records : mergeCare(binding?.base, original, remote.records);
      let confirmed = remote;
      if (!autoRestore && (!remote.records || !same(candidate, mergeCare(null, remote.records, null)))) {
        const uploaded = await fetch(path, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner: remote.owner, revision: remote.revision, records: candidate }),
          signal: AbortSignal.timeout(12_000)
        });
        if (uploaded.status === 409) {
          if (activate) message = "سوابق حساب هم‌زمان تغییر کردند. دوباره همگام‌سازی را بزنید.";
          else schedule();
          return;
        }
        if (!uploaded.ok) throw new Error();
        confirmed = await uploaded.json();
      }
      let edited = false;
      let changed = false;
      await accessCare(state => {
        const current = state.accountCare;
        if ((current?.owner && current.owner !== remote.owner) ||
            (!activate && !autoRestore && !current?.enabled) ||
            (current?.revision ?? 0) > confirmed.revision) return;
        const snapshot = portable(state);
        const result = mergeCare(original, snapshot, confirmed.records);
        edited = !same(result, mergeCare(null, confirmed.records, null));
        changed = !same(result, mergeCare(null, snapshot, null));
        if (changed) {
          applyPortable(state, result);
          remindersChanged(state);
          state.intro = "done";
        }
        state.accountCare = { owner: remote.owner, enabled: true, revision: confirmed.revision,
          base: confirmed.records, syncedAt: Date.now() };
      }, { snapshot: local });
      await reload(changed);
      message = "سوابق با حساب همگام شدند.";
      if (edited) schedule();
    } catch {
      message = "همگام‌سازی انجام نشد. سوابق روی دستگاه باقی ماندند.";
      if (!activate) schedule(30_000);
    } finally {
      running = enable.disabled = disable.disabled = false;
      await refresh();
      if (pendingSignIn) {
        pendingSignIn = false;
        void sync(false, true);
      }
    }
  }

  async function refresh() {
    try {
      const { accountCare } = await accessCareSettings();
      enable.textContent = t(accountCare?.enabled ? "همگام‌سازی اکنون" : "فعال‌کردن همگام‌سازی سوابق");
      disable.hidden = !accountCare?.enabled;
      const badge = $("account-sync-badge");
      badge.dataset.enabled = String(Boolean(accountCare?.enabled));
      badge.textContent = t(accountCare?.enabled ? "روشن" : "فقط روی دستگاه");
      const last = $("account-sync-last");
      last.hidden = !accountCare?.syncedAt;
      last.textContent = last.hidden ? "" : t("آخرین همگام‌سازی: {0}", new Date(accountCare.syncedAt).toLocaleString(document.documentElement.lang));
      status.textContent = message ? t(message) : "";
    } catch {}
  }

  enable.addEventListener("click", () => {
    void accessCare().then(state => {
      if (!state.accountCare?.enabled && !confirm(t("سوابق موجود روی این دستگاه به حساب فعلی اضافه شوند؟"))) return;
      void sync(!state.accountCare?.enabled);
    });
  });
  disable.addEventListener("click", async () => {
    if (running) return;
    await accessCare(state => { if (state.accountCare) state.accountCare.enabled = false; });
    message = "همگام‌سازی این دستگاه متوقف شد.";
    await refresh();
  });
  window.addEventListener("online", () => schedule(0));
  window.addEventListener("focus", () => schedule(0));
  setInterval(() => { if (!document.hidden) schedule(0); }, 30_000);
  return { refresh, schedule, signedIn: () => void sync(false, true) };
}
