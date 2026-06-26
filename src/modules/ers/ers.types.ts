/**
 * @file ers.types.ts
 * @description Tipos de dominio del módulo ERS (ticket escalado a proyecto GLPI).
 */

import type { UserRole } from "../../common/types/authenticated-user";

/** Fila resumida del listado de ERS. */
export interface ErsListItem {
  projectId: number;
  projectName: string;
  ticketId: number;
  requesterId: number | null;
  requesterName: string | null;
  locationId: number | null;
  locationName: string | null;
  approverId: number | null;
  approverName: string | null;
  projectStateId: number | null;
  projectStateName: string | null;
  progress: number;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Miembro de equipo/responsable asociado a un proyecto. */
export interface ErsTeamMember {
  userId: number;
  fullName: string;
}

/** Tarea de proyecto ERS. */
export interface ErsTask {
  id: number;
  name: string;
  content: string | null;
  percentDone: number;
  projectStateId: number | null;
  projectStateName: string | null;
  userId: number | null;
  userName: string | null;
  planStartDate: string | null;
  planEndDate: string | null;
}

/** Detalle completo de un ERS. */
export interface ErsDetail {
  projectId: number;
  projectName: string;
  ticketId: number;
  requesterId: number | null;
  requesterName: string | null;
  locationId: number | null;
  locationName: string | null;
  objective: string | null;
  description: string | null;
  impact: string | null;
  approverId: number | null;
  approverName: string | null;
  projectStateId: number | null;
  projectStateName: string | null;
  progress: number;
  updatedAt: string | null;
  team: ErsTeamMember[];
  tasks: ErsTask[];
}

/** Estado de proyecto GLPI. */
export interface ErsProjectState {
  id: number;
  name: string;
  color: string | null;
  isFinished: boolean;
}

/** Técnico elegible para selects del ERS. */
export interface ErsTechnician {
  id: number;
  fullName: string;
  locationId: number | null;
}

/** Contexto mínimo del ticket antes de escalar. */
export interface TicketEscalationContext {
  ticketId: number;
  ticketName: string;
  entityId: number;
  requesterId: number | null;
  locationId: number | null;
}

/** Filtro de acceso por rol para consultas de ERS. */
export interface ErsAccessScope {
  userId: number;
  role: UserRole;
}

