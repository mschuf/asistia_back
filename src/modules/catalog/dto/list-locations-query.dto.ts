/**
 * @file list-locations-query.dto.ts
 * @description DTO de consulta para filtrar ubicaciones del catálogo.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

/** Parámetros de query para el listado de ubicaciones. */
export class ListLocationsQueryDto {
  @ApiPropertyOptional({
    description: "When true, only locations with at least one active GLPI user.",
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => ["true", "1", "yes", true].includes(value))
  @IsBoolean()
  activeOnly?: boolean;
}
