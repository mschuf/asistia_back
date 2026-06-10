/**
 * @file mail-request.template.ts
 * @description Plantillas de confirmación al usuario y notificación al soporte para solicitudes por correo.
 */
import { escapeHtml, stripHtml } from "./html-utils";

/** Datos de entrada para plantillas de solicitud registrada por correo. */
export interface MailRequestTemplateInput {
  requesterName: string;
  requesterEmail: string;
  requesterUserId: number | null;
  categoryName: string;
  description: string;
}

/**
 * Construye el asunto del correo de confirmación al solicitante.
 * @param input - Datos de la solicitud registrada.
 * @returns Línea de asunto personalizada con la categoría.
 */
export function buildUserConfirmationSubject(input: MailRequestTemplateInput): string {
  return `Su solicitud fue registrada - ${input.categoryName}`;
}

/**
 * Genera el cuerpo HTML de confirmación para el solicitante.
 * @param input - Datos de la solicitud registrada.
 * @returns Fragmento HTML del correo de confirmación.
 */
export function buildUserConfirmationHtml(input: MailRequestTemplateInput): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <p>Hola ${escapeHtml(input.requesterName)},</p>
      <p>Su solicitud fue registrada correctamente.</p>
      <table style="border-collapse: collapse;">
        <tr><td style="padding:4px 8px;"><strong>Categoría</strong></td><td style="padding:4px 8px;">${escapeHtml(input.categoryName)}</td></tr>
      </table>
      <hr style="border:0;border-top:1px solid #d1d5db;margin:16px 0;" />
      <div>${escapeHtml(input.description)}</div>
    </div>
  `;
}

/**
 * Genera el cuerpo en texto plano de confirmación para el solicitante.
 * @param input - Datos de la solicitud registrada.
 * @returns Texto plano del correo de confirmación.
 */
export function buildUserConfirmationText(input: MailRequestTemplateInput): string {
  return [
    `Hola ${input.requesterName},`,
    "",
    "Su solicitud fue registrada correctamente.",
    "",
    `Categoría: ${input.categoryName}`,
    "",
    input.description,
  ].join("\n");
}

/**
 * Construye el asunto del correo de notificación al equipo de soporte.
 * @param input - Datos de la solicitud entrante.
 * @returns Línea de asunto con categoría y nombre del solicitante.
 */
export function buildSupportNotificationSubject(input: MailRequestTemplateInput): string {
  return `Nueva solicitud - ${input.categoryName} - ${input.requesterName}`;
}

/**
 * Genera el cuerpo HTML de notificación para el equipo de soporte.
 * @param input - Datos de la solicitud entrante.
 * @returns Fragmento HTML con datos del solicitante y descripción.
 */
export function buildSupportNotificationHtml(input: MailRequestTemplateInput): string {
  const userIdLabel =
    input.requesterUserId !== null ? String(input.requesterUserId) : "Sin ID GLPI";

  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <p>Se recibió una nueva solicitud por correo.</p>
      <table style="border-collapse: collapse;">
        <tr><td style="padding:4px 8px;"><strong>Solicitante</strong></td><td style="padding:4px 8px;">${escapeHtml(input.requesterName)}</td></tr>
        <tr><td style="padding:4px 8px;"><strong>Email</strong></td><td style="padding:4px 8px;">${escapeHtml(input.requesterEmail)}</td></tr>
        <tr><td style="padding:4px 8px;"><strong>ID GLPI</strong></td><td style="padding:4px 8px;">${escapeHtml(userIdLabel)}</td></tr>
        <tr><td style="padding:4px 8px;"><strong>Categoría</strong></td><td style="padding:4px 8px;">${escapeHtml(input.categoryName)}</td></tr>
      </table>
      <hr style="border:0;border-top:1px solid #d1d5db;margin:16px 0;" />
      <div>${escapeHtml(input.description)}</div>
    </div>
  `;
}

/**
 * Genera el cuerpo en texto plano de notificación para el equipo de soporte.
 * @param input - Datos de la solicitud entrante.
 * @returns Texto plano con metadatos del solicitante y descripción sin HTML.
 */
export function buildSupportNotificationText(input: MailRequestTemplateInput): string {
  const userIdLabel =
    input.requesterUserId !== null ? String(input.requesterUserId) : "Sin ID GLPI";

  return [
    "Se recibió una nueva solicitud por correo.",
    "",
    `Solicitante: ${input.requesterName}`,
    `Email: ${input.requesterEmail}`,
    `ID GLPI: ${userIdLabel}`,
    `Categoría: ${input.categoryName}`,
    "",
    stripHtml(input.description),
  ].join("\n");
}
