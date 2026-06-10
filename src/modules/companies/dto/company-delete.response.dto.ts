/**
 * @file company-delete.response.dto.ts
 * @description DTO de confirmación tras eliminar permanentemente una empresa.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Respuesta HTTP al borrar definitivamente una empresa. */
export class CompanyDeleteResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: true })
  deleted!: true;
}
