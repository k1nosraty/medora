import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarDays, Droplets, UserRound } from "lucide-react";
import Today from "./features/Today";
import { AppContext } from "./context";
import { words, type Locale } from "./i18n";
import { guest, journal } from "./storage/journal";
import { synchronize } from "./storage/sync";
const Reports = lazy(() => import("./features/Reports"));
const Water = lazy(() => import("./features/Water"));
const Account = lazy(() => import("./features/Account"));
const Plans = lazy(() => import("./features/Plans"));
const Family = lazy(() => import("./features/Family"));
const Records = lazy(() => import("./features/Records"));
const Files = lazy(() => import("./features/Archive"));

export function App() {
  const [locale, language] = useState<Locale>(() =>
    localStorage.getItem("medora-language") === "en" ? "en" : "fa",
  );
  const [calendar, setCalendar] = useState(
    () =>
      localStorage.getItem("medora-v2-calendar") ??
      (locale === "fa" ? "persian" : "gregory"),
  );
  const [owner, setOwner] = useState(
    () => sessionStorage.getItem("medora-v2-owner") ?? guest,
  );
  const [status, notice] = useState("");
  const [retry, requestSync] = useState(0);
  const location = useLocation(),
    main = useRef<HTMLElement>(null),
    client = useQueryClient();
  const t = words[locale];
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
    document.title = t.brand;
  }, [locale, t]);
  useEffect(() => {
    main.current?.focus();
    notice("");
  }, [location.pathname]);
  useEffect(() => {
    if (owner === guest || owner.startsWith("restore:")) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>,
      delay = 1000,
      busy = false;
    const sync = async () => {
      if (stopped || busy || !navigator.onLine) return;
      busy = true;
      clearTimeout(timer);
      try {
        await synchronize(journal, owner);
        if (!stopped) {
          await client.invalidateQueries({ queryKey: ["entries", owner] });
          delay = 1000;
          timer = setTimeout(sync, 15000);
        }
      } catch (error) {
        if (!stopped) {
          const message = error instanceof Error ? error.message : "network";
          notice(
            message === "conflict"
              ? t.conflict
              : message === "session"
                ? t.session
                : t.pending,
          );
          if (!["conflict", "session"].includes(message)) {
            timer = setTimeout(sync, delay);
            delay = Math.min(delay * 2, 60000);
          }
        }
      } finally {
        busy = false;
      }
    };
    void sync();
    window.addEventListener("online", sync);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("online", sync);
    };
  }, [client, owner, retry, t]);
  return (
    <AppContext.Provider
      value={{
        t,
        locale,
        owner,
        calendar,
        notice,
        setOwner: (id) => {
          sessionStorage.setItem("medora-v2-owner", id);
          setOwner(id);
        },
        setCalendar: (c) => {
          localStorage.setItem("medora-v2-calendar", c);
          setCalendar(c);
        },
      }}
    >
      <header>
        <div className="brand">
          <img src="./art/logo.svg" alt="" width="38" height="38" />
          {t.brand}
        </div>
        <button
          className="secondary"
          lang={locale === "fa" ? "en" : "fa"}
          onClick={() => {
            const next = locale === "fa" ? "en" : "fa";
            localStorage.setItem("medora-language", next);
            language(next);
            if (!localStorage.getItem("medora-v2-calendar"))
              setCalendar(next === "fa" ? "persian" : "gregory");
          }}
        >
          {t.language}
        </button>
      </header>
      <main ref={main} tabIndex={-1} key={owner}>
        <Suspense fallback={<p role="status">{t.loading}</p>}>
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/water" element={<Water />} />
            <Route path="/archive" element={<Files />} />
            <Route path="/plans/:kind" element={<Plans />} />
            <Route path="/family" element={<Family />} />
            <Route path="/records" element={<Records />} />
            <Route path="/account" element={<Account />} />
            <Route path="*" element={<Today />} />
          </Routes>
        </Suspense>
        {owner.startsWith("restore:") && (
          <NavLink to="/records" className="archive-link">
            {t.restored}
          </NavLink>
        )}
        {owner !== guest && !owner.startsWith("restore:") && (
          <button
            className="secondary"
            onClick={() => requestSync((n) => n + 1)}
          >
            {t.sync}
          </button>
        )}
        <p role="status">{status}</p>
      </main>
      <nav>
        {[
          [t.today, "/", CalendarDays],
          [t.water, "/water", Droplets],
          [t.archive, "/archive", Archive],
          [t.account, "/account", UserRound],
        ].map((item) => {
          const [label, path, Icon] = item as [string, string, typeof Archive];
          return (
            <NavLink key={path} to={path} end>
              <Icon aria-hidden="true" size={20} />
              {label}
            </NavLink>
          );
        })}
      </nav>
    </AppContext.Provider>
  );
}
