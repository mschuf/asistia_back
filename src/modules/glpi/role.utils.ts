/**
 * @file role.utils.ts
 * @description Utilidades para identificar grupos y perfiles de TI en nomenclatura GLPI.
 */

/** Grupos GLPI que identifican personal de soporte / TI. */

export const TI_GROUP_KEYWORDS = ["ti", "it", "soporte", "helpdesk"] as const;

/** Grupos GLPI que identifican personal de portería. */

export const PORTERIA_GROUP_KEYWORDS = ["porteria"] as const;



/** Perfiles operativos de TI (sin grupo explícito también pueden ser técnicos). */

export const OPERATIONAL_IT_PROFILE_KEYWORDS = ["technician", "hotliner", "supervisor"] as const;



/** Perfiles administrativos de TI (solo cuentan si además pertenecen al grupo TI). */

export const ADMIN_IT_PROFILE_KEYWORDS = ["super-admin", "superadmin", "admin"] as const;



/**
 * Normaliza un token de rol para comparaciones insensibles a mayúsculas y separadores.
 * @param value - Texto del grupo o perfil GLPI.
 * @returns Token en minúsculas con guiones como separador.
 * @throws No lanza excepciones.
 */
export function normalizeRoleToken(value: string): string {

  return value.trim().toLowerCase().replace(/[\s_-]+/g, "-");

}



/**
 * Comprueba si un valor coincide con una palabra clave de rol.
 * @param value - Texto a evaluar.
 * @param keyword - Palabra clave normalizada.
 * @returns `true` si hay coincidencia exacta o por token.
 * @throws No lanza excepciones.
 */
function matchesKeyword(value: string, keyword: string): boolean {

  const normalized = normalizeRoleToken(value);

  if (normalized === keyword) {

    return true;

  }



  const tokens = normalized.split("-").filter(Boolean);

  return tokens.includes(keyword);

}



/**
 * Indica si el nombre corresponde a un grupo de TI conocido.
 * @param name - Nombre del grupo GLPI.
 * @returns `true` si coincide con alguna palabra clave de TI.
 * @throws No lanza excepciones.
 */
export function isTiGroupName(name: string): boolean {

  return TI_GROUP_KEYWORDS.some((keyword) => matchesKeyword(name, keyword));

}



/**
 * Indica si el nombre corresponde a un grupo de portería conocido.
 * @param name - Nombre del grupo GLPI.
 * @returns `true` si coincide con alguna palabra clave de portería.
 * @throws No lanza excepciones.
 */
export function isPorteriaGroupName(name: string): boolean {

  return PORTERIA_GROUP_KEYWORDS.some((keyword) => matchesKeyword(name, keyword));

}



/**
 * Indica si el usuario pertenece al grupo de portería según IDs y catálogo GLPI.
 * @param groupIds - IDs de grupos GLPI del usuario.
 * @param groups - Catálogo de grupos GLPI.
 * @returns `true` si algún grupo del usuario coincide con portería.
 * @throws No lanza excepciones.
 */
export function hasPorteriaGroupMembership(
  groupIds: number[],
  groups: Array<{ id: number; name: string }>,
): boolean {

  const memberGroups = groups.filter((group) => groupIds.includes(group.id));

  return memberGroups.some((group) => isPorteriaGroupName(group.name));

}



/**
 * Indica si el nombre corresponde a un perfil operativo de TI.
 * @param name - Nombre del perfil GLPI.
 * @returns `true` si coincide con perfiles technician/hotliner/supervisor.
 * @throws No lanza excepciones.
 */
export function isOperationalItProfileName(name: string): boolean {

  return OPERATIONAL_IT_PROFILE_KEYWORDS.some((keyword) => matchesKeyword(name, keyword));

}



/**
 * Indica si el nombre corresponde a un perfil administrativo de TI.
 * @param name - Nombre del perfil GLPI.
 * @returns `true` si coincide con perfiles admin/super-admin.
 * @throws No lanza excepciones.
 */
export function isAdminItProfileName(name: string): boolean {

  return ADMIN_IT_PROFILE_KEYWORDS.some((keyword) => matchesKeyword(name, keyword));

}



/**
 * Indica si el nombre corresponde al perfil super-admin de GLPI.
 * @param name - Nombre del perfil GLPI.
 * @returns `true` si el token normalizado es `super-admin`.
 * @throws No lanza excepciones.
 */
export function isSuperAdminProfileName(name: string): boolean {

  return normalizeRoleToken(name) === "super-admin";

}



/**
 * Indica si el nombre corresponde a cualquier perfil de TI (operativo o administrativo).
 * @param name - Nombre del perfil GLPI.
 * @returns `true` si es perfil operativo o administrativo de TI.
 * @throws No lanza excepciones.
 */
export function isItProfileName(name: string): boolean {

  return isOperationalItProfileName(name) || isAdminItProfileName(name);

}


