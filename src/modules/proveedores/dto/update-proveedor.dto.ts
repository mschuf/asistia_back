/**
 * @file update-proveedor.dto.ts
 * @description DTO de validación para actualización parcial de un proveedor.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** Cuerpo HTTP para actualizar un proveedor existente. */
export class UpdateProveedorDto {
  @ApiPropertyOptional({ example: "Logistica Norte SA" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
