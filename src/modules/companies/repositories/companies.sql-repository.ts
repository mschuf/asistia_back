/**
 * @file companies.sql-repository.ts
 * @description Acceso SQL a la tabla `public.companies` con paginación y búsqueda.
 */
import { Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../../common/dto/pagination.dto";
import { PostgresService } from "../../postgres/postgres.service";
import type {
  CompanyListFilters,
  CompanyRow,
  CreateCompanyInput,
  UpdateCompanyInput,
} from "../companies.types";
import { parseCompanySearch } from "../company-search.utils";

/** Repositorio Postgres para operaciones CRUD de empresas. */
@Injectable()
export class CompaniesSqlRepository {
  /**
   * Inyecta el servicio de Postgres.
   * @param postgres - Cliente de consultas SQL.
   */
  constructor(private readonly postgres: PostgresService) {}

  /**
   * Lista empresas paginadas aplicando filtros de búsqueda y activas.
   * @param filters - Paginación, texto de búsqueda y `activeOnly`.
   * @returns Filas paginadas y metadatos de paginación.
   */
  async findAll(filters: CompanyListFilters): Promise<PaginatedResult<CompanyRow>> {
    const params: unknown[] = [];
    const whereClauses: string[] = [];

    if (filters.activeOnly) {
      whereClauses.push("is_active = true");
    }

    const search = filters.search?.trim();
    if (search) {
      const parsed = parseCompanySearch(search);

      if (parsed.isActive !== undefined && !filters.activeOnly) {
        params.push(parsed.isActive);
        whereClauses.push(`is_active = $${params.length}`);
      }

      if (parsed.text) {
        params.push(`%${parsed.text}%`);
        whereClauses.push(
          `(name ILIKE $${params.length} OR ms_mailbox ILIKE $${params.length} OR gemini_model ILIKE $${params.length})`,
        );
      } else if (parsed.isActive === undefined) {
        params.push(`%${search}%`);
        whereClauses.push(
          `(name ILIKE $${params.length} OR ms_mailbox ILIKE $${params.length} OR gemini_model ILIKE $${params.length})`,
        );
      }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const countRows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM public.companies ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const offset = (filters.page - 1) * filters.limit;

    params.push(filters.limit, offset);
    const limitParam = params.length - 1;
    const offsetParam = params.length;

    const items = await this.postgres.query<CompanyRow>(
      `SELECT
          id,
          name,
          is_active,
          ms_tenant_id,
          ms_client_id,
          ms_client_secret,
          ms_mailbox,
          ms_mail_folder,
          gemini_model,
          daemon_max_emails,
          daemon_interval_seconds,
          created_at,
          updated_at
       FROM public.companies
       ${whereSql}
       ORDER BY name ASC, id ASC
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
   * Busca una empresa por identificador.
   * @param id - ID numérico de la empresa.
   * @returns Fila encontrada o `null`.
   */
  async findById(id: number): Promise<CompanyRow | null> {
    const rows = await this.postgres.query<CompanyRow>(
      `SELECT
          id,
          name,
          is_active,
          ms_tenant_id,
          ms_client_id,
          ms_client_secret,
          ms_mailbox,
          ms_mail_folder,
          gemini_model,
          daemon_max_emails,
          daemon_interval_seconds,
          created_at,
          updated_at
       FROM public.companies
       WHERE id = $1`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Inserta una nueva empresa en Postgres.
   * @param input - Datos normalizados de creación.
   * @returns Fila de la empresa creada.
   */
  async create(input: CreateCompanyInput): Promise<CompanyRow> {
    const rows = await this.postgres.query<CompanyRow>(
      `INSERT INTO public.companies (
          name,
          is_active,
          ms_tenant_id,
          ms_client_id,
          ms_client_secret,
          ms_mailbox,
          ms_mail_folder,
          gemini_model,
          daemon_max_emails,
          daemon_interval_seconds
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING
          id,
          name,
          is_active,
          ms_tenant_id,
          ms_client_id,
          ms_client_secret,
          ms_mailbox,
          ms_mail_folder,
          gemini_model,
          daemon_max_emails,
          daemon_interval_seconds,
          created_at,
          updated_at`,
      [
        input.name,
        input.isActive,
        input.msTenantId,
        input.msClientId,
        input.msClientSecret,
        input.msMailbox,
        input.msMailFolder,
        input.geminiModel,
        input.daemonMaxEmails,
        input.daemonIntervalSeconds,
      ],
    );

    return rows[0];
  }

  /**
   * Actualiza parcialmente una empresa existente.
   * @param id - ID de la empresa a modificar.
   * @param input - Campos a persistir; si está vacío, reconsulta sin cambios.
   * @returns Fila actualizada o `null` si no existe.
   */
  async update(id: number, input: UpdateCompanyInput): Promise<CompanyRow | null> {
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

    if (input.name !== undefined) setField("name", input.name);
    if (input.isActive !== undefined) setField("is_active", input.isActive);
    if (input.msTenantId !== undefined) setField("ms_tenant_id", input.msTenantId);
    if (input.msClientId !== undefined) setField("ms_client_id", input.msClientId);
    if (input.msClientSecret !== undefined) setField("ms_client_secret", input.msClientSecret);
    if (input.msMailbox !== undefined) setField("ms_mailbox", input.msMailbox);
    if (input.msMailFolder !== undefined) setField("ms_mail_folder", input.msMailFolder);
    if (input.geminiModel !== undefined) setField("gemini_model", input.geminiModel);
    if (input.daemonMaxEmails !== undefined) setField("daemon_max_emails", input.daemonMaxEmails);
    if (input.daemonIntervalSeconds !== undefined) {
      setField("daemon_interval_seconds", input.daemonIntervalSeconds);
    }

    if (assignments.length === 0) {
      return this.findById(id);
    }

    assignments.push("updated_at = now()");
    params.push(id);

    const rows = await this.postgres.query<CompanyRow>(
      `UPDATE public.companies
       SET ${assignments.join(", ")}
       WHERE id = $${params.length}
       RETURNING
          id,
          name,
          is_active,
          ms_tenant_id,
          ms_client_id,
          ms_client_secret,
          ms_mailbox,
          ms_mail_folder,
          gemini_model,
          daemon_max_emails,
          daemon_interval_seconds,
          created_at,
          updated_at`,
      params,
    );

    return rows[0] ?? null;
  }

  /**
   * Desactiva una empresa estableciendo `is_active = false`.
   * @param id - ID de la empresa.
   * @returns Fila actualizada o `null` si no existe.
   */
  async softDelete(id: number): Promise<CompanyRow | null> {
    const rows = await this.postgres.query<CompanyRow>(
      `UPDATE public.companies
       SET is_active = false, updated_at = now()
       WHERE id = $1
       RETURNING
          id,
          name,
          is_active,
          ms_tenant_id,
          ms_client_id,
          ms_client_secret,
          ms_mailbox,
          ms_mail_folder,
          gemini_model,
          daemon_max_emails,
          daemon_interval_seconds,
          created_at,
          updated_at`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Activa una empresa estableciendo `is_active = true`.
   * @param id - ID de la empresa.
   * @returns Fila actualizada o `null` si no existe.
   */
  async activate(id: number): Promise<CompanyRow | null> {
    const rows = await this.postgres.query<CompanyRow>(
      `UPDATE public.companies
       SET is_active = true, updated_at = now()
       WHERE id = $1
       RETURNING
          id,
          name,
          is_active,
          ms_tenant_id,
          ms_client_id,
          ms_client_secret,
          ms_mailbox,
          ms_mail_folder,
          gemini_model,
          daemon_max_emails,
          daemon_interval_seconds,
          created_at,
          updated_at`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Elimina permanentemente una empresa de la base de datos.
   * @param id - ID de la empresa.
   * @returns ID eliminado como número o `null` si no existía.
   */
  async hardDelete(id: number): Promise<number | null> {
    const rows = await this.postgres.query<{ id: string }>(
      `DELETE FROM public.companies WHERE id = $1 RETURNING id`,
      [id],
    );

    const deletedId = rows[0]?.id;
    return deletedId != null ? Number(deletedId) : null;
  }
}
