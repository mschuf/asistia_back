/**
 * @file urgency.policy.ts
 * @description Política de urgencia por defecto según el tipo de ticket.
 */
import type { DomainTicketUrgency } from "../../glpi/mappers/ticket.mapper";
import type { TicketType } from "./ticket-type";

/**
 * Resuelve la urgencia inicial de un ticket según su tipo.
 */
export class UrgencyPolicy {
  /**
   * Devuelve la urgencia por defecto para el tipo indicado.
   * @param type - Tipo de ticket (`incident` o `request`).
   * @returns Urgencia de dominio (`high` para incidentes, `low` para solicitudes).
   * @throws Ninguno.
   */
  static defaultFor(type: TicketType): DomainTicketUrgency {
    if (type === "incident") return "high";
    return "low";
  }
}
