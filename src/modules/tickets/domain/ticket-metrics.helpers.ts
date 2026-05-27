import {
  isActiveTicket,
  type DomainTicket,
  type DomainTicketStatus,
  type DomainTicketType,
} from "../../glpi/mappers/ticket.mapper";
import { TICKET_STATUS } from "./ticket-status";

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
    inProgress: active.filter(isTicketInProgress).length,
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
