/**
 * @file personas.types.ts
 * @description Tipos de fila Postgres e inputs de dominio para el módulo de personas.
 */
import type { QueryResultRow } from "pg";
import type { PersonaSortBy, PersonaSortOrder } from "./dto/list-personas-query.dto";

/** Fila de la tabla `public.persona` tal como la devuelve Postgres. */
export interface PersonaRow extends QueryResultRow {
  id: string;
  nombre: string;
  documento: string;
  empresa: string | null;
  email: string | null;
  telefono: string | null;
  glpi_user_id: string | null;
  activo: boolean;
  has_foto: boolean;
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
  empresa?: string;
  activo?: boolean;
  sortBy?: PersonaSortBy;
  sortOrder?: PersonaSortOrder;
}

/** Payload de creación de persona normalizado para el repositorio. */
export interface CreatePersonaInput {
  nombre: string;
  documento: string;
  empresa: string | null;
  email: string | null;
  telefono: string | null;
  glpiUserId: number | null;
  activo: boolean;
}

/** Payload parcial de actualización de persona para el repositorio. */
export interface UpdatePersonaInput {
  nombre?: string;
  documento?: string;
  empresa?: string | null;
  email?: string | null;
  telefono?: string | null;
  glpiUserId?: number | null;
  activo?: boolean;
}
