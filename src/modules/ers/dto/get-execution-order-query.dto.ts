/**
 * @file get-execution-order-query.dto.ts
 * @description DTO de consulta para listar órdenes de ejecución existentes y sugerir el siguiente libre.
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

/** Query params de `GET /ers/execution-order`. */
export class GetErsExecutionOrderQueryDto {
  @ApiProperty({ example: 8, minimum: 1, description: "Sede (glpi_locations) a consultar" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  locationId!: number;

  @ApiPropertyOptional({ example: 42, minimum: 1, description: "Proyecto a excluir del listado (edición del propio proyecto)" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  excludeProjectId?: number;
}
