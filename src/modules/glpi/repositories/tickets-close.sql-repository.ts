/**
 * @file tickets-close.sql-repository.ts
 * @description Consulta y cierre masivo de tickets 100% vía SQL directo sobre `glpi_tickets`.
 * No usa la API REST de GLPI ni `TicketsService.updateStatus` (evita fallback y correos).
 */
import { Injectable } from "@nestjs/common";
import type { QueryValues } from "mysql2";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { htmlToPlainText } from "../../../common/utils/html-text.utils";
import { MysqlService } from "../../mysql/mysql.service";
import { appendResolutionNote } from "../../tickets/domain/ticket-resolution.helpers";
import type {
  CloseCandidatesSortBy,
  CloseCandidatesSortOrder,
} from "../../tickets/dto/close-candidates-query.dto";
import type { CloseBulkResponseDto } from "../../tickets/dto/close-bulk.dto";
import type { TicketResponseDto } from "../../tickets/dto/ticket.response.dto";
import { TicketMapper } from "../mappers/ticket.mapper";

/** Estados GLPI abiertos elegibles para cierre masivo (nunca incluye 6 = cerrado). */
const OPEN_STATUSES = [1, 2, 3, 4];
/** Estado GLPI resuelto elegible para cierre masivo. */
const SOLVED_STATUS = 5;
/** Estados elegibles para (re)validar antes de cerrar un ticket. */
const ELIGIBLE_STATUSES = [1, 2, 3, 4, 5];

/** Nota automática agregada al contenido de cada ticket cerrado masivamente. */
const BULK_CLOSE_NOTE = "Cierre masivo por super-admin";

/** Filtros de listado de candidatos a cierre masivo. */
export interface CloseCandidatesFilter {
  page: number;
  limit: number;
  includeOpen: boolean;
  includeSolved: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sortBy?: CloseCandidatesSortBy;
  sortOrder?: CloseCandidatesSortOrder;
}

interface CloseCandidateRow extends RowDataPacket {
  ticket_id: number;
  is_deleted: number | null;
  subject: string | null;
  description_raw: string | null;
  type_glpi: number | null;
  status_glpi: number | null;
  urgency_glpi: number | null;
  category_id: number | null;
  category_name: string | null;
  location_id: number | null;
  location_name: string | null;
  created_at: string | null;
  requester_id: number | null;
  requester_name: string | null;
  requester_email: string | null;
}

interface CountRow extends RowDataPacket {
  total: number;
}

interface LockRow extends RowDataPacket {
  id: number;
  status: number | null;
  content: string | null;
}

const CLOSE_CANDIDATES_SOURCE_SQL = `
  (
    SELECT
      t.id AS ticket_id,
      t.is_deleted,
      t.name AS subject,
      t.content AS description_raw,
      t.type AS type_glpi,
      t.status AS status_glpi,
      t.urgency AS urgency_glpi,
      t.itilcategories_id AS category_id,
      cat.completename AS category_name,
      t.locations_id AS location_id,
      loc.completename AS location_name,
      t.date AS created_at,
      req.users_id AS requester_id,
      CASE
        WHEN NULLIF(TRIM(CONCAT(
          COALESCE(NULLIF(TRIM(ru.firstname), ''), ''),
          CASE
            WHEN NULLIF(TRIM(ru.firstname), '') IS NOT NULL
             AND NULLIF(TRIM(ru.realname), '') IS NOT NULL
            THEN ' '
            ELSE ''
          END,
          COALESCE(NULLIF(TRIM(ru.realname), ''), '')
        )), '') IS NOT NULL
        THEN TRIM(CONCAT(
          COALESCE(NULLIF(TRIM(ru.firstname), ''), ''),
          CASE
            WHEN NULLIF(TRIM(ru.firstname), '') IS NOT NULL
             AND NULLIF(TRIM(ru.realname), '') IS NOT NULL
            THEN ' '
            ELSE ''
          END,
          COALESCE(NULLIF(TRIM(ru.realname), ''), '')
        ))
        ELSE ru.name
      END AS requester_name,
      req_mail.email AS requester_email
    FROM glpi_tickets t
    LEFT JOIN glpi_tickets_users req
      ON req.tickets_id = t.id
     AND req.type = 1
     AND req.id = (
       SELECT MIN(tu_min.id)
       FROM glpi_tickets_users tu_min
       WHERE tu_min.tickets_id = t.id
         AND tu_min.type = 1
     )
    LEFT JOIN glpi_users ru
      ON ru.id = req.users_id
     AND ru.is_deleted = 0
    LEFT JOIN (
      SELECT e.users_id, e.email
      FROM glpi_useremails e
      INNER JOIN (
        SELECT users_id, MIN(id) AS pick_id
        FROM glpi_useremails
        WHERE is_default = 1
        GROUP BY users_id
      ) def ON def.pick_id = e.id
    ) req_mail ON req_mail.users_id = req.users_id
    LEFT JOIN glpi_itilcategories cat
      ON cat.id = t.itilcategories_id
    LEFT JOIN glpi_locations loc
      ON loc.id = t.locations_id
  ) close_candidate_rows
`;

const CLOSE_CANDIDATES_SELECT_COLUMNS = `
  ticket_id,
  is_deleted,
  subject,
  description_raw,
  type_glpi,
  status_glpi,
  urgency_glpi,
  category_id,
  category_name,
  location_id,
  location_name,
  created_at,
  requester_id,
  requester_name,
  requester_email
`;

const CLOSE_CANDIDATES_SORT_EXPRESSIONS: Record<CloseCandidatesSortBy, string> = {
  id: "ticket_id",
  createdAt: "created_at",
  subject: "subject",
  requester: "requester_name",
  location: "COALESCE(location_name, '')",
  status: "status_glpi",
};

/**
 * Repositorio SQL de candidatos a cierre masivo y ejecución del cierre, directo sobre GLPI.
 */
@Injectable()
export class TicketsCloseSqlRepository {
  /** Inyecta el servicio MySQL compartido. */
  constructor(private readonly mysql: MysqlService) {}

  /**
   * Lista página de candidatos a cierre masivo como DTOs de respuesta API.
   * @param filter - Filtros de estado, fecha, búsqueda, orden y paginación.
   * @returns Items paginados y total de coincidencias.
   * @throws Error de base de datos si la consulta falla.
   */
  async listCandidatesAsResponse(
    filter: CloseCandidatesFilter,
  ): Promise<{ items: TicketResponseDto[]; total: number }> {
    const { whereSql, params } = this.buildWhereClause(filter);
    const orderSql = this.buildOrderClause(filter);

    const rows = await this.mysql.query<CloseCandidateRow>(
      `SELECT ${CLOSE_CANDIDATES_SELECT_COLUMNS}
       FROM ${CLOSE_CANDIDATES_SOURCE_SQL}
       WHERE ${whereSql}
       ${orderSql}
       LIMIT :limit OFFSET :offset`,
      params as QueryValues,
    );

    const countRows = await this.mysql.query<CountRow>(
      `SELECT COUNT(*) AS total
       FROM ${CLOSE_CANDIDATES_SOURCE_SQL}
       WHERE ${whereSql}`,
      params as QueryValues,
    );

    return {
      items: rows.map((row) => this.toTicketResponseDto(row)),
      total: Number(countRows[0]?.total ?? 0),
    };
  }

  /**
   * Obtiene el detalle de un candidato a cierre masivo por ID.
   * @param ticketId - ID del ticket GLPI.
   * @returns Ticket enriquecido o `null` si no existe, está borrado o ya cerrado.
   * @throws Error de base de datos si la consulta falla.
   */
  async findCandidateById(ticketId: number): Promise<TicketResponseDto | null> {
    const rows = await this.mysql.query<CloseCandidateRow>(
      `SELECT ${CLOSE_CANDIDATES_SELECT_COLUMNS}
       FROM ${CLOSE_CANDIDATES_SOURCE_SQL}
       WHERE ticket_id = :ticketId
         AND is_deleted = 0
         AND status_glpi IN (${ELIGIBLE_STATUSES.join(", ")})
       LIMIT 1`,
      { ticketId } as QueryValues,
    );
    const row = rows[0];
    return row ? this.toTicketResponseDto(row) : null;
  }

  /**
   * Cierra en bloque los tickets indicados dentro de una transacción con bloqueo de filas.
   * Nunca llama a la API REST de GLPI ni dispara notificaciones por correo.
   * @param ticketIds - IDs de tickets a cerrar (pueden incluir duplicados/no elegibles).
   * @returns Conteo de solicitados, cerrados, omitidos y fallidos.
   * @throws Error de base de datos si la transacción no puede iniciarse o confirmarse.
   */
  async closeBulk(ticketIds: number[]): Promise<CloseBulkResponseDto> {
    const uniqueIds = [...new Set(ticketIds)];

    return this.mysql.withTransaction(async (connection) => {
      const foundById = await this.lockCandidateRows(connection, uniqueIds);

      let closed = 0;
      let skipped = 0;
      let failed = 0;

      for (const id of uniqueIds) {
        const row = foundById.get(id);
        if (!row || !ELIGIBLE_STATUSES.includes(Number(row.status))) {
          skipped += 1;
          continue;
        }

        try {
          const newContent = appendResolutionNote(row.content ?? null, BULK_CLOSE_NOTE);
          const [result] = await connection.query<ResultSetHeader>(
            {
              sql: `UPDATE glpi_tickets
                    SET status = 6,
                        date_mod = NOW(),
                        closedate = NOW(),
                        solvedate = COALESCE(solvedate, NOW()),
                        content = :content
                    WHERE id = :id
                      AND COALESCE(is_deleted, 0) = 0
                      AND status IN (${ELIGIBLE_STATUSES.join(", ")})`,
              namedPlaceholders: true,
            },
            { content: newContent, id } as QueryValues,
          );
          if (result.affectedRows > 0) {
            closed += 1;
          } else {
            skipped += 1;
          }
        } catch {
          failed += 1;
        }
      }

      return { requested: uniqueIds.length, closed, skipped, failed };
    });
  }

  /**
   * Bloquea (`SELECT ... FOR UPDATE`) las filas candidatas dentro de la transacción activa.
   * @param connection - Conexión transaccional en curso.
   * @param ids - IDs únicos a bloquear.
   * @returns Mapa de ID a fila bloqueada (estado y contenido actuales).
   * @throws Error de base de datos si la consulta falla.
   */
  private async lockCandidateRows(
    connection: PoolConnection,
    ids: number[],
  ): Promise<Map<number, LockRow>> {
    if (ids.length === 0) return new Map();

    const params: Record<string, unknown> = {};
    const placeholders = ids.map((id, index) => {
      params[`id${index}`] = id;
      return `:id${index}`;
    }).join(", ");

    const [rows] = await connection.query<LockRow[]>(
      {
        sql: `SELECT id, status, content
              FROM glpi_tickets
              WHERE id IN (${placeholders}) AND COALESCE(is_deleted, 0) = 0
              FOR UPDATE`,
        namedPlaceholders: true,
      },
      params as QueryValues,
    );

    return new Map(rows.map((row) => [Number(row.id), row]));
  }

  /**
   * Construye cláusula WHERE y parámetros nombrados desde filtros de candidatos.
   * @param filter - Filtros de listado.
   * @returns SQL de condiciones y mapa de parámetros.
   * @throws No lanza excepciones.
   */
  private buildWhereClause(filter: CloseCandidatesFilter): {
    whereSql: string;
    params: Record<string, unknown>;
  } {
    const whereClauses: string[] = ["is_deleted = 0"];
    const params: Record<string, unknown> = {
      limit: filter.limit,
      offset: (filter.page - 1) * filter.limit,
    };

    const statuses = this.resolveStatuses(filter.includeOpen, filter.includeSolved);
    if (statuses.length > 0) {
      const placeholders = statuses.map((_, index) => `:status${index}`).join(", ");
      whereClauses.push(`status_glpi IN (${placeholders})`);
      statuses.forEach((status, index) => {
        params[`status${index}`] = status;
      });
    } else {
      whereClauses.push("1 = 0");
    }

    if (filter.dateFrom) {
      whereClauses.push("created_at >= :dateFrom");
      params.dateFrom = filter.dateFrom;
    }
    if (filter.dateTo) {
      whereClauses.push("created_at <= :dateTo");
      params.dateTo = filter.dateTo;
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
   * Resuelve los códigos GLPI elegibles según los flags de estado solicitados.
   * @param includeOpen - Incluir nuevo/asignado/planificado/en espera.
   * @param includeSolved - Incluir resuelto.
   * @returns Lista de estados GLPI (nunca incluye 6 = cerrado).
   * @throws No lanza excepciones.
   */
  private resolveStatuses(includeOpen: boolean, includeSolved: boolean): number[] {
    const statuses: number[] = [];
    if (includeOpen) statuses.push(...OPEN_STATUSES);
    if (includeSolved) statuses.push(SOLVED_STATUS);
    return statuses;
  }

  /**
   * Construye cláusula ORDER BY con whitelist de columnas.
   * @param filter - Filtros de candidatos incluyendo sort opcional.
   * @returns Fragmento SQL `ORDER BY ...`.
   * @throws No lanza excepciones.
   */
  private buildOrderClause(filter: CloseCandidatesFilter): string {
    if (!filter.sortBy) {
      return "ORDER BY created_at DESC";
    }

    const expression = CLOSE_CANDIDATES_SORT_EXPRESSIONS[filter.sortBy];
    if (!expression) {
      return "ORDER BY created_at DESC";
    }

    const direction = filter.sortOrder === "desc" ? "DESC" : "ASC";
    return `ORDER BY ${expression} ${direction}, created_at DESC`;
  }

  /**
   * Mapea fila de candidato a DTO de respuesta API con actor solicitante anidado.
   * @param row - Fila SQL de candidato.
   * @returns DTO listo para el cliente.
   * @throws No lanza excepciones.
   */
  private toTicketResponseDto(row: CloseCandidateRow): TicketResponseDto {
    const categoryId = this.toOptionalId(row.category_id);
    const locationId = this.toOptionalId(row.location_id);
    const requesterId = this.toOptionalId(row.requester_id);

    return {
      id: Number(row.ticket_id),
      type: TicketMapper.mapType(Number(row.type_glpi ?? 1)),
      status: TicketMapper.mapStatus(Number(row.status_glpi ?? 1)),
      urgency: TicketMapper.mapUrgency(Number(row.urgency_glpi ?? 3)),
      subject: row.subject ?? "",
      tag: row.subject?.trim() ? row.subject.trim() : null,
      description: htmlToPlainText(row.description_raw),
      category: categoryId && row.category_name ? { id: categoryId, name: row.category_name } : null,
      location: locationId ? { id: locationId, name: row.location_name } : null,
      requester: {
        id: requesterId,
        name: row.requester_name?.trim() || null,
        email: row.requester_email?.trim() || null,
      },
      technician: null,
      createdAt: row.created_at ?? null,
      updatedAt: null,
      solvedAt: null,
      closedAt: null,
    };
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
