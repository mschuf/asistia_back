/**
 * @file personas.types.ts
 * @description Tipos de fila Postgres e inputs de dominio para el módulo de personas.
 */
import type { QueryResultRow } from "pg";
import type { PersonaSortBy, PersonaSortOrder } from "./dto/list-personas-query.dto";

/** Fila de la tabla `public.prt_persona` con JOIN a proveedor. */
export interface PersonaRow extends QueryResultRow {
  id: string;
  nombre: string;
  documento: string;
  proveedor_id: string;
  proveedor_nombre: string;
  proveedor_activo: boolean;
  email: string | null;
  telefono: string | null;
  activo: boolean;
  has_foto: boolean;
  ultimo_motivo: string | null;
  ultimo_responsable: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Fila con blob de foto para descarga. */
export interface PersonaPhotoRow extends QueryResultRow {
  foto: Buffer;
  foto_mime_type: string;
}

/** Filtros de listado paginado de personas en el repositorio SQL. */
export interface PersonaListFilters {
  page: number;
  limit: number;
  search?: string;
  nombre?: string;
  documento?: string;
  proveedor?: string;
  proveedorId?: number;
  activo?: boolean;
  sortBy?: PersonaSortBy;
  sortOrder?: PersonaSortOrder;
}

/** Payload de creación de persona normalizado para el repositorio. */
export interface CreatePersonaInput {
  nombre: string;
  documento: string;
  proveedorId: number;
  email: string | null;
  telefono: string | null;
  activo: boolean;
}

/** Payload parcial de actualización de persona para el repositorio. */
export interface UpdatePersonaInput {
  nombre?: string;
  documento?: string;
  proveedorId?: number;
  email?: string | null;
  telefono?: string | null;
  activo?: boolean;
}

/** Últimos valores usados al crear una visita para la persona. */
export interface UpdateUltimosVisitaPersonaInput {
  ultimoMotivo: number;
  ultimoResponsable: number;
}

/** Nombre del proveedor placeholder creado en migración para datos históricos. */
export const PROVEEDOR_SIN_ASIGNAR_NOMBRE = "Sin asignar";
