/**
 * @file escalar-ticket.dto.ts
 * @description DTO para crear un proyecto ERS completo desde un ticket existente.
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

/** Estado completo requerido para escalar un ticket a ERS. */
export class EscalarTicketDto {
  @ApiProperty({ example: 1254, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ticketId!: number;

  @ApiProperty({ example: false })
  @IsBoolean()
  approved!: boolean;

  @ApiProperty({ example: "Implementación portal de autoservicio RRHH", minLength: 3, maxLength: 255 })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  @Matches(/\S/, { message: "projectName must contain visible characters" })
  projectName!: string;

  @ApiProperty({ example: "Reducir el tiempo de respuesta del área RRHH." })
  @IsString()
  @MinLength(1)
  @Matches(/\S/, { message: "objective must contain visible characters" })
  objective!: string;

  @ApiProperty({ example: "Se requiere una interfaz web y notificaciones automáticas." })
  @IsString()
  @MinLength(1)
  @Matches(/\S/, { message: "description must contain visible characters" })
  description!: string;

  @ApiProperty({ example: "Nueva Funcionalidad" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/, { message: "requestType must contain visible characters" })
  requestType!: string;

  @ApiProperty({ example: 3, minimum: 1, maximum: 6 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  priority!: number;

  @ApiPropertyOptional({ example: "Afecta directamente a 250 usuarios." })
  @IsOptional()
  @IsString()
  impact?: string;

  @ApiPropertyOptional({
    example: 3,
    minimum: 1,
    description: "Orden de ejecución del proyecto, único por sede (glpi_projects.code). Solo editable por superadmins.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  executionOrder?: number;

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

  @ApiPropertyOptional({ example: 1, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  projectTypeId?: number;

  @ApiProperty({ type: Number, isArray: true, example: [34, 51] })
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
