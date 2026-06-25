/**
 * @file proveedor.response.dto.ts
 * @description DTOs de respuesta de proveedor individual y listado paginado.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Representación serializable de un proveedor para la API. */
export class ProveedorResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: "Logistica Norte SA" })
  nombre!: string;

  @ApiProperty({ example: "80012345-6" })
  ruc!: string;

  @ApiProperty({ example: true })
  activo!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

/** Contenedor paginado de proveedores para respuestas HTTP. */
export class ProveedorListResponseDto {
  @ApiProperty({ type: () => [ProveedorResponseDto] })
  items!: ProveedorResponseDto[];

  @ApiProperty({ example: 1 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 15 })
  limit!: number;
}
