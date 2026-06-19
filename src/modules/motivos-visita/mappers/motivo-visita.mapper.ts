/**
 * @file motivo-visita.mapper.ts
 * @description Mapea filas SQL de motivos de visita a DTOs de respuesta de la API.
 */
import type { MotivoVisitaResponseDto } from "../dto/motivo-visita.response.dto";
import type { MotivoVisitaRow } from "../motivos-visita.types";

/**
 * Convierte una fila de Postgres en DTO de respuesta.
 * @param row - Fila cruda de `public.prt_motivo_visita`.
 * @returns DTO listo para serializar en HTTP.
 */
export function mapMotivoVisitaRowToResponse(row: MotivoVisitaRow): MotivoVisitaResponseDto {
  return {
    id: Number(row.id),
    nombre: row.nombre,
    activo: row.activo,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
