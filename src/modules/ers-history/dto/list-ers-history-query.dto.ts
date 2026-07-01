/**
 * @file list-ers-history-query.dto.ts
 * @description DTO de consulta para historial paginado de ERS.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

/** Query params de `GET /ers/:projectId/history`. */
export class ListErsHistoryQueryDto extends PaginationDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  declare limit?: number;
}

