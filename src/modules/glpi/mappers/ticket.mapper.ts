import {
  GLPI_TICKET_STATUS,
  GLPI_TICKET_TYPE,
  GLPI_TICKET_URGENCY,
} from "../glpi.constants";
import type { GlpiTicketRaw } from "../glpi.types";
import { htmlToPlainText } from "../../../common/utils/html-text.utils";

export type DomainTicketType = "incident" | "request";
export type DomainTicketStatus =
  | "new"
  | "assigned"
  | "planned"
  | "waiting"
  | "solved"
  | "closed";
export type DomainTicketUrgency =
  | "very_low"
  | "low"
  | "medium"
  | "high"
  | "very_high";

export interface DomainTicket {
  id: number;
  type: DomainTicketType;
  status: DomainTicketStatus;
  urgency: DomainTicketUrgency;
  subject: string;
  description: string | null;
  categoryId: number | null;
  locationId: number | null;
  requesterId: number | null;
  technicianId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  dueDate: string | null;
  solvedAt: string | null;
  closedAt: string | null;
  isDeleted: boolean;
}

export function isActiveTicket(ticket: DomainTicket): boolean {
  return !ticket.isDeleted;
}

/** GLPI puede devolver flags booleanos como 0/1, "0"/"1" o true/false. */
export function parseGlpiDeletedFlag(value: unknown): boolean {
  if (value === true) return true;
  return Number(value) === 1;
}

export class TicketMapper {
  static toDomain(raw: GlpiTicketRaw, opts: { requesterId?: number | null; technicianId?: number | null } = {}): DomainTicket {
    return {
      id: TicketMapper.toId(raw.id),
      type: TicketMapper.mapType(raw.type),
      status: TicketMapper.mapStatus(raw.status),
      urgency: TicketMapper.mapUrgency(raw.urgency),
      subject: raw.name,
      description: htmlToPlainText(raw.content ?? null),
      categoryId: TicketMapper.toOptionalId(raw.itilcategories_id),
      locationId: TicketMapper.toOptionalId(raw.locations_id),
      requesterId: opts.requesterId ?? null,
      technicianId: opts.technicianId ?? null,
      createdAt: raw.date ?? null,
      updatedAt: raw.date_mod ?? null,
      dueDate: raw.time_to_resolve ?? null,
      solvedAt: raw.solvedate ?? null,
      closedAt: raw.closedate ?? null,
      isDeleted: parseGlpiDeletedFlag(raw.is_deleted),
    };
  }

  static mapType(value: number): DomainTicketType {
    if (value === GLPI_TICKET_TYPE.INCIDENT) return "incident";
    return "request";
  }

  static mapTypeToGlpi(value: DomainTicketType): number {
    return value === "incident" ? GLPI_TICKET_TYPE.INCIDENT : GLPI_TICKET_TYPE.REQUEST;
  }

  static mapStatus(value: number): DomainTicketStatus {
    switch (value) {
      case GLPI_TICKET_STATUS.NEW:
        return "new";
      case GLPI_TICKET_STATUS.ASSIGNED:
        return "assigned";
      case GLPI_TICKET_STATUS.PLANNED:
        return "planned";
      case GLPI_TICKET_STATUS.WAITING:
        return "waiting";
      case GLPI_TICKET_STATUS.SOLVED:
        return "solved";
      case GLPI_TICKET_STATUS.CLOSED:
        return "closed";
      default:
        return "new";
    }
  }

  static mapStatusToGlpi(value: DomainTicketStatus): number {
    switch (value) {
      case "new":
        return GLPI_TICKET_STATUS.NEW;
      case "assigned":
        return GLPI_TICKET_STATUS.ASSIGNED;
      case "planned":
        return GLPI_TICKET_STATUS.PLANNED;
      case "waiting":
        return GLPI_TICKET_STATUS.WAITING;
      case "solved":
        return GLPI_TICKET_STATUS.SOLVED;
      case "closed":
        return GLPI_TICKET_STATUS.CLOSED;
    }
  }

  static mapUrgency(value: number): DomainTicketUrgency {
    switch (value) {
      case GLPI_TICKET_URGENCY.VERY_LOW:
        return "very_low";
      case GLPI_TICKET_URGENCY.LOW:
        return "low";
      case GLPI_TICKET_URGENCY.MEDIUM:
        return "medium";
      case GLPI_TICKET_URGENCY.HIGH:
        return "high";
      case GLPI_TICKET_URGENCY.VERY_HIGH:
        return "very_high";
      default:
        return "medium";
    }
  }

  static mapUrgencyToGlpi(value: DomainTicketUrgency): number {
    switch (value) {
      case "very_low":
        return GLPI_TICKET_URGENCY.VERY_LOW;
      case "low":
        return GLPI_TICKET_URGENCY.LOW;
      case "medium":
        return GLPI_TICKET_URGENCY.MEDIUM;
      case "high":
        return GLPI_TICKET_URGENCY.HIGH;
      case "very_high":
        return GLPI_TICKET_URGENCY.VERY_HIGH;
    }
  }

  /** GLPI REST suele devolver IDs numéricos como string en JSON. */
  private static toOptionalId(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private static toId(value: unknown): number {
    return TicketMapper.toOptionalId(value) ?? 0;
  }
}
