/** Grupos GLPI que identifican personal de soporte / TI. */

export const TI_GROUP_KEYWORDS = ["ti", "it", "soporte", "helpdesk"] as const;



/** Perfiles operativos de TI (sin grupo expl├¡cito tambi├®n pueden ser t├®cnicos). */

export const OPERATIONAL_IT_PROFILE_KEYWORDS = ["technician", "hotliner", "supervisor"] as const;



/** Perfiles administrativos de TI (solo cuentan si adem├ís pertenecen al grupo TI). */

export const ADMIN_IT_PROFILE_KEYWORDS = ["super-admin", "superadmin", "admin"] as const;



export function normalizeRoleToken(value: string): string {

  return value.trim().toLowerCase().replace(/[\s_-]+/g, "-");

}



function matchesKeyword(value: string, keyword: string): boolean {

  const normalized = normalizeRoleToken(value);

  if (normalized === keyword) {

    return true;

  }



  const tokens = normalized.split("-").filter(Boolean);

  return tokens.includes(keyword);

}



export function isTiGroupName(name: string): boolean {

  return TI_GROUP_KEYWORDS.some((keyword) => matchesKeyword(name, keyword));

}



export function isOperationalItProfileName(name: string): boolean {

  return OPERATIONAL_IT_PROFILE_KEYWORDS.some((keyword) => matchesKeyword(name, keyword));

}



export function isAdminItProfileName(name: string): boolean {

  return ADMIN_IT_PROFILE_KEYWORDS.some((keyword) => matchesKeyword(name, keyword));

}



export function isSuperAdminProfileName(name: string): boolean {

  return normalizeRoleToken(name) === "super-admin";

}



export function isItProfileName(name: string): boolean {

  return isOperationalItProfileName(name) || isAdminItProfileName(name);

}


