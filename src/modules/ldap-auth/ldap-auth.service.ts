/**
 * @file ldap-auth.service.ts
 * @description Servicio legacy de autenticación LDAP directa y diagnóstico de base DN.
 */
import { Injectable, Logger } from "@nestjs/common";
import { Client, type SearchOptions } from "ldapts";

/** Forma mínima de error devuelto por operaciones LDAP. */
interface LdapAuthError {
  message?: string;
  code?: number;
  name?: string;
  stack?: string;
}

/**
 * Autentica usuarios contra Active Directory y devuelve atributos sin pasar por GLPI.
 */
@Injectable()
export class LdapAuthService {
  private readonly logger = new Logger(LdapAuthService.name);

  /**
   * Valida credenciales en AD, busca el usuario con cuenta admin y mapea sus atributos.
   * @param username - Nombre de usuario (sAMAccountName o equivalente).
   * @param password - Contraseña en texto plano.
   * @returns Objeto con bandera de éxito y datos normalizados del usuario AD.
   * @throws {Error} Si faltan credenciales admin, no se encuentra el usuario o la autenticación falla.
   */
  async authenticate(username: string, password: string): Promise<{ success: true; user: Record<string, unknown> }> {
    const url = process.env.LDAP_URL || "ldaps://192.168.12.112:636";
    const domain = process.env.LDAP_DOMAIN || "grupopettengill.com.py";
    const baseDN = "DC=grupopettengill,DC=com,DC=py";

    const client = new Client({
      url,
      tlsOptions: url.startsWith("ldaps://") ? { rejectUnauthorized: false } : undefined,
    });

    try {
      const userPrincipalName = `${username}@${domain}`;
      this.logger.log(`Autenticando usuario: ${userPrincipalName}`);

      await client.bind(userPrincipalName, password);
      this.logger.log("Usuario autenticado correctamente");

      await client.unbind();

      const adminUsername = process.env.LDAP_ADMIN;
      const adminPassword = process.env.LDAP_ADMIN_PWD;

      if (!adminUsername || !adminPassword) {
        throw new Error("LDAP admin credentials not configured");
      }

      await client.bind(`${adminUsername}@${domain}`, adminPassword);
      this.logger.log("Admin conectado");

      let searchResult;
      const searchOptions: SearchOptions = {
        scope: "sub",
        filter: `(userPrincipalName=${userPrincipalName})`,
        attributes: [
          "dn",
          "cn",
          "sAMAccountName",
          "userPrincipalName",
          "mail",
          "displayName",
          "givenName",
          "sn",
          "department",
          "title",
          "telephoneNumber",
          "mobile",
          "memberOf",
          "whenCreated",
          "accountExpires",
        ],
      };

      this.logger.log(`Buscando por userPrincipalName: ${userPrincipalName}`);
      searchResult = await client.search(baseDN, searchOptions);
      this.logger.log(`Resultados con userPrincipalName: ${searchResult.searchEntries.length}`);

      if (searchResult.searchEntries.length === 0) {
        this.logger.log(`Buscando por sAMAccountName: ${username}`);
        searchOptions.filter = `(sAMAccountName=${username})`;
        searchResult = await client.search(baseDN, searchOptions);
        this.logger.log(`Resultados con sAMAccountName: ${searchResult.searchEntries.length}`);
      }

      if (searchResult.searchEntries.length === 0) {
        this.logger.log(`Buscando por cn: ${username}`);
        searchOptions.filter = `(cn=${username})`;
        searchResult = await client.search(baseDN, searchOptions);
        this.logger.log(`Resultados con cn: ${searchResult.searchEntries.length}`);
      }

      if (searchResult.searchEntries.length === 0) {
        this.logger.log("Buscando con filtro amplio...");
        searchOptions.filter = `(|(userPrincipalName=${userPrincipalName})(sAMAccountName=${username})(cn=${username}))`;
        searchResult = await client.search(baseDN, searchOptions);
        this.logger.log(`Resultados con filtro amplio: ${searchResult.searchEntries.length}`);
      }

      if (searchResult.searchEntries.length === 0) {
        throw new Error("User data not found in Active Directory");
      }

      const userEntry = searchResult.searchEntries[0];
      this.logger.log("Datos del usuario obtenidos");
      this.logger.debug(`Datos completos del usuario: ${JSON.stringify(userEntry)}`);

      const userData = {
        username: (userEntry.sAMAccountName as string) || username,
        userPrincipalName: userEntry.userPrincipalName as string,
        name: userEntry.cn as string,
        displayName: userEntry.displayName as string,
        firstName: userEntry.givenName as string,
        lastName: userEntry.sn as string,
        email: userEntry.mail as string,
        department: userEntry.department as string,
        title: userEntry.title as string,
        phone: userEntry.telephoneNumber as string,
        mobile: userEntry.mobile as string,
        groups: Array.isArray(userEntry.memberOf)
          ? userEntry.memberOf
          : userEntry.memberOf
            ? [userEntry.memberOf]
            : [],
        dn: userEntry.dn as string,
      };

      return {
        success: true,
        user: userData,
      };
    } catch (error) {
      const err = error as LdapAuthError;
      this.logger.error(`LDAP authentication error: ${err.message ?? err.name ?? "unknown"}`);

      if (err.message?.includes("InvalidCredentialsError") || err.code === 49) {
        throw new Error("Invalid username or password");
      }

      throw new Error("Authentication failed");
    } finally {
      try {
        await client.unbind();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Consulta el rootDSE del servidor LDAP para diagnosticar naming contexts.
   * @returns Entrada rootDSE con `defaultNamingContext` y contextos de nomenclatura.
   * @throws {Error} Si faltan credenciales admin o falla la conexión/búsqueda LDAP.
   */
  async testBaseDN(): Promise<{ success: true; rootDSE: Record<string, unknown> | undefined }> {
    const url = process.env.LDAP_URL || "ldaps://192.168.12.112:636";
    const domain = process.env.LDAP_DOMAIN || "grupopettengill.com.py";

    const client = new Client({
      url,
      tlsOptions: url.startsWith("ldaps://") ? { rejectUnauthorized: false } : undefined,
    });

    try {
      const adminUsername = process.env.LDAP_ADMIN;
      const adminPassword = process.env.LDAP_ADMIN_PWD;

      if (!adminUsername || !adminPassword) {
        throw new Error("LDAP admin credentials not configured");
      }

      await client.bind(`${adminUsername}@${domain}`, adminPassword);

      const rootDSE = await client.search("", {
        scope: "base",
        attributes: ["defaultNamingContext", "namingContexts", "rootDomainNamingContext"],
      });

      return {
        success: true,
        rootDSE: rootDSE.searchEntries[0],
      };
    } catch (error) {
      this.logger.error(`testBaseDN error: ${(error as Error).message}`);
      throw error;
    } finally {
      try {
        await client.unbind();
      } catch {
        /* ignore */
      }
    }
  }
}
