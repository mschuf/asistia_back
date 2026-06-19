/**
 * @file visita-report.mapper.ts
 * @description Mapea filas SQL de visitas a DTOs del reporte superadmin de portería.
 */
import { isVisitaTarjetaColor } from "../../visitas/domain/visita-tarjeta-color";
import { VISITA_ZONA, type VisitaZona } from "../../visitas/domain/visita-zona";
import type { VisitaReportLogResponseDto } from "../dto/visita-report.response.dto";
import type { VisitaListRow } from "../../visitas/visitas.types";

const ZONA_LABELS: Record<VisitaZona, string> = {
  administración: "Administración",
  fábrica: "Fábrica",
};

const TARJETA_LABELS = {
  rojo: "Rojo",
  amarillo: "Amarillo",
  verde: "Verde",
} as const;

const ESTADO_LABELS = {
  programada: "Programada",
  activa: "Activa",
  sin_salida: "Sin salida",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
} as const;

/**
 * Normaliza el JSONB de zonas permitidas a un arreglo de zonas válidas.
 * @param value - Valor crudo de Postgres.
 * @returns Arreglo de zonas permitidas.
 */
function parseZonasPermitidas(value: unknown): VisitaZona[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is VisitaZona =>
      typeof item === "string" && (VISITA_ZONA as readonly string[]).includes(item),
  );
}

/**
 * Formatea zonas como texto legible separado por comas.
 * @param zonas - Zonas permitidas.
 * @returns Etiquetas legibles unidas.
 */
export function formatVisitaReportZonas(zonas: VisitaZona[]): string {
  if (zonas.length === 0) return "—";
  return zonas.map((zona) => ZONA_LABELS[zona]).join(", ");
}

/**
 * Formatea color de tarjeta como etiqueta legible.
 * @param value - Color crudo de Postgres.
 * @returns Etiqueta o null.
 */
export function formatVisitaReportTarjeta(value: string | null): string | null {
  if (!value || !isVisitaTarjetaColor(value)) return null;
  return TARJETA_LABELS[value];
}

/**
 * Formatea estado de visita como etiqueta legible.
 * @param estado - Estado crudo.
 * @returns Etiqueta legible.
 */
export function formatVisitaReportEstado(estado: VisitaReportLogResponseDto["estado"]): string {
  return ESTADO_LABELS[estado];
}

/**
 * Convierte una fila de Postgres en DTO del reporte de visitas.
 * @param row - Fila cruda con datos de persona.
 * @returns DTO listo para serializar en HTTP o exportación.
 */
export function mapVisitaListRowToReportResponse(row: VisitaListRow): VisitaReportLogResponseDto {
  const zonas = parseZonasPermitidas(row.zonas_permitidas);

  return {
    entradaAt: row.entrada_at ? new Date(row.entrada_at).toISOString() : null,
    salidaAt: row.salida_at ? new Date(row.salida_at).toISOString() : null,
    visitante: row.visitante ?? "",
    documento: row.documento ?? "",
    empresa: row.empresa ?? null,
    motivo: row.motivo,
    responsable: row.responsable_nombre,
    estado: row.estado,
    zonas: formatVisitaReportZonas(zonas),
    tarjeta: formatVisitaReportTarjeta(row.tarjeta_color),
    credencial: row.credencial_numero,
  };
}
