/**
 * @file ticket-assigned.template.ts
 * @description Plantillas de correo para notificar la asignación de un ticket a un técnico.
 */
import { escapeHtml } from "./html-utils";

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
 * @returns Línea de asunto con ID de ticket y nombre del técnico.
 */
export function buildTicketAssignedSubject(input: TicketAssignedTemplateInput): string {
  return `Ticket #${input.ticketId} asignado a ${input.technicianName}`;
}

/**
 * Genera el cuerpo HTML del correo de ticket asignado.
 * @param input - Datos de la asignación.
 * @returns Fragmento HTML del correo.
 */
export function buildTicketAssignedHtml(input: TicketAssignedTemplateInput): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2>Ticket #${input.ticketId}</h2>
      <p><strong>Asunto:</strong> ${escapeHtml(input.subject)}</p>
      <p>Asignado a <strong>${escapeHtml(input.technicianName)}</strong> por ${escapeHtml(input.assignedBy)}.</p>
    </div>
  `;
}

/**
 * Genera el cuerpo en texto plano del correo de ticket asignado.
 * @param input - Datos de la asignación.
 * @returns Texto plano del correo.
 */
export function buildTicketAssignedText(input: TicketAssignedTemplateInput): string {
  return `Ticket #${input.ticketId} - "${input.subject}". Asignado a ${input.technicianName} por ${input.assignedBy}.`;
}
