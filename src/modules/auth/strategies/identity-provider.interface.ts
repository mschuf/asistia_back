/**
 * @file identity-provider.interface.ts
 * @description Contratos para proveedores de identidad (LDAP, SSO Windows) y resolución de usuario.
 */

/**
 * Datos de identidad resueltos por un proveedor de autenticación.
 */
export interface IdentityResolution {
  login: string;
  domain?: string | null;
  email?: string | null;
  displayName?: string | null;
  rawPassword?: string;
}

/**
 * Proveedor de identidad capaz de resolver usuarios desde petición HTTP o credenciales.
 */
export interface IdentityProvider {
  /** Nombre identificador del proveedor (p. ej. `ldap`, `windows-sso`). */
  readonly name: string;

  /**
   * Resuelve la identidad a partir del contexto de la petición HTTP.
   * @param request - Petición HTTP u objeto equivalente.
   * @returns Resolución de identidad o `null` si no aplica.
   * @throws Depende de la implementación concreta del proveedor.
   */
  resolveFromRequest(request: unknown): Promise<IdentityResolution | null>;

  /**
   * Resuelve la identidad validando usuario y contraseña (opcional por proveedor).
   * @param username - Nombre de usuario.
   * @param password - Contraseña en texto plano.
   * @returns Resolución de identidad o `null` si las credenciales no son válidas.
   * @throws Depende de la implementación concreta del proveedor.
   */
  resolveFromCredentials?(username: string, password: string): Promise<IdentityResolution | null>;
}

/** Token de inyección NestJS para registrar el proveedor de identidad activo. */
export const IDENTITY_PROVIDER = Symbol("IDENTITY_PROVIDER");
