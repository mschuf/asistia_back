import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { GlpiBootstrapService } from "../glpi/glpi-bootstrap.service";
import { isTiGroupName } from "../glpi/role.utils";
import { UsersGlpiRepository } from "../glpi/repositories/users.glpi-repository";
import { CatalogGlpiRepository } from "../glpi/repositories/catalog.glpi-repository";
import type { DomainUser } from "../glpi/mappers/user.mapper";
import { LdapProvider } from "./strategies/ldap.provider";
import type { IdentityResolution } from "./strategies/identity-provider.interface";
import { BusinessException } from "../../common/exceptions/business.exception";
import { GlpiException } from "../../common/exceptions/glpi.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type {
  AuthenticatedUser,
  JwtPayload,
  UserRole,
} from "../../common/types/authenticated-user";
import type { AppConfig } from "../../config/configuration";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly jwt: JwtService,
    private readonly ldap: LdapProvider,
    private readonly bootstrap: GlpiBootstrapService,
    private readonly usersRepo: UsersGlpiRepository,
    private readonly catalogRepo: CatalogGlpiRepository,
  ) {}

  async loginWithCredentials(username: string, password: string): Promise<{
    accessToken: string;
    expiresIn: string;
    user: AuthenticatedUser;
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

  async logout(_user: AuthenticatedUser): Promise<void> {
    return;
  }

  private async completeLogin(resolution: IdentityResolution): Promise<{
    accessToken: string;
    expiresIn: string;
    user: AuthenticatedUser;
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

    const groupIds = await this.resolveGroupIds(glpiUser.id);
    const role = await this.determineRole(groupIds);
    const entityName = await this.resolveEntityName(glpiUser.entityId);
    this.logger.debug(
      `[AUTH] groupIds=${JSON.stringify(groupIds)} resolvedRole='${role}' entityId=${glpiUser.entityId ?? "null"} entityName='${entityName ?? ""}'`,
    );

    const authenticated: AuthenticatedUser = {
      id: glpiUser.id,
      login: glpiUser.login,
      name: glpiUser.fullName,
      email: glpiUser.email ?? resolution.email ?? null,
      role,
      groupIds,
      locationId: glpiUser.locationId,
      entityId: glpiUser.entityId,
      entityName,
    };

    const accessToken = await this.signToken(authenticated);
    const expiresIn = this.config.get("jwt.expiresIn", { infer: true });

    return { accessToken, expiresIn, user: authenticated };
  }

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

  private async signToken(user: AuthenticatedUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      login: user.login,
      name: user.name,
      email: user.email,
      role: user.role,
      groupIds: user.groupIds,
      locationId: user.locationId,
      entityId: user.entityId,
      entityName: user.entityName,
    };
    return this.jwt.signAsync(payload);
  }
}

export type LoginOutput = Awaited<ReturnType<AuthService["loginWithCredentials"]>>;
