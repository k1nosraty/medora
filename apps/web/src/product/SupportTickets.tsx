import { t } from "../../../../web/public/medication/shared/i18n/locale.js";
import { renderTickets as initialPaint } from "../../../../web/public/medication/features/support-tickets.js";
import { clearFeature, paintFeature } from "./lazy-renderer";

interface Ticket {
  id: string;
  status: "open" | "closed";
  message: string;
  reply: string;
}
export function renderTickets(host: HTMLElement, tickets: Ticket[]) {
  if (!tickets.length) return clearFeature(host);
  const rows = tickets.map((ticket) => (
    <article className="support-ticket" key={ticket.id}>
      <strong>
        {t(ticket.status === "closed" ? "بسته‌شده" : "در حال پیگیری")}
      </strong>
      <p>{ticket.message}</p>
      {ticket.reply && <p>{ticket.reply}</p>}
    </article>
  ));
  paintFeature(host, rows, () => initialPaint(host, tickets));
}
