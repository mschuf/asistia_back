/**
 * @file motivos-visita.types.ts
 * @description Tipos de fila Postgres e inputs de dominio para el módulo de motivos de visita.
 */
import type { QueryResultRow } from "pg";
import type { MotivoVisitaSortBy, MotivoVisitaSortOrder } from "./dto/list-motivos-visita-query.dto";

/** Fila de la tabla `public.prt_motivo_visita` tal como la devuelve Postgres. */
export interface MotivoVisitaRow extends QueryResultRow {
  id: string;
  nombre: string;
  activo: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Filtros de listado paginado de motivos de visita en el repositorio SQL. */
export interface MotivoVisitaListFilters {
  page: number;
  limit: number;
  search?: string;
  nombre?: string;
  activo?: boolean;
  sortBy?: MotivoVisitaSortBy;
  sortOrder?: MotivoVisitaSortOrder;
}

/** Payload de creación de motivo de visita normalizado para el repositorio. */
export interface CreateMotivoVisitaInput {
  nombre: string;
  activo: boolean;
}

/** Payload parcial de actualización de motivo de visita para el repositorio. */
export interface UpdateMotivoVisitaInput {
  nombre?: string;
  activo?: boolean;
}
