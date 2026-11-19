import { element } from "../shared/ui/dom.js";
import { t } from "../shared/i18n/locale.js";

export function renderTickets(host, tickets) {
  const rows=tickets.map(ticket=>{
    const row=element("article","","support-ticket");
    row.append(element("strong",t(ticket.status==="closed" ? "بسته‌شده" : "در حال پیگیری")),
      element("p",ticket.message),...(ticket.reply?[element("p",ticket.reply)]:[]));
    return row;
  });
  host.replaceChildren(...rows);
}
