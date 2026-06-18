/**
 * @file porteria-audit.response.dto.ts
 * @description DTOs de respuesta del reporte superadmin de auditoría de portería.
 */
import { ApiProperty } from "@nestjs/swagger";
import { VISITA_ESTADO, type VisitaEstado } from "../../visitas/domain/visita-estado";
import { VISITA_AUDIT_ACTION, type VisitaAuditAction } from "../../visitas/visitas.types";

/** Fila de auditoría de portería. */
export class PorteriaAuditLogResponseDto {
  @ApiProperty({ example: 1234 })
  id!: number;

  @ApiProperty({ example: 88 })
  visitaId!: number;

  @ApiProperty({ enum: VISITA_AUDIT_ACTION, example: "visita.updated" })
  action!: VisitaAuditAction;

  @ApiProperty({ example: 145, description: "ID de usuario GLPI que ejecutó la acción" })
  actorUserId!: number;

  @ApiProperty({ nullable: true, example: "Juan Perez" })
  actorName!: string | null;

  @ApiProperty({ example: "2026-06-18T13:10:22.000Z" })
  occurredAt!: string;

  @ApiProperty({ nullable: true, example: "María Gonzalez" })
  visitante!: string | null;

  @ApiProperty({ nullable: true, example: "30.123.456" })
  documento!: string | null;

  @ApiProperty({ nullable: true, enum: VISITA_ESTADO })
  estadoBefore!: VisitaEstado | null;

  @ApiProperty({ nullable: true, enum: VISITA_ESTADO })
  estadoAfter!: VisitaEstado | null;

  @ApiProperty({ type: [String], example: ["estado", "salidaAt", "observaciones"] })
  changedFields!: string[];

  @ApiProperty({ nullable: true, type: Object })
  beforeState!: Record<string, unknown> | null;

  @ApiProperty({ nullable: true, type: Object })
  afterState!: Record<string, unknown> | null;

  @ApiProperty({ type: Object })
  metadata!: Record<string, unknown>;
}

/** Contenedor paginado del reporte de auditoría de portería. */
export class PorteriaAuditLogListResponseDto {
  @ApiProperty({ type: () => [PorteriaAuditLogResponseDto] })
  items!: PorteriaAuditLogResponseDto[];

  @ApiProperty({ example: 240 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 15 })
  limit!: number;

  @ApiProperty({ example: 16 })
  totalPages!: number;
}
