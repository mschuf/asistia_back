import { escapeHtml, stripHtml } from "./html-utils";
import type { TicketCreatedRecipientRole } from "../mail.events";

export interface TicketCreatedTemplateInput {
  ticketId: number;
  type: string;
  subject: string;
  description: string;
  requesterName: string;
  technicianName: string | null;
  categoryName: string | null;
  locationName: string | null;
}

function buildDetailsRows(input: TicketCreatedTemplateInput): string {
  return [
    `<tr><td style="padding:4px 8px;"><strong>Asunto</strong></td><td style="padding:4px 8px;">${escapeHtml(input.subject)}</td></tr>`,
    `<tr><td style="padding:4px 8px;"><strong>Tipo</strong></td><td style="padding:4px 8px;">${escapeHtml(input.type)}</td></tr>`,
    `<tr><td style="padding:4px 8px;"><strong>Solicitante</strong></td><td style="padding:4px 8px;">${escapeHtml(input.requesterName)}</td></tr>`,
    `<tr><td style="padding:4px 8px;"><strong>T├®cnico</strong></td><td style="padding:4px 8px;">${escapeHtml(input.technicianName ?? "Sin asignar")}</td></tr>`,
    input.categoryName
      ? `<tr><td style="padding:4px 8px;"><strong>Categor├¡a</strong></td><td style="padding:4px 8px;">${escapeHtml(input.categoryName)}</td></tr>`
      : "",
    input.locationName
      ? `<tr><td style="padding:4px 8px;"><strong>Ubicaci├│n</strong></td><td style="padding:4px 8px;">${escapeHtml(input.locationName)}</td></tr>`
      : "",
  ].join("");
}

function buildDetailsText(input: TicketCreatedTemplateInput): string[] {
  return [
    `Asunto: ${input.subject}`,
    `Tipo: ${input.type}`,
    `Solicitante: ${input.requesterName}`,
    `T├®cnico: ${input.technicianName ?? "Sin asignar"}`,
    input.categoryName ? `Categor├¡a: ${input.categoryName}` : null,
    input.locationName ? `Ubicaci├│n: ${input.locationName}` : null,
  ].filter((line): line is string => line !== null);
}

export function buildTicketCreatedSubject(
  input: TicketCreatedTemplateInput,
  role: TicketCreatedRecipientRole,
): string {
  if (role === "technician") {
    return `Nuevo ticket #${input.ticketId} - ${input.subject}`;
  }
  return `Su ticket #${input.ticketId} fue creado`;
}

export function buildTicketCreatedHtml(
  input: TicketCreatedTemplateInput,
  role: TicketCreatedRecipientRole,
): string {
  const intro =
    role === "technician"
      ? `<p>Tienes un nuevo ticket <strong>#${input.ticketId}</strong> asignado.</p>`
      : `<p>Su ticket fue creado con el id <strong>#${input.ticketId}</strong>.</p>`;

  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      ${intro}
      <h2 style="margin: 0 0 12px;">Ticket #${input.ticketId}</h2>
      <table style="border-collapse: collapse;">
        ${buildDetailsRows(input)}
      </table>
      <hr style="border:0;border-top:1px solid #d1d5db;margin:16px 0;" />
      <div>${input.description}</div>
    </div>
  `;
}

export function buildTicketCreatedText(
  input: TicketCreatedTemplateInput,
  role: TicketCreatedRecipientRole,
): string {
  const intro =
    role === "technician"
      ? `Tienes un nuevo ticket #${input.ticketId} asignado.`
      : `Su ticket fue creado con el id #${input.ticketId}.`;

  return [
    intro,
    "",
    `Ticket #${input.ticketId}`,
    ...buildDetailsText(input),
    "",
    stripHtml(input.description),
  ].join("\n");
}
