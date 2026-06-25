/**
 * @file persona.response.dto.ts
 * @description DTOs de respuesta de persona individual y listado paginado.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Representación serializable de una persona para la API. */
export class PersonaResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: "Maria Gonzalez" })
  nombre!: string;

  @ApiProperty({ example: "30.123.456" })
  documento!: string;

  @ApiProperty({ example: 1 })
  proveedorId!: number;

  @ApiProperty({ example: "Logistica Norte SA" })
  proveedorNombre!: string;

  @ApiProperty({ nullable: true, example: "maria@empresa.com" })
  email!: string | null;

  @ApiProperty({ nullable: true, example: "+54 11 5555-1234" })
  telefono!: string | null;

  @ApiProperty({ example: true })
  activo!: boolean;

  @ApiProperty({ example: false, description: "Indica si la persona tiene foto almacenada." })
  hasFoto!: boolean;

  @ApiProperty({ nullable: true, example: 1, description: "ID del último motivo usado en una visita." })
  ultimoMotivo!: number | null;

  @ApiProperty({ nullable: true, example: 188, description: "ID GLPI del último responsable usado." })
  ultimoResponsable!: number | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

/** Contenedor paginado de personas para respuestas HTTP. */
export class PersonaListResponseDto {
  @ApiProperty({ type: () => [PersonaResponseDto] })
  items!: PersonaResponseDto[];

  @ApiProperty({ example: 1 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 15 })
  limit!: number;
}
