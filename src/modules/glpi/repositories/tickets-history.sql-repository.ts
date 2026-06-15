/**
 * @file tickets-history.sql-repository.ts
 * @description Consulta paginada del historial de tickets desde la vista MySQL `v_asistia_ticket_history`.
 */
import { Injectable } from "@nestjs/common";
import type { QueryValues } from "mysql2";
import type { RowDataPacket } from "mysql2/promise";
import { htmlToPlainText } from "../../../common/utils/html-text.utils";
import type { ListTicketsFilter } from "./tickets.glpi-repository";
import type { HistorySortBy } from "../../tickets/dto/list-tickets-query.dto";
import { MysqlService } from "../../mysql/mysql.service";
import type { TicketResponseDto } from "../../tickets/dto/ticket.response.dto";
import type { TicketStatus } from "../../tickets/domain/ticket-status";
import type { TicketType } from "../../tickets/domain/ticket-type";
import { TicketMapper } from "../mappers/ticket.mapper";
import type {
  DomainTicket,
  DomainTicketStatus,
  DomainTicketType,
  DomainTicketUrgency,
} from "../mappers/ticket.mapper";

interface HistoryRow extends RowDataPacket {
  ticket_id: number;
  entities_id: number | null;
  is_deleted: number | null;
  subject: string | null;
  description_raw: string | null;
  type: string | null;
  type_glpi: number | null;
  status: string | null;
  status_glpi: number | null;
  urgency: string | null;
  urgency_glpi: number | null;
  category_id: number | null;
  category_name: string | null;
  category_name_short: string | null;
  location_id: number | null;
  location_name: string | null;
  location_name_short: string | null;
  requester_id: number | null;
  requester_name: string | null;
  requester_email: string | null;
  technician_id: number | null;
  technician_name: string | null;
  technician_email: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface CountRow extends RowDataPacket {
  total: number;
}

export interface HistoryPageResponse {
  items: TicketResponseDto[];
  total: number;
}

const TICKET_TYPES = new Set<DomainTicketType>(["incident", "request"]);
const TICKET_STATUSES = new Set<DomainTicketStatus>([
  "new",
  "assigned",
  "planned",
  "waiting",
  "solved",
  "closed",
]);
const TICKET_URGENCIES = new Set<DomainTicketUrgency>([
  "very_low",
  "low",
  "medium",
  "high",
  "very_high",
]);

const HISTORY_SELECT_COLUMNS = `
  ticket_id,
  entities_id,
  is_deleted,
  subject,
  description_raw,
  type,
  type_glpi,
  status,
  status_glpi,
  urgency,
  urgency_glpi,
  category_id,
  category_name,
  category_name_short,
  location_id,
  location_name,
  location_name_short,
  requester_id,
  requester_name,
  requester_email,
  technician_id,
  technician_name,
  technician_email,
  created_at,
  updated_at
`;

const HISTORY_STATUS_SORT_ORDER = `
  CASE status_glpi
    WHEN 6 THEN 1
    WHEN 2 THEN 2
    WHEN 3 THEN 3
    WHEN 4 THEN 4
    WHEN 1 THEN 5
    WHEN 5 THEN 6
    ELSE 99
  END`;

const HISTORY_SORT_EXPRESSIONS: Record<HistorySortBy, string> = {
  id: "ticket_id",
  createdAt: "created_at",
  requester: "requester_name",
  location: "COALESCE(location_name, location_name_short, '')",
  type: "type_glpi",
  subject: "subject",
  status: HISTORY_STATUS_SORT_ORDER,
  technician: "COALESCE(technician_name, '')",
};

/**
 * Repositorio SQL del historial de tickets materializado en vista MySQL.
 */
@Injectable()
export class TicketsHistorySqlRepository {
  /** Inyecta el servicio MySQL compartido. */
  constructor(private readonly mysql: MysqlService) {}

  /**
   * Lista página de historial como DTOs de respuesta API.
   * @param filter - Filtros de listado (actores, sede, fechas, búsqueda).
   * @returns Items paginados y total de coincidencias.
   * @throws Error de base de datos si la consulta falla.
   */
  async listHistoryPageAsResponse(filter: ListTicketsFilter): Promise<HistoryPageResponse> {
    const { whereSql, params } = this.buildWhereClause(filter);
    const orderSql = this.buildOrderClause(filter);

    const rows = await this.mysql.query<HistoryRow>(
      `SELECT ${HISTORY_SELECT_COLUMNS}
       FROM v_asistia_ticket_history
       WHERE ${whereSql}
       ${orderSql}
       LIMIT :limit OFFSET :offset`,
      params as QueryValues,
    );

    const countRows = await this.mysql.query<CountRow>(
      `SELECT COUNT(*) AS total
       FROM v_asistia_ticket_history
       WHERE ${whereSql}`,
      params as QueryValues,
    );

    return {
      items: rows.map((row) => this.toTicketResponseDto(row)),
      total: Number(countRows[0]?.total ?? 0),
    };
  }

  /**
   * Obtiene un ticket del historial por ID como dominio.
   * @param ticketId - ID del ticket GLPI.
   * @returns Ticket de dominio o `null` si no existe o está borrado.
   * @throws Error de base de datos si la consulta falla.
   */
  async findById(ticketId: number): Promise<DomainTicket | null> {
    const rows = await this.mysql.query<HistoryRow>(
      `SELECT ${HISTORY_SELECT_COLUMNS}
       FROM v_asistia_ticket_history
       WHERE ticket_id = :ticketId AND is_deleted = 0
       LIMIT 1`,
      { ticketId } as QueryValues,
    );
    const row = rows[0];
    return row ? this.toDomainTicket(row) : null;
  }

  /**
   * Construye cláusula WHERE y parámetros nombrados desde filtros de listado.
   * @param filter - Filtros de historial.
   * @returns SQL de condiciones y mapa de parámetros.
   * @throws No lanza excepciones.
   */
  private buildWhereClause(filter: ListTicketsFilter): {
    whereSql: string;
    params: Record<string, unknown>;
  } {
    const whereClauses: string[] = ["is_deleted = 0"];
    const params: Record<string, unknown> = {
      limit: filter.limit,
      offset: (filter.page - 1) * filter.limit,
    };

    if (filter.involvingUserId !== undefined) {
      whereClauses.push(
        "(technician_id = :involvingUserId OR requester_id = :involvingUserId)",
      );
      params.involvingUserId = filter.involvingUserId;
    } else {
      if (filter.requesterId !== undefined) {
        whereClauses.push("requester_id = :requesterId");
        params.requesterId = filter.requesterId;
      }
      if (filter.technicianId !== undefined) {
        whereClauses.push("technician_id = :technicianId");
        params.technicianId = filter.technicianId;
      }
    }
    if (filter.type !== undefined) {
      whereClauses.push("type_glpi = :typeGlpi");
      params.typeGlpi = filter.type;
    }
    const normalizedStatuses = this.normalizeStatusFilter(filter.status);
    if (normalizedStatuses.length > 0) {
      const placeholders = normalizedStatuses.map((_, index) => `:status${index}`).join(", ");
      whereClauses.push(`status_glpi IN (${placeholders})`);
      normalizedStatuses.forEach((status, index) => {
        params[`status${index}`] = status;
      });
    }
    if (filter.locationId !== undefined) {
      whereClauses.push(
        `(location_id = :locationId OR location_id IN (
          SELECT l.id
          FROM glpi_locations l
          WHERE l.sons_cache LIKE CONCAT('%>', :locationId, '>%')
        ))`,
      );
      params.locationId = filter.locationId;
    }
    if (filter.createdFrom) {
      whereClauses.push("created_at >= :createdFrom");
      params.createdFrom = filter.createdFrom;
    }
    if (filter.createdTo) {
      whereClauses.push("created_at <= :createdTo");
      params.createdTo = filter.createdTo;
    }
    const search = filter.search?.trim();
    if (search) {
      whereClauses.push(
        "((:searchId IS NOT NULL AND ticket_id = :searchId) OR subject LIKE :searchLike OR description_raw LIKE :searchLike)",
      );
      params.searchId = Number.isFinite(Number(search)) ? Number(search) : null;
      params.searchLike = `%${search}%`;
    }

    return { whereSql: whereClauses.join(" AND "), params };
  }

  /**
   * Construye cláusula ORDER BY con whitelist de columnas.
   * @param filter - Filtros de historial incluyendo sort opcional.
   * @returns Fragmento SQL `ORDER BY ...`.
   * @throws No lanza excepciones.
   */
  private buildOrderClause(filter: ListTicketsFilter): string {
    if (!filter.sortBy) {
      return "ORDER BY updated_at DESC";
    }

    const expression = HISTORY_SORT_EXPRESSIONS[filter.sortBy];
    if (!expression) {
      return "ORDER BY updated_at DESC";
    }

    const direction = filter.sortOrder === "desc" ? "DESC" : "ASC";
    const nullPrefix =
      filter.sortBy === "location"
        ? "(location_name IS NULL AND (location_name_short IS NULL OR location_name_short = '')), "
        : filter.sortBy === "technician"
          ? "(technician_name IS NULL OR technician_name = ''), "
          : "";

    return `ORDER BY ${nullPrefix}${expression} ${direction}, updated_at DESC`;
  }

  /**
   * Normaliza lista de estados GLPI eliminando duplicados e inválidos.
   * @param statuses - Estados crudos del filtro.
   * @returns Enteros positivos únicos.
   * @throws No lanza excepciones.
   */
  private normalizeStatusFilter(statuses?: number[]): number[] {
    if (!statuses?.length) return [];
    return [...new Set(statuses.filter((value) => Number.isInteger(value) && value > 0))];
  }

  /**
   * Mapea fila de historial a `DomainTicket`.
   * @param row - Fila de la vista SQL.
   * @returns Ticket de dominio.
   * @throws No lanza excepciones.
   */
  private toDomainTicket(row: HistoryRow): DomainTicket {
    return {
      id: Number(row.ticket_id),
      type: this.parseType(row),
      status: this.parseStatus(row),
      urgency: this.parseUrgency(row),
      subject: row.subject ?? "",
      description: htmlToPlainText(row.description_raw),
      categoryId: this.toOptionalId(row.category_id),
      locationId: this.toOptionalId(row.location_id),
      requesterId: this.toOptionalId(row.requester_id),
      technicianId: this.toOptionalId(row.technician_id),
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
      dueDate: null,
      solvedAt: null,
      closedAt: null,
      isDeleted: false,
    };
  }

  /**
   * Mapea fila de historial a DTO de respuesta API con actores anidados.
   * @param row - Fila de la vista SQL.
   * @returns DTO listo para el cliente.
   * @throws No lanza excepciones.
   */
  private toTicketResponseDto(row: HistoryRow): TicketResponseDto {
    const categoryId = this.toOptionalId(row.category_id);
    const locationId = this.toOptionalId(row.location_id);
    const requesterId = this.toOptionalId(row.requester_id);
    const technicianId = this.toOptionalId(row.technician_id);
    const categoryName =
      row.category_name?.trim() || row.category_name_short?.trim() || null;
    const locationName =
      row.location_name?.trim() || row.location_name_short?.trim() || null;

    return {
      id: Number(row.ticket_id),
      type: this.parseType(row),
      status: this.parseStatus(row),
      urgency: this.parseUrgency(row),
      subject: row.subject ?? "",
      description: htmlToPlainText(row.description_raw),
      category:
        categoryId && categoryName
          ? { id: categoryId, name: categoryName }
          : null,
      location: locationId
        ? { id: locationId, name: locationName }
        : null,
      requester: {
        id: requesterId,
        name: row.requester_name?.trim() || null,
        email: row.requester_email?.trim() || null,
      },
      technician: technicianId
        ? {
            id: technicianId,
            name: row.technician_name?.trim() || null,
            email: row.technician_email?.trim() || null,
          }
        : null,
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
    };
  }

  /**
   * Parsea tipo de ticket desde columnas de vista o código GLPI.
   * @param row - Fila de historial.
   * @returns Tipo de dominio API.
   * @throws No lanza excepciones.
   */
  private parseType(row: HistoryRow): TicketType {
    if (row.type && TICKET_TYPES.has(row.type as DomainTicketType)) {
      return row.type as TicketType;
    }
    return TicketMapper.mapType(Number(row.type_glpi ?? 1));
  }

  /**
   * Parsea estado de ticket desde columnas de vista o código GLPI.
   * @param row - Fila de historial.
   * @returns Estado de dominio API.
   * @throws No lanza excepciones.
   */
  private parseStatus(row: HistoryRow): TicketStatus {
    if (row.status && TICKET_STATUSES.has(row.status as DomainTicketStatus)) {
      return row.status as TicketStatus;
    }
    return TicketMapper.mapStatus(Number(row.status_glpi ?? 1));
  }

  /**
   * Parsea urgencia desde columnas de vista o código GLPI.
   * @param row - Fila de historial.
   * @returns Urgencia de dominio.
   * @throws No lanza excepciones.
   */
  private parseUrgency(row: HistoryRow): DomainTicketUrgency {
    if (row.urgency && TICKET_URGENCIES.has(row.urgency as DomainTicketUrgency)) {
      return row.urgency as DomainTicketUrgency;
    }
    return TicketMapper.mapUrgency(Number(row.urgency_glpi ?? 3));
  }

  /**
   * Convierte valor SQL en ID positivo opcional.
   * @param value - Valor de columna.
   * @returns ID o `null`.
   * @throws No lanza excepciones.
   */
  private toOptionalId(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
}
