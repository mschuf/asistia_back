/**
 * @file mail.events.ts
 * @description Constantes de eventos y tipos de payload para notificaciones por correo de tickets.
 */

/** Nombres de eventos emitidos por el módulo de correo. */
export const MAIL_EVENTS = {
  TICKET_CREATED: "mail.ticket.created",
  TICKET_STATUS_CHANGED: "mail.ticket.status_changed",
  TICKET_ASSIGNED: "mail.ticket.assigned",
  TICKET_REASSIGNED: "mail.ticket.reassigned",
  ERS_ESCALATED: "mail.ers.escalated",
  ERS_CREATED: "mail.ers.created",
  ERS_TEAM_ASSIGNED: "mail.ers.team_assigned",
  ERS_CLOSED: "mail.ers.closed",
} as const;

/** Destinatario de correo con nombre visible y dirección. */
export interface MailRecipient {
  name: string;
  email: string;
}

/** Rol del destinatario en la notificación de ticket creado. */
export type TicketCreatedRecipientRole = "requester" | "technician";

/** Destinatario de ticket creado con rol para personalizar la plantilla. */
export interface TicketCreatedRecipient extends MailRecipient {
  role: TicketCreatedRecipientRole;
}

/** Payload del evento emitido al crear un ticket. */
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

/** Payload del evento emitido al cambiar el estado de un ticket. */
export interface TicketStatusChangedEvent {
  ticketId: number;
  subject: string;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
  recipients: MailRecipient[];
}

/** Payload del evento emitido al asignar un ticket a un técnico. */
export type TicketAssignedRecipientRole = "requester" | "new_technician";

/** Destinatario de ticket asignado con rol para personalizar la plantilla. */
export interface TicketAssignedRecipient extends MailRecipient {
  role: TicketAssignedRecipientRole;
}

/** Payload del evento emitido al asignar un ticket a un técnico. */
export interface TicketAssignedEvent {
  ticketId: number;
  subject: string;
  technicianName: string;
  assignedBy: string;
  notify: TicketAssignedRecipient[];
}

/** Payload del evento emitido al reasignar un ticket a otro técnico. */
export type TicketReassignedRecipientRole =
  | "requester"
  | "previous_technician"
  | "new_technician";

/** Destinatario de ticket reasignado con rol para personalizar la plantilla. */
export interface TicketReassignedRecipient extends MailRecipient {
  role: TicketReassignedRecipientRole;
}

/** Payload del evento emitido al reasignar un ticket a otro técnico. */
export interface TicketReassignedEvent {
  ticketId: number;
  subject: string;
  previousTechnicianName: string;
  newTechnicianName: string;
  reassignedBy: string;
  notify: TicketReassignedRecipient[];
}

/** Payload del evento emitido al solicitante cuando su ticket escala a ERS. */
export interface ErsEscalatedEvent {
  projectId: number;
  projectName: string;
  ticketId: number;
  requesterName: string;
  notify: MailRecipient[];
}

/** Origen de creación de un proyecto ERS. */
export type ErsCreatedOrigin = "escalated" | "standalone";

/** Payload del evento emitido al revisor (Martin) cuando se crea un ERS. */
export interface ErsCreatedEvent {
  projectId: number;
  projectName: string;
  ticketId: number | null;
  requesterName: string;
  origin: ErsCreatedOrigin;
  notify: MailRecipient[];
}

/** Payload del evento emitido a los miembros de equipo asignados a un proyecto ERS. */
export interface ErsTeamAssignedEvent {
  projectId: number;
  projectName: string;
  assignedBy: string;
  notify: MailRecipient[];
}

/** Payload del evento emitido a los implicados cuando un proyecto ERS se cierra. */
export interface ErsClosedEvent {
  projectId: number;
  projectName: string;
  ticketId: number | null;
  finalStateName: string;
  notify: MailRecipient[];
}
