import { escapeHtml } from "../../mail/templates/html-utils";

const RESOLUTION_SEPARATOR = "//";
const PLAIN_SEPARATOR = ` ${RESOLUTION_SEPARATOR} `;
const HTML_SEPARATOR = `<br>${RESOLUTION_SEPARATOR} `;

function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}

/**
 * Appends the technician resolution note after the requester's description.
 * The "//" separator is added automatically; callers pass only the new text.
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
