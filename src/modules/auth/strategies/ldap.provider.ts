/**
 * @file ldap.provider.ts
 * @description Proveedor LDAP/Active Directory para autenticación y consulta de atributos de usuario.
 */
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "ldapts";
import type { AppConfig } from "../../../config/configuration";
import { BusinessException } from "../../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../../common/types/api-error-code";
import type { IdentityProvider, IdentityResolution } from "./identity-provider.interface";

/**
 * Implementación de autenticación y búsqueda de usuarios contra LDAP/Active Directory.
 */
@Injectable()
export class LdapProvider implements IdentityProvider {
  readonly name = "ldap";
  private readonly logger = new Logger(LdapProvider.name);

  /** Inyecta la configuración de conexión y credenciales LDAP. */
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /**
   * Resolución por petición HTTP no soportada en este proveedor.
   * @returns Siempre `null`.
   * @throws No lanza excepciones explícitas.
   */
  async resolveFromRequest(): Promise<IdentityResolution | null> {
    return null;
  }

  /**
   * Autentica al usuario contra AD y opcionalmente enriquece atributos con búsqueda admin.
   * @param username - Nombre de usuario (sAMAccountName).
   * @param password - Contraseña en texto plano.
   * @returns Resolución de identidad con login, dominio y atributos; `null` solo en búsqueda mínima.
   * @throws {BusinessException} Si LDAP no está configurado, credenciales inválidas o hay error de referral.
   */
  async resolveFromCredentials(
    username: string,
    password: string,
  ): Promise<IdentityResolution | null> {
    const url = this.config.get("auth.ldap.url", { infer: true });
    const domain = this.config.get("auth.ldap.domain", { infer: true });
    const baseDn = this.config.get("auth.ldap.baseDn", { infer: true });
    const adminUser = this.config.get("auth.ldap.adminUser", { infer: true });
    const adminPassword = this.config.get("auth.ldap.adminPassword", { infer: true });

    this.logger.debug(
      `[LDAP] resolveFromCredentials -> url=${url} domain=${domain} baseDn=${baseDn} ` +
        `username='${username}' passwordLength=${password?.length ?? 0} ` +
        `adminUserConfigured=${Boolean(adminUser)} adminPasswordConfigured=${Boolean(adminPassword)}`,
    );

    if (!url || !domain) {
      this.logger.error(`[LDAP] missing configuration: url=${url} domain=${domain}`);
      throw new BusinessException({
        message: "LDAP is not configured",
        code: API_ERROR_CODE.UNAUTHORIZED,
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    }

    const client = new Client({
      url,
      tlsOptions: url.startsWith("ldaps://") ? { rejectUnauthorized: false } : undefined,
    });

    try {
      const userPrincipalName = `${username}@${domain}`;
      this.logger.debug(`[LDAP] binding as user '${userPrincipalName}' against ${url}`);

      await client.bind(userPrincipalName, password);
      this.logger.debug(`[LDAP] user bind OK for '${userPrincipalName}'`);
      await client.unbind();

      const resolution = await this.lookupDirectoryEntry(client, username, {
        url,
        domain,
        baseDn,
        adminUser,
        adminPassword,
      });
      return resolution ?? { login: username, domain };
    } catch (error) {
      const err = error as { message?: string; code?: number; name?: string; stack?: string };
      const message = err.message ?? "";
      const code = err.code;
      this.logger.error(
        `[LDAP] bind/search threw -> name='${err.name}' code=${code} message='${message}'`,
      );
      if (err.stack) this.logger.debug(err.stack);

      // AD sub-error 52e = invalid credentials (within LDAP result code 49).
      const isInvalidCredentials =
        message.includes("InvalidCredentialsError") ||
        message.includes("data 52e") ||
        code === 49;
      if (isInvalidCredentials) {
        throw new BusinessException({
          message: "Invalid username or password",
          code: API_ERROR_CODE.AUTH_INVALID_CREDENTIALS,
          status: HttpStatus.UNAUTHORIZED,
        });
      }

      // 0000202B / LDAP result code 10 = referral. The DC we hit is not authoritative
      // for the user's domain. Recommend Global Catalog or a DC of the right domain.
      const isReferral =
        message.includes("0000202B") ||
        message.includes("RefErr") ||
        message.includes("ReferralError") ||
        code === 10;
      if (isReferral) {
        this.logger.warn(
          `[LDAP] AD returned a referral. The configured LDAP server (${url}) is not ` +
            `authoritative for domain '${domain}'. Point LDAP_URL to a DC of that domain ` +
            `or to the Global Catalog (port 3268 / 3269).`,
        );
        throw new BusinessException({
          message:
            "LDAP server is not authoritative for the user's domain. Configure LDAP_URL to a DC of '" +
            domain +
            "' or to the Global Catalog (port 3268).",
          code: API_ERROR_CODE.UNAUTHORIZED,
          status: HttpStatus.UNAUTHORIZED,
        });
      }

      throw new BusinessException({
        message: `Authentication failed: ${message || err.name || "unknown LDAP error"}`,
        code: API_ERROR_CODE.UNAUTHORIZED,
        status: HttpStatus.UNAUTHORIZED,
      });
    } finally {
      try {
        await client.unbind();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Busca un usuario en AD por correo electrónico usando credenciales de administrador.
   * @param email - Dirección de correo a buscar.
   * @returns Login, nombre y email resueltos, o `null` si no hay configuración o no existe.
   * @throws No lanza excepciones explícitas; devuelve `null` ante errores LDAP.
   */
  async lookupUserByEmail(
    email: string,
  ): Promise<{ login: string; name: string; email: string } | null> {
    const url = this.config.get("auth.ldap.url", { infer: true });
    const domain = this.config.get("auth.ldap.domain", { infer: true });
    const baseDn = this.config.get("auth.ldap.baseDn", { infer: true });
    const adminUser = this.config.get("auth.ldap.adminUser", { infer: true });
    const adminPassword = this.config.get("auth.ldap.adminPassword", { infer: true });
    const trimmed = email.trim();

    if (!url || !domain || !adminUser || !adminPassword || !baseDn || !trimmed.includes("@")) {
      return null;
    }

    const client = new Client({
      url,
      tlsOptions: url.startsWith("ldaps://") ? { rejectUnauthorized: false } : undefined,
    });

    try {
      await client.bind(`${adminUser}@${domain}`, adminPassword);
      const search = await client.search(baseDn, {
        scope: "sub",
        filter: `(mail=${LdapProvider.escapeLdapFilterValue(trimmed)})`,
        attributes: ["sAMAccountName", "mail", "displayName", "cn"],
      });
      const entry = search.searchEntries[0];
      if (!entry) {
        return null;
      }

      const resolvedEmail =
        typeof entry.mail === "string" && entry.mail.includes("@") ? entry.mail : trimmed;
      const login = String(entry.sAMAccountName ?? "").trim();
      const name =
        (typeof entry.displayName === "string" && entry.displayName.trim()) ||
        (typeof entry.cn === "string" && entry.cn.trim()) ||
        login ||
        resolvedEmail;

      if (!login) {
        return null;
      }

      return { login, name, email: resolvedEmail };
    } catch (error) {
      this.logger.warn(
        `[LDAP] lookupUserByEmail failed for '${trimmed}': ${(error as Error).message}`,
      );
      return null;
    } finally {
      try {
        await client.unbind();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Obtiene el correo electrónico de un usuario AD a partir de su login.
   * @param login - sAMAccountName o identificador equivalente.
   * @returns Email del usuario o `null` si no se encuentra o falta configuración.
   * @throws No lanza excepciones explícitas; devuelve `null` ante errores LDAP.
   */
  async lookupEmailByLogin(login: string): Promise<string | null> {
    const url = this.config.get("auth.ldap.url", { infer: true });
    const domain = this.config.get("auth.ldap.domain", { infer: true });
    const baseDn = this.config.get("auth.ldap.baseDn", { infer: true });
    const adminUser = this.config.get("auth.ldap.adminUser", { infer: true });
    const adminPassword = this.config.get("auth.ldap.adminPassword", { infer: true });

    if (!url || !domain || !adminUser || !adminPassword || !baseDn) {
      return null;
    }

    const client = new Client({
      url,
      tlsOptions: url.startsWith("ldaps://") ? { rejectUnauthorized: false } : undefined,
    });

    try {
      const resolution = await this.lookupDirectoryEntry(client, login, {
        url,
        domain,
        baseDn,
        adminUser,
        adminPassword,
      });
      return resolution?.email ?? null;
    } catch (error) {
      this.logger.warn(
        `[LDAP] lookupEmailByLogin failed for '${login}': ${(error as Error).message}`,
      );
      return null;
    } finally {
      try {
        await client.unbind();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Escapa caracteres especiales de un valor para usarlo en filtros LDAP.
   * @param value - Cadena a escapar.
   * @returns Valor seguro para interpolar en un filtro LDAP.
   * @throws No lanza excepciones explícitas.
   */
  private static escapeLdapFilterValue(value: string): string {
    return value.replace(/[\0()*\\]/g, (char) => {
      const hex = char.charCodeAt(0).toString(16).padStart(2, "0");
      return `\\${hex}`;
    });
  }

  /**
   * Busca en el directorio los atributos del usuario tras autenticación exitosa.
   * @param client - Cliente LDAP ya instanciado.
   * @param username - Nombre de usuario a buscar.
   * @param config - Parámetros de conexión y credenciales admin.
   * @returns Resolución enriquecida o mínima si no hay búsqueda admin configurada.
   * @throws Error LDAP si el bind admin o la búsqueda fallan.
   */
  private async lookupDirectoryEntry(
    client: Client,
    username: string,
    config: {
      url: string;
      domain: string;
      baseDn?: string;
      adminUser?: string;
      adminPassword?: string;
    },
  ): Promise<IdentityResolution | null> {
    const { domain, baseDn, adminUser, adminPassword } = config;
    const userPrincipalName = `${username}@${domain}`;

    if (!adminUser || !adminPassword || !baseDn) {
      this.logger.debug(
        "[LDAP] skipping admin search (adminUser/adminPassword/baseDn missing); returning minimal resolution",
      );
      return { login: username, domain };
    }

    this.logger.debug(`[LDAP] binding as admin '${adminUser}@${domain}' to look up attributes`);
    await client.bind(`${adminUser}@${domain}`, adminPassword);

    const searchOptions = {
      scope: "sub" as const,
      filter: `(|(userPrincipalName=${userPrincipalName})(sAMAccountName=${username})(cn=${username}))`,
      attributes: ["cn", "sAMAccountName", "userPrincipalName", "mail", "displayName"],
    };

    this.logger.debug(
      `[LDAP] searching baseDn='${baseDn}' filter='${searchOptions.filter}'`,
    );
    const search = await client.search(baseDn, searchOptions);
    const entry = search.searchEntries[0];
    this.logger.debug(
      `[LDAP] search returned ${search.searchEntries.length} entries; firstEntry=${
        entry ? JSON.stringify(entry) : "null"
      }`,
    );

    if (!entry) {
      return { login: username, domain };
    }

    return {
      login: String(entry.sAMAccountName ?? username),
      domain,
      email: typeof entry.mail === "string" ? entry.mail : null,
      displayName: typeof entry.displayName === "string" ? entry.displayName : null,
    };
  }
}
