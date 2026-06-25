/**
 * @file ticket-assigned.template.ts
 * @description Plantillas de correo para notificar la asignación inicial de un ticket.
 */
import { escapeHtml } from "./html-utils";
import type { TicketAssignedRecipientRole } from "../mail.events";

/** Datos de entrada para plantillas de ticket asignado. */
export interface TicketAssignedTemplateInput {
  ticketId: number;
  subject: string;
  technicianName: string;
  assignedBy: string;
}

/**
 * Construye el asunto del correo de ticket asignado.
 * @param input - Datos de la asignación.
 * @param role - Rol del destinatario.
 * @returns Línea de asunto con ID de ticket y nombre del técnico.
 */
export function buildTicketAssignedSubject(
  input: TicketAssignedTemplateInput,
  role: TicketAssignedRecipientRole,
): string {
  if (role === "requester") {
    return `Su ticket #${input.ticketId} fue asignado a ${input.technicianName}`;
  }
  return `Ticket #${input.ticketId} asignado a ${input.technicianName}`;
}

/**
 * Genera el cuerpo HTML del correo de ticket asignado.
 * @param input - Datos de la asignación.
 * @param role - Rol del destinatario.
 * @returns Fragmento HTML del correo.
 */
export function buildTicketAssignedHtml(
  input: TicketAssignedTemplateInput,
  role: TicketAssignedRecipientRole,
): string {
  const message =
    role === "requester"
      ? `Su ticket fue asignado a <strong>${escapeHtml(input.technicianName)}</strong>.`
      : `Se le asignó el ticket <strong>#${input.ticketId}</strong>.`;

  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2>Ticket #${input.ticketId}</h2>
      <p><strong>Asunto:</strong> ${escapeHtml(input.subject)}</p>
      <p>${message}</p>
      <p>Técnico asignado: <strong>${escapeHtml(input.technicianName)}</strong></p>
      <p>Asignado por: ${escapeHtml(input.assignedBy)}</p>
    </div>
  `;
}

/**
 * Genera el cuerpo en texto plano del correo de ticket asignado.
 * @param input - Datos de la asignación.
 * @param role - Rol del destinatario.
 * @returns Texto plano del correo.
 */
export function buildTicketAssignedText(
  input: TicketAssignedTemplateInput,
  role: TicketAssignedRecipientRole,
): string {
  const intro =
    role === "requester"
      ? `Su ticket #${input.ticketId} fue asignado a ${input.technicianName}.`
      : `Se le asignó el ticket #${input.ticketId}.`;

  return `${intro} Asunto: "${input.subject}". Técnico asignado: ${input.technicianName}. Asignado por ${input.assignedBy}.`;
}
