/**
 * @file prompt.mapper.ts
 * @description Mapea filas SQL de prompts a DTOs de respuesta de la API.
 */
import type { PromptRow } from "../prompts.types";
import type { PromptResponseDto } from "../dto/prompt.response.dto";

/**
 * Normaliza fechas de Postgres a cadena ISO-8601.
 * @param value - Fecha como `Date` o cadena desde SQL.
 * @returns Representación ISO en UTC.
 */
function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Convierte una fila de Postgres en DTO de respuesta de prompt.
 * @param row - Fila cruda de `public.prompt` con join a empresa.
 * @returns DTO listo para serializar en HTTP.
 */
export function mapPromptRowToResponse(row: PromptRow): PromptResponseDto {
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    companyName: row.company_name,
    systemInstruction: row.system_instruction,
    promptTemplate: row.prompt_template,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}
