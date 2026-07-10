/**
 * @file ers-closed.template.ts
 * @description Plantillas de correo para notificar a los implicados cuando un ERS se cierra.
 */
import { escapeHtml } from "./html-utils";

/** Datos de entrada para plantillas de ERS cerrado. */
export interface ErsClosedTemplateInput {
  projectId: number;
  projectName: string;
  ticketId: number | null;
  finalStateName: string;
}

/**
 * Construye el asunto del correo de ERS cerrado.
 * @param input - Datos del proyecto ERS cerrado.
 * @returns Línea de asunto con ID de proyecto.
 */
export function buildErsClosedSubject(input: ErsClosedTemplateInput): string {
  return `ERS #${input.projectId} cerrado: ${input.projectName}`;
}

/**
 * Genera el cuerpo HTML del correo de ERS cerrado.
 * @param input - Datos del proyecto ERS cerrado.
 * @returns Fragmento HTML del correo.
 */
export function buildErsClosedHtml(input: ErsClosedTemplateInput): string {
  const ticketLine = input.ticketId ? `<p>Ticket de origen: #${input.ticketId}</p>` : "";
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2>Proyecto ERS #${input.projectId}</h2>
      <p>El proyecto ERS <strong>"${escapeHtml(input.projectName)}"</strong> fue cerrado con estado <strong>${escapeHtml(input.finalStateName)}</strong>.</p>
      ${ticketLine}
    </div>
  `;
}

/**
 * Genera el cuerpo en texto plano del correo de ERS cerrado.
 * @param input - Datos del proyecto ERS cerrado.
 * @returns Texto plano del correo.
 */
export function buildErsClosedText(input: ErsClosedTemplateInput): string {
  const ticketLine = input.ticketId ? ` Ticket de origen: #${input.ticketId}.` : "";
  return `El proyecto ERS #${input.projectId} "${input.projectName}" fue cerrado con estado ${input.finalStateName}.${ticketLine}`;
}
