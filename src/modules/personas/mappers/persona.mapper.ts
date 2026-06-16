/**
 * @file persona.mapper.ts
 * @description Mapea filas SQL de personas a DTOs de respuesta de la API.
 */
import type { PersonaResponseDto } from "../dto/persona.response.dto";
import type { PersonaRow } from "../personas.types";

/**
 * Convierte una fila de Postgres en DTO de respuesta.
 * @param row - Fila cruda de `public.persona`.
 * @returns DTO listo para serializar en HTTP.
 */
export function mapPersonaRowToResponse(row: PersonaRow): PersonaResponseDto {
  return {
    id: Number(row.id),
    nombre: row.nombre,
    documento: row.documento,
    empresa: row.empresa,
    email: row.email,
    telefono: row.telefono,
    glpiUserId: row.glpi_user_id != null ? Number(row.glpi_user_id) : null,
    activo: row.activo,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
