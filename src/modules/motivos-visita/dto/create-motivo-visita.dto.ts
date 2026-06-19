/**
 * @file create-motivo-visita.dto.ts
 * @description DTO de validación para la creación de un motivo de visita.
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** Cuerpo HTTP para crear un motivo de visita. */
export class CreateMotivoVisitaDto {
  @ApiProperty({ example: "Mantenimiento preventivo" })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  nombre!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
