/**
 * @file ers-history.response.dto.ts
 * @description DTOs de respuesta para historial de ERS.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Evento de historial de un proyecto ERS. */
export class ErsHistoryItemResponseDto {
  @ApiProperty({ example: 14 })
  id!: number;

  @ApiProperty({ example: 2001 })
  projectId!: number;

  @ApiProperty({ enum: ["create", "update", "delete"], example: "update" })
  actionType!: "create" | "update" | "delete";

  @ApiProperty({ example: "info" })
  actionColor!: string;

  @ApiProperty({ example: "Se actualizó la gestión del proyecto y sus tareas." })
  summary!: string;

  @ApiProperty({ example: 1368 })
  actorUserId!: number;

  @ApiProperty({ example: "María Gómez" })
  actorDisplayName!: string;

  @ApiProperty({ example: "2026-06-30T16:30:00.000Z" })
  happenedAt!: string;
}

/** Respuesta paginada de historial de ERS. */
export class ErsHistoryListResponseDto {
  @ApiProperty({ type: () => [ErsHistoryItemResponseDto] })
  items!: ErsHistoryItemResponseDto[];

  @ApiProperty({ example: 24 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}

