export const CACHE_KEYS = {
  CATEGORIES: "catalog:categories",
  LOCATIONS: "catalog:locations",
  LOCATIONS_ACTIVE: "catalog:locations:active",
  GROUPS: "catalog:groups",
  USERS_ALL: "users:all",
  USERS_TECHNICIANS: "users:technicians",
  GLPI_SESSION: (sessionKey: string) => `glpi:session:${sessionKey}`,
} as const;
