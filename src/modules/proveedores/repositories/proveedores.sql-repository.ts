/**
 * @file proveedores.sql-repository.ts
 * @description Acceso SQL a la tabla `public.prt_proveedor` con paginación, filtros y orden.
 */
import { Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../../common/dto/pagination.dto";
import { PostgresService } from "../../postgres/postgres.service";
import type {
  CreateProveedorInput,
  ProveedorListFilters,
  ProveedorRow,
  UpdateProveedorInput,
} from "../proveedores.types";
import type { ProveedorSortBy, ProveedorSortOrder } from "../dto/list-proveedores-query.dto";

const PROVEEDOR_SORT_EXPRESSIONS: Record<ProveedorSortBy, string> = {
  id: "id",
  nombre: "nombre",
  ruc: "ruc",
  createdAt: "created_at",
};

const PROVEEDOR_SELECT_COLUMNS = `
  id,
  nombre,
  ruc,
  activo,
  created_at,
  updated_at
`;

/** Repositorio Postgres para operaciones CRUD de proveedores. */
@Injectable()
export class ProveedoresSqlRepository {
  /** Inyecta el servicio de Postgres. */
  constructor(private readonly postgres: PostgresService) {}

  /**
   * Lista proveedores paginados aplicando filtros y orden.
   * @param filters - Paginación, búsqueda y filtros por columna.
   * @returns Filas paginadas y metadatos de paginación.
   */
  async findAll(filters: ProveedorListFilters): Promise<PaginatedResult<ProveedorRow>> {
    const { whereSql, params } = this.buildWhereClause(filters);
    const countRows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM public.prt_proveedor ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const offset = (filters.page - 1) * filters.limit;
    const orderSql = this.buildOrderClause(filters);

    const listParams = [...params, filters.limit, offset];
    const limitParam = listParams.length - 1;
    const offsetParam = listParams.length;

    const items = await this.postgres.query<ProveedorRow>(
      `SELECT ${PROVEEDOR_SELECT_COLUMNS}
       FROM public.prt_proveedor
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
   * Busca un proveedor por identificador.
   * @param id - ID numérico del proveedor.
   * @returns Fila encontrada o `null`.
   */
  async findById(id: number): Promise<ProveedorRow | null> {
    const rows = await this.postgres.query<ProveedorRow>(
      `SELECT ${PROVEEDOR_SELECT_COLUMNS}
       FROM public.prt_proveedor
       WHERE id = $1`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Busca un proveedor por nombre exacto (case-sensitive en Postgres, comparación normalizada en servicio).
   * @param nombre - Nombre del proveedor.
   * @returns Fila encontrada o `null`.
   */
  async findByNombre(nombre: string): Promise<ProveedorRow | null> {
    const rows = await this.postgres.query<ProveedorRow>(
      `SELECT ${PROVEEDOR_SELECT_COLUMNS}
       FROM public.prt_proveedor
       WHERE nombre = $1`,
      [nombre],
    );

    return rows[0] ?? null;
  }

  /**
   * Busca un proveedor por RUC exacto.
   * @param ruc - RUC del proveedor.
   * @returns Fila encontrada o `null`.
   */
  async findByRuc(ruc: string): Promise<ProveedorRow | null> {
    const rows = await this.postgres.query<ProveedorRow>(
      `SELECT ${PROVEEDOR_SELECT_COLUMNS}
       FROM public.prt_proveedor
       WHERE ruc = $1`,
      [ruc],
    );

    return rows[0] ?? null;
  }

  /**
   * Cuenta personas vinculadas a un proveedor.
   * @param proveedorId - ID del proveedor.
   * @returns Cantidad de personas asociadas.
   */
  async countPersonas(proveedorId: number): Promise<number> {
    const rows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM public.prt_persona
       WHERE proveedor_id = $1`,
      [proveedorId],
    );

    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Inserta un nuevo proveedor en Postgres.
   * @param input - Datos normalizados de creación.
   * @returns Fila del proveedor creado.
   */
  async create(input: CreateProveedorInput): Promise<ProveedorRow> {
    const rows = await this.postgres.query<ProveedorRow>(
      `INSERT INTO public.prt_proveedor (nombre, ruc, activo)
       VALUES ($1, $2, $3)
       RETURNING ${PROVEEDOR_SELECT_COLUMNS}`,
      [input.nombre, input.ruc, input.activo],
    );

    return rows[0];
  }

  /**
   * Actualiza parcialmente un proveedor existente.
   * @param id - ID del proveedor a modificar.
   * @param input - Campos a persistir.
   * @returns Fila actualizada o `null` si no existe.
   */
  async update(id: number, input: UpdateProveedorInput): Promise<ProveedorRow | null> {
    const assignments: string[] = [];
    const params: unknown[] = [];

    const setField = (column: string, value: unknown): void => {
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    };

    if (input.nombre !== undefined) setField("nombre", input.nombre);
    if (input.ruc !== undefined) setField("ruc", input.ruc);
    if (input.activo !== undefined) setField("activo", input.activo);

    if (assignments.length === 0) {
      return this.findById(id);
    }

    assignments.push("updated_at = now()");
    params.push(id);

    const rows = await this.postgres.query<ProveedorRow>(
      `UPDATE public.prt_proveedor
       SET ${assignments.join(", ")}
       WHERE id = $${params.length}
       RETURNING ${PROVEEDOR_SELECT_COLUMNS}`,
      params,
    );

    return rows[0] ?? null;
  }

  /**
   * Desactiva un proveedor estableciendo `activo = false`.
   * @param id - ID del proveedor.
   * @returns Fila actualizada o `null` si no existe.
   */
  async softDelete(id: number): Promise<ProveedorRow | null> {
    const rows = await this.postgres.query<ProveedorRow>(
      `UPDATE public.prt_proveedor
       SET activo = false, updated_at = now()
       WHERE id = $1
       RETURNING ${PROVEEDOR_SELECT_COLUMNS}`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Reactiva un proveedor estableciendo `activo = true`.
   * @param id - ID del proveedor.
   * @returns Fila actualizada o `null` si no existe.
   */
  async activate(id: number): Promise<ProveedorRow | null> {
    const rows = await this.postgres.query<ProveedorRow>(
      `UPDATE public.prt_proveedor
       SET activo = true, updated_at = now()
       WHERE id = $1
       RETURNING ${PROVEEDOR_SELECT_COLUMNS}`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Elimina permanentemente un proveedor de la base de datos.
   * @param id - ID del proveedor.
   * @returns ID eliminado como número o `null` si no existía.
   */
  async hardDelete(id: number): Promise<number | null> {
    const rows = await this.postgres.query<{ id: string }>(
      `DELETE FROM public.prt_proveedor WHERE id = $1 RETURNING id`,
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
  private buildWhereClause(filters: ProveedorListFilters): { whereSql: string; params: unknown[] } {
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
    addIlike("ruc", filters.ruc);

    const search = filters.search?.trim();
    if (search) {
      params.push(`%${search}%`);
      const ilikeParam = params.length;
      const searchConditions = [`nombre ILIKE $${ilikeParam}`, `ruc ILIKE $${ilikeParam}`];

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
  private buildOrderClause(filters: ProveedorListFilters): string {
    if (!filters.sortBy) {
      return "ORDER BY id DESC";
    }

    const expression = PROVEEDOR_SORT_EXPRESSIONS[filters.sortBy];
    if (!expression) {
      return "ORDER BY id DESC";
    }

    const direction: ProveedorSortOrder = filters.sortOrder === "desc" ? "desc" : "asc";
    return `ORDER BY ${expression} ${direction.toUpperCase()}, id ASC`;
  }
}
