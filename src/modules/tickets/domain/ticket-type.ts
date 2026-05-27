export const TICKET_TYPE = {
  INCIDENT: "incident",
  REQUEST: "request",
} as const;

export type TicketType = (typeof TICKET_TYPE)[keyof typeof TICKET_TYPE];

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  incident: "Incidente",
  request: "Solicitud",
};
