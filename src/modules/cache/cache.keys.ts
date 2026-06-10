/**
 * @file cache.keys.ts
 * @description Claves estandarizadas para entradas del caché en memoria.
 */

/** Catálogo de claves de caché usadas por servicios de catálogo, usuarios y sesión GLPI. */
export const CACHE_KEYS = {
  CATEGORIES: "catalog:categories",
  LOCATIONS: "catalog:locations",
  LOCATIONS_ACTIVE: "catalog:locations:active",
  GROUPS: "catalog:groups",
  USERS_ALL: "users:all",
  USERS_TECHNICIANS: "users:technicians",
  /**
   * Construye la clave de caché para una sesión GLPI.
   * @param sessionKey - Identificador de la sesión GLPI.
   * @returns Clave namespaced `glpi:session:{sessionKey}`.
   */
  GLPI_SESSION: (sessionKey: string) => `glpi:session:${sessionKey}`,
} as const;
