/**
 * @file user-search.utils.ts
 * @description Utilidades de búsqueda, normalización y ordenación de usuarios de dominio.
 */
import type { DomainUser } from "./mappers/user.mapper";

/**
 * Normaliza texto para búsqueda: sin acentos, minúsculas y sin espacios extremos.
 * @param value - Cadena de entrada.
 * @returns Texto normalizado para comparación.
 * @throws No lanza excepciones.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Normaliza un correo electrónico para comparación.
 * @param value - Correo de entrada.
 * @returns Correo en minúsculas y sin espacios extremos.
 * @throws No lanza excepciones.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Compara dos correos ignorando mayúsculas y espacios.
 * @param left - Primer correo.
 * @param right - Segundo correo.
 * @returns `true` si representan el mismo correo.
 * @throws No lanza excepciones.
 */
export function emailsMatch(left: string, right: string): boolean {
  return normalizeEmail(left) === normalizeEmail(right);
}

/**
 * Evalúa si un usuario coincide con todos los tokens de búsqueda.
 * @param user - Usuario de dominio a evaluar.
 * @param search - Texto de búsqueda libre.
 * @returns `true` si todos los tokens aparecen en nombre, login o email.
 * @throws No lanza excepciones.
 */
export function matchesUserSearch(user: DomainUser, search: string): boolean {
  const normalized = normalizeForSearch(search);
  if (!normalized) {
    return true;
  }

  const haystack = normalizeForSearch(
    [user.fullName, user.login, user.email, user.firstName, user.lastName]
      .filter(Boolean)
      .join(" "),
  );

  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Ordena usuarios alfabéticamente por nombre completo (locale `es`).
 * @param users - Lista de usuarios a ordenar.
 * @returns Nueva lista ordenada sin mutar el original.
 * @throws No lanza excepciones.
 */
export function sortUsersByName(users: DomainUser[]): DomainUser[] {
  return [...users].sort((left, right) =>
    left.fullName.localeCompare(right.fullName, "es", { sensitivity: "base" }),
  );
}

/**
 * Extrae el total de registros del encabezado Content-Range de GLPI.
 * @param contentRange - Valor del encabezado `Content-Range`.
 * @returns Total numérico o `null` si no se puede parsear.
 * @throws No lanza excepciones.
 */
export function parseContentRangeTotal(contentRange: string | undefined): number | null {
  if (!contentRange) {
    return null;
  }

  const match = contentRange.match(/\/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}
