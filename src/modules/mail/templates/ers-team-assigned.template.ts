/**
 * @file ers-team-assigned.template.ts
 * @description Plantillas de correo para notificar a un miembro asignado al equipo de un ERS.
 */
import { escapeHtml } from "./html-utils";

/** Datos de entrada para plantillas de asignación de equipo ERS. */
export interface ErsTeamAssignedTemplateInput {
  projectId: number;
  projectName: string;
  assignedBy: string;
}

/**
 * Construye el asunto del correo de asignación al equipo de un ERS.
 * @param input - Datos del proyecto ERS.
 * @returns Línea de asunto con ID de proyecto.
 */
export function buildErsTeamAssignedSubject(input: ErsTeamAssignedTemplateInput): string {
  return `Fue asignado al equipo del ERS #${input.projectId}`;
}

/**
 * Genera el cuerpo HTML del correo de asignación al equipo de un ERS.
 * @param input - Datos del proyecto ERS.
 * @returns Fragmento HTML del correo.
 */
export function buildErsTeamAssignedHtml(input: ErsTeamAssignedTemplateInput): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2>Proyecto ERS #${input.projectId}</h2>
      <p>Fue asignado al equipo del proyecto ERS <strong>"${escapeHtml(input.projectName)}"</strong>.</p>
      <p>Asignado por: ${escapeHtml(input.assignedBy)}</p>
    </div>
  `;
}

/**
 * Genera el cuerpo en texto plano del correo de asignación al equipo de un ERS.
 * @param input - Datos del proyecto ERS.
 * @returns Texto plano del correo.
 */
export function buildErsTeamAssignedText(input: ErsTeamAssignedTemplateInput): string {
  return `Fue asignado al equipo del proyecto ERS #${input.projectId} "${input.projectName}". Asignado por ${input.assignedBy}.`;
}
