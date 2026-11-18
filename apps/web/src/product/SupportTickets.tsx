import { t } from "../../../../web/public/medication/shared/i18n/locale.js";
import type { Ticket } from "./supportApi";

export function SupportTickets({ tickets }: { tickets: Ticket[] }) {
  return tickets.map((ticket) => (
    <article className="support-ticket" key={ticket.id}>
      <strong>
        {t(ticket.status === "closed" ? "بسته‌شده" : "در حال پیگیری")}
      </strong>
      <p dir="auto">{ticket.message}</p>
      {ticket.reply && <p dir="auto">{ticket.reply}</p>}
    </article>
  ));
}
