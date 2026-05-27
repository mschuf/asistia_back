import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { InMemoryCacheService } from "../cache/cache.service";
import { CACHE_KEYS } from "../cache/cache.keys";

interface GlpiSession {
  sessionToken: string;
  userId: number;
  login: string;
  createdAt: number;
}

@Injectable()
export class GlpiSessionManager {
  private readonly logger = new Logger(GlpiSessionManager.name);

  constructor(private readonly cache: InMemoryCacheService) {}

  issueKey(): string {
    return randomUUID();
  }

  register(sessionKey: string, session: GlpiSession, ttlSeconds: number): void {
    this.cache.set(CACHE_KEYS.GLPI_SESSION(sessionKey), session, ttlSeconds);
  }

  get(sessionKey: string): GlpiSession | undefined {
    return this.cache.get<GlpiSession>(CACHE_KEYS.GLPI_SESSION(sessionKey));
  }

  getSessionToken(sessionKey: string): string | undefined {
    return this.get(sessionKey)?.sessionToken;
  }

  revoke(sessionKey: string): void {
    this.cache.delete(CACHE_KEYS.GLPI_SESSION(sessionKey));
  }
}
