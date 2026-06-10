/**
 * @file catalog.service.ts
 * @description Expone catálogos GLPI (categorías, ubicaciones y grupos) con caché en memoria.
 */
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CatalogGlpiRepository } from "../glpi/repositories/catalog.glpi-repository";
import { LocationsSqlRepository } from "../glpi/repositories/locations.sql-repository";
import { GlpiBootstrapService } from "../glpi/glpi-bootstrap.service";
import { InMemoryCacheService } from "../cache/cache.service";
import { CACHE_KEYS } from "../cache/cache.keys";
import type { DomainCategory } from "../glpi/mappers/category.mapper";
import type { DomainLocation } from "../glpi/mappers/location.mapper";
import type { DomainGroup } from "../glpi/mappers/group.mapper";
import type { AppConfig } from "../../config/configuration";

/**
 * Servicio de catálogo ITIL con lectura cacheada desde GLPI o SQL.
 */
@Injectable()
export class CatalogService {
  /**
   * Inyecta repositorios GLPI/SQL, bootstrap, caché y configuración.
   * @param repo - Repositorio GLPI de catálogo.
   * @param locationsSqlRepo - Repositorio SQL de ubicaciones.
   * @param bootstrap - Sesión bootstrap de GLPI.
   * @param cache - Caché en memoria.
   * @param config - Configuración de la aplicación.
   */
  constructor(
    private readonly repo: CatalogGlpiRepository,
    private readonly locationsSqlRepo: LocationsSqlRepository,
    private readonly bootstrap: GlpiBootstrapService,
    private readonly cache: InMemoryCacheService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Lista categorías ITIL desde caché o GLPI.
   * @returns Categorías del dominio ordenadas por el origen de datos.
   */
  async listCategories(): Promise<DomainCategory[]> {
    const ttl = this.config.get("cache.catalogTtlSeconds", { infer: true });
    return this.cache.wrap(
      CACHE_KEYS.CATEGORIES,
      () => this.bootstrap.withCatalogBootstrapSession((key) => this.repo.listCategories(key)),
      ttl,
    );
  }

  /**
   * Lista ubicaciones; opcionalmente solo las con usuarios activos (SQL).
   * @param options - Filtro `activeOnly` para ubicaciones con usuarios activos.
   * @returns Ubicaciones del dominio.
   */
  async listLocations(options?: { activeOnly?: boolean }): Promise<DomainLocation[]> {
    const ttl = this.config.get("cache.catalogTtlSeconds", { infer: true });

    if (options?.activeOnly) {
      return this.cache.wrap(
        CACHE_KEYS.LOCATIONS_ACTIVE,
        () => this.locationsSqlRepo.listLocationsWithActiveUsers(),
        ttl,
      );
    }

    return this.cache.wrap(
      CACHE_KEYS.LOCATIONS,
      () => this.bootstrap.withCatalogBootstrapSession((key) => this.repo.listLocations(key)),
      ttl,
    );
  }

  /**
   * Lista grupos GLPI desde caché o API.
   * @returns Grupos del dominio.
   */
  async listGroups(): Promise<DomainGroup[]> {
    const ttl = this.config.get("cache.catalogTtlSeconds", { infer: true });
    return this.cache.wrap(
      CACHE_KEYS.GROUPS,
      () => this.bootstrap.withCatalogBootstrapSession((key) => this.repo.listGroups(key)),
      ttl,
    );
  }

  /**
   * Invalida entradas de caché del catálogo según el alcance indicado.
   * @param scope - Alcance: todo el catálogo o una entidad concreta.
   * @returns void
   */
  invalidate(scope: "all" | "categories" | "locations" | "groups"): void {
    if (scope === "all" || scope === "categories") this.cache.delete(CACHE_KEYS.CATEGORIES);
    if (scope === "all" || scope === "locations") {
      this.cache.delete(CACHE_KEYS.LOCATIONS);
      this.cache.delete(CACHE_KEYS.LOCATIONS_ACTIVE);
    }
    if (scope === "all" || scope === "groups") this.cache.delete(CACHE_KEYS.GROUPS);
  }
}
