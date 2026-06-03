import { escapeHtml, stripHtml } from "./html-utils";

export interface MailRequestTemplateInput {
  requesterName: string;
  requesterEmail: string;
  requesterUserId: number | null;
  categoryName: string;
  description: string;
}

export function buildUserConfirmationSubject(input: MailRequestTemplateInput): string {
  return `Su solicitud fue registrada - ${input.categoryName}`;
}

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

export function buildSupportNotificationSubject(input: MailRequestTemplateInput): string {
  return `Nueva solicitud - ${input.categoryName} - ${input.requesterName}`;
}

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
