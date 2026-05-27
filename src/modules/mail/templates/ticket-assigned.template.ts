import { escapeHtml } from "./html-utils";

export interface TicketAssignedTemplateInput {
  ticketId: number;
  subject: string;
  technicianName: string;
  assignedBy: string;
}

export function buildTicketAssignedSubject(input: TicketAssignedTemplateInput): string {
  return `Ticket #${input.ticketId} asignado a ${input.technicianName}`;
}

export function buildTicketAssignedHtml(input: TicketAssignedTemplateInput): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2>Ticket #${input.ticketId}</h2>
      <p><strong>Asunto:</strong> ${escapeHtml(input.subject)}</p>
      <p>Asignado a <strong>${escapeHtml(input.technicianName)}</strong> por ${escapeHtml(input.assignedBy)}.</p>
    </div>
  `;
}

export function buildTicketAssignedText(input: TicketAssignedTemplateInput): string {
  return `Ticket #${input.ticketId} - "${input.subject}". Asignado a ${input.technicianName} por ${input.assignedBy}.`;
}
