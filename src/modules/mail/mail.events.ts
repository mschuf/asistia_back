export const MAIL_EVENTS = {
  TICKET_CREATED: "mail.ticket.created",
  TICKET_STATUS_CHANGED: "mail.ticket.status_changed",
  TICKET_ASSIGNED: "mail.ticket.assigned",
  TICKET_REASSIGNED: "mail.ticket.reassigned",
} as const;

export interface MailRecipient {
  name: string;
  email: string;
}

export type TicketCreatedRecipientRole = "requester" | "technician";

export interface TicketCreatedRecipient extends MailRecipient {
  role: TicketCreatedRecipientRole;
}

export interface TicketCreatedEvent {
  ticketId: number;
  type: string;
  subject: string;
  description: string;
  requesterName: string;
  technicianName: string | null;
  categoryName: string | null;
  locationName: string | null;
  notify: TicketCreatedRecipient[];
}

export interface TicketStatusChangedEvent {
  ticketId: number;
  subject: string;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
  recipients: MailRecipient[];
}

export interface TicketAssignedEvent {
  ticketId: number;
  subject: string;
  technicianName: string;
  assignedBy: string;
  recipients: MailRecipient[];
}

export interface TicketReassignedEvent {
  ticketId: number;
  subject: string;
  previousTechnicianName: string;
  newTechnicianName: string;
  reassignedBy: string;
  recipients: MailRecipient[];
}
