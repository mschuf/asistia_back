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

export function canTransitionTo(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
