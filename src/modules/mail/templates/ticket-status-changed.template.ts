/**
 * @file ticket-status-changed.template.ts
 * @description Plantillas de correo para notificar cambios de estado en un ticket.
 */
import { escapeHtml } from "./html-utils";

/** Datos de entrada para plantillas de cambio de estado. */
export interface TicketStatusChangedTemplateInput {
  ticketId: number;
  subject: string;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
}

/**
 * Construye el asunto del correo de cambio de estado.
 * @param input - Datos del cambio de estado.
 * @returns Línea de asunto con ID de ticket y nuevo estado.
 */
export function buildTicketStatusChangedSubject(input: TicketStatusChangedTemplateInput): string {
  return `Ticket #${input.ticketId} - estado: ${input.newStatus}`;
}

/**
 * Genera el cuerpo HTML del correo de cambio de estado.
 * @param input - Datos del cambio de estado.
 * @returns Fragmento HTML del correo.
 */
export function buildTicketStatusChangedHtml(input: TicketStatusChangedTemplateInput): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2>Ticket #${input.ticketId}</h2>
      <p><strong>Asunto:</strong> ${escapeHtml(input.subject)}</p>
      <p>Estado actualizado de <strong>${escapeHtml(input.previousStatus)}</strong> a <strong>${escapeHtml(input.newStatus)}</strong>.</p>
      <p>Actualizado por: ${escapeHtml(input.changedBy)}</p>
    </div>
  `;
}

/**
 * Genera el cuerpo en texto plano del correo de cambio de estado.
 * @param input - Datos del cambio de estado.
 * @returns Texto plano del correo.
 */
export function buildTicketStatusChangedText(input: TicketStatusChangedTemplateInput): string {
  return `Ticket #${input.ticketId} - "${input.subject}". Estado: ${input.previousStatus} -> ${input.newStatus}. Actualizado por ${input.changedBy}.`;
}
