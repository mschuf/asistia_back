/**
 * @file ticket-reassigned.template.ts
 * @description Plantillas de correo para notificar la reasignación de un ticket a otro técnico.
 */
import { escapeHtml } from "./html-utils";

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
 * @returns Línea de asunto con ID de ticket y nuevo técnico.
 */
export function buildTicketReassignedSubject(input: TicketReassignedTemplateInput): string {
  return `Ticket #${input.ticketId} reasignado a ${input.newTechnicianName}`;
}

/**
 * Genera el cuerpo HTML del correo de ticket reasignado.
 * @param input - Datos de la reasignación.
 * @returns Fragmento HTML del correo.
 */
export function buildTicketReassignedHtml(input: TicketReassignedTemplateInput): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2>Ticket #${input.ticketId}</h2>
      <p><strong>Asunto:</strong> ${escapeHtml(input.subject)}</p>
      <p>El ticket fue reasignado y ya no figura bajo su responsabilidad.</p>
      <p>Nuevo técnico: <strong>${escapeHtml(input.newTechnicianName)}</strong></p>
      <p>Reasignado por: ${escapeHtml(input.reassignedBy)}</p>
    </div>
  `;
}

/**
 * Genera el cuerpo en texto plano del correo de ticket reasignado.
 * @param input - Datos de la reasignación.
 * @returns Texto plano del correo.
 */
export function buildTicketReassignedText(input: TicketReassignedTemplateInput): string {
  return `Ticket #${input.ticketId} - "${input.subject}". Fue reasignado y ya no figura bajo la responsabilidad de ${input.previousTechnicianName}. Nuevo técnico: ${input.newTechnicianName}. Reasignado por ${input.reassignedBy}.`;
}
