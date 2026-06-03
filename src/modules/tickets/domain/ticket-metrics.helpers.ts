import {
  isActiveTicket,
  type DomainTicket,
  type DomainTicketStatus,
  type DomainTicketType,
} from "../../glpi/mappers/ticket.mapper";
import { GLPI_TICKET_STATUS } from "../../glpi/glpi.constants";
import { TICKET_STATUS } from "./ticket-status";

/** Estados GLPI equivalentes a {@link OPEN_STATUSES} (métricas SQL / API). */
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

/** Mes calendario actual en UTC (documentado en código). */
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

export function isTicketOpen(ticket: DomainTicket): boolean {
  return OPEN_STATUSES.includes(ticket.status);
}

export function isTicketInProgress(ticket: DomainTicket): boolean {
  return IN_PROGRESS_STATUSES.includes(ticket.status);
}

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

export interface MyTicketsMetricSlice {
  inProgress: number;
  openPercent: number;
  openThisMonth: number;
  totalThisMonth: number;
}

function activeOnly(tickets: DomainTicket[]): DomainTicket[] {
  return tickets.filter(isActiveTicket);
}

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

/** Normaliza IDs de GLPI (p. ej. string en JSON) para comparaciones y mapas. */
export function normalizeLocationId(value: number | null | undefined): number | null {
  if (value == null) return null;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

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

export function dedupeTicketsById(tickets: DomainTicket[]): DomainTicket[] {
  const byId = new Map<number, DomainTicket>();
  for (const ticket of tickets) {
    const previous = byId.get(ticket.id);
    byId.set(ticket.id, previous ? mergeMetricsTicketSnapshot(previous, ticket) : ticket);
  }
  return [...byId.values()];
}

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

/** Sede efectiva: la del ticket o, si falta, la del técnico asignado. */
export function resolveTicketLocationId(
  ticket: DomainTicket,
  technicianLocations: ReadonlyMap<number, number | null>,
): number | null {
  const ticketLocation = normalizeLocationId(ticket.locationId);
  if (ticketLocation != null) return ticketLocation;
  if (ticket.technicianId == null) return null;
  return normalizeLocationId(technicianLocations.get(ticket.technicianId) ?? null);
}

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
    .sort((left, right) => right.open - left.open);
}
