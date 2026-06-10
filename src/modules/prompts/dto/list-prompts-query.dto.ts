/**
 * @file list-prompts-query.dto.ts
 * @description DTO de consulta para listar prompts con paginación, búsqueda y filtro por empresa.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsPositive, IsString } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

/** Parámetros de query para el listado paginado de prompts. */
export class ListPromptsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Free-text search in company name or prompt content" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by company id" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  companyId?: number;
}

/** Límite por defecto de registros por página en listados de prompts. */
export const DEFAULT_PROMPTS_PAGE_LIMIT = 20;
