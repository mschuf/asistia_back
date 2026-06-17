/**
 * @file personas.sql-repository.ts
 * @description Acceso SQL a la tabla `public.persona` con paginación, filtros y orden.
 */
import { Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../../common/dto/pagination.dto";
import { PostgresService } from "../../postgres/postgres.service";
import type {
  CreatePersonaInput,
  PersonaListFilters,
  PersonaPhotoRow,
  PersonaRow,
  UpdatePersonaInput,
} from "../personas.types";
import type { PersonaSortBy, PersonaSortOrder } from "../dto/list-personas-query.dto";

const PERSONA_SORT_EXPRESSIONS: Record<PersonaSortBy, string> = {
  id: "id",
  nombre: "nombre",
  documento: "documento",
  empresa: "empresa",
  createdAt: "created_at",
};

const PERSONA_SELECT_COLUMNS = `
  id,
  nombre,
  documento,
  empresa,
  email,
  telefono,
  glpi_user_id,
  activo,
  (foto IS NOT NULL) AS has_foto,
  created_at,
  updated_at
`;

/** Repositorio Postgres para operaciones CRUD de personas. */
@Injectable()
export class PersonasSqlRepository {
  /** Inyecta el servicio de Postgres. */
  constructor(private readonly postgres: PostgresService) {}

  /**
   * Lista personas paginadas aplicando filtros y orden.
   * @param filters - Paginación, búsqueda y filtros por columna.
   * @returns Filas paginadas y metadatos de paginación.
   */
  async findAll(filters: PersonaListFilters): Promise<PaginatedResult<PersonaRow>> {
    const { whereSql, params } = this.buildWhereClause(filters);
    const countRows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM public.persona ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const offset = (filters.page - 1) * filters.limit;
    const orderSql = this.buildOrderClause(filters);

    const listParams = [...params, filters.limit, offset];
    const limitParam = listParams.length - 1;
    const offsetParam = listParams.length;

    const items = await this.postgres.query<PersonaRow>(
      `SELECT ${PERSONA_SELECT_COLUMNS}
       FROM public.persona
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
   * Busca una persona por identificador.
   * @param id - ID numérico de la persona.
   * @returns Fila encontrada o `null`.
   */
  async findById(id: number): Promise<PersonaRow | null> {
    const rows = await this.postgres.query<PersonaRow>(
      `SELECT ${PERSONA_SELECT_COLUMNS}
       FROM public.persona
       WHERE id = $1`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Busca una persona por documento.
   * @param documento - Documento único de la persona.
   * @returns Fila encontrada o `null`.
   */
  async findByDocumento(documento: string): Promise<PersonaRow | null> {
    const rows = await this.postgres.query<PersonaRow>(
      `SELECT ${PERSONA_SELECT_COLUMNS}
       FROM public.persona
       WHERE documento = $1`,
      [documento],
    );

    return rows[0] ?? null;
  }

  /**
   * Busca una persona por ID de usuario GLPI vinculado.
   * @param glpiUserId - ID numérico del usuario en GLPI.
   * @returns Fila encontrada o `null`.
   */
  async findByGlpiUserId(glpiUserId: number): Promise<PersonaRow | null> {
    const rows = await this.postgres.query<PersonaRow>(
      `SELECT ${PERSONA_SELECT_COLUMNS}
       FROM public.persona
       WHERE glpi_user_id = $1`,
      [glpiUserId],
    );

    return rows[0] ?? null;
  }

  /**
   * Lista los IDs de usuario GLPI ya vinculados a personas.
   * @returns Conjunto de IDs GLPI vinculados.
   */
  async findLinkedGlpiUserIds(): Promise<Set<number>> {
    const rows = await this.postgres.query<{ glpi_user_id: string }>(
      `SELECT glpi_user_id FROM public.persona WHERE glpi_user_id IS NOT NULL`,
    );

    return new Set(
      rows
        .map((row) => Number(row.glpi_user_id))
        .filter((id) => Number.isFinite(id) && id > 0),
    );
  }

  /**
   * Cuenta visitas activas o programadas asociadas a una persona.
   * @param personaId - ID de la persona.
   * @returns Cantidad de visitas abiertas.
   */
  async countActiveVisitas(personaId: number): Promise<number> {
    const rows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM public.visita
       WHERE persona_id = $1
         AND estado IN ('programada', 'activa')`,
      [personaId],
    );

    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Inserta una nueva persona en Postgres.
   * @param input - Datos normalizados de creación.
   * @returns Fila de la persona creada.
   */
  async create(input: CreatePersonaInput): Promise<PersonaRow> {
    const rows = await this.postgres.query<PersonaRow>(
      `INSERT INTO public.persona (
          nombre,
          documento,
          empresa,
          email,
          telefono,
          glpi_user_id,
          activo
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${PERSONA_SELECT_COLUMNS}`,
      [
        input.nombre,
        input.documento,
        input.empresa,
        input.email,
        input.telefono,
        input.glpiUserId,
        input.activo,
      ],
    );

    return rows[0];
  }

  /**
   * Actualiza parcialmente una persona existente.
   * @param id - ID de la persona a modificar.
   * @param input - Campos a persistir.
   * @returns Fila actualizada o `null` si no existe.
   */
  async update(id: number, input: UpdatePersonaInput): Promise<PersonaRow | null> {
    const assignments: string[] = [];
    const params: unknown[] = [];

    const setField = (column: string, value: unknown): void => {
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    };

    if (input.nombre !== undefined) setField("nombre", input.nombre);
    if (input.documento !== undefined) setField("documento", input.documento);
    if (input.empresa !== undefined) setField("empresa", input.empresa);
    if (input.email !== undefined) setField("email", input.email);
    if (input.telefono !== undefined) setField("telefono", input.telefono);
    if (input.glpiUserId !== undefined) setField("glpi_user_id", input.glpiUserId);
    if (input.activo !== undefined) setField("activo", input.activo);

    if (assignments.length === 0) {
      return this.findById(id);
    }

    assignments.push("updated_at = now()");
    params.push(id);

    const rows = await this.postgres.query<PersonaRow>(
      `UPDATE public.persona
       SET ${assignments.join(", ")}
       WHERE id = $${params.length}
       RETURNING ${PERSONA_SELECT_COLUMNS}`,
      params,
    );

    return rows[0] ?? null;
  }

  /**
   * Desactiva una persona estableciendo `activo = false`.
   * @param id - ID de la persona.
   * @returns Fila actualizada o `null` si no existe.
   */
  async softDelete(id: number): Promise<PersonaRow | null> {
    const rows = await this.postgres.query<PersonaRow>(
      `UPDATE public.persona
       SET activo = false, updated_at = now()
       WHERE id = $1
       RETURNING ${PERSONA_SELECT_COLUMNS}`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Elimina permanentemente una persona de la base de datos.
   * @param id - ID de la persona.
   * @returns ID eliminado como número o `null` si no existía.
   */
  async hardDelete(id: number): Promise<number | null> {
    const rows = await this.postgres.query<{ id: string }>(
      `DELETE FROM public.persona WHERE id = $1 RETURNING id`,
      [id],
    );

    const deletedId = rows[0]?.id;
    return deletedId != null ? Number(deletedId) : null;
  }

  /**
   * Obtiene el blob de foto de una persona.
   * @param id - ID de la persona.
   * @returns Buffer y MIME type o `null` si no hay foto.
   */
  async findPhotoById(id: number): Promise<PersonaPhotoRow | null> {
    const rows = await this.postgres.query<PersonaPhotoRow>(
      `SELECT foto, foto_mime_type
       FROM public.persona
       WHERE id = $1
         AND foto IS NOT NULL`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Persiste o reemplaza la foto de una persona.
   * @param id - ID de la persona.
   * @param foto - Imagen procesada.
   * @param mimeType - MIME type final de la imagen.
   * @returns Fila actualizada o `null` si no existe la persona.
   */
  async updatePhoto(id: number, foto: Buffer, mimeType: string): Promise<PersonaRow | null> {
    const rows = await this.postgres.query<PersonaRow>(
      `UPDATE public.persona
       SET foto = $1,
           foto_mime_type = $2,
           updated_at = now()
       WHERE id = $3
       RETURNING ${PERSONA_SELECT_COLUMNS}`,
      [foto, mimeType, id],
    );

    return rows[0] ?? null;
  }

  /**
   * Elimina la foto almacenada de una persona.
   * @param id - ID de la persona.
   * @returns Fila actualizada o `null` si no existe la persona.
   */
  async clearPhoto(id: number): Promise<PersonaRow | null> {
    const rows = await this.postgres.query<PersonaRow>(
      `UPDATE public.persona
       SET foto = NULL,
           foto_mime_type = NULL,
           updated_at = now()
       WHERE id = $1
       RETURNING ${PERSONA_SELECT_COLUMNS}`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Construye cláusula WHERE con filtros parametrizados.
   * @param filters - Filtros del listado.
   * @returns SQL WHERE y parámetros.
   */
  private buildWhereClause(filters: PersonaListFilters): { whereSql: string; params: unknown[] } {
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
    addIlike("documento", filters.documento);
    addIlike("empresa", filters.empresa);

    const search = filters.search?.trim();
    if (search) {
      params.push(`%${search}%`);
      const ilikeParam = params.length;
      const searchConditions = [
        `nombre ILIKE $${ilikeParam}`,
        `documento ILIKE $${ilikeParam}`,
        `empresa ILIKE $${ilikeParam}`,
        `email ILIKE $${ilikeParam}`,
      ];

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
  private buildOrderClause(filters: PersonaListFilters): string {
    if (!filters.sortBy) {
      return "ORDER BY nombre ASC, id ASC";
    }

    const expression = PERSONA_SORT_EXPRESSIONS[filters.sortBy];
    if (!expression) {
      return "ORDER BY nombre ASC, id ASC";
    }

    const direction: PersonaSortOrder = filters.sortOrder === "desc" ? "desc" : "asc";
    return `ORDER BY ${expression} ${direction.toUpperCase()}, id ASC`;
  }
}
