import { Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../../common/dto/pagination.dto";
import { GlpiClient } from "../glpi.client";
import { GLPI_ENDPOINTS } from "../glpi.constants";
import { UserMapper, type DomainUser } from "../mappers/user.mapper";
import {
  matchesUserSearch,
  parseContentRangeTotal,
  sortUsersByName,
} from "../user-search.utils";
import type {
  GlpiEntityRaw,
  GlpiProfileRaw,
  GlpiProfileUserRaw,
  GlpiUserEmailRaw,
  GlpiUserRaw,
} from "../glpi.types";
import {
  isOperationalItProfileName,
} from "../role.utils";

export interface ListUsersFilter {
  page: number;
  limit: number;
  search?: string;
}

const USER_FETCH_BATCH_SIZE = 200;
const MAX_USER_FETCH_BATCHES = 50;

@Injectable()
export class UsersGlpiRepository {
  constructor(private readonly glpi: GlpiClient) {}

  async findById(sessionKey: string, userId: number): Promise<DomainUser | null> {
    try {
      const response = await this.glpi.request<GlpiUserRaw>({
        method: "GET",
        path: `${GLPI_ENDPOINTS.USER}/${userId}`,
        sessionKey,
        query: { expand_dropdowns: false },
      });
      const user = UserMapper.toDomain(response.data);
      if (user.email) {
        return user;
      }

      const email = await this.findPrimaryEmail(sessionKey, userId);
      return email ? { ...user, email } : user;
    } catch {
      return null;
    }
  }

  private async findPrimaryEmail(sessionKey: string, userId: number): Promise<string | null> {
    try {
      const response = await this.glpi.request<GlpiUserEmailRaw[]>({
        method: "GET",
        path: `${GLPI_ENDPOINTS.USER}/${userId}/${GLPI_ENDPOINTS.USER_EMAIL}`,
        sessionKey,
        query: { range: "0-49" },
      });
      const entries = Array.isArray(response.data) ? response.data : [];
      if (entries.length === 0) {
        return null;
      }

      const defaultEntry = entries.find((entry) => entry.is_default === 1);
      const candidate = defaultEntry ?? entries[0];
      const email = candidate?.email?.trim();
      return email && email.includes("@") ? email : null;
    } catch {
      return null;
    }
  }

  async findByLogin(sessionKey: string, login: string): Promise<DomainUser | null> {
    // GLPI 9.4 espera filtros por campo como `searchText[<field>]=<value>` (array de
    // query params), no como `searchText=name:<value>`. Si se manda mal, GLPI ignora
    // el filtro y devuelve toda la tabla paginada.
    const response = await this.glpi.request<GlpiUserRaw[] | Record<string, unknown>>({
      method: "GET",
      path: GLPI_ENDPOINTS.USER,
      sessionKey,
      query: {
        "searchText[name]": login,
        is_deleted: 0,
        range: "0-49",
      },
    });

    const list = Array.isArray(response.data) ? response.data : [];
    if (list.length === 0) return null;

    // Match exacto en `name` (login GLPI). Nunca devolver list[0] como fallback:
    // si no hay match exacto, mejor null y que el caller lo trate como "no existe".
    const exact = list.find(
      (entry) => entry.name?.toLowerCase() === login.toLowerCase(),
    );
    return exact ? UserMapper.toDomain(exact) : null;
  }

  async listAll(sessionKey: string): Promise<DomainUser[]> {
    return this.fetchAllActiveUsers(sessionKey);
  }

  async fetchAllActiveUsers(sessionKey: string): Promise<DomainUser[]> {
    const all: DomainUser[] = [];
    let start = 0;
    let total: number | null = null;

    for (let batch = 0; batch < MAX_USER_FETCH_BATCHES; batch += 1) {
      const end = start + USER_FETCH_BATCH_SIZE - 1;
      const response = await this.glpi.request<GlpiUserRaw[]>({
        method: "GET",
        path: GLPI_ENDPOINTS.USER,
        sessionKey,
        query: { range: `${start}-${end}`, is_deleted: 0 },
      });

      const list = Array.isArray(response.data) ? response.data : [];
      if (total === null) {
        total = parseContentRangeTotal(response.headers["content-range"]);
      }

      for (const raw of list) {
        if (raw.is_active === 0) {
          continue;
        }
        const user = UserMapper.toDomain(raw);
        if (!user.isActive) {
          continue;
        }
        all.push(user);
      }

      const fetchedThrough = start + list.length;
      if (list.length < USER_FETCH_BATCH_SIZE) {
        break;
      }
      if (total !== null && fetchedThrough >= total) {
        break;
      }
      start += USER_FETCH_BATCH_SIZE;
    }

    return sortUsersByName(all);
  }

  async list(
    sessionKey: string,
    filter: ListUsersFilter,
  ): Promise<PaginatedResult<DomainUser>> {
    const search = filter.search?.trim();
    const allUsers = await this.fetchAllActiveUsers(sessionKey);
    const filtered = search
      ? allUsers.filter((user) => matchesUserSearch(user, search))
      : allUsers;
    const start = (filter.page - 1) * filter.limit;

    return {
      items: filtered.slice(start, start + filter.limit),
      total: filtered.length,
      page: filter.page,
      limit: filter.limit,
    };
  }

  async findEntityName(sessionKey: string, entityId: number): Promise<string | null> {
    try {
      const response = await this.glpi.request<GlpiEntityRaw>({
        method: "GET",
        path: `${GLPI_ENDPOINTS.ENTITY}/${entityId}`,
        sessionKey,
        query: { expand_dropdowns: false },
      });
      const data = response.data;
      const candidate = (data?.completename ?? data?.name ?? "").toString().trim();
      return candidate.length > 0 ? candidate : null;
    } catch {
      return null;
    }
  }

  async listGroupsOfUser(sessionKey: string, userId: number): Promise<number[]> {
    const response = await this.glpi.request<Array<{ groups_id?: number }>>({
      method: "GET",
      path: GLPI_ENDPOINTS.GROUP_USER,
      sessionKey,
      query: { "searchText[users_id]": userId },
    });
    const list = Array.isArray(response.data) ? response.data : [];
    const ids = list
      .map((entry) => Number(entry.groups_id ?? 0))
      .filter((id) => Number.isFinite(id) && id > 0);
    return Array.from(new Set(ids));
  }

  async resolveTechnicianIds(
    sessionKey: string,
    technicianGroupIds: number[],
  ): Promise<number[]> {
    return this.fetchAllGroupMemberIds(sessionKey, technicianGroupIds);
  }

  private async fetchAllGroupMemberIds(
    sessionKey: string,
    groupIds: number[],
  ): Promise<number[]> {
    if (groupIds.length === 0) {
      return [];
    }

    const memberIds = new Set<number>();

    for (const groupId of groupIds) {
      let start = 0;

      for (let batch = 0; batch < MAX_USER_FETCH_BATCHES; batch += 1) {
        const end = start + USER_FETCH_BATCH_SIZE - 1;
        const response = await this.glpi.request<
          Array<{ users_id?: number; groups_id?: number }>
        >({
          method: "GET",
          path: GLPI_ENDPOINTS.GROUP_USER,
          sessionKey,
          query: { "searchText[groups_id]": groupId, range: `${start}-${end}` },
        });

        const list = Array.isArray(response.data) ? response.data : [];
        for (const entry of list) {
          // GLPI 9.4 searchText[groups_id] no filtra de forma fiable: la respuesta
          // incluye filas de otros grupos. Solo contar membres├¡as del grupo pedido.
          const entryGroupId = Number(entry.groups_id ?? 0);
          if (entryGroupId !== groupId) {
            continue;
          }
          const id = Number(entry.users_id ?? 0);
          if (id > 0) {
            memberIds.add(id);
          }
        }

        const total = parseContentRangeTotal(response.headers["content-range"]);
        const fetchedThrough = start + list.length;
        if (list.length < USER_FETCH_BATCH_SIZE) {
          break;
        }
        if (total !== null && fetchedThrough >= total) {
          break;
        }
        start += USER_FETCH_BATCH_SIZE;
      }
    }

    return [...memberIds];
  }

  private async listProfiles(sessionKey: string): Promise<GlpiProfileRaw[]> {
    const response = await this.glpi.request<GlpiProfileRaw[]>({
      method: "GET",
      path: GLPI_ENDPOINTS.PROFILE,
      sessionKey,
      query: { range: "0-499" },
    });
    return Array.isArray(response.data) ? response.data : [];
  }

  private async fetchAllProfileUserIds(
    sessionKey: string,
    profileIds: number[],
  ): Promise<number[]> {
    if (profileIds.length === 0) {
      return [];
    }

    const userIds = new Set<number>();

    for (const profileId of profileIds) {
      let start = 0;

      for (let batch = 0; batch < MAX_USER_FETCH_BATCHES; batch += 1) {
        const end = start + USER_FETCH_BATCH_SIZE - 1;
        const response = await this.glpi.request<GlpiProfileUserRaw[]>({
          method: "GET",
          path: GLPI_ENDPOINTS.PROFILE_USER,
          sessionKey,
          query: { "searchText[profiles_id]": profileId, range: `${start}-${end}` },
        });

        const list = Array.isArray(response.data) ? response.data : [];
        for (const entry of list) {
          const id = Number(entry.users_id ?? 0);
          if (id > 0) {
            userIds.add(id);
          }
        }

        const total = parseContentRangeTotal(response.headers["content-range"]);
        const fetchedThrough = start + list.length;
        if (list.length < USER_FETCH_BATCH_SIZE) {
          break;
        }
        if (total !== null && fetchedThrough >= total) {
          break;
        }
        start += USER_FETCH_BATCH_SIZE;
      }
    }

    return [...userIds];
  }

  private async resolveOperationalProfileUserIds(sessionKey: string): Promise<number[]> {
    const profiles = await this.listProfiles(sessionKey);
    const operationalProfileIds = profiles
      .filter((profile) => isOperationalItProfileName(profile.name))
      .map((profile) => profile.id);
    return this.fetchAllProfileUserIds(sessionKey, operationalProfileIds);
  }

  async resolveEligibleTechniciansFromUsers(
    sessionKey: string,
    technicianGroupIds: number[],
    activeUsers: DomainUser[],
  ): Promise<DomainUser[]> {
    const [groupMemberIds, operationalProfileUserIds] = await Promise.all([
      this.fetchAllGroupMemberIds(sessionKey, technicianGroupIds),
      this.resolveOperationalProfileUserIds(sessionKey),
    ]);

    const groupMemberIdSet = new Set(groupMemberIds);
    const operationalProfileIdSet = new Set(operationalProfileUserIds);
    const tiGroupIdSet = new Set(technicianGroupIds);
    const eligible = new Map<number, DomainUser>();

    for (const user of activeUsers) {
      if (!user.isActive) {
        continue;
      }

      const inTiGroup = groupMemberIdSet.has(user.id);
      const primaryGroupIsTi = user.primaryGroupId !== null && tiGroupIdSet.has(user.primaryGroupId);
      const hasOperationalProfile = operationalProfileIdSet.has(user.id);

      if (inTiGroup || primaryGroupIsTi || hasOperationalProfile) {
        eligible.set(user.id, user);
      }
    }

    const missingGroupMemberIds = groupMemberIds.filter((id) => !eligible.has(id));
    if (missingGroupMemberIds.length > 0) {
      const fallbackUsers = await this.fetchUsersByIds(sessionKey, missingGroupMemberIds);
      for (const user of fallbackUsers) {
        eligible.set(user.id, user);
      }
    }

    return sortUsersByName([...eligible.values()]);
  }

  private async resolveEligibleTechnicians(
    sessionKey: string,
    technicianGroupIds: number[],
  ): Promise<DomainUser[]> {
    const activeUsers = await this.fetchAllActiveUsers(sessionKey);
    return this.resolveEligibleTechniciansFromUsers(sessionKey, technicianGroupIds, activeUsers);
  }

  async isEligibleTechnician(
    sessionKey: string,
    userId: number,
    technicianGroupIds: number[],
  ): Promise<boolean> {
    const technicians = await this.resolveEligibleTechnicians(sessionKey, technicianGroupIds);
    return technicians.some((user) => user.id === userId);
  }

  async fetchUsersByIds(sessionKey: string, userIds: number[]): Promise<DomainUser[]> {
    if (userIds.length === 0) {
      return [];
    }

    const users = await Promise.all(userIds.map((id) => this.findById(sessionKey, id)));
    return users.filter((user): user is DomainUser => user !== null && user.isActive);
  }

  async listTechnicians(
    sessionKey: string,
    technicianGroupIds: number[],
    filter?: ListUsersFilter,
  ): Promise<DomainUser[] | PaginatedResult<DomainUser>> {
    const users = await this.resolveEligibleTechnicians(sessionKey, technicianGroupIds);

    if (!filter) {
      return users;
    }

    const search = filter.search?.trim();
    const filtered = search ? users.filter((user) => matchesUserSearch(user, search)) : users;
    const start = (filter.page - 1) * filter.limit;

    return {
      items: filtered.slice(start, start + filter.limit),
      total: filtered.length,
      page: filter.page,
      limit: filter.limit,
    };
  }
}
