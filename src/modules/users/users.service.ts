import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PaginatedResult } from "../../common/dto/pagination.dto";
import { UsersGlpiRepository } from "../glpi/repositories/users.glpi-repository";
import { CatalogService } from "../catalog/catalog.service";
import { GlpiBootstrapService } from "../glpi/glpi-bootstrap.service";
import { InMemoryCacheService } from "../cache/cache.service";
import { CACHE_KEYS } from "../cache/cache.keys";
import { isTiGroupName } from "../glpi/role.utils";
import type { DomainUser } from "../glpi/mappers/user.mapper";
import { emailsMatch, matchesUserSearch } from "../glpi/user-search.utils";
import type { AppConfig } from "../../config/configuration";
import {
  DEFAULT_USERS_PAGE_LIMIT,
  type ListUsersQueryDto,
} from "./dto/list-users-query.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersGlpiRepository,
    private readonly catalog: CatalogService,
    private readonly bootstrap: GlpiBootstrapService,
    private readonly cache: InMemoryCacheService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async listAll(): Promise<DomainUser[]> {
    return this.getCachedActiveUsers();
  }

  async list(query: ListUsersQueryDto): Promise<PaginatedResult<DomainUser>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_USERS_PAGE_LIMIT;
    const search = query.search?.trim();
    const allUsers = await this.getCachedActiveUsers();
    const filtered = search
      ? allUsers.filter((user) => matchesUserSearch(user, search))
      : allUsers;
    const start = (page - 1) * limit;

    return {
      items: filtered.slice(start, start + limit),
      total: filtered.length,
      page,
      limit,
    };
  }

  private async getCachedActiveUsers(): Promise<DomainUser[]> {
    const ttl = this.config.get("cache.defaultTtlSeconds", { infer: true });
    return this.cache.wrap(
      CACHE_KEYS.USERS_ALL,
      () =>
        this.bootstrap.withCatalogBootstrapSession((key) =>
          this.repo.fetchAllActiveUsers(key),
        ),
      ttl,
    );
  }

  async listTechnicians(query?: ListUsersQueryDto): Promise<PaginatedResult<DomainUser>> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? DEFAULT_USERS_PAGE_LIMIT;
    const search = query?.search?.trim();
    const allTechnicians = await this.getCachedTechnicians();
    const filtered = search
      ? allTechnicians.filter((user) => matchesUserSearch(user, search))
      : allTechnicians;
    const start = (page - 1) * limit;

    return {
      items: filtered.slice(start, start + limit),
      total: filtered.length,
      page,
      limit,
    };
  }

  private async getCachedTechnicians(): Promise<DomainUser[]> {
    const ttl = this.config.get("cache.defaultTtlSeconds", { infer: true });
    return this.cache.wrap(
      CACHE_KEYS.USERS_TECHNICIANS,
      async () => {
        const [activeUsers, tiGroupIds] = await Promise.all([
          this.getCachedActiveUsers(),
          this.getCachedTiGroupIds(),
        ]);
        return this.bootstrap.withCatalogBootstrapSession((key) =>
          this.repo.resolveEligibleTechniciansFromUsers(key, tiGroupIds, activeUsers),
        );
      },
      ttl,
    );
  }

  private async getCachedTiGroupIds(): Promise<number[]> {
    const groups = await this.catalog.listGroups();
    return groups
      .filter((group) => isTiGroupName(group.name))
      .map((group) => group.id);
  }

  async findById(id: number): Promise<DomainUser | null> {
    return this.bootstrap.withCatalogBootstrapSession((key) =>
      this.repo.findById(key, id),
    );
  }

  async findByLogin(login: string): Promise<DomainUser | null> {
    const trimmed = login.trim();
    if (!trimmed) {
      return null;
    }
    return this.bootstrap.withCatalogBootstrapSession((key) =>
      this.repo.findByLogin(key, trimmed),
    );
  }

  async findByEmail(email: string): Promise<DomainUser | null> {
    const trimmed = email.trim();
    if (!trimmed.includes("@")) {
      return null;
    }

    const cached = await this.getCachedActiveUsers();
    const fromCache = cached.find(
      (user) => user.email && emailsMatch(user.email, trimmed),
    );
    if (fromCache) {
      return fromCache;
    }

    return this.bootstrap.withCatalogBootstrapSession((key) =>
      this.repo.findByEmail(key, trimmed),
    );
  }

  async isEligibleTechnician(userId: number): Promise<boolean> {
    const technicians = await this.getCachedTechnicians();
    return technicians.some((user) => user.id === userId);
  }
}
