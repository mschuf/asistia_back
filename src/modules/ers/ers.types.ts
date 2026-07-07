/**
 * @file ers.types.ts
 * @description Tipos de dominio del módulo ERS (ticket escalado a proyecto GLPI).
 */

import type { UserRole } from "../../common/types/authenticated-user";

/** Fila resumida del listado de ERS. */
export interface ErsListItem {
  projectId: number;
  projectName: string;
  ticketId: number | null;
  requesterId: number | null;
  requesterName: string | null;
  requesterArea: string | null;
  locationId: number | null;
  locationName: string | null;
  approverId: number | null;
  approverName: string | null;
  approved: boolean;
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
  ticketId: number | null;
  requesterId: number | null;
  requesterName: string | null;
  requesterSectors: string[];
  locationId: number | null;
  locationName: string | null;
  objective: string | null;
  description: string | null;
  impact: string | null;
  requestType: string | null;
  priority: number;
  approved: boolean;
  approverId: number | null;
  approverName: string | null;
  projectStateId: number | null;
  projectStateName: string | null;
  projectTypeId: number | null;
  projectTypeName: string | null;
  progress: number;
  createdAt: string | null;
  updatedAt: string | null;
  ticketCreatedAt: string | null;
  ticketStatus: number | null;
  ticketSolvedAt: string | null;
  ticketClosedAt: string | null;
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
  locationName: string | null;
}

/** Tipo de proyecto GLPI utilizado como sistema relacionado. */
export interface ErsProjectType {
  id: number;
  name: string;
}

/** Contexto mínimo del ticket antes de escalar. */
export interface TicketEscalationContext {
  ticketId: number;
  ticketName: string;
  entityId: number;
  requesterId: number | null;
  locationId: number | null;
  status: number;
}

export interface ErsMetricSlice {
  active: number;
  activePercent: number;
  activeThisMonth: number;
  totalThisMonth: number;
}

export interface ErsActiveByLocationMetric {
  locationId: number | null;
  name: string;
  active: number;
}

export interface ErsActiveBySystemMetric {
  projectTypeId: number | null;
  name: string;
  active: number;
}

export interface ErsActiveByAreaMetric {
  name: string;
  active: number;
}

export interface ErsMetrics {
  myGroup: ErsMetricSlice;
  mySite: ErsMetricSlice | null;
  myProjects: ErsMetricSlice;
  unapproved: ErsMetricSlice;
  activeByLocation: ErsActiveByLocationMetric[];
  activeBySystem: ErsActiveBySystemMetric[];
  activeByArea: ErsActiveByAreaMetric[];
}

export interface ErsEligibleTicket {
  ticketId: number;
  subject: string;
  requesterName: string | null;
  locationId: number | null;
  locationName: string | null;
}

/** Filtro de acceso por rol para consultas de ERS. */
export interface ErsAccessScope {
  userId: number;
  role: UserRole;
}

