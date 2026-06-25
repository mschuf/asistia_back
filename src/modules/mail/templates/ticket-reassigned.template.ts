/**
 * @file ticket-reassigned.template.ts
 * @description Plantillas de correo para notificar la reasignación de un ticket.
 */
import { escapeHtml } from "./html-utils";
import type { TicketReassignedRecipientRole } from "../mail.events";

/** Datos de entrada para plantillas de ticket reasignado. */
export interface TicketReassignedTemplateInput {
  ticketId: number;
  subject: string;
  previousTechnicianName: string;
  newTechnicianName: string;
  reassignedBy: string;
}

/**
 * Construye el asunto del correo de ticket reasignado.
 * @param input - Datos de la reasignación.
 * @param role - Rol del destinatario.
 * @returns Línea de asunto con ID de ticket y nuevo técnico.
 */
export function buildTicketReassignedSubject(
  input: TicketReassignedTemplateInput,
  role: TicketReassignedRecipientRole,
): string {
  if (role === "requester") {
    return `Su ticket #${input.ticketId} fue reasignado a ${input.newTechnicianName}`;
  }
  if (role === "new_technician") {
    return `Ticket #${input.ticketId} reasignado a usted`;
  }
  return `Ticket #${input.ticketId} reasignado a ${input.newTechnicianName}`;
}

/**
 * Genera el cuerpo HTML del correo de ticket reasignado.
 * @param input - Datos de la reasignación.
 * @param role - Rol del destinatario.
 * @returns Fragmento HTML del correo.
 */
export function buildTicketReassignedHtml(
  input: TicketReassignedTemplateInput,
  role: TicketReassignedRecipientRole,
): string {
  const intro =
    role === "requester"
      ? "Su ticket fue reasignado."
      : role === "previous_technician"
        ? "El ticket fue reasignado y ya no figura bajo su responsabilidad."
        : "Se le reasignó un ticket para su atención.";

  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2>Ticket #${input.ticketId}</h2>
      <p><strong>Asunto:</strong> ${escapeHtml(input.subject)}</p>
      <p>${intro}</p>
      <p>Técnico anterior: <strong>${escapeHtml(input.previousTechnicianName)}</strong></p>
      <p>Nuevo técnico: <strong>${escapeHtml(input.newTechnicianName)}</strong></p>
      <p>Reasignado por: ${escapeHtml(input.reassignedBy)}</p>
    </div>
  `;
}

/**
 * Genera el cuerpo en texto plano del correo de ticket reasignado.
 * @param input - Datos de la reasignación.
 * @param role - Rol del destinatario.
 * @returns Texto plano del correo.
 */
export function buildTicketReassignedText(
  input: TicketReassignedTemplateInput,
  role: TicketReassignedRecipientRole,
): string {
  const intro =
    role === "requester"
      ? `Su ticket #${input.ticketId} fue reasignado.`
      : role === "previous_technician"
        ? `El ticket #${input.ticketId} fue reasignado y ya no figura bajo su responsabilidad.`
        : `Se le reasignó el ticket #${input.ticketId}.`;

  return `${intro} Asunto: "${input.subject}". Técnico anterior: ${input.previousTechnicianName}. Nuevo técnico: ${input.newTechnicianName}. Reasignado por ${input.reassignedBy}.`;
}
