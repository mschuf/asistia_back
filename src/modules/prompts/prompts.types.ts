import type { QueryResultRow } from "pg";

export interface PromptRow extends QueryResultRow {
  id: string;
  company_id: string;
  company_name: string;
  system_instruction: string;
  prompt_template: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface PromptListFilters {
  page: number;
  limit: number;
  search?: string;
  companyId?: number;
}

export interface CreatePromptInput {
  companyId: number;
  systemInstruction: string;
  promptTemplate: string;
}

export interface UpdatePromptInput {
  companyId?: number;
  systemInstruction?: string;
  promptTemplate?: string;
}
