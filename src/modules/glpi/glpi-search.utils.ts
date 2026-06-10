/**
 * @file glpi-search.utils.ts
 * @description Utilidades para parsear respuestas de búsqueda `GET /search/:itemtype` de GLPI.
 */
export interface GlpiSearchEnvelope {
  totalcount?: number;
  count?: number;
  data?: unknown;
}

/**
 * Normaliza filas de `GET /search/:itemtype` (GLPI devuelve `data` como array u objeto).
 * @param payload - Cuerpo crudo de la respuesta de búsqueda.
 * @returns Filas como objetos planos; arreglo vacío si el payload no es válido.
 * @throws No lanza excepciones.
 */
export function parseGlpiSearchRows(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];

  const envelope = payload as GlpiSearchEnvelope;
  const raw = envelope.data;

  if (Array.isArray(raw)) {
    return raw.filter(
      (row): row is Record<string, unknown> => row !== null && typeof row === "object",
    );
  }

  if (raw && typeof raw === "object") {
    return Object.values(raw as Record<string, unknown>).filter(
      (row): row is Record<string, unknown> => row !== null && typeof row === "object",
    );
  }

  return [];
}

/**
 * Extrae el ID numérico de una fila de búsqueda GLPI.
 * @param row - Fila de resultado de búsqueda.
 * @param idField - Número de campo GLPI que contiene el ID.
 * @returns ID positivo o `null` si no es válido.
 * @throws No lanza excepciones.
 */
export function extractSearchRowId(row: Record<string, unknown>, idField: number): number | null {
  const id = Number(row[String(idField)] ?? 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Total de resultados de `GET /search/:itemtype` (body `totalcount` o header Content-Range).
 * @param payload - Cuerpo de la respuesta de búsqueda.
 * @param contentRange - Encabezado `Content-Range` opcional.
 * @returns Total de coincidencias o `0` si no se puede determinar.
 * @throws No lanza excepciones.
 */
export function parseGlpiSearchTotal(payload: unknown, contentRange?: string): number {
  if (payload && typeof payload === "object") {
    const totalcount = Number((payload as GlpiSearchEnvelope).totalcount);
    if (Number.isFinite(totalcount) && totalcount >= 0) return totalcount;
  }
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)$/);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value >= 0) return value;
    }
  }
  return 0;
}
