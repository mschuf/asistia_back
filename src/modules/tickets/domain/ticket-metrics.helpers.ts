/**
 * @file ticket-metrics.helpers.ts
 * @description Cálculo de métricas, normalización de sedes y agregación por ubicación.
 */
import {
  isActiveTicket,
  type DomainTicket,
  type DomainTicketStatus,
  type DomainTicketType,
} from "../../glpi/mappers/ticket.mapper";
import { GLPI_TICKET_STATUS } from "../../glpi/glpi.constants";
import { TICKET_STATUS, type TicketStatus } from "./ticket-status";

/** Estados del historial con filtro UI "Abiertos" (asignado + planificado). */
export const MY_GROUP_HISTORY_STATUSES: TicketStatus[] = [
  TICKET_STATUS.ASSIGNED,
  TICKET_STATUS.PLANNED,
];

/** Códigos GLPI equivalentes a {@link MY_GROUP_HISTORY_STATUSES}. */
export const MY_GROUP_HISTORY_STATUS_GLPI = [
  GLPI_TICKET_STATUS.ASSIGNED,
  GLPI_TICKET_STATUS.PLANNED,
] as const;

/** Estados GLPI equivalentes a {@link OPEN_STATUSES} (indicadores SQL / API). */
export const OPEN_STATUS_GLPI = [
  GLPI_TICKET_STATUS.NEW,
  GLPI_TICKET_STATUS.ASSIGNED,
  GLPI_TICKET_STATUS.PLANNED,
  GLPI_TICKET_STATUS.WAITING,
] as const;

export const OPEN_STATUSES: DomainTicketStatus[] = [
  TICKET_STATUS.NEW,
  TICKET_STATUS.ASSIGNED,
  TICKET_STATUS.PLANNED,
  TICKET_STATUS.WAITING,
];

export const IN_PROGRESS_STATUSES: DomainTicketStatus[] = [
  TICKET_STATUS.ASSIGNED,
  TICKET_STATUS.PLANNED,
  TICKET_STATUS.WAITING,
];

/**
 * Indica si una fecha ISO cae en el mes calendario actual (UTC).
 * @param isoDate - Fecha en formato ISO o nula.
 * @returns `true` si pertenece al mes actual en UTC.
 * @throws Ninguno.
 */
export function isInCurrentMonth(isoDate: string | null): boolean {
  if (!isoDate) return false;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth()
  );
}

/**
 * Determina si el ticket está en un estado considerado abierto.
 * @param ticket - Ticket de dominio.
 * @returns `true` si el estado está en {@link OPEN_STATUSES}.
 * @throws Ninguno.
 */
export function isTicketOpen(ticket: DomainTicket): boolean {
  return OPEN_STATUSES.includes(ticket.status);
}

/**
 * Determina si el ticket está en progreso (asignado, planificado o en espera).
 * @param ticket - Ticket de dominio.
 * @returns `true` si el estado está en {@link IN_PROGRESS_STATUSES}.
 * @throws Ninguno.
 */
export function isTicketInProgress(ticket: DomainTicket): boolean {
  return IN_PROGRESS_STATUSES.includes(ticket.status);
}

/**
 * Calcula el porcentaje de abiertos respecto al total del mes.
 * @param openCount - Cantidad de tickets abiertos.
 * @param totalMonth - Total de tickets del mes.
 * @returns Porcentaje redondeado (0 si el total es ≤ 0).
 * @throws Ninguno.
 */
export function openPercent(openCount: number, totalMonth: number): number {
  if (totalMonth <= 0) return 0;
  return Math.round((openCount / totalMonth) * 100);
}

export interface TicketMetricSlice {
  open: number;
  openPercent: number;
  openThisMonth: number;
  totalThisMonth: number;
}

/** Slice vacío reutilizable cuando una métrica no aplica al rol. */
export const EMPTY_METRIC_SLICE: TicketMetricSlice = {
  open: 0,
  openPercent: 0,
  openThisMonth: 0,
  totalThisMonth: 0,
};

export interface MyTicketsMetricSlice {
  inProgress: number;
  openPercent: number;
  openThisMonth: number;
  totalThisMonth: number;
}

/**
 * Filtra tickets activos (no eliminados lógicamente).
 * @param tickets - Lista de tickets de entrada.
 * @returns Solo tickets activos según `isActiveTicket`.
 * @throws Ninguno.
 */
function activeOnly(tickets: DomainTicket[]): DomainTicket[] {
  return tickets.filter(isActiveTicket);
}

/**
 * Calcula métricas de "Mis tickets" para técnicos asignados.
 * @param assigned - Tickets asignados al técnico.
 * @returns Slice con en progreso, porcentaje y conteos del mes.
 * @throws Ninguno.
 */
export function computeMyTicketsMetrics(assigned: DomainTicket[]): MyTicketsMetricSlice {
  const active = activeOnly(assigned);
  const monthTickets = active.filter((t) => isInCurrentMonth(t.createdAt));
  const openMonth = monthTickets.filter(isTicketOpen);
  return {
    /** Alineado con incidentes/solicitudes: abiertos asignados (incluye `new`). */
    inProgress: active.filter(isTicketOpen).length,
    openPercent: openPercent(openMonth.length, monthTickets.length),
    openThisMonth: openMonth.length,
    totalThisMonth: monthTickets.length,
  };
}

/**
 * Calcula métricas por tipo (incidente o solicitud).
 * @param assigned - Pool de tickets asignados.
 * @param type - Tipo de ticket a filtrar.
 * @returns Slice de métricas para el tipo indicado.
 * @throws Ninguno.
 */
export function computeTypeMetrics(
  assigned: DomainTicket[],
  type: DomainTicketType,
): TicketMetricSlice {
  const pool = activeOnly(assigned).filter((t) => t.type === type);
  const monthTickets = pool.filter((t) => isInCurrentMonth(t.createdAt));
  const openMonth = monthTickets.filter(isTicketOpen);
  return {
    open: pool.filter(isTicketOpen).length,
    openPercent: openPercent(openMonth.length, monthTickets.length),
    openThisMonth: openMonth.length,
    totalThisMonth: monthTickets.length,
  };
}

/**
 * Calcula métricas por estado (resuelto o cerrado).
 * @param tickets - Pool de tickets del usuario.
 * @param status - Estado de ticket a filtrar.
 * @returns Slice de métricas para el estado indicado.
 * @throws Ninguno.
 */
export function computeStatusMetrics(
  tickets: DomainTicket[],
  status: DomainTicketStatus,
): TicketMetricSlice {
  const pool = activeOnly(tickets);
  const monthTickets = pool.filter((t) => isInCurrentMonth(t.createdAt));
  const statusMonth = monthTickets.filter((t) => t.status === status);
  return {
    open: pool.filter((t) => t.status === status).length,
    openPercent: openPercent(statusMonth.length, monthTickets.length),
    openThisMonth: statusMonth.length,
    totalThisMonth: monthTickets.length,
  };
}

/**
 * Calcula métricas de tickets de una sede concreta.
 * @param siteTickets - Tickets de la sede.
 * @returns Slice de abiertos y estadísticas del mes.
 * @throws Ninguno.
 */
export function computeSiteMetrics(
  siteTickets: DomainTicket[],
): TicketMetricSlice {
  const active = activeOnly(siteTickets);
  const monthTickets = active.filter((t) => isInCurrentMonth(t.createdAt));
  const openMonth = monthTickets.filter(isTicketOpen);
  return {
    open: active.filter(isTicketOpen).length,
    openPercent: openPercent(openMonth.length, monthTickets.length),
    openThisMonth: openMonth.length,
    totalThisMonth: monthTickets.length,
  };
}

/**
 * Normaliza IDs de GLPI (p. ej. string en JSON) para comparaciones y mapas.
 * @param value - ID crudo de sede o técnico.
 * @returns ID numérico positivo o `null` si no es válido.
 * @throws Ninguno.
 */
export function normalizeLocationId(value: number | null | undefined): number | null {
  if (value == null) return null;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Fusiona dos snapshots del mismo ticket priorizando campos del existente.
 * @param existing - Ticket ya almacenado en el mapa.
 * @param incoming - Ticket entrante a fusionar.
 * @returns Ticket combinado con campos no nulos del existente.
 * @throws Ninguno.
 */
function mergeMetricsTicketSnapshot(existing: DomainTicket, incoming: DomainTicket): DomainTicket {
  return {
    ...incoming,
    ...existing,
    locationId: existing.locationId ?? incoming.locationId,
    categoryId: existing.categoryId ?? incoming.categoryId,
    requesterId: existing.requesterId ?? incoming.requesterId,
    technicianId: existing.technicianId ?? incoming.technicianId,
  };
}

/**
 * Elimina duplicados por ID fusionando snapshots de métricas.
 * @param tickets - Lista posiblemente con IDs repetidos.
 * @returns Tickets únicos por `id`.
 * @throws Ninguno.
 */
export function dedupeTicketsById(tickets: DomainTicket[]): DomainTicket[] {
  const byId = new Map<number, DomainTicket>();
  for (const ticket of tickets) {
    const previous = byId.get(ticket.id);
    byId.set(ticket.id, previous ? mergeMetricsTicketSnapshot(previous, ticket) : ticket);
  }
  return [...byId.values()];
}

/**
 * Recolecta IDs de técnicos sin sede en el ticket que requieren resolución.
 * @param pools - Uno o más pools de tickets.
 * @returns Conjunto de IDs de técnico con `locationId` nulo en el ticket.
 * @throws Ninguno.
 */
export function collectTechnicianIdsNeedingLocation(
  ...pools: DomainTicket[][]
): Set<number> {
  const ids = new Set<number>();
  for (const pool of pools) {
    for (const ticket of pool) {
      if (ticket.locationId == null && ticket.technicianId != null) {
        ids.add(ticket.technicianId);
      }
    }
  }
  return ids;
}

/**
 * Sede efectiva: la del ticket o, si falta, la del técnico asignado.
 * @param ticket - Ticket de dominio.
 * @param technicianLocations - Mapa técnico → sede.
 * @returns ID de sede normalizado o `null`.
 * @throws Ninguno.
 */
export function resolveTicketLocationId(
  ticket: DomainTicket,
  technicianLocations: ReadonlyMap<number, number | null>,
): number | null {
  const ticketLocation = normalizeLocationId(ticket.locationId);
  if (ticketLocation != null) return ticketLocation;
  if (ticket.technicianId == null) return null;
  return normalizeLocationId(technicianLocations.get(ticket.technicianId) ?? null);
}

/**
 * Arma el pool de tickets de "Mi sede" deduplicando y filtrando por ubicación.
 * @param siteTickets - Tickets abiertos de la sede.
 * @param assignedTickets - Tickets asignados al usuario.
 * @param userLocationId - Sede del usuario autenticado.
 * @param technicianLocations - Mapa técnico → sede.
 * @returns Tickets activos cuya sede efectiva coincide con la del usuario.
 * @throws Ninguno.
 */
export function buildMySiteTicketPool(
  siteTickets: DomainTicket[],
  assignedTickets: DomainTicket[],
  userLocationId: number,
  technicianLocations: ReadonlyMap<number, number | null>,
): DomainTicket[] {
  const normalizedUserLocationId = normalizeLocationId(userLocationId);
  if (normalizedUserLocationId == null) return [];

  return dedupeTicketsById([...siteTickets, ...assignedTickets]).filter(
    (ticket) =>
      isActiveTicket(ticket) &&
      resolveTicketLocationId(ticket, technicianLocations) === normalizedUserLocationId,
  );
}

export interface OpenByLocationMetricRow {
  locationId: number;
  name: string;
  open: number;
}

/**
 * Total global de abiertos por sede; solo incluye sedes con al menos un ticket abierto.
 * @param tickets - Tickets abiertos a agregar.
 * @param locationNameById - Mapa sede → nombre para el resultado.
 * @returns Filas ordenadas por abiertos descendente y nombre.
 * @throws Ninguno.
 */
export function buildOpenByLocationMetrics(
  tickets: DomainTicket[],
  locationNameById: ReadonlyMap<number, string>,
): OpenByLocationMetricRow[] {
  const openByLocationMap = new Map<number, number>();

  for (const ticket of tickets) {
    if (!isActiveTicket(ticket) || !isTicketOpen(ticket)) continue;
    const locationId = normalizeLocationId(ticket.locationId);
    if (locationId == null) continue;
    openByLocationMap.set(locationId, (openByLocationMap.get(locationId) ?? 0) + 1);
  }

  return [...openByLocationMap.entries()]
    .map(([locationId, open]) => ({
      locationId,
      name: locationNameById.get(locationId) ?? `Sede #${locationId}`,
      open,
    }))
    .sort(
      (left, right) =>
        right.open - left.open || left.name.localeCompare(right.name, "es"),
    );
}

export interface OpenByAssigneeMetricRow {
  technicianId: number;
  name: string;
  open: number;
}

/**
 * Total global de abiertos por técnico asignado; solo incluye técnicos con al menos un ticket abierto.
 * @param tickets - Tickets abiertos a agregar.
 * @param technicianNameById - Mapa técnico → nombre para el resultado.
 * @returns Filas ordenadas por abiertos descendente y nombre.
 * @throws Ninguno.
 */
export function buildOpenByAssigneeMetrics(
  tickets: DomainTicket[],
  technicianNameById: ReadonlyMap<number, string>,
): OpenByAssigneeMetricRow[] {
  const openByAssigneeMap = new Map<number, number>();

  for (const ticket of tickets) {
    if (!isActiveTicket(ticket) || !isTicketOpen(ticket)) continue;
    if (ticket.technicianId == null) continue;
    openByAssigneeMap.set(
      ticket.technicianId,
      (openByAssigneeMap.get(ticket.technicianId) ?? 0) + 1,
    );
  }

  return [...openByAssigneeMap.entries()]
    .map(([technicianId, open]) => ({
      technicianId,
      name: technicianNameById.get(technicianId) ?? `Usuario #${technicianId}`,
      open,
    }))
    .sort(
      (left, right) =>
        right.open - left.open || left.name.localeCompare(right.name, "es"),
    );
}
