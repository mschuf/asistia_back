/**
 * @file ticket.mapper.ts
 * @description Mapea tickets de GLPI al modelo de dominio y traduce enums bidireccionales.
 */
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

/**
 * Indica si el ticket de dominio está activo (no eliminado en GLPI).
 * @param ticket - Ticket de dominio.
 * @returns `true` si no está marcado como eliminado.
 * @throws No lanza excepciones.
 */
export function isActiveTicket(ticket: DomainTicket): boolean {
  return !ticket.isDeleted;
}

/**
 * Interpreta el flag `is_deleted` de GLPI en booleano.
 * GLPI puede devolver flags booleanos como 0/1, "0"/"1" o true/false.
 * @param value - Valor crudo del flag.
 * @returns `true` si el ticket está eliminado.
 * @throws No lanza excepciones.
 */
export function parseGlpiDeletedFlag(value: unknown): boolean {
  if (value === true) return true;
  return Number(value) === 1;
}

/**
 * Convierte tickets GLPI a objetos de dominio y traduce enums.
 */
export class TicketMapper {
  /**
   * Transforma un ticket GLPI en su representación de dominio.
   * @param raw - Registro crudo devuelto por la API de GLPI.
   * @param opts - IDs opcionales de solicitante y técnico ya resueltos.
   * @returns Ticket normalizado con descripción en texto plano.
   * @throws No lanza excepciones.
   */
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

  /**
   * Mapea el tipo numérico GLPI al dominio.
   * @param value - Código de tipo GLPI.
   * @returns `"incident"` o `"request"`.
   * @throws No lanza excepciones.
   */
  static mapType(value: number): DomainTicketType {
    if (value === GLPI_TICKET_TYPE.INCIDENT) return "incident";
    return "request";
  }

  /**
   * Mapea el tipo de dominio al código numérico GLPI.
   * @param value - Tipo de dominio.
   * @returns Código `GLPI_TICKET_TYPE`.
   * @throws No lanza excepciones.
   */
  static mapTypeToGlpi(value: DomainTicketType): number {
    return value === "incident" ? GLPI_TICKET_TYPE.INCIDENT : GLPI_TICKET_TYPE.REQUEST;
  }

  /**
   * Mapea el estado numérico GLPI al dominio.
   * @param value - Código de estado GLPI.
   * @returns Estado de dominio; `"new"` por defecto si es desconocido.
   * @throws No lanza excepciones.
   */
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

  /**
   * Mapea el estado de dominio al código numérico GLPI.
   * @param value - Estado de dominio.
   * @returns Código `GLPI_TICKET_STATUS`.
   * @throws No lanza excepciones.
   */
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

  /**
   * Mapea la urgencia numérica GLPI al dominio.
   * @param value - Código de urgencia GLPI.
   * @returns Urgencia de dominio; `"medium"` por defecto.
   * @throws No lanza excepciones.
   */
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

  /**
   * Mapea la urgencia de dominio al código numérico GLPI.
   * @param value - Urgencia de dominio.
   * @returns Código `GLPI_TICKET_URGENCY`.
   * @throws No lanza excepciones.
   */
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

  /**
   * Convierte un valor desconocido en ID opcional positivo.
   * GLPI REST suele devolver IDs numéricos como string en JSON.
   * @param value - Valor crudo del ID.
   * @returns ID positivo o `null`.
   * @throws No lanza excepciones.
   */
  private static toOptionalId(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  /**
   * Convierte un valor desconocido en ID numérico (0 si no es válido).
   * @param value - Valor crudo del ID.
   * @returns ID positivo o `0`.
   * @throws No lanza excepciones.
   */
  private static toId(value: unknown): number {
    return TicketMapper.toOptionalId(value) ?? 0;
  }
}
