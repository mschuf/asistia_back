/**
 * @file visitas.types.ts
 * @description Tipos de fila Postgres e inputs de dominio para el módulo de visitas.
 */
import type { QueryResultRow } from "pg";
import type { VisitaEstado } from "./domain/visita-estado";
import type { VisitaSeguimiento } from "./domain/visita-seguimiento";
import type { VisitaSortBy, VisitaSortOrder } from "./dto/list-visitas-query.dto";

/** Fila de la tabla `public.visita` tal como la devuelve Postgres. */
export interface VisitaRow extends QueryResultRow {
  id: string;
  persona_id: string;
  motivo: string;
  responsable_nombre: string;
  estado: VisitaEstado;
  estado_seguimiento: VisitaSeguimiento | null;
  zonas_permitidas: string[] | unknown;
  credencial_numero: string | null;
  tarjeta_color: string | null;
  entrada_at: Date | string | null;
  salida_at: Date | string | null;
  observaciones: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Fila de visita con datos de persona para listados. */
export interface VisitaListRow extends VisitaRow {
  visitante: string;
  documento: string;
  empresa: string | null;
}

/** Filtros de listado paginado de visitas en el repositorio SQL. */
export interface VisitaListFilters {
  page: number;
  limit: number;
  search?: string;
  visitante?: string;
  documento?: string;
  empresa?: string;
  motivo?: string;
  responsable?: string;
  estado?: VisitaEstado;
  personaId?: number;
  entradaFrom?: string;
  entradaTo?: string;
  includeProgramadasSinEntrada?: boolean;
  sortBy?: VisitaSortBy;
  sortOrder?: VisitaSortOrder;
}

/** Payload de creación de visita normalizado para el repositorio. */
export interface CreateVisitaInput {
  personaId: number;
  motivo: string;
  responsableNombre: string;
  estado: VisitaEstado;
  estadoSeguimiento: VisitaSeguimiento | null;
  zonasPermitidas: string[];
  credencialNumero: string | null;
  tarjetaColor: string | null;
  entradaAt: Date | null;
  salidaAt: Date | null;
  observaciones: string | null;
}

/** Fila de agregados de métricas de visitas desde Postgres. */
export interface VisitaMetricsRow extends QueryResultRow {
  month_visits: string;
  day_visits: string;
  plant_visitors: string;
  admin_visitors: string;
}

/** Payload parcial de actualización de visita para el repositorio. */
export interface UpdateVisitaInput {
  personaId?: number;
  motivo?: string;
  responsableNombre?: string;
  estado?: VisitaEstado;
  estadoSeguimiento?: VisitaSeguimiento | null;
  zonasPermitidas?: string[];
  credencialNumero?: string | null;
  tarjetaColor?: string | null;
  entradaAt?: Date | null;
  salidaAt?: Date | null;
  observaciones?: string | null;
}
