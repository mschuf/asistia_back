/**
 * @file update-ers.dto.ts
 * @description DTO para la transacción 2 (edición TI) en un único guardado atómico.
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";

/** Ítem de tarea de proyecto enviado por la UI TI. */
export class ErsTaskInputDto {
  @ApiProperty({ example: "Diseño funcional" })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ example: "Definición de historias y criterios de aceptación." })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ example: 45, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  percentDone!: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  projectStateId?: number;

  @ApiPropertyOptional({ example: 44 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number;

  @ApiPropertyOptional({ example: "2026-07-01T08:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  planStartDate?: string;

  @ApiPropertyOptional({ example: "2026-07-10T17:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  planEndDate?: string;
}

/** Guardado único de la vista TI. */
export class UpdateErsDto {
  @ApiPropertyOptional({ example: "Portal RRHH", description: "Nombre visible del proyecto" })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  projectName?: string;

  @ApiPropertyOptional({ example: "Reducir tiempos de gestión.", description: "Objetivo del requerimiento" })
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({ example: "Detalle funcional del requerimiento.", description: "Descripción detallada" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: "Impacta a 250 colaboradores.", description: "Medición de impacto de negocio" })
  @IsOptional()
  @IsString()
  impact?: string;

  @ApiPropertyOptional({ example: 80, description: "Aprobador de proyecto (users_id)" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  approverId?: number;

  @ApiPropertyOptional({ example: 2, description: "Estado de proyecto (projectstates_id)" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  projectStateId?: number;

  @ApiProperty({
    type: Number,
    isArray: true,
    example: [80, 81],
    description: "Equipo técnico del proyecto (projectteams/itemtype=User)",
  })
  @IsArray()
  @ArrayMaxSize(50)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  teamMemberIds!: number[];

  @ApiProperty({ type: () => [ErsTaskInputDto] })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ErsTaskInputDto)
  tasks!: ErsTaskInputDto[];
}

