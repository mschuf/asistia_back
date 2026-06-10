/**
 * @file prompt.response.dto.ts
 * @description DTOs de respuesta de prompt individual y listado paginado.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Representación serializable de un prompt para la API. */
export class PromptResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 2 })
  companyId!: number;

  @ApiProperty({ example: "Guarani" })
  companyName!: string;

  @ApiProperty()
  systemInstruction!: string;

  @ApiProperty()
  promptTemplate!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

/** Contenedor paginado de prompts para respuestas HTTP. */
export class PromptListResponseDto {
  @ApiProperty({ type: () => [PromptResponseDto] })
  items!: PromptResponseDto[];

  @ApiProperty({ example: 1 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
