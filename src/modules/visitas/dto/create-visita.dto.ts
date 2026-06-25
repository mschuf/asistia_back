/**
 * @file create-visita.dto.ts
 * @description DTO de validación para la creación de una visita.
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { VISITA_ESTADO, type VisitaEstado } from "../domain/visita-estado";
import { VISITA_SEGUIMIENTO, type VisitaSeguimiento } from "../domain/visita-seguimiento";
import { VISITA_ZONA, type VisitaZona } from "../domain/visita-zona";
import { VISITA_TARJETA_COLOR, type VisitaTarjetaColor } from "../domain/visita-tarjeta-color";

/** Cuerpo HTTP para crear una visita. */
export class CreateVisitaDto {
  @ApiProperty({ example: 1 })
  @IsDefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personaId!: number;

  @ApiProperty({ example: 1 })
  @IsDefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  motivoVisitaId!: number;

  @ApiProperty({ example: "Juan Perez" })
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  responsableNombre!: string;

  @ApiProperty({ example: 188, description: "ID de usuario GLPI del responsable" })
  @IsDefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  responsableId!: number;

  @ApiPropertyOptional({ enum: VISITA_ESTADO, default: "activa" })
  @IsOptional()
  @IsIn(VISITA_ESTADO)
  estado?: VisitaEstado;

  @ApiPropertyOptional({ enum: VISITA_SEGUIMIENTO })
  @IsOptional()
  @IsIn(VISITA_SEGUIMIENTO)
  estadoSeguimiento?: VisitaSeguimiento;

  @ApiPropertyOptional({ type: [String], example: ["porteria", "fabrica"] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(VISITA_ZONA, { each: true })
  zonasPermitidas?: VisitaZona[];

  @ApiProperty({ example: "T-1024" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  credencialNumero!: string;

  @ApiProperty({ enum: VISITA_TARJETA_COLOR, example: "rojo" })
  @IsIn(VISITA_TARJETA_COLOR)
  tarjetaColor!: VisitaTarjetaColor;

  @ApiPropertyOptional({ description: "ISO8601 datetime for visit entry" })
  @IsOptional()
  @IsDateString()
  entradaAt?: string;

  @ApiPropertyOptional({ description: "ISO8601 datetime for visit exit" })
  @IsOptional()
  @IsDateString()
  salidaAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
