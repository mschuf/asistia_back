/**
 * @file ticket-status.ts
 * @description Constantes, etiquetas y reglas de transición de estados de tickets.
 */
export const TICKET_STATUS = {
  NEW: "new",
  ASSIGNED: "assigned",
  PLANNED: "planned",
  WAITING: "waiting",
  SOLVED: "solved",
  CLOSED: "closed",
} as const;

export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  new: "Nuevo",
  assigned: "Asignado",
  planned: "Planificado",
  waiting: "En espera",
  solved: "Resuelto",
  closed: "Cerrado",
};

const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  new: ["assigned", "waiting", "planned", "solved", "closed"],
  assigned: ["planned", "waiting", "solved", "closed"],
  planned: ["assigned", "waiting", "solved", "closed"],
  waiting: ["assigned", "planned", "solved", "closed"],
  solved: ["closed", "assigned"],
  closed: [],
};

/**
 * Indica si la transición entre dos estados de ticket está permitida.
 * @param from - Estado actual del ticket.
 * @param to - Estado destino solicitado.
 * @returns `true` si la transición es válida o si ambos estados son iguales.
 * @throws Ninguno.
 */
export function canTransitionTo(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
