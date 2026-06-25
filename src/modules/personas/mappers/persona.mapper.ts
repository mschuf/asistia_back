/**
 * @file persona.mapper.ts
 * @description Mapea filas SQL de personas a DTOs de respuesta de la API.
 */
import type { PersonaResponseDto } from "../dto/persona.response.dto";
import type { PersonaRow } from "../personas.types";

/**
 * Convierte una fila de Postgres en DTO de respuesta.
 * @param row - Fila cruda de `public.prt_persona` con JOIN a proveedor.
 * @returns DTO listo para serializar en HTTP.
 */
export function mapPersonaRowToResponse(row: PersonaRow): PersonaResponseDto {
  return {
    id: Number(row.id),
    nombre: row.nombre,
    documento: row.documento,
    proveedorId: Number(row.proveedor_id),
    proveedorNombre: row.proveedor_nombre,
    email: row.email,
    telefono: row.telefono,
    activo: row.activo,
    hasFoto: Boolean(row.has_foto),
    ultimoMotivo: row.ultimo_motivo != null ? Number(row.ultimo_motivo) : null,
    ultimoResponsable: row.ultimo_responsable != null ? Number(row.ultimo_responsable) : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
