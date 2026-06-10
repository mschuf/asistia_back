/**
 * @file attachment.response.dto.ts
 * @description DTO de respuesta Swagger para metadatos de un adjunto de ticket.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Representación pública de un adjunto asociado a un ticket. */
export class TicketAttachmentResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 12345 })
  ticketId!: number;

  @ApiProperty({ example: "evidencia.png" })
  filename!: string;

  @ApiProperty({ example: "image/png" })
  mimeType!: string;

  @ApiProperty({ example: 102400 })
  size!: number;

  @ApiProperty({ example: 42 })
  uploadedById!: number;

  @ApiProperty({ example: "2026-06-09T12:00:00.000Z" })
  createdAt!: string;
}
