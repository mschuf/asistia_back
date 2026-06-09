import type { PromptRow } from "../prompts.types";
import type { PromptResponseDto } from "../dto/prompt.response.dto";

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

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
