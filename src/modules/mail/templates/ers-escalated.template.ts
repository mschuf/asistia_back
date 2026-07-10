/**
 * @file ers-escalated.template.ts
 * @description Plantillas de correo para notificar al solicitante que su ticket escaló a ERS.
 */
import { escapeHtml } from "./html-utils";

/** Datos de entrada para plantillas de ERS escalado. */
export interface ErsEscalatedTemplateInput {
  projectId: number;
  projectName: string;
  ticketId: number;
  requesterName: string;
}

/**
 * Construye el asunto del correo de ticket escalado a ERS.
 * @param input - Datos del proyecto ERS creado.
 * @returns Línea de asunto con ID de ticket.
 */
export function buildErsEscalatedSubject(input: ErsEscalatedTemplateInput): string {
  return `Su ticket #${input.ticketId} fue escalado a ERS`;
}

/**
 * Genera el cuerpo HTML del correo de ticket escalado a ERS.
 * @param input - Datos del proyecto ERS creado.
 * @returns Fragmento HTML del correo.
 */
export function buildErsEscalatedHtml(input: ErsEscalatedTemplateInput): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2>Ticket #${input.ticketId} escalado a ERS</h2>
      <p>Su ticket fue escalado al proyecto ERS <strong>"${escapeHtml(input.projectName)}"</strong> (#${input.projectId}).</p>
      <p>Le mantendremos informado sobre el avance del proyecto.</p>
    </div>
  `;
}

/**
 * Genera el cuerpo en texto plano del correo de ticket escalado a ERS.
 * @param input - Datos del proyecto ERS creado.
 * @returns Texto plano del correo.
 */
export function buildErsEscalatedText(input: ErsEscalatedTemplateInput): string {
  return `Su ticket #${input.ticketId} fue escalado al proyecto ERS "${input.projectName}" (#${input.projectId}).`;
}
