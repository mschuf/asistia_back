/**
 * @file glpi-session.manager.ts
 * @description Gestiona sesiones GLPI en caché en memoria indexadas por clave opaca.
 */
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

/**
 * Administrador de sesiones GLPI almacenadas en caché.
 */
@Injectable()
export class GlpiSessionManager {
  private readonly logger = new Logger(GlpiSessionManager.name);

  /** Inyecta el servicio de caché en memoria. */
  constructor(private readonly cache: InMemoryCacheService) {}

  /**
   * Genera una clave opaca para asociar una sesión GLPI.
   * @returns UUID v4 como identificador de sesión.
   * @throws No lanza excepciones.
   */
  issueKey(): string {
    return randomUUID();
  }

  /**
   * Registra una sesión GLPI con TTL en caché.
   * @param sessionKey - Clave opaca emitida por `issueKey`.
   * @param session - Datos de la sesión GLPI.
   * @param ttlSeconds - Tiempo de vida en segundos.
   * @returns void
   * @throws No lanza excepciones.
   */
  register(sessionKey: string, session: GlpiSession, ttlSeconds: number): void {
    this.cache.set(CACHE_KEYS.GLPI_SESSION(sessionKey), session, ttlSeconds);
  }

  /**
   * Obtiene la sesión GLPI asociada a una clave.
   * @param sessionKey - Clave opaca de sesión.
   * @returns Sesión almacenada o `undefined` si expiró o no existe.
   * @throws No lanza excepciones.
   */
  get(sessionKey: string): GlpiSession | undefined {
    return this.cache.get<GlpiSession>(CACHE_KEYS.GLPI_SESSION(sessionKey));
  }

  /**
   * Obtiene el token de sesión GLPI para peticiones HTTP.
   * @param sessionKey - Clave opaca de sesión.
   * @returns Token de sesión o `undefined`.
   * @throws No lanza excepciones.
   */
  getSessionToken(sessionKey: string): string | undefined {
    return this.get(sessionKey)?.sessionToken;
  }

  /**
   * Revoca y elimina una sesión de la caché.
   * @param sessionKey - Clave opaca de sesión.
   * @returns void
   * @throws No lanza excepciones.
   */
  revoke(sessionKey: string): void {
    this.cache.delete(CACHE_KEYS.GLPI_SESSION(sessionKey));
  }
}
