/**
 * @file personas.sql-repository.ts
 * @description Acceso SQL a la tabla `public.prt_persona` con paginación, filtros y orden.
 */
import { Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../../common/dto/pagination.dto";
import { PostgresService } from "../../postgres/postgres.service";
import type {
  CreatePersonaInput,
  PersonaListFilters,
  PersonaPhotoRow,
  PersonaRow,
  UpdateUltimosVisitaPersonaInput,
  UpdatePersonaInput,
} from "../personas.types";
import type { PersonaSortBy, PersonaSortOrder } from "../dto/list-personas-query.dto";

const PERSONA_SORT_EXPRESSIONS: Record<PersonaSortBy, string> = {
  id: "p.id",
  nombre: "p.nombre",
  documento: "p.documento",
  proveedorNombre: "prov.nombre",
  createdAt: "p.created_at",
};

const PERSONA_SELECT_COLUMNS = `
  p.id,
  p.nombre,
  p.documento,
  p.proveedor_id,
  prov.nombre AS proveedor_nombre,
  prov.activo AS proveedor_activo,
  p.email,
  p.telefono,
  p.activo,
  (p.foto IS NOT NULL) AS has_foto,
  p.ultimo_motivo,
  p.ultimo_responsable,
  p.created_at,
  p.updated_at
`;

const PERSONA_FROM_JOIN = `
  FROM public.prt_persona p
  INNER JOIN public.prt_proveedor prov ON prov.id = p.proveedor_id
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
      `SELECT COUNT(*)::text AS total ${PERSONA_FROM_JOIN} ${whereSql}`,
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
       ${PERSONA_FROM_JOIN}
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
       ${PERSONA_FROM_JOIN}
       WHERE p.id = $1`,
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
       ${PERSONA_FROM_JOIN}
       WHERE p.documento = $1`,
      [documento],
    );

    return rows[0] ?? null;
  }

  /**
   * Cuenta visitas asociadas a una persona.
   * @param personaId - ID de la persona.
   * @returns Cantidad de visitas vinculadas.
   */
  async countVisitas(personaId: number): Promise<number> {
    const rows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM public.prt_visita
       WHERE persona_id = $1`,
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
    const rows = await this.postgres.query<{ id: string }>(
      `INSERT INTO public.prt_persona (
          nombre,
          documento,
          proveedor_id,
          email,
          telefono,
          activo
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        input.nombre,
        input.documento,
        input.proveedorId,
        input.email,
        input.telefono,
        input.activo,
      ],
    );

    const created = await this.findById(Number(rows[0]!.id));
    return created!;
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
    if (input.proveedorId !== undefined) setField("proveedor_id", input.proveedorId);
    if (input.email !== undefined) setField("email", input.email);
    if (input.telefono !== undefined) setField("telefono", input.telefono);
    if (input.activo !== undefined) setField("activo", input.activo);

    if (assignments.length === 0) {
      return this.findById(id);
    }

    assignments.push("updated_at = now()");
    params.push(id);

    const rows = await this.postgres.query<{ id: string }>(
      `UPDATE public.prt_persona
       SET ${assignments.join(", ")}
       WHERE id = $${params.length}
       RETURNING id`,
      params,
    );

    if (!rows[0]) {
      return null;
    }

    return this.findById(Number(rows[0].id));
  }

  /**
   * Desactiva una persona estableciendo `activo = false`.
   * @param id - ID de la persona.
   * @returns Fila actualizada o `null` si no existe.
   */
  async softDelete(id: number): Promise<PersonaRow | null> {
    const rows = await this.postgres.query<{ id: string }>(
      `UPDATE public.prt_persona
       SET activo = false, updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [id],
    );

    if (!rows[0]) {
      return null;
    }

    return this.findById(Number(rows[0].id));
  }

  /**
   * Elimina permanentemente una persona de la base de datos.
   * @param id - ID de la persona.
   * @returns ID eliminado como número o `null` si no existía.
   */
  async hardDelete(id: number): Promise<number | null> {
    const rows = await this.postgres.query<{ id: string }>(
      `DELETE FROM public.prt_persona WHERE id = $1 RETURNING id`,
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
       FROM public.prt_persona
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
    const rows = await this.postgres.query<{ id: string }>(
      `UPDATE public.prt_persona
       SET foto = $1,
           foto_mime_type = $2,
           updated_at = now()
       WHERE id = $3
       RETURNING id`,
      [foto, mimeType, id],
    );

    if (!rows[0]) {
      return null;
    }

    return this.findById(Number(rows[0].id));
  }

  /**
   * Actualiza los últimos IDs usados por una persona al crear una visita.
   * @param id - ID de la persona.
   * @param input - IDs de motivo y responsable seleccionados.
   * @returns Fila actualizada o `null` si no existe.
   */
  async updateUltimosVisita(
    id: number,
    input: UpdateUltimosVisitaPersonaInput,
  ): Promise<PersonaRow | null> {
    const rows = await this.postgres.query<{ id: string }>(
      `UPDATE public.prt_persona
       SET ultimo_motivo = $1,
           ultimo_responsable = $2,
           updated_at = now()
       WHERE id = $3
       RETURNING id`,
      [input.ultimoMotivo, input.ultimoResponsable, id],
    );

    if (!rows[0]) {
      return null;
    }

    return this.findById(Number(rows[0].id));
  }

  /**
   * Elimina la foto almacenada de una persona.
   * @param id - ID de la persona.
   * @returns Fila actualizada o `null` si no existe la persona.
   */
  async clearPhoto(id: number): Promise<PersonaRow | null> {
    const rows = await this.postgres.query<{ id: string }>(
      `UPDATE public.prt_persona
       SET foto = NULL,
           foto_mime_type = NULL,
           updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [id],
    );

    if (!rows[0]) {
      return null;
    }

    return this.findById(Number(rows[0].id));
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
      whereClauses.push(`p.activo = $${params.length}`);
    }

    if (filters.proveedorId !== undefined) {
      params.push(filters.proveedorId);
      whereClauses.push(`p.proveedor_id = $${params.length}`);
    }

    addIlike("p.nombre", filters.nombre);
    addIlike("p.documento", filters.documento);
    addIlike("prov.nombre", filters.proveedor);

    const search = filters.search?.trim();
    if (search) {
      params.push(`%${search}%`);
      const ilikeParam = params.length;
      const searchConditions = [
        `p.nombre ILIKE $${ilikeParam}`,
        `p.documento ILIKE $${ilikeParam}`,
        `prov.nombre ILIKE $${ilikeParam}`,
        `p.email ILIKE $${ilikeParam}`,
      ];

      const parsedId = Number.parseInt(search, 10);
      if (Number.isFinite(parsedId) && parsedId > 0 && String(parsedId) === search) {
        params.push(parsedId);
        searchConditions.push(`p.id = $${params.length}`);
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
      return "ORDER BY p.id DESC";
    }

    const expression = PERSONA_SORT_EXPRESSIONS[filters.sortBy];
    if (!expression) {
      return "ORDER BY p.id DESC";
    }

    const direction: PersonaSortOrder = filters.sortOrder === "desc" ? "desc" : "asc";
    return `ORDER BY ${expression} ${direction.toUpperCase()}, p.id ASC`;
  }
}
