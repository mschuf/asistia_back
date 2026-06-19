/**
 * @file create-persona.dto.ts
 * @description DTO de validación para la creación de una persona.
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

/** Cuerpo HTTP para crear una persona visitante o empleado. */
export class CreatePersonaDto {
  @ApiProperty({ example: "Maria Gonzalez" })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  nombre!: string;

  @ApiProperty({ example: "30.123.456" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  documento!: string;

  @ApiProperty({ example: 1, description: "ID del proveedor al que pertenece la persona" })
  @IsInt()
  @Min(1)
  proveedorId!: number;

  @ApiPropertyOptional({ example: "maria@empresa.com" })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ example: "+54 11 5555-1234" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  telefono?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
