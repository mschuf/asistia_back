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
