/**
 * @file authenticated-user.ts
 * @description Tipos del usuario autenticado, perfil de sesión y payload JWT.
 */

/** Rol funcional del usuario en asistIA. */
export type UserRole = "final_user" | "technician";

/**
 * Identidad mínima del usuario extraída del JWT o sesión.
 */
export interface AuthenticatedUser {
  id: number;
  role: UserRole;
  locationId: number | null;
}

/**
 * Perfil enriquecido del usuario obtenido desde GLPI/LDAP.
 */
export interface UserProfile {
  login: string;
  name: string;
  email: string | null;
  groupIds: number[];
  entityId: number | null;
  entityName: string | null;
  isSuperAdmin: boolean;
  isPorteriaUser: boolean;
}

/**
 * Claims del token JWT de acceso.
 */
export interface JwtPayload {
  sub: number;
  role: UserRole;
  locationId: number | null;
  iat?: number;
  exp?: number;
}

/** Usuario de sesión con identidad y perfil combinados. */
export type SessionUser = AuthenticatedUser & UserProfile;
