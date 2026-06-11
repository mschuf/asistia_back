/**
 * @file ticket-created-logs.sql-repository.ts
 * @description Consultas SQL paginadas sobre app_logs para el reporte ticket.created.
 */
import { Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../../common/dto/pagination.dto";
import { PostgresService } from "../../postgres/postgres.service";
import type {
  TicketCreatedLogSortBy,
  TicketCreatedLogSortOrder,
} from "../dto/list-ticket-created-logs-query.dto";
import type {
  TicketCreatedLogBaseFilters,
  TicketCreatedLogListFilters,
  TicketCreatedLogRow,
} from "../reports.types";

const TICKET_CREATED_LOG_SELECT = `
  l.created_at,
  c.name AS company,
  m.subject,
  m.from_address,
  l.details -> 'request' ->> 'email' AS requester_email,
  l.details -> 'request' ->> 'type' AS type,
  l.details ->> 'category_name' AS category,
  l.details ->> 'mail_sent' AS mail_sent,
  l.details ->> 'http_status' AS http_status
`;

const TICKET_CREATED_LOG_FROM = `
  FROM public.app_logs l
  JOIN public.companies c ON c.id = l.company_id
  LEFT JOIN public.mail_messages m ON m.id = l.mail_message_id
`;

/** Máximo de filas exportables en un solo archivo. */
export const MAX_TICKET_CREATED_LOG_EXPORT_ROWS = 50_000;

const TICKET_CREATED_LOG_SORT_EXPRESSIONS: Record<TicketCreatedLogSortBy, string> = {
  createdAt: "l.created_at",
  company: "c.name",
  subject: "m.subject",
  fromAddress: "m.from_address",
  requesterEmail: "l.details -> 'request' ->> 'email'",
  type: "l.details -> 'request' ->> 'type'",
  category: "l.details ->> 'category_name'",
  mailSent: "l.details ->> 'mail_sent'",
  httpStatus: "l.details ->> 'http_status'",
};

/** Repositorio Postgres del reporte de tickets creados por correo. */
@Injectable()
export class TicketCreatedLogsSqlRepository {
  /**
   * Inyecta el servicio de Postgres.
   * @param postgres - Cliente de consultas SQL.
   */
  constructor(private readonly postgres: PostgresService) {}

  /**
   * Lista logs paginados del evento ticket.created.
   * @param filters - Paginación, fechas, categoría, empresa y ordenación.
   * @returns Filas paginadas y total de coincidencias.
   */
  async findAll(
    filters: TicketCreatedLogListFilters,
  ): Promise<PaginatedResult<TicketCreatedLogRow>> {
    const { whereSql, params } = this.buildWhereClause(filters);
    const orderSql = this.buildOrderClause(filters);

    const countRows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total ${TICKET_CREATED_LOG_FROM} ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const offset = (filters.page - 1) * filters.limit;

    const listParams = [...params, filters.limit, offset];
    const limitParam = listParams.length - 1;
    const offsetParam = listParams.length;

    const items = await this.postgres.query<TicketCreatedLogRow>(
      `SELECT ${TICKET_CREATED_LOG_SELECT}
       ${TICKET_CREATED_LOG_FROM}
       ${whereSql}
       ${orderSql}
       LIMIT $${limitParam}
       OFFSET $${offsetParam}`,
      listParams,
    );

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  /**
   * Lista todos los logs exportables del evento ticket.created.
   * @param filters - Filtros del reporte sin paginación.
   * @returns Filas exportadas y total de coincidencias.
   */
  async findAllForExport(
    filters: TicketCreatedLogBaseFilters,
  ): Promise<{ items: TicketCreatedLogRow[]; total: number }> {
    const { whereSql, params } = this.buildWhereClause(filters);
    const orderSql = this.buildOrderClause(filters);

    const countRows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total ${TICKET_CREATED_LOG_FROM} ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const listParams = [...params, MAX_TICKET_CREATED_LOG_EXPORT_ROWS];
    const limitParam = listParams.length;

    const items = await this.postgres.query<TicketCreatedLogRow>(
      `SELECT ${TICKET_CREATED_LOG_SELECT}
       ${TICKET_CREATED_LOG_FROM}
       ${whereSql}
       ${orderSql}
       LIMIT $${limitParam}`,
      listParams,
    );

    return { items, total };
  }

  /**
   * Construye cláusula WHERE y parámetros desde filtros de listado.
   * @param filters - Filtros del reporte.
   * @returns SQL de condiciones y valores parametrizados.
   */
  private buildWhereClause(filters: TicketCreatedLogBaseFilters): {
    whereSql: string;
    params: unknown[];
  } {
    const whereClauses: string[] = ["l.event = 'ticket.created'"];
    const params: unknown[] = [];

    if (filters.createdFrom) {
      params.push(filters.createdFrom);
      whereClauses.push(`l.created_at >= $${params.length}::timestamptz`);
    }
    if (filters.createdTo) {
      params.push(filters.createdTo);
      whereClauses.push(`l.created_at <= $${params.length}::timestamptz`);
    }
    if (filters.categoryName?.trim()) {
      params.push(filters.categoryName.trim());
      whereClauses.push(`l.details ->> 'category_name' = $${params.length}`);
    }
    if (filters.companyId !== undefined) {
      params.push(filters.companyId);
      whereClauses.push(`l.company_id = $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    return { whereSql, params };
  }

  /**
   * Construye cláusula ORDER BY con whitelist de columnas.
   * @param filters - Filtros del reporte incluyendo sort opcional.
   * @returns Fragmento SQL `ORDER BY ...`.
   */
  private buildOrderClause(filters: TicketCreatedLogBaseFilters): string {
    if (!filters.sortBy) {
      return "ORDER BY l.created_at DESC";
    }

    const expression = TICKET_CREATED_LOG_SORT_EXPRESSIONS[filters.sortBy];
    if (!expression) {
      return "ORDER BY l.created_at DESC";
    }

    const direction: TicketCreatedLogSortOrder = filters.sortOrder === "asc" ? "asc" : "desc";
    return `ORDER BY ${expression} ${direction.toUpperCase()}, l.created_at DESC`;
  }
}
