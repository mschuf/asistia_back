/**
 * @file create-proveedor.dto.ts
 * @description DTO de validación para la creación de un proveedor.
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** Cuerpo HTTP para crear un proveedor. */
export class CreateProveedorDto {
  @ApiProperty({ example: "Logistica Norte SA" })
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
