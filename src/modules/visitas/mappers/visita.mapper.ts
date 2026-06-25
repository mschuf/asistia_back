/**
 * @file visita.mapper.ts
 * @description Mapea filas SQL de visitas a DTOs de respuesta de la API.
 */
import { isVisitaTarjetaColor } from "../domain/visita-tarjeta-color";
import { VISITA_ZONA, type VisitaZona } from "../domain/visita-zona";
import type { VisitaResponseDto } from "../dto/visita.response.dto";
import type { VisitaListRow, VisitaRow } from "../visitas.types";

/**
 * Normaliza el JSONB de zonas permitidas a un arreglo de zonas válidas.
 * @param value - Valor crudo de Postgres.
 * @returns Arreglo de zonas permitidas.
 */
function parseZonasPermitidas(value: unknown): VisitaZona[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is VisitaZona =>
    typeof item === "string" && (VISITA_ZONA as readonly string[]).includes(item),
  );
}

/**
 * Convierte una fila de Postgres en DTO de respuesta.
 * @param row - Fila cruda de `public.prt_visita` con datos de prt_persona.
 * @returns DTO listo para serializar en HTTP.
 */
export function mapVisitaRowToResponse(row: VisitaListRow | (VisitaRow & Partial<VisitaListRow>)): VisitaResponseDto {
  return {
    id: Number(row.id),
    personaId: Number(row.persona_id),
    visitante: row.visitante ?? "",
    hasFoto: Boolean(row.has_foto),
    hasVisitaFoto: Boolean(row.has_visita_foto),
    documento: row.documento ?? "",
    empresa: row.empresa ?? null,
    motivo: row.motivo,
    motivoVisitaId: row.motivo_visita_id != null ? Number(row.motivo_visita_id) : null,
    responsableNombre: row.responsable_nombre,
    estado: row.estado,
    estadoSeguimiento: row.estado_seguimiento,
    zonasPermitidas: parseZonasPermitidas(row.zonas_permitidas),
    credencialNumero: row.credencial_numero,
    tarjetaColor: isVisitaTarjetaColor(row.tarjeta_color) ? row.tarjeta_color : null,
    entradaAt: row.entrada_at ? new Date(row.entrada_at).toISOString() : null,
    salidaAt: row.salida_at ? new Date(row.salida_at).toISOString() : null,
    observaciones: row.observaciones,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
