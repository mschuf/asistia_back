/**
 * @file list-ers-documents-query.dto.ts
 * @description Filtros, orden y paginación del listado de documentos ERS.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from "class-validator";

export const ERS_DOCUMENT_LIMITS = ["15", "50", "100", "all"] as const;
export type ErsDocumentLimit = (typeof ERS_DOCUMENT_LIMITS)[number];
export const ERS_DOCUMENT_SORT_COLUMNS = ["name", "type", "createdAt"] as const;
export type ErsDocumentSortColumn = (typeof ERS_DOCUMENT_SORT_COLUMNS)[number];

/** Query de `GET /ers/:projectId/documents`. */
export class ListErsDocumentsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ enum: ERS_DOCUMENT_LIMITS, default: "15" })
  @IsOptional()
  @IsIn(ERS_DOCUMENT_LIMITS)
  limit?: ErsDocumentLimit;

  @ApiPropertyOptional({ description: "Búsqueda global" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Nombre del archivo" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ["image", "pdf", "text"] })
  @IsOptional()
  @IsIn(["image", "pdf", "text"])
  type?: "image" | "pdf" | "text";

  @ApiPropertyOptional({ example: "2026-07-01" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @ApiPropertyOptional({ example: "2026-07-31" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;

  @ApiPropertyOptional({ enum: ERS_DOCUMENT_SORT_COLUMNS })
  @IsOptional()
  @IsIn(ERS_DOCUMENT_SORT_COLUMNS)
  sortBy?: ErsDocumentSortColumn;

  @ApiPropertyOptional({ enum: ["asc", "desc"] })
  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc";
}
