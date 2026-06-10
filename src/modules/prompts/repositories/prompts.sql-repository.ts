/**
 * @file prompts.sql-repository.ts
 * @description Acceso SQL a la tabla `public.prompt` con join a empresas y paginación.
 */
import { Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../../common/dto/pagination.dto";
import { PostgresService } from "../../postgres/postgres.service";
import type {
  CreatePromptInput,
  PromptListFilters,
  PromptRow,
  UpdatePromptInput,
} from "../prompts.types";

const SELECT_COLUMNS = `
  p.id,
  p.company_id,
  c.name AS company_name,
  p.system_instruction,
  p.prompt_template,
  p.created_at,
  p.updated_at
`;

const FROM_JOIN = `
  FROM public.prompt p
  INNER JOIN public.companies c ON c.id = p.company_id
`;

/** Repositorio Postgres para operaciones CRUD de prompts. */
@Injectable()
export class PromptsSqlRepository {
  /**
   * Inyecta el servicio de Postgres.
   * @param postgres - Cliente de consultas SQL.
   */
  constructor(private readonly postgres: PostgresService) {}

  /**
   * Lista prompts paginados con filtros de búsqueda y empresa.
   * @param filters - Paginación, texto de búsqueda y `companyId` opcional.
   * @returns Filas paginadas y metadatos de paginación.
   */
  async findAll(filters: PromptListFilters): Promise<PaginatedResult<PromptRow>> {
    const params: unknown[] = [];
    const whereClauses: string[] = [];

    if (filters.companyId) {
      params.push(filters.companyId);
      whereClauses.push(`p.company_id = $${params.length}`);
    }

    const search = filters.search?.trim();
    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(
        `(c.name ILIKE $${params.length} OR p.system_instruction ILIKE $${params.length} OR p.prompt_template ILIKE $${params.length})`,
      );
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const countRows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total ${FROM_JOIN} ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const offset = (filters.page - 1) * filters.limit;

    params.push(filters.limit, offset);
    const limitParam = params.length - 1;
    const offsetParam = params.length;

    const items = await this.postgres.query<PromptRow>(
      `SELECT ${SELECT_COLUMNS}
       ${FROM_JOIN}
       ${whereSql}
       ORDER BY c.name ASC, p.id ASC
       LIMIT $${limitParam}
       OFFSET $${offsetParam}`,
      params,
    );

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }

  /**
   * Busca un prompt por identificador con datos de empresa.
   * @param id - ID numérico del prompt.
   * @returns Fila encontrada o `null`.
   */
  async findById(id: number): Promise<PromptRow | null> {
    const rows = await this.postgres.query<PromptRow>(
      `SELECT ${SELECT_COLUMNS}
       ${FROM_JOIN}
       WHERE p.id = $1`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Busca el prompt asociado a una empresa.
   * @param companyId - ID de la empresa.
   * @returns Fila encontrada o `null` si la empresa no tiene prompt.
   */
  async findByCompanyId(companyId: number): Promise<PromptRow | null> {
    const rows = await this.postgres.query<PromptRow>(
      `SELECT ${SELECT_COLUMNS}
       ${FROM_JOIN}
       WHERE p.company_id = $1`,
      [companyId],
    );

    return rows[0] ?? null;
  }

  /**
   * Indica si una empresa existe en `public.companies`.
   * @param companyId - ID de la empresa a verificar.
   * @returns `true` si existe al menos una fila.
   */
  async companyExists(companyId: number): Promise<boolean> {
    const rows = await this.postgres.query<{ id: string }>(
      `SELECT id FROM public.companies WHERE id = $1`,
      [companyId],
    );

    return rows.length > 0;
  }

  /**
   * Inserta un nuevo prompt y lo reconsulta con join a empresa.
   * @param input - Datos normalizados de creación.
   * @returns Fila del prompt creado con nombre de empresa.
   * @throws {Error} Si el prompt no es recuperable tras el insert.
   */
  async create(input: CreatePromptInput): Promise<PromptRow> {
    const rows = await this.postgres.query<PromptRow>(
      `INSERT INTO public.prompt (
          company_id,
          system_instruction,
          prompt_template
       ) VALUES ($1, $2, $3)
       RETURNING
          id,
          company_id,
          system_instruction,
          prompt_template,
          created_at,
          updated_at`,
      [input.companyId, input.systemInstruction, input.promptTemplate],
    );

    const created = rows[0];
    const withCompany = await this.findById(Number(created.id));
    if (!withCompany) {
      throw new Error(`Prompt ${created.id} not found after insert`);
    }

    return withCompany;
  }

  /**
   * Actualiza parcialmente un prompt existente.
   * @param id - ID del prompt a modificar.
   * @param input - Campos a persistir; si está vacío, reconsulta sin cambios.
   * @returns Fila actualizada con join o `null` si no existe.
   */
  async update(id: number, input: UpdatePromptInput): Promise<PromptRow | null> {
    const assignments: string[] = [];
    const params: unknown[] = [];

    /**
     * Acumula una asignación de columna en el UPDATE dinámico.
     * @param column - Nombre de columna SQL.
     * @param value - Valor a asignar.
     * @returns void
     */
    const setField = (column: string, value: unknown): void => {
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    };

    if (input.companyId !== undefined) setField("company_id", input.companyId);
    if (input.systemInstruction !== undefined) {
      setField("system_instruction", input.systemInstruction);
    }
    if (input.promptTemplate !== undefined) setField("prompt_template", input.promptTemplate);

    if (assignments.length === 0) {
      return this.findById(id);
    }

    assignments.push("updated_at = now()");
    params.push(id);

    const rows = await this.postgres.query<{ id: string }>(
      `UPDATE public.prompt
       SET ${assignments.join(", ")}
       WHERE id = $${params.length}
       RETURNING id`,
      params,
    );

    if (!rows[0]) {
      return null;
    }

    return this.findById(id);
  }

  /**
   * Elimina permanentemente un prompt de la base de datos.
   * @param id - ID del prompt.
   * @returns ID eliminado como número o `null` si no existía.
   */
  async hardDelete(id: number): Promise<number | null> {
    const rows = await this.postgres.query<{ id: string }>(
      `DELETE FROM public.prompt WHERE id = $1 RETURNING id`,
      [id],
    );

    const deletedId = rows[0]?.id;
    return deletedId != null ? Number(deletedId) : null;
  }
}
