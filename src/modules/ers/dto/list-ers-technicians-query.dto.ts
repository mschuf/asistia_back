/**
 * @file list-ers-technicians-query.dto.ts
 * @description DTO de consulta para técnicos GLPI filtrables por sede.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

/** Query params de `GET /ers/technicians`. */
export class ListErsTechniciansQueryDto extends PaginationDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  declare limit?: number;

  @ApiPropertyOptional({ type: Number, description: "Sede GLPI opcional" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  locationId?: number;

  @ApiPropertyOptional({ description: "Texto de búsqueda por nombre/login" })
  @IsOptional()
  @IsString()
  search?: string;
}

