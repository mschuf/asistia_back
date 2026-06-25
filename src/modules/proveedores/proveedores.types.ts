/**
 * @file proveedores.types.ts
 * @description Tipos de fila Postgres e inputs de dominio para el módulo de proveedores.
 */
import type { QueryResultRow } from "pg";
import type { ProveedorSortBy, ProveedorSortOrder } from "./dto/list-proveedores-query.dto";

/** Fila de la tabla `public.prt_proveedor` tal como la devuelve Postgres. */
export interface ProveedorRow extends QueryResultRow {
  id: string;
  nombre: string;
  ruc: string;
  activo: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Filtros de listado paginado de proveedores en el repositorio SQL. */
export interface ProveedorListFilters {
  page: number;
  limit: number;
  search?: string;
  nombre?: string;
  ruc?: string;
  activo?: boolean;
  sortBy?: ProveedorSortBy;
  sortOrder?: ProveedorSortOrder;
}

/** Payload de creación de proveedor normalizado para el repositorio. */
export interface CreateProveedorInput {
  nombre: string;
  ruc: string;
  activo: boolean;
}

/** Payload parcial de actualización de proveedor para el repositorio. */
export interface UpdateProveedorInput {
  nombre?: string;
  ruc?: string;
  activo?: boolean;
}
