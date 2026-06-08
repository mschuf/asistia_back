import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import type { PaginatedResult } from "../../common/dto/pagination.dto";
import { UsersGlpiRepository } from "../glpi/repositories/users.glpi-repository";
import { UsersTechniciansSqlRepository } from "../glpi/repositories/users-technicians.sql-repository";
import { CatalogService } from "../catalog/catalog.service";
import { GlpiBootstrapService } from "../glpi/glpi-bootstrap.service";
import { InMemoryCacheService } from "../cache/cache.service";
import { CACHE_KEYS } from "../cache/cache.keys";
import { isTiGroupName } from "../glpi/role.utils";
import type { DomainUser } from "../glpi/mappers/user.mapper";
import { emailsMatch, matchesUserSearch } from "../glpi/user-search.utils";
import { pickLastActiveTechnicianByName } from "../tickets/domain/ticket-auto-assign.helpers";
import { normalizeLocationId } from "../tickets/domain/ticket-metrics.helpers";
import type { AppConfig } from "../../config/configuration";
import {
  DEFAULT_USERS_PAGE_LIMIT,
  type ListUsersQueryDto,
} from "./dto/list-users-query.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersGlpiRepository,
    private readonly techniciansSqlRepo: UsersTechniciansSqlRepository,
    private readonly catalog: CatalogService,
    private readonly bootstrap: GlpiBootstrapService,
    private readonly cache: InMemoryCacheService,
    private readonly config: ConfigService<AppConfig, true>,
    @InjectPinoLogger(UsersService.name)
    private readonly logger: PinoLogger,
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
      async () => {
        const usersSource = this.config.get("glpi.usersSource", { infer: true });
        if (usersSource === "sql") {
          try {
            const sqlItems = await this.techniciansSqlRepo.listActiveUsers();
            this.logger.info(
              {
                usersListSource: "sql",
                configured: usersSource,
                total: sqlItems.length,
              },
              "[users] source=sql",
            );
            return sqlItems;
          } catch (error) {
            this.logger.warn(
              {
                usersListSource: "api-fallback",
                configured: usersSource,
                reason: "sql_error",
                err: error,
              },
              `[users] source=api-fallback message=${(error as Error).message}`,
            );
          }
        }

        const apiItems = await this.bootstrap.withCatalogBootstrapSession((key) =>
          this.repo.fetchAllActiveUsers(key),
        );
        this.logger.info(
          {
            usersListSource: "api",
            configured: usersSource,
            total: apiItems.length,
          },
          "[users] source=api",
        );
        return apiItems;
      },
      ttl,
    );
  }

  async listTechnicians(query?: ListUsersQueryDto): Promise<PaginatedResult<DomainUser>> {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? DEFAULT_USERS_PAGE_LIMIT;
    const search = query?.search?.trim();
    const allTechnicians = (await this.getCachedTechnicians()).filter((user) => user.isActive);
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
        const tiGroupIds = await this.getCachedTiGroupIds();
        const techniciansSource = this.config.get("glpi.techniciansSource", { infer: true });

        if (techniciansSource === "sql") {
          try {
            const sqlItems = await this.techniciansSqlRepo.listEligibleTechnicians(tiGroupIds);
            this.logger.info(
              {
                usersTechniciansSource: "sql",
                configured: techniciansSource,
                total: sqlItems.length,
              },
              "[users/technicians] source=sql",
            );
            return sqlItems;
          } catch (error) {
            this.logger.warn(
              {
                usersTechniciansSource: "api-fallback",
                configured: techniciansSource,
                reason: "sql_error",
                err: error,
              },
              `[users/technicians] source=api-fallback message=${(error as Error).message}`,
            );
          }
        }

        const activeUsers = await this.getCachedActiveUsers();
        const apiItems = await this.bootstrap.withCatalogBootstrapSession((key) =>
          this.repo.resolveEligibleTechniciansFromUsers(key, tiGroupIds, activeUsers),
        );
        this.logger.info(
          {
            usersTechniciansSource: "api",
            configured: techniciansSource,
            total: apiItems.length,
          },
          "[users/technicians] source=api",
        );
        return apiItems;
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

  async resolveLastTechnicianForLocation(locationId: number | null): Promise<DomainUser | null> {
    const normalizedLocationId = normalizeLocationId(locationId);
    const tiGroupIds = await this.getCachedTiGroupIds();

    try {
      const technicians = await this.techniciansSqlRepo.listEligibleTechniciansForLocation(
        tiGroupIds,
        normalizedLocationId,
      );
      return pickLastActiveTechnicianByName(technicians, normalizedLocationId);
    } catch (error) {
      this.logger.warn(
        {
          autoAssignSource: "sql",
          locationId: normalizedLocationId,
          err: error,
        },
        `[users/auto-assign] sql failed message=${(error as Error).message}`,
      );
      return null;
    }
  }
}
