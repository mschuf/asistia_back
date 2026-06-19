/**
 * @file motivo-visita.response.dto.ts
 * @description DTOs de respuesta de motivo de visita individual y listado paginado.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Representación serializable de un motivo de visita para la API. */
export class MotivoVisitaResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: "Mantenimiento preventivo" })
  nombre!: string;

  @ApiProperty({ example: true })
  activo!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

/** Contenedor paginado de motivos de visita para respuestas HTTP. */
export class MotivoVisitaListResponseDto {
  @ApiProperty({ type: () => [MotivoVisitaResponseDto] })
  items!: MotivoVisitaResponseDto[];

  @ApiProperty({ example: 1 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 15 })
  limit!: number;
}
