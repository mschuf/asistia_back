/**
 * @file prompts.types.ts
 * @description Tipos de fila Postgres e inputs de dominio para el módulo de prompts.
 */
import type { QueryResultRow } from "pg";

/** Fila de `public.prompt` con nombre de empresa unido por JOIN. */
export interface PromptRow extends QueryResultRow {
  id: string;
  company_id: string;
  company_name: string;
  system_instruction: string;
  prompt_template: string;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Filtros de listado paginado de prompts en el repositorio SQL. */
export interface PromptListFilters {
  page: number;
  limit: number;
  search?: string;
  companyId?: number;
}

/** Payload de creación de prompt normalizado para el repositorio. */
export interface CreatePromptInput {
  companyId: number;
  systemInstruction: string;
  promptTemplate: string;
}

/** Payload parcial de actualización de prompt para el repositorio. */
export interface UpdatePromptInput {
  companyId?: number;
  systemInstruction?: string;
  promptTemplate?: string;
}
