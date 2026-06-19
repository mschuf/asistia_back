/**
 * @file motivos-visita.sql-repository.ts
 * @description Acceso SQL a la tabla `public.prt_motivo_visita` con paginación, filtros y orden.
 */
import { Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../../common/dto/pagination.dto";
import { PostgresService } from "../../postgres/postgres.service";
import type {
  CreateMotivoVisitaInput,
  MotivoVisitaListFilters,
  MotivoVisitaRow,
  UpdateMotivoVisitaInput,
} from "../motivos-visita.types";
import type { MotivoVisitaSortBy, MotivoVisitaSortOrder } from "../dto/list-motivos-visita-query.dto";

const MOTIVO_VISITA_SORT_EXPRESSIONS: Record<MotivoVisitaSortBy, string> = {
  id: "id",
  nombre: "nombre",
  createdAt: "created_at",
};

const MOTIVO_VISITA_SELECT_COLUMNS = `
  id,
  nombre,
  activo,
  created_at,
  updated_at
`;

/** Repositorio Postgres para operaciones CRUD de motivos de visita. */
@Injectable()
export class MotivosVisitaSqlRepository {
  /** Inyecta el servicio de Postgres. */
  constructor(private readonly postgres: PostgresService) {}

  /**
   * Lista motivos de visita paginados aplicando filtros y orden.
   * @param filters - Paginación, búsqueda y filtros por columna.
   * @returns Filas paginadas y metadatos de paginación.
   */
  async findAll(filters: MotivoVisitaListFilters): Promise<PaginatedResult<MotivoVisitaRow>> {
    const { whereSql, params } = this.buildWhereClause(filters);
    const countRows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM public.prt_motivo_visita ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const offset = (filters.page - 1) * filters.limit;
    const orderSql = this.buildOrderClause(filters);

    const listParams = [...params, filters.limit, offset];
    const limitParam = listParams.length - 1;
    const offsetParam = listParams.length;

    const items = await this.postgres.query<MotivoVisitaRow>(
      `SELECT ${MOTIVO_VISITA_SELECT_COLUMNS}
       FROM public.prt_motivo_visita
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
   * Busca un motivo de visita por identificador.
   * @param id - ID numérico del motivo.
   * @returns Fila encontrada o `null`.
   */
  async findById(id: number): Promise<MotivoVisitaRow | null> {
    const rows = await this.postgres.query<MotivoVisitaRow>(
      `SELECT ${MOTIVO_VISITA_SELECT_COLUMNS}
       FROM public.prt_motivo_visita
       WHERE id = $1`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Busca un motivo de visita por nombre exacto.
   * @param nombre - Nombre del motivo.
   * @returns Fila encontrada o `null`.
   */
  async findByNombre(nombre: string): Promise<MotivoVisitaRow | null> {
    const rows = await this.postgres.query<MotivoVisitaRow>(
      `SELECT ${MOTIVO_VISITA_SELECT_COLUMNS}
       FROM public.prt_motivo_visita
       WHERE nombre = $1`,
      [nombre],
    );

    return rows[0] ?? null;
  }

  /**
   * Cuenta visitas vinculadas a un motivo de visita.
   * @param motivoVisitaId - ID del motivo.
   * @returns Cantidad de visitas asociadas.
   */
  async countVisitas(motivoVisitaId: number): Promise<number> {
    const rows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM public.prt_visita
       WHERE motivo_visita_id = $1`,
      [motivoVisitaId],
    );

    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Inserta un nuevo motivo de visita en Postgres.
   * @param input - Datos normalizados de creación.
   * @returns Fila del motivo creado.
   */
  async create(input: CreateMotivoVisitaInput): Promise<MotivoVisitaRow> {
    const rows = await this.postgres.query<MotivoVisitaRow>(
      `INSERT INTO public.prt_motivo_visita (nombre, activo)
       VALUES ($1, $2)
       RETURNING ${MOTIVO_VISITA_SELECT_COLUMNS}`,
      [input.nombre, input.activo],
    );

    return rows[0];
  }

  /**
   * Actualiza parcialmente un motivo de visita existente.
   * @param id - ID del motivo a modificar.
   * @param input - Campos a persistir.
   * @returns Fila actualizada o `null` si no existe.
   */
  async update(id: number, input: UpdateMotivoVisitaInput): Promise<MotivoVisitaRow | null> {
    const assignments: string[] = [];
    const params: unknown[] = [];

    const setField = (column: string, value: unknown): void => {
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    };

    if (input.nombre !== undefined) setField("nombre", input.nombre);
    if (input.activo !== undefined) setField("activo", input.activo);

    if (assignments.length === 0) {
      return this.findById(id);
    }

    assignments.push("updated_at = now()");
    params.push(id);

    const rows = await this.postgres.query<MotivoVisitaRow>(
      `UPDATE public.prt_motivo_visita
       SET ${assignments.join(", ")}
       WHERE id = $${params.length}
       RETURNING ${MOTIVO_VISITA_SELECT_COLUMNS}`,
      params,
    );

    return rows[0] ?? null;
  }

  /**
   * Desactiva un motivo de visita estableciendo `activo = false`.
   * @param id - ID del motivo.
   * @returns Fila actualizada o `null` si no existe.
   */
  async softDelete(id: number): Promise<MotivoVisitaRow | null> {
    const rows = await this.postgres.query<MotivoVisitaRow>(
      `UPDATE public.prt_motivo_visita
       SET activo = false, updated_at = now()
       WHERE id = $1
       RETURNING ${MOTIVO_VISITA_SELECT_COLUMNS}`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Reactiva un motivo de visita estableciendo `activo = true`.
   * @param id - ID del motivo.
   * @returns Fila actualizada o `null` si no existe.
   */
  async activate(id: number): Promise<MotivoVisitaRow | null> {
    const rows = await this.postgres.query<MotivoVisitaRow>(
      `UPDATE public.prt_motivo_visita
       SET activo = true, updated_at = now()
       WHERE id = $1
       RETURNING ${MOTIVO_VISITA_SELECT_COLUMNS}`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Elimina permanentemente un motivo de visita de la base de datos.
   * @param id - ID del motivo.
   * @returns ID eliminado como número o `null` si no existía.
   */
  async hardDelete(id: number): Promise<number | null> {
    const rows = await this.postgres.query<{ id: string }>(
      `DELETE FROM public.prt_motivo_visita WHERE id = $1 RETURNING id`,
      [id],
    );

    const deletedId = rows[0]?.id;
    return deletedId != null ? Number(deletedId) : null;
  }

  /**
   * Construye cláusula WHERE con filtros parametrizados.
   * @param filters - Filtros del listado.
   * @returns SQL WHERE y parámetros.
   */
  private buildWhereClause(filters: MotivoVisitaListFilters): { whereSql: string; params: unknown[] } {
    const params: unknown[] = [];
    const whereClauses: string[] = [];

    const addIlike = (column: string, value?: string): void => {
      const trimmed = value?.trim();
      if (!trimmed) return;
      params.push(`%${trimmed}%`);
      whereClauses.push(`${column} ILIKE $${params.length}`);
    };

    if (filters.activo !== undefined) {
      params.push(filters.activo);
      whereClauses.push(`activo = $${params.length}`);
    }

    addIlike("nombre", filters.nombre);

    const search = filters.search?.trim();
    if (search) {
      params.push(`%${search}%`);
      const ilikeParam = params.length;
      const searchConditions = [`nombre ILIKE $${ilikeParam}`];

      const parsedId = Number.parseInt(search, 10);
      if (Number.isFinite(parsedId) && parsedId > 0 && String(parsedId) === search) {
        params.push(parsedId);
        searchConditions.push(`id = $${params.length}`);
      }

      whereClauses.push(`(${searchConditions.join(" OR ")})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    return { whereSql, params };
  }

  /**
   * Construye cláusula ORDER BY con whitelist de columnas.
   * @param filters - Filtros del listado incluyendo sort opcional.
   * @returns Fragmento SQL `ORDER BY ...`.
   */
  private buildOrderClause(filters: MotivoVisitaListFilters): string {
    if (!filters.sortBy) {
      return "ORDER BY nombre ASC, id ASC";
    }

    const expression = MOTIVO_VISITA_SORT_EXPRESSIONS[filters.sortBy];
    if (!expression) {
      return "ORDER BY nombre ASC, id ASC";
    }

    const direction: MotivoVisitaSortOrder = filters.sortOrder === "desc" ? "desc" : "asc";
    return `ORDER BY ${expression} ${direction.toUpperCase()}, id ASC`;
  }
}
