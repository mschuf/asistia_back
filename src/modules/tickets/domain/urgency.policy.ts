import type { DomainTicketUrgency } from "../../glpi/mappers/ticket.mapper";
import type { TicketType } from "./ticket-type";

export class UrgencyPolicy {
  static defaultFor(type: TicketType): DomainTicketUrgency {
    if (type === "incident") return "high";
    return "low";
  }
}
