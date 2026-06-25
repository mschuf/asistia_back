/**
 * @file visitas.sql-repository.ts
 * @description Acceso SQL a la tabla `public.prt_visita` con JOIN a prt_persona, filtros y orden.
 */
import { Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../../common/dto/pagination.dto";
import { PostgresService } from "../../postgres/postgres.service";
import type {
  CreateVisitaInput,
  UpdateVisitaInput,
  VisitaListFilters,
  VisitaListRow,
  VisitaMetricsRange,
  VisitaMetricsRow,
  VisitaPhotoRow,
  VisitaRow,
} from "../visitas.types";
import type { VisitaSortBy, VisitaSortOrder } from "../dto/list-visitas-query.dto";
import type { VisitaTarjetaColor } from "../domain/visita-tarjeta-color";

const VISITA_SORT_EXPRESSIONS: Record<VisitaSortBy, string> = {
  id: "v.id",
  visitante: "p.nombre",
  documento: "p.documento",
  empresa: "prov.nombre",
  motivo: "v.motivo",
  responsable: "v.responsable_nombre",
  estado: "v.estado",
  entradaAt: "v.entrada_at",
  salidaAt: "v.salida_at",
};

const VISITA_SELECT_COLUMNS = `
  v.id,
  v.persona_id,
  v.motivo_visita_id,
  v.motivo,
  v.responsable_nombre,
  v.estado,
  v.estado_seguimiento,
  v.zonas_permitidas,
  v.credencial_numero,
  v.tarjeta_color,
  v.entrada_at,
  v.salida_at,
  v.observaciones,
  v.created_at,
  v.updated_at,
  p.nombre AS visitante,
  p.documento,
  prov.nombre AS empresa,
  (p.foto IS NOT NULL) AS has_foto,
  (v.foto IS NOT NULL) AS has_visita_foto
`;

const VISITA_FROM_JOIN = `
  FROM public.prt_visita v
  INNER JOIN public.prt_persona p ON p.id = v.persona_id
  INNER JOIN public.prt_proveedor prov ON prov.id = p.proveedor_id
`;

/** Columnas de visita actualizada vía RETURNING (alias `u`) con joins de persona. */
const VISITA_UPDATED_SELECT_COLUMNS = `
  u.id,
  u.persona_id,
  u.motivo_visita_id,
  u.motivo,
  u.responsable_nombre,
  u.estado,
  u.estado_seguimiento,
  u.zonas_permitidas,
  u.credencial_numero,
  u.tarjeta_color,
  u.entrada_at,
  u.salida_at,
  u.observaciones,
  u.created_at,
  u.updated_at,
  p.nombre AS visitante,
  p.documento,
  prov.nombre AS empresa,
  (p.foto IS NOT NULL) AS has_foto,
  (u.foto IS NOT NULL) AS has_visita_foto
`;

/** Repositorio Postgres para operaciones CRUD de visitas. */
@Injectable()
export class VisitasSqlRepository {
  /** Inyecta el servicio de Postgres. */
  constructor(private readonly postgres: PostgresService) {}

  /**
   * Lista visitas paginadas aplicando filtros y orden.
   * @param filters - Paginación, búsqueda y filtros por columna.
   * @returns Filas paginadas y metadatos de paginación.
   */
  async findAll(filters: VisitaListFilters): Promise<PaginatedResult<VisitaListRow>> {
    const { whereSql, params } = this.buildWhereClause(filters);
    const countRows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total ${VISITA_FROM_JOIN} ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const offset = (filters.page - 1) * filters.limit;
    const orderSql = this.buildOrderClause(filters);

    const listParams = [...params, filters.limit, offset];
    const limitParam = listParams.length - 1;
    const offsetParam = listParams.length;

    const items = await this.postgres.query<VisitaListRow>(
      `SELECT ${VISITA_SELECT_COLUMNS}
       ${VISITA_FROM_JOIN}
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
   * Obtiene contadores agregados de visitas para las cards de Portería.
   * @param range - Rango de entrada_at y comienzo del último día del rango.
   * @returns Totales de visitas por período, último día y zonas activas.
   */
  async getMetrics(range: VisitaMetricsRange): Promise<VisitaMetricsRow> {
    const rows = await this.postgres.query<VisitaMetricsRow>(
      `SELECT
          COUNT(*) FILTER (
            WHERE entrada_at >= $1
              AND entrada_at <= $2
              AND estado <> 'cancelada'
          )::text AS month_visits,
          COUNT(*) FILTER (
            WHERE entrada_at >= $3
              AND entrada_at <= $2
              AND estado <> 'cancelada'
          )::text AS day_visits,
          COUNT(*) FILTER (
            WHERE estado = 'activa'
              AND entrada_at >= $1
              AND entrada_at <= $2
              AND (
                tarjeta_color = 'rojo'
                OR (
                  tarjeta_color IS NULL
                  AND zonas_permitidas @> '["administración"]'::jsonb
                  AND NOT zonas_permitidas @> '["fábrica"]'::jsonb
                )
              )
          )::text AS active_only_admin,
          COUNT(*) FILTER (
            WHERE estado = 'activa'
              AND entrada_at >= $1
              AND entrada_at <= $2
              AND (
                tarjeta_color = 'amarillo'
                OR (
                  tarjeta_color IS NULL
                  AND zonas_permitidas @> '["fábrica"]'::jsonb
                  AND NOT zonas_permitidas @> '["administración"]'::jsonb
                )
              )
          )::text AS active_only_factory,
          COUNT(*) FILTER (
            WHERE estado = 'activa'
              AND entrada_at >= $1
              AND entrada_at <= $2
              AND (
                tarjeta_color = 'verde'
                OR (
                  tarjeta_color IS NULL
                  AND zonas_permitidas @> '["administración"]'::jsonb
                  AND zonas_permitidas @> '["fábrica"]'::jsonb
                )
              )
          )::text AS active_both_zones,
          COUNT(*) FILTER (
            WHERE estado = 'sin_salida'
              AND entrada_at >= $1
              AND entrada_at < $3
          )::text AS active_stale_without_checkout
       FROM public.prt_visita`,
      [range.entradaFrom, range.entradaTo, range.lastDayStart],
    );

    return (
      rows[0] ?? {
        month_visits: "0",
        day_visits: "0",
        active_only_admin: "0",
        active_only_factory: "0",
        active_both_zones: "0",
        active_stale_without_checkout: "0",
      }
    );
  }

  /**
   * Busca una visita por identificador con datos de persona.
   * @param id - ID numérico de la visita.
   * @returns Fila encontrada o `null`.
   */
  async findById(id: number): Promise<VisitaListRow | null> {
    const rows = await this.postgres.query<VisitaListRow>(
      `SELECT ${VISITA_SELECT_COLUMNS}
       ${VISITA_FROM_JOIN}
       WHERE v.id = $1`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Busca una visita activa que use el color de tarjeta indicado.
   * @param tarjetaColor - Color de tarjeta a comprobar.
   * @param excludeVisitaId - ID de visita a excluir (p. ej. la que se está editando).
   * @returns Fila encontrada o `null` si la tarjeta está libre.
   */
  async findActiveByTarjetaColor(
    tarjetaColor: VisitaTarjetaColor,
    excludeVisitaId?: number,
  ): Promise<VisitaListRow | null> {
    const rows = await this.postgres.query<VisitaListRow>(
      `SELECT ${VISITA_SELECT_COLUMNS}
       ${VISITA_FROM_JOIN}
       WHERE v.estado IN ('activa', 'sin_salida')
         AND v.tarjeta_color = $1
         AND ($2::bigint IS NULL OR v.id <> $2)
       LIMIT 1`,
      [tarjetaColor, excludeVisitaId ?? null],
    );

    return rows[0] ?? null;
  }

  /**
   * Busca una visita activa que use el número de tarjeta indicado.
   * @param credencialNumero - Número de tarjeta a comprobar.
   * @param excludeVisitaId - ID de visita a excluir (p. ej. la que se está editando).
   * @returns Fila encontrada o `null` si el número está libre.
   */
  async findActiveByCredencialNumero(
    credencialNumero: string,
    excludeVisitaId?: number,
  ): Promise<VisitaListRow | null> {
    const normalized = credencialNumero.trim();
    if (!normalized) return null;

    const rows = await this.postgres.query<VisitaListRow>(
      `SELECT ${VISITA_SELECT_COLUMNS}
       ${VISITA_FROM_JOIN}
       WHERE v.estado IN ('activa', 'sin_salida')
         AND trim(v.credencial_numero) = $1
         AND ($2::bigint IS NULL OR v.id <> $2)
       LIMIT 1`,
      [normalized, excludeVisitaId ?? null],
    );

    return rows[0] ?? null;
  }

  /**
   * Busca una visita activa de la persona indicada en el día calendario dado.
   * @param personaId - ID de la persona visitante.
   * @param excludeVisitaId - ID de visita a excluir (p. ej. la que se está editando).
   * @param dayStart - Inicio inclusive del día local de referencia (`entrada_at >= dayStart`).
   * @param dayEnd - Fin exclusive del día local de referencia (`entrada_at < dayEnd`).
   * @returns Fila encontrada o `null` si la persona no tiene visita activa ese día.
   */
  async findActiveByPersonaId(
    personaId: number,
    excludeVisitaId?: number,
    dayStart?: Date,
    dayEnd?: Date,
  ): Promise<VisitaListRow | null> {
    const rows = await this.postgres.query<VisitaListRow>(
      `SELECT ${VISITA_SELECT_COLUMNS}
       ${VISITA_FROM_JOIN}
       WHERE v.estado = 'activa'
         AND v.persona_id = $1
         AND ($2::bigint IS NULL OR v.id <> $2)
         AND ($3::timestamptz IS NULL OR v.entrada_at >= $3::timestamptz)
         AND ($4::timestamptz IS NULL OR v.entrada_at < $4::timestamptz)
       LIMIT 1`,
      [personaId, excludeVisitaId ?? null, dayStart ?? null, dayEnd ?? null],
    );

    return rows[0] ?? null;
  }

  /**
   * Lista visitas activas candidatas a pasar a sin_salida (ingreso anterior al día actual).
   * @param startOfToday - Inicio del día calendario actual (hora local del servidor).
   * @returns Filas con estado activa y entrada_at anterior a hoy.
   */
  async findStaleCandidates(startOfToday: Date): Promise<VisitaListRow[]> {
    return this.postgres.query<VisitaListRow>(
      `SELECT ${VISITA_SELECT_COLUMNS}
       ${VISITA_FROM_JOIN}
       WHERE v.estado = 'activa'
         AND v.entrada_at IS NOT NULL
         AND v.entrada_at < $1::timestamptz`,
      [startOfToday],
    );
  }

  /**
   * Marca visitas activas con ingreso de día anterior como sin_salida.
   * @param startOfToday - Inicio del día calendario actual (hora local del servidor).
   * @returns Filas actualizadas con datos de persona.
   */
  async markStaleWithoutCheckout(startOfToday: Date): Promise<VisitaListRow[]> {
    return this.postgres.query<VisitaListRow>(
      `WITH updated AS (
          UPDATE public.prt_visita
          SET estado = 'sin_salida', updated_at = now()
          WHERE estado = 'activa'
            AND entrada_at IS NOT NULL
            AND entrada_at < $1::timestamptz
          RETURNING *
       )
       SELECT ${VISITA_UPDATED_SELECT_COLUMNS}
       FROM updated u
       INNER JOIN public.prt_persona p ON p.id = u.persona_id
       INNER JOIN public.prt_proveedor prov ON prov.id = p.proveedor_id`,
      [startOfToday],
    );
  }

  /**
   * Inserta una nueva visita en Postgres.
   * @param input - Datos normalizados de creación.
   * @returns Fila de la visita creada con datos de persona.
   */
  async create(input: CreateVisitaInput): Promise<VisitaListRow> {
    const rows = await this.postgres.query<VisitaRow>(
      `INSERT INTO public.prt_visita (
          persona_id,
          motivo_visita_id,
          motivo,
          responsable_nombre,
          estado,
          estado_seguimiento,
          zonas_permitidas,
          credencial_numero,
          tarjeta_color,
          entrada_at,
          salida_at,
          observaciones
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)
       RETURNING
          id,
          persona_id,
          motivo_visita_id,
          motivo,
          responsable_nombre,
          estado,
          estado_seguimiento,
          zonas_permitidas,
          credencial_numero,
          tarjeta_color,
          entrada_at,
          salida_at,
          observaciones,
          created_at,
          updated_at`,
      [
        input.personaId,
        input.motivoVisitaId,
        input.motivo,
        input.responsableNombre,
        input.estado,
        input.estadoSeguimiento,
        JSON.stringify(input.zonasPermitidas),
        input.credencialNumero,
        input.tarjetaColor,
        input.entradaAt,
        input.salidaAt,
        input.observaciones,
      ],
    );

    const created = rows[0];
    const withPersona = await this.findById(Number(created.id));
    if (!withPersona) {
      throw new Error(`Visita ${created.id} not found after insert`);
    }

    return withPersona;
  }

  /**
   * Actualiza parcialmente una visita existente.
   * @param id - ID de la visita a modificar.
   * @param input - Campos a persistir.
   * @returns Fila actualizada o `null` si no existe.
   */
  async update(id: number, input: UpdateVisitaInput): Promise<VisitaListRow | null> {
    const assignments: string[] = [];
    const params: unknown[] = [];

    const setField = (column: string, value: unknown): void => {
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    };

    if (input.personaId !== undefined) setField("persona_id", input.personaId);
    if (input.motivoVisitaId !== undefined) setField("motivo_visita_id", input.motivoVisitaId);
    if (input.motivo !== undefined) setField("motivo", input.motivo);
    if (input.responsableNombre !== undefined) setField("responsable_nombre", input.responsableNombre);
    if (input.estado !== undefined) setField("estado", input.estado);
    if (input.estadoSeguimiento !== undefined) setField("estado_seguimiento", input.estadoSeguimiento);
    if (input.zonasPermitidas !== undefined) {
      params.push(JSON.stringify(input.zonasPermitidas));
      assignments.push(`zonas_permitidas = $${params.length}::jsonb`);
    }
    if (input.credencialNumero !== undefined) setField("credencial_numero", input.credencialNumero);
    if (input.tarjetaColor !== undefined) setField("tarjeta_color", input.tarjetaColor);
    if (input.entradaAt !== undefined) setField("entrada_at", input.entradaAt);
    if (input.salidaAt !== undefined) setField("salida_at", input.salidaAt);
    if (input.observaciones !== undefined) setField("observaciones", input.observaciones);

    if (assignments.length === 0) {
      return this.findById(id);
    }

    assignments.push("updated_at = now()");
    params.push(id);

    const rows = await this.postgres.query<VisitaRow>(
      `UPDATE public.prt_visita
       SET ${assignments.join(", ")}
       WHERE id = $${params.length}
       RETURNING id`,
      params,
    );

    if (!rows[0]) return null;
    return this.findById(id);
  }

  /**
   * Elimina permanentemente una visita de la base de datos.
   * @param id - ID de la visita.
   * @returns Fila eliminada o `null` si no existía.
   */
  async hardDelete(id: number): Promise<VisitaRow | null> {
    const rows = await this.postgres.query<VisitaRow>(
      `DELETE FROM public.prt_visita
       WHERE id = $1
       RETURNING
          id,
          persona_id,
          motivo,
          responsable_nombre,
          estado,
          estado_seguimiento,
          zonas_permitidas,
          credencial_numero,
          tarjeta_color,
          entrada_at,
          salida_at,
          observaciones,
          created_at,
          updated_at`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Construye cláusula WHERE con filtros parametrizados.
   * @param filters - Filtros del listado.
   * @returns SQL WHERE y parámetros.
   */
  private buildWhereClause(filters: VisitaListFilters): { whereSql: string; params: unknown[] } {
    const params: unknown[] = [];
    const whereClauses: string[] = [];

    const addIlike = (column: string, value?: string): void => {
      const trimmed = value?.trim();
      if (!trimmed) return;
      params.push(`%${trimmed}%`);
      whereClauses.push(`${column} ILIKE $${params.length}`);
    };

    if (filters.personaId !== undefined) {
      params.push(filters.personaId);
      whereClauses.push(`v.persona_id = $${params.length}`);
    }

    if (filters.estado) {
      params.push(filters.estado);
      whereClauses.push(`v.estado = $${params.length}`);
    }

    if (
      filters.entradaFrom &&
      filters.entradaTo &&
      filters.includeProgramadasSinEntrada === true
    ) {
      params.push(filters.entradaFrom);
      const fromParam = params.length;
      params.push(filters.entradaTo);
      const toParam = params.length;
      whereClauses.push(
        `(
          (v.entrada_at >= $${fromParam}::timestamptz AND v.entrada_at <= $${toParam}::timestamptz)
          OR (
            v.entrada_at IS NULL
            AND v.estado = 'programada'
            AND v.created_at >= $${fromParam}::timestamptz
            AND v.created_at <= $${toParam}::timestamptz
          )
        )`,
      );
    } else {
      if (filters.entradaFrom) {
        params.push(filters.entradaFrom);
        whereClauses.push(`v.entrada_at >= $${params.length}::timestamptz`);
      }

      if (filters.entradaTo) {
        params.push(filters.entradaTo);
        whereClauses.push(`v.entrada_at <= $${params.length}::timestamptz`);
      }
    }

    addIlike("p.nombre", filters.visitante);
    addIlike("p.documento", filters.documento);
    addIlike("prov.nombre", filters.empresa);
    addIlike("v.motivo", filters.motivo);
    addIlike("v.responsable_nombre", filters.responsable);

    const search = filters.search?.trim();
    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(
        `(p.nombre ILIKE $${params.length}
          OR p.documento ILIKE $${params.length}
          OR prov.nombre ILIKE $${params.length}
          OR v.motivo ILIKE $${params.length}
          OR v.responsable_nombre ILIKE $${params.length})`,
      );
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    return { whereSql, params };
  }

  /**
   * Construye cláusula ORDER BY con whitelist de columnas.
   * @param filters - Filtros del listado incluyendo sort opcional.
   * @returns Fragmento SQL `ORDER BY ...`.
   */
  private buildOrderClause(filters: VisitaListFilters): string {
    if (!filters.sortBy) {
      return "ORDER BY v.entrada_at DESC NULLS LAST, v.id DESC";
    }

    const expression = VISITA_SORT_EXPRESSIONS[filters.sortBy];
    if (!expression) {
      return "ORDER BY v.entrada_at DESC NULLS LAST, v.id DESC";
    }

    const direction: VisitaSortOrder = filters.sortOrder === "asc" ? "asc" : "desc";
    const nulls = filters.sortBy === "entradaAt" || filters.sortBy === "salidaAt" ? " NULLS LAST" : "";
    return `ORDER BY ${expression} ${direction.toUpperCase()}${nulls}, v.id DESC`;
  }

  /**
   * Obtiene el blob de foto de una visita.
   * @param id - ID de la visita.
   * @returns Buffer y MIME type o `null` si no hay foto.
   */
  async findPhotoById(id: number): Promise<VisitaPhotoRow | null> {
    const rows = await this.postgres.query<VisitaPhotoRow>(
      `SELECT foto, foto_mime_type
       FROM public.prt_visita
       WHERE id = $1
         AND foto IS NOT NULL`,
      [id],
    );

    return rows[0] ?? null;
  }

  /**
   * Persiste o reemplaza la foto de una visita.
   * @param id - ID de la visita.
   * @param foto - Imagen procesada.
   * @param mimeType - MIME type final de la imagen.
   * @returns Fila actualizada con datos de persona o `null` si no existe la visita.
   */
  async updatePhoto(id: number, foto: Buffer, mimeType: string): Promise<VisitaListRow | null> {
    const rows = await this.postgres.query<{ id: string }>(
      `UPDATE public.prt_visita
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

    return this.findById(id);
  }
}
