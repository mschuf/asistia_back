/**
 * @file html-text.utils.ts
 * @description Utilidades para decodificar entidades HTML y convertir fragmentos HTML a texto plano.
 */

/**
 * Decodifica entidades HTML comunes en una cadena.
 * @param value - Texto con entidades HTML.
 * @returns Texto con caracteres decodificados.
 */
export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

const BLOCK_BREAK = /<\/(?:p|div|li|h[1-6]|tr|blockquote|pre)>/gi;

/**
 * Convierte HTML a texto plano preservando saltos de línea básicos.
 * @param value - Fragmento HTML o cadena vacía/nula.
 * @returns Texto plano recortado o `null` si no queda contenido.
 */
export function htmlToPlainText(value: string | null | undefined): string | null {
  if (!value) return null;

  const decoded = decodeHtmlEntities(value);
  const withBreaks = decoded.replace(/<br\s*\/?>/gi, "\n").replace(BLOCK_BREAK, "\n");
  const text = withBreaks
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text || null;
}
