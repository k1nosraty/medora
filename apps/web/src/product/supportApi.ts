import { accountTransport } from "./accountTransport";

export interface Ticket {
  id: string;
  status: "open" | "closed";
  message: string;
  reply?: string | null;
}

function isTicket(value: unknown): value is Ticket {
  return typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "string" &&
    "message" in value && typeof value.message === "string" &&
    "status" in value && (value.status === "open" || value.status === "closed") &&
    (!("reply" in value) || value.reply === null || typeof value.reply === "string");
}

export async function readTickets(
  signal: AbortSignal,
): Promise<Ticket[] | null> {
  const response = await accountTransport("/api/support", {
    cache: "no-store",
    signal,
  });
  if (response.status === 401) return null;
  if (!response.ok) throw Error("Support unavailable");
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("tickets" in body) ||
      !Array.isArray(body.tickets) || !body.tickets.every(isTicket))
    throw Error("Invalid support response");
  return body.tickets;
}

export async function sendTicket(message: string, includeDiagnostics: boolean) {
  let diagnostics;
  if (includeDiagnostics) {
    let version = "";
    try {
      const response = await fetch("/medication/sw.js", {
        cache: "no-store",
        signal: AbortSignal.timeout(1500),
      });
      version =
        (await response.text()).match(
          /medora-medication-shell-([a-f0-9]+)/,
        )?.[1] ?? "";
    } catch {
      // Diagnostics are optional and must not block the report.
    }
    const agent = navigator.userAgent;
    diagnostics = {
      version,
      platform: /iPhone|iPad/.test(agent)
        ? "iOS"
        : /Android/.test(agent)
          ? "Android"
          : "Other",
      permission: globalThis.Notification?.permission ?? "unavailable",
    };
  }
  return accountTransport("/api/support", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, diagnostics }),
  });
}
