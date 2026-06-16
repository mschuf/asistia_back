/**
 * @file auth.service.ts
 * @description Orquesta autenticación LDAP, resolución de perfil GLPI y emisión de JWT de sesión.
 */
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { GlpiBootstrapService } from "../glpi/glpi-bootstrap.service";
import {
  isSuperAdminProfileName,
  isTiGroupName,
} from "../glpi/role.utils";
import { UsersGlpiRepository } from "../glpi/repositories/users.glpi-repository";
import { CatalogGlpiRepository } from "../glpi/repositories/catalog.glpi-repository";
import { UsersProfilesSqlRepository } from "../glpi/repositories/users-profiles.sql-repository";
import { UsersGroupsSqlRepository } from "../glpi/repositories/users-groups.sql-repository";
import type { DomainUser } from "../glpi/mappers/user.mapper";
import { LdapProvider } from "./strategies/ldap.provider";
import type { IdentityResolution } from "./strategies/identity-provider.interface";
import { BusinessException } from "../../common/exceptions/business.exception";
import { GlpiException } from "../../common/exceptions/glpi.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import { CryptoService } from "../../common/crypto/crypto.service";
import type {
  AuthenticatedUser,
  JwtPayload,
  SessionUser,
  UserProfile,
  UserRole,
} from "../../common/types/authenticated-user";
import type { AppConfig } from "../../config/configuration";

/**
 * Servicio de autenticación que valida credenciales LDAP y enriquece el perfil desde GLPI.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Inyecta configuración, JWT, cifrado, LDAP y repositorios GLPI. */
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
    private readonly ldap: LdapProvider,
    private readonly bootstrap: GlpiBootstrapService,
    private readonly usersRepo: UsersGlpiRepository,
    private readonly catalogRepo: CatalogGlpiRepository,
    private readonly usersProfilesSqlRepo: UsersProfilesSqlRepository,
    private readonly usersGroupsSqlRepo: UsersGroupsSqlRepository,
  ) {}

  /**
   * Descifra la contraseña RSA-OAEP y delega el login con credenciales en texto plano.
   * @param username - Nombre de usuario LDAP (sAMAccountName).
   * @param encryptedPassword - Contraseña cifrada en base64.
   * @returns Token JWT, expiración y usuario de sesión.
   * @throws {BusinessException} Si el descifrado falla o las credenciales LDAP son inválidas.
   */
  async loginWithEncryptedCredentials(
    username: string,
    encryptedPassword: string,
  ): Promise<{
    accessToken: string;
    expiresIn: string;
    user: SessionUser;
  }> {
    let password: string;
    try {
      password = this.crypto.decrypt(encryptedPassword);
    } catch (error) {
      this.logger.warn(
        `[AUTH] Failed to decrypt credentials for '${username}': ${(error as Error).message}`,
      );
      throw new BusinessException({
        message: "Invalid credentials",
        code: API_ERROR_CODE.AUTH_INVALID_CREDENTIALS,
        status: HttpStatus.UNAUTHORIZED,
      });
    }

    return this.loginWithCredentials(username, password);
  }

  /**
   * Valida credenciales contra LDAP y completa el flujo de login en GLPI.
   * @param username - Nombre de usuario LDAP.
   * @param password - Contraseña en texto plano.
   * @returns Token JWT, expiración y usuario de sesión.
   * @throws {BusinessException} Si LDAP no resuelve la identidad o las credenciales son inválidas.
   * @throws Error reenviado si la resolución LDAP falla por error de infraestructura.
   */
  async loginWithCredentials(username: string, password: string): Promise<{
    accessToken: string;
    expiresIn: string;
    user: SessionUser;
  }> {
    this.logger.debug(`[AUTH] loginWithCredentials called for username='${username}'`);
    let resolution: IdentityResolution | null;
    try {
      resolution = await this.ldap.resolveFromCredentials(username, password);
    } catch (error) {
      this.logger.error(
        `[AUTH] LDAP resolution failed for '${username}': ${(error as Error).message}`,
      );
      throw error;
    }
    if (!resolution) {
      this.logger.warn(`[AUTH] LDAP returned null resolution for '${username}'`);
      throw new BusinessException({
        message: "Invalid credentials",
        code: API_ERROR_CODE.AUTH_INVALID_CREDENTIALS,
        status: HttpStatus.UNAUTHORIZED,
      });
    }

    this.logger.debug(
      `[AUTH] LDAP resolved -> login='${resolution.login}' domain='${resolution.domain}' email='${resolution.email ?? ""}'`,
    );
    return this.completeLogin(resolution);
  }

  /**
   * Revoca la sesión del usuario autenticado (sin estado en servidor por ahora).
   * @param _user - Usuario autenticado cuya sesión se cierra.
   * @returns Promesa resuelta sin valor.
   * @throws No lanza excepciones explícitas.
   */
  async logout(_user: AuthenticatedUser): Promise<void> {
    return;
  }

  /**
   * Resuelve el usuario GLPI, determina rol y firma el JWT de sesión.
   * @param resolution - Identidad resuelta por el proveedor LDAP.
   * @returns Token JWT, expiración y usuario de sesión completo.
   * @throws {BusinessException} Si el usuario no existe en GLPI o GLPI niega permisos de lectura.
   */
  private async completeLogin(resolution: IdentityResolution): Promise<{
    accessToken: string;
    expiresIn: string;
    user: SessionUser;
  }> {
    this.logger.debug(`[AUTH] completeLogin for '${resolution.login}'`);

    const glpiUser = await this.resolveGlpiUser(resolution.login);
    if (!glpiUser) {
      throw new BusinessException({
        message: `User '${resolution.login}' not found in GLPI`,
        code: API_ERROR_CODE.AUTH_USER_NOT_FOUND,
        status: HttpStatus.UNAUTHORIZED,
      });
    }

    const [groupIds, entityName, isSuperAdmin] = await Promise.all([
      this.resolveGroupIds(glpiUser.id),
      this.resolveEntityName(glpiUser.entityId),
      this.resolveIsSuperAdmin(glpiUser.id),
    ]);
    const [role, isPorteriaUser] = await Promise.all([
      this.determineRole(groupIds),
      this.resolveIsPorteriaUser(glpiUser.id),
    ]);
    this.logger.debug(
      `[AUTH] groupIds=${JSON.stringify(groupIds)} resolvedRole='${role}' entityId=${glpiUser.entityId ?? "null"} entityName='${entityName ?? ""}' isSuperAdmin=${isSuperAdmin} isPorteriaUser=${isPorteriaUser}`,
    );

    const principal: AuthenticatedUser = {
      id: glpiUser.id,
      role,
      locationId: glpiUser.locationId,
    };
    const profile: UserProfile = {
      login: glpiUser.login,
      name: glpiUser.fullName,
      email: glpiUser.email ?? resolution.email ?? null,
      groupIds,
      entityId: glpiUser.entityId,
      entityName,
      isSuperAdmin,
      isPorteriaUser,
    };
    const user: SessionUser = { ...principal, ...profile };

    const accessToken = await this.signToken(principal);
    const expiresIn = this.config.get("jwt.expiresIn", { infer: true });

    return { accessToken, expiresIn, user };
  }

  /**
   * Enriquece el usuario autenticado con datos actualizados desde GLPI.
   * @param user - Usuario autenticado extraído del JWT.
   * @returns Perfil de sesión con grupos, entidad y flags de super-admin.
   * @throws {BusinessException} Si el usuario no existe en GLPI.
   */
  async resolveProfile(user: AuthenticatedUser): Promise<SessionUser> {
    const domainUser = await this.bootstrap.withCatalogBootstrapSession((key) =>
      this.usersRepo.findById(key, user.id),
    );
    if (!domainUser) {
      throw new BusinessException({
        message: `User ${user.id} not found in GLPI`,
        code: API_ERROR_CODE.AUTH_USER_NOT_FOUND,
        status: HttpStatus.UNAUTHORIZED,
      });
    }

    const groupIds = await this.resolveGroupIds(domainUser.id);
    const [entityName, isSuperAdmin, isPorteriaUser] = await Promise.all([
      this.resolveEntityName(domainUser.entityId),
      this.resolveIsSuperAdmin(domainUser.id),
      this.resolveIsPorteriaUser(domainUser.id),
    ]);

    return {
      id: user.id,
      role: user.role,
      locationId: user.locationId,
      login: domainUser.login,
      name: domainUser.fullName,
      email: domainUser.email,
      groupIds,
      entityId: domainUser.entityId,
      entityName,
      isSuperAdmin,
      isPorteriaUser,
    };
  }

  /**
   * Determina si el usuario tiene perfil Super-Admin en alguna entidad GLPI.
   * @param userId - Identificador numérico del usuario en GLPI.
   * @returns `true` si posee perfil super-admin; `false` si no o ante error SQL.
   * @throws No lanza excepciones explícitas; devuelve `false` ante fallos de consulta.
   */
  private async resolveIsSuperAdmin(userId: number): Promise<boolean> {
    try {
      const profiles = await this.usersProfilesSqlRepo.listUserEntityProfiles(userId);
      const isSuperAdmin = profiles.some((profile) => isSuperAdminProfileName(profile.profileName));
      this.logger.debug(
        `[AUTH] Super-admin profiles for user ${userId}: ${JSON.stringify(profiles)} resolved=${isSuperAdmin}`,
      );
      return isSuperAdmin;
    } catch (error) {
      this.logger.warn(
        `[AUTH] Could not resolve GLPI profiles through SQL for user ${userId}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Obtiene el nombre legible de la entidad GLPI del usuario.
   * @param entityId - Identificador de entidad GLPI o `null`.
   * @returns Nombre de la entidad o `null` si no aplica o falla la consulta.
   * @throws No lanza excepciones explícitas; devuelve `null` ante errores GLPI.
   */
  private async resolveEntityName(entityId: number | null): Promise<string | null> {
    if (entityId === null || entityId === undefined) {
      return null;
    }
    try {
      return await this.bootstrap.withCatalogBootstrapSession((key) =>
        this.usersRepo.findEntityName(key, entityId),
      );
    } catch (error) {
      this.logger.warn(
        `[AUTH] Could not resolve GLPI entity name for id=${entityId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Busca un usuario GLPI por login usando la sesión bootstrap del catálogo.
   * @param login - Login LDAP/GLPI del usuario.
   * @returns Usuario de dominio GLPI o `null` si no existe.
   * @throws {BusinessException} Si GLPI responde forbidden por permisos insuficientes.
   * @throws Error reenviado para otros fallos GLPI o de red.
   */
  private async resolveGlpiUser(login: string): Promise<DomainUser | null> {
    try {
      return await this.bootstrap.withCatalogBootstrapSession((key) =>
        this.usersRepo.findByLogin(key, login),
      );
    } catch (error) {
      if (
        error instanceof GlpiException &&
        error.code === API_ERROR_CODE.GLPI_FORBIDDEN
      ) {
        throw new BusinessException({
          message:
            "La cuenta de servicio GLPI no tiene permisos para leer usuarios. " +
            "Asigne permiso READ sobre User al perfil de la cuenta configurada " +
            "en GLPI_CATALOG_BOOTSTRAP_LOGIN.",
          code: API_ERROR_CODE.GLPI_FORBIDDEN,
          status: HttpStatus.FORBIDDEN,
        });
      }
      throw error;
    }
  }

  /**
   * Lista los identificadores de grupos GLPI a los que pertenece el usuario.
   * @param userId - Identificador numérico del usuario en GLPI.
   * @returns Arreglo de IDs de grupo; vacío si la consulta falla.
   * @throws No lanza excepciones explícitas; devuelve arreglo vacío ante errores.
   */
  private async resolveGroupIds(userId: number): Promise<number[]> {
    try {
      return await this.bootstrap.withCatalogBootstrapSession((key) =>
        this.usersRepo.listGroupsOfUser(key, userId),
      );
    } catch (error) {
      this.logger.warn(
        `[AUTH] Could not read GLPI groups for user ${userId}, defaulting to none: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Determina el rol de aplicación según la pertenencia a grupos TI en GLPI.
   * @param groupIds - IDs de grupos GLPI del usuario.
   * @returns `technician` si pertenece a un grupo TI; `final_user` en caso contrario.
   * @throws No lanza excepciones explícitas; devuelve `final_user` ante errores de catálogo.
   */
  private async determineRole(groupIds: number[]): Promise<UserRole> {
    if (groupIds.length === 0) {
      this.logger.debug(`[AUTH] role signals -> user has NO groups, defaulting to final_user`);
      return "final_user";
    }
    try {
      const groups = await this.bootstrap.withCatalogBootstrapSession((key) =>
        this.catalogRepo.listGroups(key),
      );
      const memberGroups = groups.filter((group) => groupIds.includes(group.id));
      const tiGroup = memberGroups.find((group) => isTiGroupName(group.name));
      const isTiGroup = Boolean(tiGroup);

      const memberSummary = memberGroups.map((group) => `${group.id}:${group.name}`);
      this.logger.debug(
        `[AUTH] role signals -> isTiGroup=${isTiGroup}${tiGroup ? ` matchedBy='${tiGroup.name}'` : ""} memberGroups=${JSON.stringify(memberSummary)} rawGroupIds=${JSON.stringify(groupIds)}`,
      );

      return isTiGroup ? "technician" : "final_user";
    } catch (error) {
      this.logger.warn(`Role detection failed, defaulting to final_user: ${(error as Error).message}`);
      return "final_user";
    }
  }

  /**
   * Determina si el usuario pertenece al grupo GLPI de portería.
   * @param userId - Identificador numérico del usuario en GLPI.
   * @returns `true` si pertenece a un grupo de portería; `false` en caso contrario.
   * @throws No lanza excepciones explícitas; devuelve `false` ante errores SQL.
   */
  private async resolveIsPorteriaUser(userId: number): Promise<boolean> {
    try {
      const isPorteriaUser = await this.usersGroupsSqlRepo.isPorteriaUser(userId);
      this.logger.debug(
        `[AUTH] porteria signals -> isPorteriaUser=${isPorteriaUser} userId=${userId}`,
      );
      return isPorteriaUser;
    } catch (error) {
      this.logger.warn(
        `Porteria group detection failed, defaulting to false: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Firma un JWT con los claims mínimos del usuario autenticado.
   * @param user - Usuario autenticado con id, rol y ubicación.
   * @returns Token JWT firmado de forma asíncrona.
   * @throws Error de `JwtService` si la firma falla.
   */
  private async signToken(user: AuthenticatedUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      locationId: user.locationId,
    };
    return this.jwt.signAsync(payload);
  }
}

/** Tipo de salida del flujo de login con credenciales en texto plano. */
export type LoginOutput = Awaited<ReturnType<AuthService["loginWithCredentials"]>>;
