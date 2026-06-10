/**
 * @file prompt-delete.response.dto.ts
 * @description DTO de confirmación tras eliminar permanentemente un prompt.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Respuesta HTTP al borrar definitivamente un prompt. */
export class PromptDeleteResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: true })
  deleted!: true;
}
