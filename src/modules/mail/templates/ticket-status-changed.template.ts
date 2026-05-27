import { escapeHtml } from "./html-utils";

export interface TicketStatusChangedTemplateInput {
  ticketId: number;
  subject: string;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
}

export function buildTicketStatusChangedSubject(input: TicketStatusChangedTemplateInput): string {
  return `Ticket #${input.ticketId} - estado: ${input.newStatus}`;
}

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

export function buildTicketStatusChangedText(input: TicketStatusChangedTemplateInput): string {
  return `Ticket #${input.ticketId} - "${input.subject}". Estado: ${input.previousStatus} -> ${input.newStatus}. Actualizado por ${input.changedBy}.`;
}
