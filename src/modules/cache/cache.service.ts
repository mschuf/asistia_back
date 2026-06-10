/**
 * @file cache.service.ts
 * @description Servicio de caché en memoria con TTL, patrón wrap y barrido periódico.
 */
import { Injectable, Logger } from "@nestjs/common";

/** Entrada almacenada con valor y fecha de expiración absoluta. */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Implementación simple de caché en memoria por proceso con expiración por TTL.
 */
@Injectable()
export class InMemoryCacheService {
  private readonly logger = new Logger(InMemoryCacheService.name);
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private sweepInterval: NodeJS.Timeout | undefined;

  /** Inicia el intervalo de limpieza de entradas expiradas. */
  constructor() {
    this.sweepInterval = setInterval(() => this.sweep(), 60_000);
    if (typeof this.sweepInterval.unref === "function") {
      this.sweepInterval.unref();
    }
  }

  /**
   * Obtiene un valor del caché si existe y no expiró.
   * @param key - Clave de la entrada.
   * @returns Valor almacenado o `undefined`.
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Almacena un valor con TTL en segundos.
   * @param key - Clave de la entrada.
   * @param value - Valor a cachear.
   * @param ttlSeconds - Tiempo de vida en segundos.
   * @returns void
   */
  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Elimina una entrada del caché.
   * @param key - Clave a borrar.
   * @returns void
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Devuelve un valor cacheado o lo carga con `loader` y lo guarda.
   * @param key - Clave de la entrada.
   * @param loader - Función asíncrona que obtiene el valor si no está cacheado.
   * @param ttlSeconds - TTL en segundos para la entrada nueva.
   * @returns Valor cacheado o recién cargado.
   */
  async wrap<T>(key: string, loader: () => Promise<T>, ttlSeconds: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await loader();
    this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Vacía por completo el almacén en memoria.
   * @returns void
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Devuelve la cantidad de entradas actuales (incluidas expiradas pendientes de barrido).
   * @returns Número de claves en el mapa interno.
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Elimina entradas expiradas del mapa interno.
   * @returns void
   */
  private sweep(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
        removed += 1;
      }
    }
    if (removed > 0) {
      this.logger.debug?.(`Cache sweep removed ${removed} expired entries`);
    }
  }

  /**
   * Detiene el intervalo de barrido al destruir el módulo.
   * @returns void
   */
  onModuleDestroy(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = undefined;
    }
  }
}
