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

@Injectable()
export class CatalogService {
  constructor(
    private readonly repo: CatalogGlpiRepository,
    private readonly locationsSqlRepo: LocationsSqlRepository,
    private readonly bootstrap: GlpiBootstrapService,
    private readonly cache: InMemoryCacheService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async listCategories(): Promise<DomainCategory[]> {
    const ttl = this.config.get("cache.catalogTtlSeconds", { infer: true });
    return this.cache.wrap(
      CACHE_KEYS.CATEGORIES,
      () => this.bootstrap.withCatalogBootstrapSession((key) => this.repo.listCategories(key)),
      ttl,
    );
  }

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

  async listGroups(): Promise<DomainGroup[]> {
    const ttl = this.config.get("cache.catalogTtlSeconds", { infer: true });
    return this.cache.wrap(
      CACHE_KEYS.GROUPS,
      () => this.bootstrap.withCatalogBootstrapSession((key) => this.repo.listGroups(key)),
      ttl,
    );
  }

  invalidate(scope: "all" | "categories" | "locations" | "groups"): void {
    if (scope === "all" || scope === "categories") this.cache.delete(CACHE_KEYS.CATEGORIES);
    if (scope === "all" || scope === "locations") {
      this.cache.delete(CACHE_KEYS.LOCATIONS);
      this.cache.delete(CACHE_KEYS.LOCATIONS_ACTIVE);
    }
    if (scope === "all" || scope === "groups") this.cache.delete(CACHE_KEYS.GROUPS);
  }
}
