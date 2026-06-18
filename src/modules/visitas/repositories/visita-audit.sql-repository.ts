/**
 * @file visita-audit.sql-repository.ts
 * @description Acceso SQL a `public.prt_visita_audit_log` para inserción y listado paginado.
 */
import { Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../../common/dto/pagination.dto";
import { PostgresService } from "../../postgres/postgres.service";
import type {
  CreateVisitaAuditLogInput,
  VisitaAuditListFilters,
  VisitaAuditLogRow,
  VisitaAuditSortBy,
  VisitaAuditSortOrder,
} from "../visitas.types";

const VISITA_AUDIT_SORT_EXPRESSIONS: Record<VisitaAuditSortBy, string> = {
  occurredAt: "l.occurred_at",
  action: "l.action",
  visitante: "COALESCE(l.after_state->>'visitante', l.before_state->>'visitante', '')",
  documento: "COALESCE(l.after_state->>'documento', l.before_state->>'documento', '')",
  actorUserId: "l.actor_user_id",
  visitaId: "l.visita_id",
};

const VISITA_AUDIT_SELECT_COLUMNS = `
  l.id,
  l.visita_id,
  l.action,
  l.actor_user_id,
  l.occurred_at,
  l.before_state,
  l.after_state,
  l.changed_fields,
  l.metadata,
  COALESCE(l.after_state->>'visitante', l.before_state->>'visitante') AS visitante,
  COALESCE(l.after_state->>'documento', l.before_state->>'documento') AS documento,
  l.before_state->>'estado' AS estado_before,
  l.after_state->>'estado' AS estado_after
`;

/** Repositorio Postgres para registrar y consultar eventos de auditoría de visitas. */
@Injectable()
export class VisitaAuditSqlRepository {
  /** Inyecta servicio Postgres compartido. */
  constructor(private readonly postgres: PostgresService) {}

  /**
   * Inserta un evento de auditoría de visita.
   * @param input - Evento normalizado a persistir.
   */
  async create(input: CreateVisitaAuditLogInput): Promise<void> {
    await this.postgres.query(
      `INSERT INTO public.prt_visita_audit_log (
          visita_id,
          action,
          actor_user_id,
          before_state,
          after_state,
          changed_fields,
          metadata
       ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::text[], $7::jsonb)`,
      [
        input.visitaId,
        input.action,
        input.actorUserId,
        input.beforeState ? JSON.stringify(input.beforeState) : null,
        input.afterState ? JSON.stringify(input.afterState) : null,
        input.changedFields,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }

  /**
   * Lista eventos de auditoría paginados con filtros y orden.
   * @param filters - Filtros de consulta.
   * @returns Resultado paginado de logs.
   */
  async findAll(filters: VisitaAuditListFilters): Promise<PaginatedResult<VisitaAuditLogRow>> {
    const { whereSql, params } = this.buildWhereClause(filters);
    const countRows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM public.prt_visita_audit_log l ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const offset = (filters.page - 1) * filters.limit;
    const orderSql = this.buildOrderClause(filters);

    const listParams = [...params, filters.limit, offset];
    const limitParam = listParams.length - 1;
    const offsetParam = listParams.length;

    const items = await this.postgres.query<VisitaAuditLogRow>(
      `SELECT ${VISITA_AUDIT_SELECT_COLUMNS}
       FROM public.prt_visita_audit_log l
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
   * Construye WHERE parametrizado para filtros de auditoría.
   * @param filters - Filtros solicitados.
   * @returns SQL y parámetros.
   */
  private buildWhereClause(filters: VisitaAuditListFilters): { whereSql: string; params: unknown[] } {
    const params: unknown[] = [];
    const whereClauses: string[] = [];

    const addIlike = (sqlExpression: string, value?: string): void => {
      const trimmed = value?.trim();
      if (!trimmed) return;
      params.push(`%${trimmed}%`);
      whereClauses.push(`${sqlExpression} ILIKE $${params.length}`);
    };

    if (filters.action) {
      params.push(filters.action);
      whereClauses.push(`l.action = $${params.length}`);
    }

    if (filters.actorUserId !== undefined) {
      params.push(filters.actorUserId);
      whereClauses.push(`l.actor_user_id = $${params.length}`);
    }

    if (filters.visitaId !== undefined) {
      params.push(filters.visitaId);
      whereClauses.push(`l.visita_id = $${params.length}`);
    }

    if (filters.occurredFrom) {
      params.push(filters.occurredFrom);
      whereClauses.push(`l.occurred_at >= $${params.length}::timestamptz`);
    }

    if (filters.occurredTo) {
      params.push(filters.occurredTo);
      whereClauses.push(`l.occurred_at <= $${params.length}::timestamptz`);
    }

    if (filters.estadoBefore) {
      params.push(filters.estadoBefore);
      whereClauses.push(`l.before_state->>'estado' = $${params.length}`);
    }

    if (filters.estadoAfter) {
      params.push(filters.estadoAfter);
      whereClauses.push(`l.after_state->>'estado' = $${params.length}`);
    }

    addIlike(`COALESCE(l.after_state->>'visitante', l.before_state->>'visitante', '')`, filters.visitante);
    addIlike(`COALESCE(l.after_state->>'documento', l.before_state->>'documento', '')`, filters.documento);

    const q = filters.q?.trim();
    if (q) {
      params.push(`%${q}%`);
      whereClauses.push(
        `(l.action ILIKE $${params.length}
          OR l.visita_id::text ILIKE $${params.length}
          OR l.actor_user_id::text ILIKE $${params.length}
          OR COALESCE(l.after_state->>'visitante', l.before_state->>'visitante', '') ILIKE $${params.length}
          OR COALESCE(l.after_state->>'documento', l.before_state->>'documento', '') ILIKE $${params.length}
          OR COALESCE(l.after_state->>'motivo', l.before_state->>'motivo', '') ILIKE $${params.length}
          OR COALESCE(l.after_state->>'responsableNombre', l.before_state->>'responsableNombre', '') ILIKE $${params.length})`,
      );
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    return { whereSql, params };
  }

  /**
   * Construye ORDER BY con whitelist de columnas.
   * @param filters - Filtros recibidos.
   * @returns SQL ORDER BY seguro.
   */
  private buildOrderClause(filters: VisitaAuditListFilters): string {
    if (!filters.sortBy) {
      return "ORDER BY l.occurred_at DESC, l.id DESC";
    }
    const expression = VISITA_AUDIT_SORT_EXPRESSIONS[filters.sortBy];
    if (!expression) {
      return "ORDER BY l.occurred_at DESC, l.id DESC";
    }
    const direction: VisitaAuditSortOrder = filters.sortOrder === "asc" ? "asc" : "desc";
    return `ORDER BY ${expression} ${direction.toUpperCase()}, l.id DESC`;
  }
}
