/**
 * @file close-bulk.dto.ts
 * @description Payload y respuesta de POST /tickets/close-bulk (super admin, SQL-only).
 */
import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, Min } from "class-validator";

/** Máximo de tickets aceptados por solicitud de cierre masivo. */
export const MAX_CLOSE_BULK_TICKETS = 500;

/** Cuerpo de POST /tickets/close-bulk. */
export class CloseBulkDto {
  @ApiProperty({
    type: [Number],
    example: [10453, 10454],
    maxItems: MAX_CLOSE_BULK_TICKETS,
    description: "IDs de tickets GLPI a cerrar",
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_CLOSE_BULK_TICKETS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ticketIds!: number[];
}

/** Respuesta de POST /tickets/close-bulk. */
export class CloseBulkResponseDto {
  @ApiProperty({ example: 45, description: "Tickets solicitados (únicos)" })
  requested!: number;

  @ApiProperty({ example: 42, description: "Tickets cerrados exitosamente" })
  closed!: number;

  @ApiProperty({ example: 3, description: "Tickets no elegibles al momento del cierre (no existen, borrados o ya cerrados)" })
  skipped!: number;

  @ApiProperty({ example: 0, description: "Tickets que fallaron por un error inesperado" })
  failed!: number;
}
