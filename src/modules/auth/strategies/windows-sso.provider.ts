import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import type { AppConfig } from "../../../config/configuration";
import type { IdentityProvider, IdentityResolution } from "./identity-provider.interface";

@Injectable()
export class WindowsSsoProvider implements IdentityProvider {
  readonly name = "windows-sso";

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

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
