/**
 * @file create-ers.dto.ts
 * @description DTO para crear de forma atómica un ticket y su proyecto ERS completo.
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { ErsTaskInputDto } from "./update-ers.dto";

/** Estado completo requerido por la pantalla de alta de ERS. */
export class CreateErsDto {
  @ApiProperty({ example: false, description: "Indica si el proyecto fue aprobado y puede crear tareas" })
  @IsBoolean()
  approved!: boolean;

  @ApiProperty({ example: 188, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requesterId!: number;

  @ApiProperty({ example: 8, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  locationId!: number;

  @ApiProperty({ example: "Portal RRHH", minLength: 3, maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Matches(/\S/, { message: "projectName must contain visible characters" })
  projectName!: string;

  @ApiProperty({ example: "Reducir tiempos de gestión." })
  @IsString()
  @MinLength(1)
  @Matches(/\S/, { message: "objective must contain visible characters" })
  objective!: string;

  @ApiProperty({ example: "Detalle funcional del requerimiento." })
  @IsString()
  @MinLength(1)
  @Matches(/\S/, { message: "description must contain visible characters" })
  description!: string;

  @ApiProperty({ example: "Nueva Funcionalidad", description: "Tipo de requerimiento configurado para ERS" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/, { message: "requestType must contain visible characters" })
  requestType!: string;

  @ApiProperty({ example: 3, minimum: 1, maximum: 6, description: "Prioridad TI (glpi_projects.priority)" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  priority!: number;

  @ApiPropertyOptional({ example: "Impacta a 250 colaboradores." })
  @IsOptional()
  @IsString()
  impact?: string;

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  approverId?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  projectStateId?: number;

  @ApiPropertyOptional({
    example: 1,
    minimum: 0,
    description: "Sistema relacionado (projecttypes_id); 0 indica sin sistema relacionado",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  projectTypeId?: number;

  @ApiProperty({ type: Number, isArray: true, example: [80, 81] })
  @IsArray()
  @ArrayMaxSize(50)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  teamMemberIds!: number[];

  @ApiProperty({ type: () => [ErsTaskInputDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ErsTaskInputDto)
  tasks!: ErsTaskInputDto[];
}
