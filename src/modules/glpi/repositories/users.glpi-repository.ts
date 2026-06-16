/**
 * @file users.glpi-repository.ts
 * @description Repositorio REST de usuarios GLPI: búsqueda, listados y resolución de técnicos.
 */
import { Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../../common/dto/pagination.dto";
import { GlpiClient } from "../glpi.client";
import { GLPI_ENDPOINTS } from "../glpi.constants";
import { UserMapper, type DomainUser } from "../mappers/user.mapper";
import {
  emailsMatch,
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
  GlpiUserTitleRaw,
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

/**
 * Repositorio REST de usuarios y técnicos en GLPI.
 */
@Injectable()
export class UsersGlpiRepository {
  /**
 Inyecta el cliente HTTP de GLPI.
   * @returns void
   * @throws No lanza excepciones salvo errores de infraestructura.
   */
  constructor(private readonly glpi: GlpiClient) {}

  /**

   * Obtiene usuario por ID; complementa email vía UserEmail si falta.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param userId - Parámetro `userId`.
   * @returns `Promise<DomainUser | null>`
   */
  async findById(sessionKey: string, userId: number): Promise<DomainUser | null>  {
    try {
      const response = await this.glpi.request<GlpiUserRaw>({
        method: "GET",
        path: `${GLPI_ENDPOINTS.USER}/${userId}`,
        sessionKey,
        query: { expand_dropdowns: false },
      });
      const raw = response.data;
      let user = UserMapper.toDomain(raw);
      if (!user.userTitle) {
        const titleId = UserMapper.toOptionalId(raw.usertitles_id);
        if (titleId) {
          const userTitle = await this.findUserTitleName(sessionKey, titleId);
          if (userTitle) {
            user = { ...user, userTitle };
          }
        }
      }
      if (user.email) {
        return user;
      }

      const email = await this.findPrimaryEmail(sessionKey, userId);
      return email ? { ...user, email } : user;
    } catch {
      return null;
    }
  }

  /**

   * Lee correo principal desde sub-recurso UserEmail.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param userId - Parámetro `userId`.
   * @returns `Promise<string | null>`
   */
  private async findPrimaryEmail(sessionKey: string, userId: number): Promise<string | null>  {
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

  /**

   * Busca usuario por correo electrónico.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param email - Parámetro `email`.
   * @returns `Promise<DomainUser | null>`
   */
  async findByEmail(sessionKey: string, email: string): Promise<DomainUser | null>  {
    const trimmed = email.trim();
    if (!trimmed.includes("@")) {
      return null;
    }

    try {
      const response = await this.glpi.request<GlpiUserEmailRaw[]>({
        method: "GET",
        path: GLPI_ENDPOINTS.USER_EMAIL,
        sessionKey,
        query: {
          "searchText[email]": trimmed,
          range: "0-49",
        },
      });

      const entries = Array.isArray(response.data) ? response.data : [];
      const match = entries.find((entry) => entry.email && emailsMatch(entry.email, trimmed));
      const userId = Number(match?.users_id ?? 0);
      if (!Number.isFinite(userId) || userId <= 0) {
        return null;
      }

      return this.findById(sessionKey, userId);
    } catch {
      return null;
    }
  }

  /**

   * Busca usuario por login GLPI con coincidencia exacta en name.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param login - Parámetro `login`.
   * @returns `Promise<DomainUser | null>`
   */
  async findByLogin(sessionKey: string, login: string): Promise<DomainUser | null>  {
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

  /**

   * Alias de fetchAllActiveUsers para listado completo.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @returns `Promise<DomainUser[]>`
   */
  async listAll(sessionKey: string): Promise<DomainUser[]>  {
    return this.fetchAllActiveUsers(sessionKey);
  }

  /**

   * Descarga usuarios activos paginando la API User.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @returns `Promise<DomainUser[]>`
   */
  async fetchAllActiveUsers(sessionKey: string): Promise<DomainUser[]>  {
    const titleById = await this.fetchUserTitleMap(sessionKey);
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
        const titleId = UserMapper.toOptionalId(raw.usertitles_id);
        const userTitle = user.userTitle ?? (titleId ? titleById.get(titleId) ?? null : null);
        all.push(userTitle ? { ...user, userTitle } : user);
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

  /**

   * Lista usuarios activos con búsqueda y paginación en memoria.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param filter - Parámetro `filter`.
   * @returns `Promise<PaginatedResult<DomainUser>>`
   */
  async list(
    sessionKey: string,
    filter: ListUsersFilter,
  ): Promise<PaginatedResult<DomainUser>>  {
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

  /**
   * Resuelve nombre de título de usuario GLPI por ID.
   * @param sessionKey - Token de sesión GLPI.
   * @param userTitleId - ID del título de usuario.
   * @returns Nombre del título o `null`.
   */
  async findUserTitleName(sessionKey: string, userTitleId: number): Promise<string | null> {
    try {
      const response = await this.glpi.request<GlpiUserTitleRaw>({
        method: "GET",
        path: `${GLPI_ENDPOINTS.USER_TITLE}/${userTitleId}`,
        sessionKey,
        query: { expand_dropdowns: false },
      });
      const candidate = (response.data?.name ?? "").toString().trim();
      return candidate.length > 0 ? candidate : null;
    } catch {
      return null;
    }
  }

  /**
   * Carga el catálogo de títulos de usuario GLPI indexado por ID.
   * @param sessionKey - Token de sesión GLPI.
   * @returns Mapa id → nombre de título.
   */
  private async fetchUserTitleMap(sessionKey: string): Promise<Map<number, string>> {
    const titleById = new Map<number, string>();
    try {
      const response = await this.glpi.request<GlpiUserTitleRaw[]>({
        method: "GET",
        path: GLPI_ENDPOINTS.USER_TITLE,
        sessionKey,
        query: { range: "0-999" },
      });
      const items = Array.isArray(response.data) ? response.data : [];
      for (const item of items) {
        const name = (item.name ?? "").toString().trim();
        if (name.length > 0) {
          titleById.set(Number(item.id), name);
        }
      }
    } catch {
      return titleById;
    }
    return titleById;
  }

  /**

   * Resuelve nombre de entidad GLPI por ID.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param entityId - Parámetro `entityId`.
   * @returns `Promise<string | null>`
   */
  async findEntityName(sessionKey: string, entityId: number): Promise<string | null>  {
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

  /**

   * IDs de grupos a los que pertenece el usuario.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param userId - Parámetro `userId`.
   * @returns `Promise<number[]>`
   */
  async listGroupsOfUser(sessionKey: string, userId: number): Promise<number[]>  {
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

  /**

   * IDs de miembros de los grupos técnico indicados.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param technicianGroupIds - Parámetro `technicianGroupIds`.
   * @returns `Promise<number[]>`
   */
  async resolveTechnicianIds(
    sessionKey: string,
    technicianGroupIds: number[],
  ): Promise<number[]>  {
    return this.fetchAllGroupMemberIds(sessionKey, technicianGroupIds);
  }

  /**

   * Pagina Group_User filtrando membresías del grupo pedido.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param groupIds - Parámetro `groupIds`.
   * @returns `Promise<number[]>`
   */
  private async fetchAllGroupMemberIds(
    sessionKey: string,
    groupIds: number[],
  ): Promise<number[]>  {
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

  /**

   * Lista perfiles GLPI disponibles (rango 0-499).
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @returns `Promise<GlpiProfileRaw[]>`
   */
  private async listProfiles(sessionKey: string): Promise<GlpiProfileRaw[]>  {
    const response = await this.glpi.request<GlpiProfileRaw[]>({
      method: "GET",
      path: GLPI_ENDPOINTS.PROFILE,
      sessionKey,
      query: { range: "0-499" },
    });
    return Array.isArray(response.data) ? response.data : [];
  }

  /**

   * IDs de usuarios asociados a perfiles dados.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param profileIds - Parámetro `profileIds`.
   * @returns `Promise<number[]>`
   */
  private async fetchAllProfileUserIds(
    sessionKey: string,
    profileIds: number[],
  ): Promise<number[]>  {
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

  /**

   * Usuarios con perfiles operativos de TI.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @returns `Promise<number[]>`
   */
  private async resolveOperationalProfileUserIds(sessionKey: string): Promise<number[]>  {
    const profiles = await this.listProfiles(sessionKey);
    const operationalProfileIds = profiles
      .filter((profile) => isOperationalItProfileName(profile.name))
      .map((profile) => profile.id);
    return this.fetchAllProfileUserIds(sessionKey, operationalProfileIds);
  }

  /**

   * Filtra técnicos elegibles desde usuarios ya cargados.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param technicianGroupIds - Parámetro `technicianGroupIds`.
   * @param activeUsers - Parámetro `activeUsers`.
   * @returns `Promise<DomainUser[]>`
   */
  async resolveEligibleTechniciansFromUsers(
    sessionKey: string,
    technicianGroupIds: number[],
    activeUsers: DomainUser[],
  ): Promise<DomainUser[]>  {
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

  /**

   * Carga usuarios activos y resuelve técnicos elegibles.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param technicianGroupIds - Parámetro `technicianGroupIds`.
   * @returns `Promise<DomainUser[]>`
   */
  private async resolveEligibleTechnicians(
    sessionKey: string,
    technicianGroupIds: number[],
  ): Promise<DomainUser[]>  {
    const activeUsers = await this.fetchAllActiveUsers(sessionKey);
    return this.resolveEligibleTechniciansFromUsers(sessionKey, technicianGroupIds, activeUsers);
  }

  /**

   * Indica si un usuario es técnico elegible.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param userId - Parámetro `userId`.
   * @param technicianGroupIds - Parámetro `technicianGroupIds`.
   * @returns `Promise<boolean>`
   */
  async isEligibleTechnician(
    sessionKey: string,
    userId: number,
    technicianGroupIds: number[],
  ): Promise<boolean>  {
    const technicians = await this.resolveEligibleTechnicians(sessionKey, technicianGroupIds);
    return technicians.some((user) => user.id === userId);
  }

  /**

   * Carga usuarios activos por lista de IDs.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param userIds - Parámetro `userIds`.
   * @returns `Promise<DomainUser[]>`
   */
  async fetchUsersByIds(sessionKey: string, userIds: number[]): Promise<DomainUser[]>  {
    if (userIds.length === 0) {
      return [];
    }

    const users = await Promise.all(userIds.map((id) => this.findById(sessionKey, id)));
    return users.filter((user): user is DomainUser => user !== null && user.isActive);
  }

  /**

   * Lista técnicos elegibles con paginación opcional.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición en métodos que propagan error.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param technicianGroupIds - Parámetro `technicianGroupIds`.
   * @param filter - Parámetro `filter`.
   * @returns `Promise<DomainUser[] | PaginatedResult<DomainUser>>`
   */
  async listTechnicians(
    sessionKey: string,
    technicianGroupIds: number[],
    filter?: ListUsersFilter,
  ): Promise<DomainUser[] | PaginatedResult<DomainUser>>  {
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
