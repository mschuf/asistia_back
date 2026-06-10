/**
 * @file company-search.utils.ts
 * @description Utilidades para interpretar tokens de búsqueda de empresas (texto y estado activo/inactivo).
 */
const INACTIVE_PREFIXES = ["inactiva", "inactivo", "inactive"] as const;
const ACTIVE_PREFIXES = ["activa", "activo", "active"] as const;

/** Resultado del parseo de una cadena de búsqueda de empresas. */
export interface ParsedCompanySearch {
  text?: string;
  isActive?: boolean;
}

/**
 * Determina si un token corresponde a un prefijo de empresa inactiva.
 * @param token - Fragmento de búsqueda del usuario.
 * @returns `true` si el token indica filtro por inactivas.
 */
function isInactiveToken(token: string): boolean {
  const normalized = token.toLowerCase();
  if (normalized.length < 3) return false;
  if (normalized.startsWith("inac")) return true;
  return INACTIVE_PREFIXES.some((prefix) => prefix.startsWith(normalized));
}

/**
 * Determina si un token corresponde a un prefijo de empresa activa.
 * @param token - Fragmento de búsqueda del usuario.
 * @returns `true` si el token indica filtro por activas.
 */
function isActiveToken(token: string): boolean {
  const normalized = token.toLowerCase();
  if (normalized.length < 3) return false;
  if (normalized.startsWith("inac")) return false;
  if (normalized.startsWith("activ")) return true;
  return ACTIVE_PREFIXES.some((prefix) => prefix.startsWith(normalized));
}

/**
 * Parsea una búsqueda libre separando tokens de estado activo/inactivo del texto restante.
 * @param search - Cadena de búsqueda ingresada por el usuario.
 * @returns Objeto con texto libre y/o filtro de estado activo.
 */
export function parseCompanySearch(search: string): ParsedCompanySearch {
  const trimmed = search.trim();
  if (!trimmed) return {};

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  let isActive: boolean | undefined;
  const textTokens: string[] = [];

  for (const token of tokens) {
    if (isInactiveToken(token)) {
      isActive = false;
      continue;
    }
    if (isActiveToken(token)) {
      isActive = true;
      continue;
    }
    textTokens.push(token);
  }

  const text = textTokens.join(" ").trim();
  return {
    ...(text ? { text } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  };
}
