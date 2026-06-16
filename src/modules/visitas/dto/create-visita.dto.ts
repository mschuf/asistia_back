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
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { VISITA_ESTADO, type VisitaEstado } from "../domain/visita-estado";
import { VISITA_SEGUIMIENTO, type VisitaSeguimiento } from "../domain/visita-seguimiento";
import { VISITA_ZONA, type VisitaZona } from "../domain/visita-zona";
import { VISITA_TARJETA_COLOR, type VisitaTarjetaColor } from "../domain/visita-tarjeta-color";

/** Cuerpo HTTP para crear una visita. */
export class CreateVisitaDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personaId!: number;

  @ApiProperty({ example: "Entrega de materiales" })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(500)
  motivo!: string;

  @ApiProperty({ example: "Juan Perez" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  responsableNombre!: string;

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

  @ApiPropertyOptional({ example: "T-1024" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  credencialNumero?: string;

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
