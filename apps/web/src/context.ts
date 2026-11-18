import { createContext, useContext } from "react";
import type { Copy, Locale } from "./i18n";
export interface Context {
  t: Copy;
  locale: Locale;
  calendar: string;
  setCalendar: (s: string) => void;
  owner: string;
  setOwner: (s: string) => void;
  notice: (s: string) => void;
}
export const AppContext = createContext<Context | null>(null);
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("Missing app context");
  return ctx;
}
