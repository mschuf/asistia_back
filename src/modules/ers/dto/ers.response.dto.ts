/**
 * @file ers.response.dto.ts
 * @description DTOs de respuesta del módulo ERS.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Fila de listado de ERS. */
export class ErsListItemResponseDto {
  @ApiProperty({ example: 2001 })
  projectId!: number;

  @ApiProperty({ example: "Portal RRHH" })
  projectName!: string;

  @ApiProperty({ example: 1203 })
  ticketId!: number;

  @ApiProperty({ example: 45, nullable: true })
  requesterId!: number | null;

  @ApiProperty({ example: "Ana Pérez", nullable: true })
  requesterName!: string | null;

  @ApiProperty({ example: 8, nullable: true })
  locationId!: number | null;

  @ApiProperty({ example: "Casa Central", nullable: true })
  locationName!: string | null;

  @ApiProperty({ example: 80, nullable: true })
  approverId!: number | null;

  @ApiProperty({ example: "Carlos Ramírez", nullable: true })
  approverName!: string | null;

  @ApiProperty({ example: 2, nullable: true })
  projectStateId!: number | null;

  @ApiProperty({ example: "En curso", nullable: true })
  projectStateName!: string | null;

  @ApiProperty({ example: 65 })
  progress!: number;

  @ApiProperty({ example: "2026-06-20T09:30:00.000Z", nullable: true })
  createdAt!: string | null;

  @ApiProperty({ example: "2026-06-26T13:00:00.000Z", nullable: true })
  updatedAt!: string | null;
}

/** Respuesta paginada de listado de ERS. */
export class ErsListResponseDto {
  @ApiProperty({ type: () => [ErsListItemResponseDto] })
  items!: ErsListItemResponseDto[];

  @ApiProperty({ example: 24 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 15 })
  limit!: number;
}

/** Miembro de equipo/responsable. */
export class ErsTeamMemberResponseDto {
  @ApiProperty({ example: 80 })
  userId!: number;

  @ApiProperty({ example: "Carlos Ramírez" })
  fullName!: string;
}

/** Tarea de proyecto en detalle ERS. */
export class ErsTaskResponseDto {
  @ApiProperty({ example: 9001 })
  id!: number;

  @ApiProperty({ example: "Diseño funcional" })
  name!: string;

  @ApiProperty({ nullable: true, example: "Historias de usuario y casos de uso." })
  content!: string | null;

  @ApiProperty({ example: 40 })
  percentDone!: number;

  @ApiProperty({ nullable: true, example: 2 })
  projectStateId!: number | null;

  @ApiProperty({ nullable: true, example: "En curso" })
  projectStateName!: string | null;

  @ApiProperty({ nullable: true, example: 81 })
  userId!: number | null;

  @ApiProperty({ nullable: true, example: "María Gómez" })
  userName!: string | null;

  @ApiProperty({ nullable: true, example: "2026-07-01T08:00:00.000Z" })
  planStartDate!: string | null;

  @ApiProperty({ nullable: true, example: "2026-07-10T17:00:00.000Z" })
  planEndDate!: string | null;
}

/** Detalle completo de ERS. */
export class ErsDetailResponseDto {
  @ApiProperty({ example: 2001 })
  projectId!: number;

  @ApiProperty({ example: "Portal RRHH" })
  projectName!: string;

  @ApiProperty({ example: 1203 })
  ticketId!: number;

  @ApiProperty({ nullable: true, example: 45 })
  requesterId!: number | null;

  @ApiProperty({ nullable: true, example: "Ana Pérez" })
  requesterName!: string | null;

  @ApiProperty({ nullable: true, example: 8 })
  locationId!: number | null;

  @ApiProperty({ nullable: true, example: "Casa Central" })
  locationName!: string | null;

  @ApiProperty({ nullable: true, example: "Reducir tiempos de RRHH." })
  objective!: string | null;

  @ApiProperty({ nullable: true, example: "Se requiere autoservicio y notificaciones." })
  description!: string | null;

  @ApiProperty({ nullable: true, example: "Impacta a 250 colaboradores." })
  impact!: string | null;

  @ApiProperty({ nullable: true, example: 80 })
  approverId!: number | null;

  @ApiProperty({ nullable: true, example: "Carlos Ramírez" })
  approverName!: string | null;

  @ApiProperty({ nullable: true, example: 2 })
  projectStateId!: number | null;

  @ApiProperty({ nullable: true, example: "En curso" })
  projectStateName!: string | null;

  @ApiProperty({ example: 65 })
  progress!: number;

  @ApiProperty({ nullable: true, example: "2026-06-26T13:00:00.000Z" })
  updatedAt!: string | null;

  @ApiProperty({ type: () => [ErsTeamMemberResponseDto] })
  team!: ErsTeamMemberResponseDto[];

  @ApiProperty({ type: () => [ErsTaskResponseDto] })
  tasks!: ErsTaskResponseDto[];
}

/** Estado de proyecto. */
export class ErsProjectStateResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: "Nuevo" })
  name!: string;

  @ApiProperty({ nullable: true, example: "#3b82f6" })
  color!: string | null;

  @ApiProperty({ example: false })
  isFinished!: boolean;
}

/** Técnico para selects de responsables/equipo/aprobador. */
export class ErsTechnicianResponseDto {
  @ApiProperty({ example: 80 })
  id!: number;

  @ApiProperty({ example: "Carlos Ramírez" })
  fullName!: string;

  @ApiProperty({ nullable: true, example: 8 })
  locationId!: number | null;
}

/** Respuesta paginada de técnicos. */
export class ErsTechnicianListResponseDto {
  @ApiProperty({ type: () => [ErsTechnicianResponseDto] })
  items!: ErsTechnicianResponseDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 50 })
  limit!: number;
}

