/**
 * @file ers-history.types.ts
 * @description Tipos de dominio para historial de ERS.
 */

/** Acciones auditables del historial de ERS. */
export type ErsHistoryActionType = "create" | "update" | "delete";

/** Fila persistida en historial de ERS (PostgreSQL). */
export interface ErsHistoryItem {
  id: number;
  projectId: number;
  actionType: ErsHistoryActionType;
  actionColor: string;
  summary: string;
  actorUserId: number;
  actorDisplayName: string;
  happenedAt: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
}

/** Metadatos opcionales para enriquecer un evento de historial. */
export interface ErsHistoryMetadata {
  ticketId?: number;
  projectName?: string;
  [key: string]: unknown;
}

/** Payload para registrar un nuevo evento de historial. */
export interface CreateErsHistoryInput {
  projectId: number;
  actionType: ErsHistoryActionType;
  summary: string;
  actorUserId: number;
  actorDisplayName: string;
  metadata?: ErsHistoryMetadata;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
}

