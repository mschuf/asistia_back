/**
 * @file ers-created.template.ts
 * @description Plantillas de correo para notificar al revisor cuando se crea un ERS.
 */
import { escapeHtml } from "./html-utils";
import type { ErsCreatedOrigin } from "../mail.events";

/** Datos de entrada para plantillas de ERS creado. */
export interface ErsCreatedTemplateInput {
  projectId: number;
  projectName: string;
  ticketId: number | null;
  requesterName: string;
  origin: ErsCreatedOrigin;
}

/**
 * Construye el asunto del correo de ERS creado.
 * @param input - Datos del proyecto ERS creado.
 * @returns Línea de asunto con ID de proyecto.
 */
export function buildErsCreatedSubject(input: ErsCreatedTemplateInput): string {
  return `Nuevo ERS creado:  ${input.projectName}`;
}

/**
 * Genera el cuerpo HTML del correo de ERS creado.
 * @param input - Datos del proyecto ERS creado.
 * @returns Fragmento HTML del correo.
 */
export function buildErsCreatedHtml(input: ErsCreatedTemplateInput): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2>Proyecto ERS #${input.projectId}</h2>
      <p>Nuevo proyecto ERS: ${escapeHtml(input.projectName)}</p>
      <p>Ingrese a asistIA para aprobarlo.</p>
      <p>Solicitante: <strong>${escapeHtml(input.requesterName)}</strong>.</p>
    </div>
  `;
}

/**
 * Genera el cuerpo en texto plano del correo de ERS creado.
 * @param input - Datos del proyecto ERS creado.
 * @returns Texto plano del correo.
 */
export function buildErsCreatedText(input: ErsCreatedTemplateInput): string {
  return `Nuevo proyecto ERS: ${input.projectName}\nIngrese a asistIA para aprobarlo.\nSolicitante: ${input.requesterName}.`;
}
