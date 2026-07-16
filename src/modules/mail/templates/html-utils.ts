/**
 * @file html-utils.ts
 * @description Utilidades para escapar HTML y generar texto plano desde contenido HTML.
 */

/**
 * Escapa caracteres especiales para insertar texto seguro en plantillas HTML.
 * @param value - Cadena con posible contenido dinámico del usuario.
 * @returns Cadena con entidades HTML escapadas.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Elimina etiquetas HTML y normaliza espacios para versiones en texto plano.
 * @param value - Contenido HTML o mixto.
 * @returns Texto plano sin etiquetas y con espacios colapsados.
 */
export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Longitud máxima de un tag válido (glpi_tickets.name reutilizado como tag). */
const TAG_MAX_LENGTH = 15;

/**
 * Concatena el tag entre corchetes al asunto mostrado en el cuerpo del correo.
 * Omite el tag si está vacío, si excede la longitud de un tag válido (título
 * heredado) o si coincide con el propio asunto.
 * @param subject - Asunto visible (categoría del ticket).
 * @param tag - Tag corto del ticket o `null`.
 * @returns `"Asunto [TAG]"` o el asunto sin cambios.
 */
export function formatSubjectWithTag(subject: string, tag?: string | null): string {
  const trimmedTag = tag?.trim();
  if (!trimmedTag) return subject;
  if (trimmedTag.length > TAG_MAX_LENGTH) return subject;
  if (trimmedTag === subject.trim()) return subject;
  return `${subject} [${trimmedTag}]`;
}
