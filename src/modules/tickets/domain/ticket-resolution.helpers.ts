/**
 * @file ticket-resolution.helpers.ts
 * @description Concatena notas de resolución del técnico al contenido del ticket en GLPI.
 */
import { escapeHtml } from "../../mail/templates/html-utils";

const RESOLUTION_SEPARATOR = "//";
const PLAIN_SEPARATOR = ` ${RESOLUTION_SEPARATOR} `;
const HTML_SEPARATOR = `<br>${RESOLUTION_SEPARATOR} `;

/**
 * Detecta si el contenido parece HTML para elegir el separador adecuado.
 * @param value - Texto a evaluar.
 * @returns `true` si contiene etiquetas HTML.
 * @throws Ninguno.
 */
function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}

/**
 * Appends the technician resolution note after the requester's description.
 * The "//" separator is added automatically; callers pass only the new text.
 *
 * Añade la nota de resolución del técnico tras la descripción del solicitante.
 * @param rawContent - Contenido actual del ticket en GLPI (puede ser nulo).
 * @param resolutionNote - Texto de lo realizado por el técnico.
 * @returns Contenido concatenado con el separador `//`.
 * @throws Ninguno.
 */
export function appendResolutionNote(rawContent: string | null, resolutionNote: string): string {
  const note = resolutionNote.trim();
  const base = (rawContent ?? "").trim();

  if (!base) {
    return note ? `${RESOLUTION_SEPARATOR} ${note}` : RESOLUTION_SEPARATOR;
  }

  if (looksLikeHtml(base)) {
    const escapedNote = escapeHtml(note);
    return `${base}${HTML_SEPARATOR}${escapedNote}`;
  }

  return `${base}${PLAIN_SEPARATOR}${note}`;
}
