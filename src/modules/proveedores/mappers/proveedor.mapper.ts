/**
 * @file proveedor.mapper.ts
 * @description Mapea filas SQL de proveedores a DTOs de respuesta de la API.
 */
import type { ProveedorResponseDto } from "../dto/proveedor.response.dto";
import type { ProveedorRow } from "../proveedores.types";

/**
 * Convierte una fila de Postgres en DTO de respuesta.
 * @param row - Fila cruda de `public.prt_proveedor`.
 * @returns DTO listo para serializar en HTTP.
 */
export function mapProveedorRowToResponse(row: ProveedorRow): ProveedorResponseDto {
  return {
    id: Number(row.id),
    nombre: row.nombre,
    ruc: row.ruc,
    activo: row.activo,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
