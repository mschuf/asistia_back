/**
 * @file update-proveedor.dto.ts
 * @description DTO de validación para actualización parcial de un proveedor.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** Cuerpo HTTP para actualizar un proveedor existente. */
export class UpdateProveedorDto {
  @ApiPropertyOptional({ example: "Logistica Norte SA" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nombre?: string;

  @ApiPropertyOptional({ example: "80012345-6" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  ruc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
