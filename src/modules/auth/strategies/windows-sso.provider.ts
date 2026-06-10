/**
 * @file windows-sso.provider.ts
 * @description Proveedor de identidad que resuelve el usuario desde cabeceras SSO de Windows/IIS.
 */
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import type { AppConfig } from "../../../config/configuration";
import type { IdentityProvider, IdentityResolution } from "./identity-provider.interface";

/**
 * Implementación de SSO Windows leyendo el login desde una cabecera HTTP configurable.
 */
@Injectable()
export class WindowsSsoProvider implements IdentityProvider {
  readonly name = "windows-sso";

  /** Inyecta la configuración de cabecera SSO y normalización de dominio. */
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /**
   * Extrae y normaliza el usuario desde la cabecera SSO de la petición.
   * @param request - Petición HTTP con cabeceras de autenticación integrada.
   * @returns Resolución de identidad o `null` si la cabecera no está presente.
   * @throws No lanza excepciones explícitas.
   */
  async resolveFromRequest(request: unknown): Promise<IdentityResolution | null> {
    const req = request as Request | undefined;
    if (!req) return null;

    const headerName = this.config.get("auth.ssoUserHeader", { infer: true });
    const headerValueRaw = req.headers[headerName];
    const headerValue = Array.isArray(headerValueRaw) ? headerValueRaw[0] : headerValueRaw;

    if (!headerValue || typeof headerValue !== "string") return null;

    const normalized = this.normalize(headerValue);
    if (!normalized) return null;

    return normalized;
  }

  /**
   * Normaliza un valor de cabecera SSO en formato `DOMINIO\usuario` o `usuario@dominio`.
   * @param raw - Valor crudo de la cabecera SSO.
   * @returns Resolución con login y dominio, o `null` si está vacío.
   * @throws No lanza excepciones explícitas.
   */
  private normalize(raw: string): IdentityResolution | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const stripDomain = this.config.get("auth.ssoDomainStrip", { infer: true });

    let login = trimmed;
    let domain: string | null = null;

    if (trimmed.includes("\\")) {
      const [domainPart, userPart] = trimmed.split("\\", 2);
      if (userPart) {
        domain = domainPart ?? null;
        login = userPart;
      }
    } else if (trimmed.includes("@")) {
      const [userPart, domainPart] = trimmed.split("@", 2);
      if (userPart) {
        login = userPart;
        domain = domainPart ?? null;
      }
    }

    return {
      login: stripDomain ? login : trimmed,
      domain,
    };
  }
}
