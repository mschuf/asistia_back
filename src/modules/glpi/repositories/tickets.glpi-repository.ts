/**
 * @file tickets.glpi-repository.ts
 * @description Repositorio REST de tickets GLPI: listado, historial, métricas y ciclo de vida.
 */
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GlpiClient } from "../glpi.client";
import {
  GLPI_ENDPOINTS,
  GLPI_TICKET_TYPE,
  GLPI_TICKET_SEARCH_FIELDS,
  GLPI_TICKET_USER_TYPE,
} from "../glpi.constants";
import { isActiveTicket, TicketMapper, type DomainTicket } from "../mappers/ticket.mapper";
import type { GlpiTicketRaw } from "../glpi.types";
import { extractSearchRowId, parseGlpiSearchRows, parseGlpiSearchTotal } from "../glpi-search.utils";
import { normalizeLocationId } from "../../tickets/domain/ticket-metrics.helpers";
import type { AppConfig } from "../../../config/configuration";
import type { HistorySortBy, HistorySortOrder } from "../../tickets/dto/list-tickets-query.dto";

export interface ListTicketsFilter {
  status?: number[];
  type?: number;
  requesterId?: number;
  technicianId?: number;
  involvingUserId?: number;
  locationId?: number;
  createdFrom?: string;
  createdTo?: string;
  search?: string;
  page: number;
  limit: number;
  sortBy?: HistorySortBy;
  sortOrder?: HistorySortOrder;
}

export interface ListTicketsResult {
  items: DomainTicket[];
  total: number;
}

export interface ListTicketsOptions {
  /**
 Solicitante/técnico vía Ticket_User. Desactivar en indicadores agregadas. */
  includeActors?: boolean;
}

export interface CreateTicketInput {
  name: string;
  content: string;
  type: number;
  status: number;
  urgency: number;
  itilcategories_id: number;
  locations_id?: number;
  entities_id: number;
  requesters_id?: number;
  technicians_id?: number;
}

const GLPI_REQUEST_CONCURRENCY = 6;
/** Máximo de IDs por sede vía search GLPI cuando no hay filtro previo por usuario. */
const LOCATION_SEARCH_MAX = 500;
/** Campo de búsqueda GLPI para ordenar por última modificación. */
const GLPI_SEARCH_SORT_LAST_UPDATE = 19;
/** Reintentos tras POST /Ticket para compensar índice GLPI en User/Ticket_User. */
const POST_CREATE_INDEX_ATTEMPTS = 3;
const POST_CREATE_INDEX_DELAY_MS = 400;
/** Paginación de search GLPI exclusiva para indicadores TI (no comparte `list()`). */
const METRICS_SEARCH_PAGE_SIZE = 500;
const METRICS_ASSIGNED_MAX = 9999;
/** Columnas explícitas para búsquedas de indicadores acotadas (Mi Sede / Indicadores). */
const SCOPED_METRICS_FORCEDISPLAY = [
  GLPI_TICKET_SEARCH_FIELDS.ID,
  GLPI_TICKET_SEARCH_FIELDS.STATUS,
  GLPI_TICKET_SEARCH_FIELDS.LOCATION,
  GLPI_TICKET_SEARCH_FIELDS.TYPE,
  GLPI_TICKET_SEARCH_FIELDS.DATE_CREATION,
  GLPI_TICKET_SEARCH_FIELDS.TECHNICIAN,
  GLPI_TICKET_SEARCH_FIELDS.TITLE,
] as const;
/** Columnas para Historial (endpoint dedicado, aislado de list/metrics). */
const HISTORY_FORCEDISPLAY = [
  GLPI_TICKET_SEARCH_FIELDS.ID,
  GLPI_TICKET_SEARCH_FIELDS.STATUS,
  GLPI_TICKET_SEARCH_FIELDS.LOCATION,
  GLPI_TICKET_SEARCH_FIELDS.TYPE,
  GLPI_TICKET_SEARCH_FIELDS.DATE_CREATION,
  GLPI_TICKET_SEARCH_FIELDS.DATE_MOD,
  GLPI_TICKET_SEARCH_FIELDS.TECHNICIAN,
  GLPI_TICKET_SEARCH_FIELDS.REQUESTER,
  GLPI_TICKET_SEARCH_FIELDS.CATEGORY,
  GLPI_TICKET_SEARCH_FIELDS.URGENCY,
  GLPI_TICKET_SEARCH_FIELDS.TITLE,
] as const;

interface ScopedMetricsSearchFilter {
  technicianId?: number;
  locationId?: number;
  /** Si true, `locationId` usa `equals` (sede exacta) en lugar de `under`. */
  locationExact?: boolean;
  status?: number[];
}

/**
 * Repositorio REST de tickets GLPI contra la API.
 */
@Injectable()
export class TicketsGlpiRepository {
  /** Inyecta cliente GLPI y configuración. */
  constructor(
    private readonly glpi: GlpiClient,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**

   * Lista tickets paginados combinando Ticket_User, búsqueda GLPI y filtros locales.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param filter - Parámetro `filter`.
   * @param options - Parámetro `options`.
   * @returns `Promise<ListTicketsResult>`
   */
  async list(
    sessionKey: string,
    filter: ListTicketsFilter,
    options: ListTicketsOptions = {},
  ): Promise<ListTicketsResult>  {
    const includeActors = options.includeActors ?? true;
    let ticketIds: number[] | null = null;

    // Historial/indicadores por técnico o solicitante: vínculos Ticket_User (fiable en tickets recién creados).
    // No usar search/Ticket por actor: el índice GLPI suele ir detrás del POST de la API.
    if (filter.technicianId !== undefined) {
      ticketIds = await this.listTicketIdsForUser(
        sessionKey,
        filter.technicianId,
        GLPI_TICKET_USER_TYPE.ASSIGNED,
      );
    }

    if (filter.requesterId !== undefined) {
      const requesterTicketIds = await this.listTicketIdsForUser(
        sessionKey,
        filter.requesterId,
        GLPI_TICKET_USER_TYPE.REQUESTER,
      );
      ticketIds = ticketIds
        ? ticketIds.filter((id) => requesterTicketIds.includes(id))
        : requesterTicketIds;
    }

    if (filter.locationId !== undefined) {
      const locationTicketIds = await this.searchTicketIdsByLocation(
        sessionKey,
        filter.locationId,
      );
      const locationSet = new Set(locationTicketIds);
      ticketIds =
        ticketIds !== null
          ? ticketIds.filter((id) => locationSet.has(id))
          : locationTicketIds;
    }

    if (ticketIds === null && TicketsGlpiRepository.shouldUseSearchOnlyList(filter)) {
      return this.listViaSearch(sessionKey, filter, includeActors);
    }

    let items: DomainTicket[];
    let totalFromHeader: number | null = null;

    if (ticketIds !== null) {
      items = await this.fetchTicketsByIdsInternal(sessionKey, ticketIds);
    } else {
      const start = (filter.page - 1) * filter.limit;
      const end = start + filter.limit - 1;

      const query: Record<string, string | number | boolean | undefined> = {
        is_deleted: 0,
        range: `${start}-${end}`,
        sort: GLPI_SEARCH_SORT_LAST_UPDATE,
        order: "DESC",
        expand_dropdowns: false,
        with_logs: false,
        with_devices: false,
        with_disks: false,
        with_softwares: false,
        with_connections: false,
        with_networkports: false,
        with_infocoms: false,
        with_contracts: false,
        with_documents: false,
        with_tickets: false,
        with_problems: false,
        with_changes: false,
        with_notes: false,
        with_logs_ko: false,
      };

      const response = await this.glpi.request<GlpiTicketRaw[]>({
        method: "GET",
        path: GLPI_ENDPOINTS.TICKET,
        sessionKey,
        query,
      });

      items = (Array.isArray(response.data) ? response.data : []).map((raw) =>
        TicketMapper.toDomain(raw),
      );
      totalFromHeader = TicketsGlpiRepository.parseTotal(response.headers["content-range"]);
    }

    const filterForApply = { ...filter };
    if (ticketIds !== null && filter.locationId !== undefined) {
      delete filterForApply.locationId;
    }
    items = TicketsGlpiRepository.applyListFilters(items, filterForApply);
    items.sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt ?? left.createdAt ?? "") || 0;
      const rightTime = Date.parse(right.updatedAt ?? right.createdAt ?? "") || 0;
      return rightTime - leftTime;
    });

    const total = totalFromHeader ?? items.length;
    const start = (filter.page - 1) * filter.limit;
    const paginated = ticketIds !== null ? items.slice(start, start + filter.limit) : items;
    const resultItems = includeActors
      ? await this.attachTicketActors(sessionKey, paginated)
      : paginated;

    return {
      items: resultItems,
      total: ticketIds !== null ? items.length : total,
    };
  }

  /**

   * Listado vía search GLPI cuando no hay filtro por actor vía Ticket_User.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param filter - Parámetro `filter`.
   * @param includeActors - Parámetro `includeActors`.
   * @returns `Promise<ListTicketsResult>`
   */
  private async listViaSearch(
    sessionKey: string,
    filter: ListTicketsFilter,
    includeActors: boolean,
  ): Promise<ListTicketsResult>  {
    const start = (filter.page - 1) * filter.limit;
    const end = start + filter.limit - 1;

    const response = await this.glpi.request<unknown>({
      method: "GET",
      path: `${GLPI_ENDPOINTS.SEARCH}/${GLPI_ENDPOINTS.TICKET}`,
      sessionKey,
      query: {
        ...TicketsGlpiRepository.buildSearchCriteria(filter),
        is_deleted: 0,
        range: `${start}-${end}`,
        sort: GLPI_SEARCH_SORT_LAST_UPDATE,
        order: "DESC",
      },
    });

    const total = parseGlpiSearchTotal(response.data, response.headers["content-range"]);
    const rows = parseGlpiSearchRows(response.data);
    const ticketIds = rows
      .map((row) => extractSearchRowId(row, GLPI_TICKET_SEARCH_FIELDS.ID))
      .filter((id): id is number => id !== null);

    if (ticketIds.length === 0) {
      return { items: [], total };
    }

    const fetched = await this.fetchTicketsByIdsInternal(sessionKey, ticketIds);
    const byId = new Map(fetched.map((ticket) => [ticket.id, ticket]));
    const items = TicketsGlpiRepository.withoutTrashed(
      ticketIds
        .map((id) => byId.get(id))
        .filter((ticket): ticket is DomainTicket => ticket !== undefined),
    );

    const resultItems = includeActors
      ? await this.attachTicketActors(sessionKey, items)
      : items;

    return { items: resultItems, total };
  }

  /**

   * Indica si el listado puede resolverse solo con search GLPI.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param filter - Parámetro `filter`.
   * @returns `boolean`
   */
  private static shouldUseSearchOnlyList(filter: ListTicketsFilter): boolean  {
    if (filter.technicianId !== undefined || filter.requesterId !== undefined) {
      return false;
    }
    return (
      filter.locationId !== undefined ||
      (filter.status !== undefined && filter.status.length > 0) ||
      filter.type !== undefined ||
      Boolean(filter.search?.trim()) ||
      Boolean(filter.createdFrom) ||
      Boolean(filter.createdTo)
    );
  }

  /**

   * Arma criterios de búsqueda GLPI desde filtros de listado.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param filter - Parámetro `filter`.
   * @returns `Record<string, string | number>`
   */
  private static buildSearchCriteria(filter: ListTicketsFilter): Record<string, string | number>  {
    const query: Record<string, string | number> = {};
    let idx = 0;

    const add = (
      field: number,
      searchtype: string,
      value: string | number,
      link: "AND" | "OR" = "AND",
    ) => {
      if (idx > 0) {
        query[`criteria[${idx}][link]`] = link;
      }
      query[`criteria[${idx}][field]`] = field;
      query[`criteria[${idx}][searchtype]`] = searchtype;
      query[`criteria[${idx}][value]`] = value;
      idx += 1;
    };

    if (filter.technicianId !== undefined) {
      add(GLPI_TICKET_SEARCH_FIELDS.TECHNICIAN, "equals", filter.technicianId);
    }
    if (filter.requesterId !== undefined) {
      add(GLPI_TICKET_SEARCH_FIELDS.REQUESTER, "equals", filter.requesterId);
    }
    if (filter.locationId !== undefined) {
      add(GLPI_TICKET_SEARCH_FIELDS.LOCATION, "under", filter.locationId);
    }
    if (filter.status && filter.status.length > 0) {
      filter.status.forEach((status, index) => {
        add(GLPI_TICKET_SEARCH_FIELDS.STATUS, "equals", status, index === 0 ? "AND" : "OR");
      });
    }
    if (filter.type !== undefined) {
      add(GLPI_TICKET_SEARCH_FIELDS.TYPE, "equals", filter.type);
    }
    if (filter.createdFrom) {
      add(GLPI_TICKET_SEARCH_FIELDS.DATE_CREATION, "morethan", filter.createdFrom);
    }
    if (filter.createdTo) {
      add(GLPI_TICKET_SEARCH_FIELDS.DATE_CREATION, "lessthan", filter.createdTo);
    }
    const searchNeedle = filter.search?.trim();
    if (searchNeedle) {
      add(GLPI_TICKET_SEARCH_FIELDS.TITLE, "contains", searchNeedle);
    }

    return query;
  }

  /**

   * Criterios de búsqueda para indicadores acotados (Mi Sede).
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param filter - Parámetro `filter`.
   * @returns `Record<string, string | number>`
   */
  private static buildScopedMetricsSearchCriteria(
    filter: ScopedMetricsSearchFilter,
  ): Record<string, string | number>  {
    const query: Record<string, string | number> = {};
    let idx = 0;

    const add = (
      field: number,
      searchtype: string,
      value: string | number,
      link: "AND" | "OR" = "AND",
    ) => {
      if (idx > 0) {
        query[`criteria[${idx}][link]`] = link;
      }
      query[`criteria[${idx}][field]`] = field;
      query[`criteria[${idx}][searchtype]`] = searchtype;
      query[`criteria[${idx}][value]`] = value;
      idx += 1;
    };

    if (filter.technicianId !== undefined) {
      add(GLPI_TICKET_SEARCH_FIELDS.TECHNICIAN, "equals", filter.technicianId);
    }
    if (filter.locationId !== undefined) {
      add(
        GLPI_TICKET_SEARCH_FIELDS.LOCATION,
        filter.locationExact ? "equals" : "under",
        filter.locationId,
      );
    }
    if (filter.status && filter.status.length > 0) {
      filter.status.forEach((status, index) => {
        add(GLPI_TICKET_SEARCH_FIELDS.STATUS, "equals", status, index === 0 ? "AND" : "OR");
      });
    }

    return query;
  }

  /**

   * Columnas forcedisplay para búsquedas de indicadores.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @returns `Record<string, number>`
   */
  private static buildScopedMetricsForcedisplayQuery(): Record<string, number>  {
    const query: Record<string, number> = {};
    SCOPED_METRICS_FORCEDISPLAY.forEach((field, index) => {
      query[`forcedisplay[${index}]`] = field;
    });
    return query;
  }

  /**

   * Columnas forcedisplay para búsquedas de historial.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @returns `Record<string, number>`
   */
  private static buildHistoryForcedisplayQuery(): Record<string, number>  {
    const query: Record<string, number> = {};
    HISTORY_FORCEDISPLAY.forEach((field, index) => {
      query[`forcedisplay[${index}]`] = field;
    });
    return query;
  }

  /**

   * Página de historial vía search GLPI aislada de list/metrics.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param filter - Parámetro `filter`.
   * @param rangeStart - Parámetro `rangeStart`.
   * @param rangeEnd - Parámetro `rangeEnd`.
   * @param _fallbackTechnicianId - Parámetro `_fallbackTechnicianId`.
   * @returns `Promise<`
   */
  private async searchHistoryTicketsPage(
    sessionKey: string,
    filter: ListTicketsFilter,
    rangeStart: number,
    rangeEnd: number,
    _fallbackTechnicianId?: number,
  ): Promise< { items: DomainTicket[]; total: number }> {
    const response = await this.glpi.request<unknown>({
      method: "GET",
      path: `${GLPI_ENDPOINTS.SEARCH}/${GLPI_ENDPOINTS.TICKET}`,
      sessionKey,
      query: {
        ...TicketsGlpiRepository.buildSearchCriteria(filter),
        ...TicketsGlpiRepository.buildHistoryForcedisplayQuery(),
        is_deleted: 0,
        range: `${rangeStart}-${rangeEnd}`,
        sort: GLPI_SEARCH_SORT_LAST_UPDATE,
        order: "DESC",
      },
    });

    const total = parseGlpiSearchTotal(response.data, response.headers["content-range"]);
    const rows = parseGlpiSearchRows(response.data);
    const ticketIds = rows
      .map((row) => extractSearchRowId(row, GLPI_TICKET_SEARCH_FIELDS.ID))
      .filter((id): id is number => id !== null);

    if (ticketIds.length === 0) {
      return { items: [], total };
    }

    const fetched = await this.fetchTicketsByIdsInternal(sessionKey, ticketIds);
    const byId = new Map(fetched.map((ticket) => [ticket.id, ticket]));
    const items = TicketsGlpiRepository.withoutTrashed(
      ticketIds
        .map((id) => byId.get(id))
        .filter((ticket): ticket is DomainTicket => ticket !== undefined),
    );

    return { items, total };
  }

  /**

   * Historial paginado con una búsqueda GLPI por página.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param filter - Parámetro `filter`.
   * @param options - Parámetro `options`.
   * @returns `Promise<ListTicketsResult>`
   */
  async listHistoryPage(
    sessionKey: string,
    filter: ListTicketsFilter,
    options: ListTicketsOptions = {},
  ): Promise<ListTicketsResult>  {
    const includeActors = options.includeActors ?? true;
    const start = (filter.page - 1) * filter.limit;
    const end = start + filter.limit - 1;

    const { items, total } = await this.searchHistoryTicketsPage(
      sessionKey,
      filter,
      start,
      end,
      filter.technicianId,
    );

    const resultItems = includeActors
      ? await this.attachTicketActors(sessionKey, items)
      : items;

    return { items: resultItems, total };
  }

  /**

   * Página de tickets para métricas de sede o técnico.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param filter - Parámetro `filter`.
   * @param rangeStart - Parámetro `rangeStart`.
   * @param rangeEnd - Parámetro `rangeEnd`.
   * @param fallbackTechnicianId - Parámetro `fallbackTechnicianId`.
   * @returns `Promise<`
   */
  private async searchScopedMetricsTicketsPage(
    sessionKey: string,
    filter: ScopedMetricsSearchFilter,
    rangeStart: number,
    rangeEnd: number,
    fallbackTechnicianId?: number,
  ): Promise< { items: DomainTicket[]; total: number }> {
    const response = await this.glpi.request<unknown>({
      method: "GET",
      path: `${GLPI_ENDPOINTS.SEARCH}/${GLPI_ENDPOINTS.TICKET}`,
      sessionKey,
      query: {
        ...TicketsGlpiRepository.buildScopedMetricsSearchCriteria(filter),
        ...TicketsGlpiRepository.buildScopedMetricsForcedisplayQuery(),
        is_deleted: 0,
        range: `${rangeStart}-${rangeEnd}`,
        sort: GLPI_SEARCH_SORT_LAST_UPDATE,
        order: "DESC",
      },
    });

    const total = parseGlpiSearchTotal(response.data, response.headers["content-range"]);
    const rows = parseGlpiSearchRows(response.data);
    const items = rows
      .map((row) =>
        TicketsGlpiRepository.domainTicketFromSearchRow(row, fallbackTechnicianId),
      )
      .filter((ticket): ticket is DomainTicket => ticket !== null && isActiveTicket(ticket));

    return { items, total };
  }

  /**

   * Pagina resultados de métricas hasta un máximo configurado.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param filter - Parámetro `filter`.
   * @param maxResults - Parámetro `maxResults`.
   * @param fallbackTechnicianId - Parámetro `fallbackTechnicianId`.
   * @returns `Promise<DomainTicket[]>`
   */
  private async paginateScopedMetricsTickets(
    sessionKey: string,
    filter: ScopedMetricsSearchFilter,
    maxResults: number,
    fallbackTechnicianId?: number,
  ): Promise<DomainTicket[]>  {
    const cappedMax = Math.max(1, Math.min(maxResults, METRICS_ASSIGNED_MAX));
    const all: DomainTicket[] = [];
    let rangeStart = 0;

    while (rangeStart < cappedMax) {
      const rangeEnd = Math.min(
        rangeStart + METRICS_SEARCH_PAGE_SIZE - 1,
        cappedMax - 1,
      );
      const { items, total } = await this.searchScopedMetricsTicketsPage(
        sessionKey,
        filter,
        rangeStart,
        rangeEnd,
        fallbackTechnicianId,
      );
      all.push(...items);
      rangeStart += METRICS_SEARCH_PAGE_SIZE;
      if (items.length === 0 || all.length >= total || rangeStart >= total) {
        break;
      }
    }

    return all;
  }

  /**

   * Página search para agregados de indicadores por actor.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param filter - Parámetro `filter`.
   * @param rangeStart - Parámetro `rangeStart`.
   * @param rangeEnd - Parámetro `rangeEnd`.
   * @param fallbackTechnicianId - Parámetro `fallbackTechnicianId`.
   * @returns `Promise<`
   */
  private async searchTicketsForMetricsPage(
    sessionKey: string,
    filter: Pick<ListTicketsFilter, "technicianId" | "requesterId" | "status">,
    rangeStart: number,
    rangeEnd: number,
    fallbackTechnicianId?: number,
  ): Promise< { items: DomainTicket[]; total: number }> {
    const listFilter: ListTicketsFilter = {
      page: 1,
      limit: rangeEnd - rangeStart + 1,
      technicianId: filter.technicianId,
      requesterId: filter.requesterId,
      status: filter.status,
    };

    const response = await this.glpi.request<unknown>({
      method: "GET",
      path: `${GLPI_ENDPOINTS.SEARCH}/${GLPI_ENDPOINTS.TICKET}`,
      sessionKey,
      query: {
        ...TicketsGlpiRepository.buildSearchCriteria(listFilter),
        is_deleted: 0,
        range: `${rangeStart}-${rangeEnd}`,
        sort: GLPI_SEARCH_SORT_LAST_UPDATE,
        order: "DESC",
      },
    });

    const total = parseGlpiSearchTotal(response.data, response.headers["content-range"]);
    const rows = parseGlpiSearchRows(response.data);
    const items = rows
      .map((row) =>
        TicketsGlpiRepository.domainTicketFromSearchRow(row, fallbackTechnicianId),
      )
      .filter((ticket): ticket is DomainTicket => ticket !== null && isActiveTicket(ticket));

    return { items, total };
  }

  /**

   * Construye DomainTicket mínimo desde fila de search GLPI.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param row - Parámetro `row`.
   * @param fallbackTechnicianId - Parámetro `fallbackTechnicianId`.
   * @returns `DomainTicket | null`
   */
  private static domainTicketFromSearchRow(
    row: Record<string, unknown>,
    fallbackTechnicianId?: number,
  ): DomainTicket | null  {
    const id = extractSearchRowId(row, GLPI_TICKET_SEARCH_FIELDS.ID);
    if (!id) return null;

    const statusRaw = Number(row[String(GLPI_TICKET_SEARCH_FIELDS.STATUS)] ?? 0);
    const typeRaw = Number(
      row[String(GLPI_TICKET_SEARCH_FIELDS.TYPE)] ?? GLPI_TICKET_TYPE.INCIDENT,
    );
    const createdRaw = row[String(GLPI_TICKET_SEARCH_FIELDS.DATE_CREATION)];
    const updatedRaw = row[String(GLPI_TICKET_SEARCH_FIELDS.DATE_MOD)];
    const urgencyRaw = Number(row[String(GLPI_TICKET_SEARCH_FIELDS.URGENCY)] ?? 0);
    const technicianFromRow = TicketsGlpiRepository.parseSearchOptionalId(
      row[String(GLPI_TICKET_SEARCH_FIELDS.TECHNICIAN)],
    );

    return {
      id,
      type: TicketMapper.mapType(typeRaw),
      status: TicketMapper.mapStatus(statusRaw),
      urgency: urgencyRaw > 0 ? TicketMapper.mapUrgency(urgencyRaw) : "medium",
      subject: String(row[String(GLPI_TICKET_SEARCH_FIELDS.TITLE)] ?? ""),
      description: null,
      categoryId: TicketsGlpiRepository.parseSearchOptionalId(
        row[String(GLPI_TICKET_SEARCH_FIELDS.CATEGORY)],
      ),
      locationId: TicketsGlpiRepository.parseSearchOptionalId(
        row[String(GLPI_TICKET_SEARCH_FIELDS.LOCATION)],
      ),
      requesterId: TicketsGlpiRepository.parseSearchOptionalId(
        row[String(GLPI_TICKET_SEARCH_FIELDS.REQUESTER)],
      ),
      technicianId: fallbackTechnicianId ?? technicianFromRow,
      createdAt:
        typeof createdRaw === "string" && createdRaw.length > 0 ? createdRaw : null,
      updatedAt:
        typeof updatedRaw === "string" && updatedRaw.length > 0 ? updatedRaw : null,
      dueDate: null,
      solvedAt: null,
      closedAt: null,
      isDeleted: false,
    };
  }

  /**

   * Parsea ID opcional desde celda de búsqueda GLPI.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param value - Parámetro `value`.
   * @returns `number | null`
   */
  private static parseSearchOptionalId(value: unknown): number | null  {
    if (value === null || value === undefined || value === "") return null;
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  /**

   * Obtiene ticket por ID con actores Ticket_User.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param id - Parámetro `id`.
   * @returns `Promise<DomainTicket | null>`
   */
  async findById(sessionKey: string, id: number): Promise<DomainTicket | null>  {
    try {
      const response = await this.glpi.request<GlpiTicketRaw>({
        method: "GET",
        path: `${GLPI_ENDPOINTS.TICKET}/${id}`,
        sessionKey,
      });
      const ticket = TicketMapper.toDomain(response.data);
      if (!isActiveTicket(ticket)) return null;
      const links = await this.fetchTicketUsers(sessionKey, id);
      return {
        ...ticket,
        requesterId: links.requesterId ?? ticket.requesterId,
        technicianId: links.technicianId ?? ticket.technicianId,
      };
    } catch {
      return null;
    }
  }

  /**

   * Lee solicitante y técnico desde Ticket_User.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @returns `Promise<`
   */
  async fetchTicketUsers(
    sessionKey: string,
    ticketId: number,
  ): Promise< { requesterId: number | null; technicianId: number | null }> {
    try {
      const response = await this.glpi.request<
        Array<{ tickets_id?: number; users_id?: number; type?: number | string }>
      >({
        method: "GET",
        path: `${GLPI_ENDPOINTS.TICKET}/${ticketId}/${GLPI_ENDPOINTS.TICKET_USER}`,
        sessionKey,
        query: { range: "0-49" },
      });
      return TicketsGlpiRepository.parseTicketUserLinks(
        Array.isArray(response.data) ? response.data : [],
        ticketId,
      );
    } catch {
      return { requesterId: null, technicianId: null };
    }
  }

  /**

   * Crea ticket vía POST y finaliza indexación de actores y sede.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param input - Parámetro `input`.
   * @returns `Promise<DomainTicket>`
   */
  async create(sessionKey: string, input: CreateTicketInput): Promise<DomainTicket>  {
    const glpiInput: Record<string, unknown> = {
      name: input.name,
      content: input.content,
      type: input.type,
      status: input.status,
      urgency: input.urgency,
      itilcategories_id: input.itilcategories_id,
      entities_id: input.entities_id,
    };
    if (input.requesters_id !== undefined) {
      glpiInput._users_id_requester = input.requesters_id;
    }
    if (input.locations_id !== undefined) {
      glpiInput.locations_id = input.locations_id;
    }
    if (input.technicians_id !== undefined) {
      glpiInput._users_id_assign = input.technicians_id;
    }

    const response = await this.glpi.request<{ id: number } | Array<{ id: number }>>({
      method: "POST",
      path: GLPI_ENDPOINTS.TICKET,
      sessionKey,
      body: { input: glpiInput },
    });

    const ticketId = TicketsGlpiRepository.extractCreatedTicketId(
      response.data,
      response.headers.location,
    );
    if (!ticketId) {
      throw new Error("Ticket created but response did not include a valid ID");
    }

    await this.finalizeTicketAfterApiCreate(sessionKey, ticketId, input);
    const persisted = await this.findById(sessionKey, ticketId);
    return persisted ?? TicketsGlpiRepository.buildTicketFromCreateInput(ticketId, input);
  }

  /**
   * Tras POST /Ticket, refuerza vínculos Ticket_User y sede para indexación GLPI.
   * @param sessionKey - Clave de sesión GLPI.
   * @param ticketId - ID del ticket creado.
   * @param input - Input original de creación.
   * @returns void
   * @throws {GlpiException} Si GLPI rechaza algún PUT/POST de refuerzo.
   */
  private async finalizeTicketAfterApiCreate(
    sessionKey: string,
    ticketId: number,
    input: CreateTicketInput,
  ): Promise<void> {
    if (input.requesters_id !== undefined) {
      await this.ensureRequesterLink(sessionKey, ticketId, input.requesters_id);
    }
    if (input.technicians_id !== undefined) {
      await this.ensureTechnicianLink(sessionKey, ticketId, input.technicians_id);
    }

    await this.maybeStripServiceAccountActor(
      sessionKey,
      ticketId,
      input.technicians_id,
      input.status,
    );

    if (input.locations_id !== undefined) {
      await this.applyTicketLocation(sessionKey, ticketId, input.locations_id);
    }

    await this.touchTicketForHistorialIndex(
      sessionKey,
      ticketId,
      input.status,
      input.locations_id,
    );
    await this.ensureTicketIndexedForActors(sessionKey, ticketId, input);
  }

  /**

   * Obtiene descripción HTML cruda del ticket.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @returns `Promise<string | null>`
   */
  async getRawContent(sessionKey: string, ticketId: number): Promise<string | null>  {
    const response = await this.glpi.request<GlpiTicketRaw>({
      method: "GET",
      path: `${GLPI_ENDPOINTS.TICKET}/${ticketId}`,
      sessionKey,
    });
    const content = response.data.content;
    if (content === null || content === undefined) return null;
    return String(content);
  }

  /**

   * Actualiza estado y opcionalmente contenido vía PUT.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @param statusGlpi - Parámetro `statusGlpi`.
   * @param content - Parámetro `content`.
   * @returns `Promise<void>`
   */
  async updateStatus(
    sessionKey: string,
    ticketId: number,
    statusGlpi: number,
    content?: string,
  ): Promise<void>  {
    const input: Record<string, unknown> = { id: ticketId, status: statusGlpi };
    if (content !== undefined) {
      input.content = content;
    }
    await this.glpi.request<unknown>({
      method: "PUT",
      path: `${GLPI_ENDPOINTS.TICKET}/${ticketId}`,
      sessionKey,
      body: { input },
    });
  }

  /**

   * IDs de tickets asignados al técnico.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param technicianId - Parámetro `technicianId`.
   * @returns `Promise<number[]>`
   */
  async listAssignedTicketIds(sessionKey: string, technicianId: number): Promise<number[]>  {
    return this.listTicketIdsForUser(
      sessionKey,
      technicianId,
      GLPI_TICKET_USER_TYPE.ASSIGNED,
    );
  }

  /**

   * Tickets asignados al técnico para agregados de indicadores.
   * Usa search GLPI (una fila por ticket) en lugar de GET /Ticket/:id por ID.
   

   * Tickets asignados para agregados de indicadores TI.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param technicianId - Parámetro `technicianId`.
   * @returns `Promise<DomainTicket[]>`
   */
  async listAssignedTicketsForMetrics(
    sessionKey: string,
    technicianId: number,
  ): Promise<DomainTicket[]>  {
    const all: DomainTicket[] = [];
    let rangeStart = 0;

    while (rangeStart < METRICS_ASSIGNED_MAX) {
      const rangeEnd = Math.min(
        rangeStart + METRICS_SEARCH_PAGE_SIZE - 1,
        METRICS_ASSIGNED_MAX - 1,
      );
      const { items, total } = await this.searchTicketsForMetricsPage(
        sessionKey,
        { technicianId },
        rangeStart,
        rangeEnd,
        technicianId,
      );
      all.push(...items);
      rangeStart += METRICS_SEARCH_PAGE_SIZE;
      if (items.length === 0 || all.length >= total || rangeStart >= total) {
        break;
      }
    }

    return all;
  }

  /**

   * Tickets del solicitante para indicadores.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param requesterId - Parámetro `requesterId`.
   * @returns `Promise<DomainTicket[]>`
   */
  async listRequesterTicketsForMetrics(
    sessionKey: string,
    requesterId: number,
  ): Promise<DomainTicket[]>  {
    const all: DomainTicket[] = [];
    let rangeStart = 0;

    while (rangeStart < METRICS_ASSIGNED_MAX) {
      const rangeEnd = Math.min(
        rangeStart + METRICS_SEARCH_PAGE_SIZE - 1,
        METRICS_ASSIGNED_MAX - 1,
      );
      const { items, total } = await this.searchTicketsForMetricsPage(
        sessionKey,
        { requesterId },
        rangeStart,
        rangeEnd,
      );
      all.push(...items);
      rangeStart += METRICS_SEARCH_PAGE_SIZE;
      if (items.length === 0 || all.length >= total || rangeStart >= total) {
        break;
      }
    }

    return all;
  }

  /**

   * Tickets abiertos de una sede exacta (card Mi Sede).
   * Consulta aislada: no comparte path con listAssignedTicketsForMetrics.
   

   * Tickets abiertos de sede exacta (card Mi Sede).
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param locationId - Parámetro `locationId`.
   * @param openStatusGlpi - Parámetro `openStatusGlpi`.
   * @param limit - Parámetro `limit`.
   * @returns `Promise<DomainTicket[]>`
   */
  async listOpenTicketsForLocationMetrics(
    sessionKey: string,
    locationId: number,
    openStatusGlpi: number[],
    limit: number,
  ): Promise<DomainTicket[]>  {
    const normalizedLocationId = normalizeLocationId(locationId);
    if (normalizedLocationId == null) return [];

    const cappedLimit = Math.max(1, Math.min(limit, LOCATION_SEARCH_MAX));
    const pool = await this.paginateScopedMetricsTickets(
      sessionKey,
      {
        locationId: normalizedLocationId,
        locationExact: true,
      },
      cappedLimit,
    );
    return pool.filter((ticket) =>
      openStatusGlpi.includes(TicketMapper.mapStatusToGlpi(ticket.status)),
    );
  }

  /**

   * Tickets abiertos globales (Indicadores: total por sede, sin filtro por técnico).
   * Consulta aislada: no altera el pool de Mis Tickets / Incidentes / Solicitudes.
   

   * Tickets abiertos globales por sede (Indicadores).
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param openStatusGlpi - Parámetro `openStatusGlpi`.
   * @param limit - Parámetro `limit`.
   * @returns `Promise<DomainTicket[]>`
   */
  async listAllOpenTicketsForLocationMetrics(
    sessionKey: string,
    openStatusGlpi: number[],
    limit: number,
  ): Promise<DomainTicket[]>  {
    const pool = await this.paginateScopedMetricsTickets(
      sessionKey,
      { status: openStatusGlpi },
      limit,
    );
    return pool.filter((ticket) =>
      openStatusGlpi.includes(TicketMapper.mapStatusToGlpi(ticket.status)),
    );
  }

  /**

   * Obtiene tickets por lista de IDs.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketIds - Parámetro `ticketIds`.
   * @returns `Promise<DomainTicket[]>`
   */
  async fetchTicketsByIds(sessionKey: string, ticketIds: number[]): Promise<DomainTicket[]>  {
    return this.fetchTicketsByIdsInternal(sessionKey, ticketIds);
  }

  /**

   * Asigna técnico y opcionalmente limpia cuenta de servicio.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @param technicianId - Parámetro `technicianId`.
   * @returns `Promise<void>`
   */
  async assignTechnician(
    sessionKey: string,
    ticketId: number,
    technicianId: number,
  ): Promise<void>  {
    await this.ensureTechnicianLink(sessionKey, ticketId, technicianId);
    await this.maybeStripServiceAccountActor(sessionKey, ticketId, technicianId);
  }

  /**

   * Actualiza sede del ticket vía PUT.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @param locationId - Parámetro `locationId`.
   * @returns `Promise<void>`
   */
  async updateLocation(
    sessionKey: string,
    ticketId: number,
    locationId: number,
  ): Promise<void>  {
    await this.applyTicketLocation(sessionKey, ticketId, locationId);
  }

  /**

   * Actualiza el solicitante del ticket vía PUT o POST en Ticket_User.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @param requesterId - Parámetro `requesterId`.
   * @returns `Promise<void>`
   */
  async updateRequester(
    sessionKey: string,
    ticketId: number,
    requesterId: number,
  ): Promise<void>  {
    const links = await this.listTicketUserLinkEntries(sessionKey, ticketId);
    const requesterLinks = links
      .filter((link) => link.type === GLPI_TICKET_USER_TYPE.REQUESTER)
      .sort((left, right) => left.id - right.id);
    const primary = requesterLinks[0];

    if (primary) {
      if (primary.users_id === requesterId) return;
      await this.glpi.request<unknown>({
        method: "PUT",
        path: `${GLPI_ENDPOINTS.TICKET_USER}/${primary.id}`,
        sessionKey,
        body: {
          input: {
            id: primary.id,
            users_id: requesterId,
          },
        },
      });
      return;
    }

    await this.postTicketUserRequester(sessionKey, ticketId, requesterId);
  }

  /**

   * Garantiza vínculo Ticket_User de solicitante.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @param requesterId - Parámetro `requesterId`.
   * @returns `Promise<void>`
   */
  private async ensureRequesterLink(
    sessionKey: string,
    ticketId: number,
    requesterId: number,
  ): Promise<void>  {
    const links = await this.fetchTicketUsers(sessionKey, ticketId);
    if (links.requesterId === requesterId) return;
    await this.postTicketUserRequester(sessionKey, ticketId, requesterId);
  }

  /**

   * POST Ticket_User tipo solicitante.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @param requesterId - Parámetro `requesterId`.
   * @returns `Promise<void>`
   */
  private async postTicketUserRequester(
    sessionKey: string,
    ticketId: number,
    requesterId: number,
  ): Promise<void>  {
    await this.glpi.request<unknown>({
      method: "POST",
      path: GLPI_ENDPOINTS.TICKET_USER,
      sessionKey,
      body: {
        input: {
          tickets_id: ticketId,
          users_id: requesterId,
          type: GLPI_TICKET_USER_TYPE.REQUESTER,
        },
      },
    });
  }

  /**

   * PUT explícito de locations_id para indexación GLPI.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @param locationId - Parámetro `locationId`.
   * @returns `Promise<void>`
   */
  private async applyTicketLocation(
    sessionKey: string,
    ticketId: number,
    locationId: number,
  ): Promise<void>  {
    await this.glpi.request<unknown>({
      method: "PUT",
      path: `${GLPI_ENDPOINTS.TICKET}/${ticketId}`,
      sessionKey,
      body: {
        input: { id: ticketId, locations_id: locationId },
      },
    });
  }

  /**

   * Garantiza vínculo Ticket_User de técnico.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @param technicianId - Parámetro `technicianId`.
   * @returns `Promise<void>`
   */
  private async ensureTechnicianLink(
    sessionKey: string,
    ticketId: number,
    technicianId: number,
  ): Promise<void>  {
    const links = await this.fetchTicketUsers(sessionKey, ticketId);
    if (links.technicianId === technicianId) return;
    await this.postTicketUserAssignment(sessionKey, ticketId, technicianId);
  }

  /**

   * POST Ticket_User tipo asignado.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @param technicianId - Parámetro `technicianId`.
   * @returns `Promise<void>`
   */
  private async postTicketUserAssignment(
    sessionKey: string,
    ticketId: number,
    technicianId: number,
  ): Promise<void>  {
    await this.glpi.request<unknown>({
      method: "POST",
      path: GLPI_ENDPOINTS.TICKET_USER,
      sessionKey,
      body: {
        input: {
          tickets_id: ticketId,
          users_id: technicianId,
          type: GLPI_TICKET_USER_TYPE.ASSIGNED,
        },
      },
    });
  }

  /**

   * Elimina auto-asignación de cuenta API si está habilitado.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @param expectedTechnicianId - Parámetro `expectedTechnicianId`.
   * @param intendedStatusGlpi - Parámetro `intendedStatusGlpi`.
   * @returns `Promise<void>`
   */
  private async maybeStripServiceAccountActor(
    sessionKey: string,
    ticketId: number,
    expectedTechnicianId?: number,
    intendedStatusGlpi?: number,
  ): Promise<void>  {
    if (!this.config.get("glpi.stripServiceAssignment", { infer: true })) return;
    const serviceUserId = await this.getSessionUserId(sessionKey);
    if (serviceUserId && expectedTechnicianId === serviceUserId) return;
    await this.stripServiceAccountActor(
      sessionKey,
      ticketId,
      expectedTechnicianId,
      intendedStatusGlpi,
    );
  }

  /**

   * Tras POST /Ticket, GET /User/:id/Ticket_User puede ir detrás del vínculo creado.
   * Reintenta y, si hace falta, PUT benigno de status (mismo efecto que guardar en la UI GLPI).
   

   * Reintenta indexación de actores tras creación.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @param input - Parámetro `input`.
   * @returns `Promise<void>`
   */
  private async ensureTicketIndexedForActors(
    sessionKey: string,
    ticketId: number,
    input: CreateTicketInput,
  ): Promise<void>  {
    const actors: Array<{ userId: number; type: number }> = [];
    if (input.requesters_id !== undefined) {
      actors.push({ userId: input.requesters_id, type: GLPI_TICKET_USER_TYPE.REQUESTER });
    }
    if (input.technicians_id !== undefined) {
      actors.push({ userId: input.technicians_id, type: GLPI_TICKET_USER_TYPE.ASSIGNED });
    }

    for (const actor of actors) {
      await this.ensureTicketVisibleForUser(
        sessionKey,
        ticketId,
        actor.userId,
        actor.type,
        input.status,
        input.locations_id,
      );
    }
  }

  /**

   * Comprueba visibilidad del ticket en search por actor.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @param userId - Parámetro `userId`.
   * @param actorType - Parámetro `actorType`.
   * @returns `Promise<boolean>`
   */
  private async isTicketVisibleInActorSearch(
    sessionKey: string,
    ticketId: number,
    userId: number,
    actorType: number,
  ): Promise<boolean>  {
    const actorField = TicketsGlpiRepository.resolveTicketActorSearchField(actorType);
    if (actorField === null) return false;

    try {
      const fromSearch = await this.searchTicketIdsByActor(sessionKey, actorField, userId);
      return fromSearch.includes(ticketId);
    } catch {
      return false;
    }
  }

  /**

   * Reintenta hasta que el ticket sea visible para el actor.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @param userId - Parámetro `userId`.
   * @param actorType - Parámetro `actorType`.
   * @param statusGlpi - Parámetro `statusGlpi`.
   * @param locationId - Parámetro `locationId`.
   * @returns `Promise<void>`
   */
  private async ensureTicketVisibleForUser(
    sessionKey: string,
    ticketId: number,
    userId: number,
    actorType: number,
    statusGlpi: number,
    locationId?: number,
  ): Promise<void>  {
    for (let attempt = 0; attempt < POST_CREATE_INDEX_ATTEMPTS; attempt += 1) {
      const links = await this.fetchTicketUsers(sessionKey, ticketId);
      const linkOk =
        actorType === GLPI_TICKET_USER_TYPE.REQUESTER
          ? links.requesterId === userId
          : links.technicianId === userId;

      if (!linkOk) {
        if (actorType === GLPI_TICKET_USER_TYPE.REQUESTER) {
          await this.ensureRequesterLink(sessionKey, ticketId, userId);
        } else {
          await this.ensureTechnicianLink(sessionKey, ticketId, userId);
        }
      }

      const visibleIds = await this.listTicketIdsForUser(sessionKey, userId, actorType);
      const visibleInSearch = await this.isTicketVisibleInActorSearch(
        sessionKey,
        ticketId,
        userId,
        actorType,
      );
      if (visibleIds.includes(ticketId) || visibleInSearch) {
        return;
      }

      if (attempt < POST_CREATE_INDEX_ATTEMPTS - 1) {
        await TicketsGlpiRepository.delay(POST_CREATE_INDEX_DELAY_MS);
      }
    }

    await this.touchTicketForHistorialIndex(sessionKey, ticketId, statusGlpi, locationId);
  }

  /**

   * PUT benigno de status/sede para alinear índices GLPI.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @param statusGlpi - Parámetro `statusGlpi`.
   * @param locationId - Parámetro `locationId`.
   * @returns `Promise<void>`
   */
  private async touchTicketForHistorialIndex(
    sessionKey: string,
    ticketId: number,
    statusGlpi: number,
    locationId?: number,
  ): Promise<void>  {
    const input: Record<string, unknown> = { id: ticketId, status: statusGlpi };
    if (locationId !== undefined) {
      input.locations_id = locationId;
    }

    await this.glpi.request<unknown>({
      method: "PUT",
      path: `${GLPI_ENDPOINTS.TICKET}/${ticketId}`,
      sessionKey,
      body: { input },
    });
  }

  /**

   * Espera asíncrona entre reintentos de indexación.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param ms - Parámetro `ms`.
   * @returns `Promise<void>`
   */
  private static delay(ms: number): Promise<void>  {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**

   * Parche legacy cuando la cuenta API tiene perfil técnico y GLPI la auto-asigna.
   * Desactivado por defecto: usar cuenta asistIA sin perfil técnico ni grupo TI.
   

   * Parche legacy: quita actor de cuenta de servicio auto-asignada.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @param expectedTechnicianId - Parámetro `expectedTechnicianId`.
   * @param intendedStatusGlpi - Parámetro `intendedStatusGlpi`.
   * @returns `Promise<void>`
   */
  private async stripServiceAccountActor(
    sessionKey: string,
    ticketId: number,
    expectedTechnicianId?: number,
    intendedStatusGlpi?: number,
  ): Promise<void>  {
    const serviceUserId = await this.getSessionUserId(sessionKey);
    if (!serviceUserId) return;

    const links = await this.listTicketUserLinkEntries(sessionKey, ticketId);
    const serviceActorTypes = new Set<number>([
      GLPI_TICKET_USER_TYPE.ASSIGNED,
      GLPI_TICKET_USER_TYPE.OBSERVER,
    ]);

    for (const link of links) {
      if (link.users_id !== serviceUserId || !serviceActorTypes.has(link.type)) continue;
      await this.glpi.request<unknown>({
        method: "DELETE",
        path: `${GLPI_ENDPOINTS.TICKET_USER}/${link.id}`,
        sessionKey,
      });
    }

    if (expectedTechnicianId === undefined && intendedStatusGlpi !== undefined) {
      const remainingAssigned = links.filter(
        (link) =>
          link.type === GLPI_TICKET_USER_TYPE.ASSIGNED && link.users_id !== serviceUserId,
      );
      if (remainingAssigned.length === 0) {
        await this.updateStatus(sessionKey, ticketId, intendedStatusGlpi);
      }
    }
  }

  /**

   * Resuelve ID de usuario de la sesión API actual.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @returns `Promise<number | null>`
   */
  private async getSessionUserId(sessionKey: string): Promise<number | null>  {
    const configured = this.config.get("glpi.serviceUserId", { infer: true });
    if (configured) return configured;

    try {
      const response = await this.glpi.request<{ session?: { glpiID?: number } }>({
        method: "GET",
        path: GLPI_ENDPOINTS.GET_FULL_SESSION,
        sessionKey,
      });
      const id = Number(response.data?.session?.glpiID ?? 0);
      return Number.isFinite(id) && id > 0 ? id : null;
    } catch {
      return null;
    }
  }

  /**

   * Lista entradas crudas de Ticket_User de un ticket.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketId - Parámetro `ticketId`.
   * @returns `Promise<Array<`
   */
  private async listTicketUserLinkEntries(
    sessionKey: string,
    ticketId: number,
  ): Promise<Array< { id: number; users_id: number; type: number }>> {
    try {
      const response = await this.glpi.request<
        Array<{ id?: number; users_id?: number; type?: number | string; tickets_id?: number }>
      >({
        method: "GET",
        path: `${GLPI_ENDPOINTS.TICKET}/${ticketId}/${GLPI_ENDPOINTS.TICKET_USER}`,
        sessionKey,
        query: { range: "0-49" },
      });
      const entries = Array.isArray(response.data) ? response.data : [];
      return entries
        .map((entry) => ({
          id: Number(entry.id ?? 0),
          users_id: Number(entry.users_id ?? 0),
          type: Number(entry.type ?? 0),
        }))
        .filter((entry) => entry.id > 0 && entry.users_id > 0);
    } catch {
      return [];
    }
  }

  /**

   * IDs de tickets bajo una sede vía search GLPI.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param locationId - Parámetro `locationId`.
   * @returns `Promise<number[]>`
   */
  private async searchTicketIdsByLocation(
    sessionKey: string,
    locationId: number,
    maxResults = LOCATION_SEARCH_MAX,
  ): Promise<number[]>  {
    const cappedMax = Math.max(1, Math.min(maxResults, LOCATION_SEARCH_MAX));
    const response = await this.glpi.request<unknown>({
      method: "GET",
      path: `${GLPI_ENDPOINTS.SEARCH}/${GLPI_ENDPOINTS.TICKET}`,
      sessionKey,
      query: {
        is_deleted: 0,
        range: `0-${cappedMax - 1}`,
        "criteria[0][field]": GLPI_TICKET_SEARCH_FIELDS.LOCATION,
        "criteria[0][searchtype]": "under",
        "criteria[0][value]": locationId,
      },
    });

    const rows = parseGlpiSearchRows(response.data);

    return [
      ...new Set(
        rows
          .map((row) => extractSearchRowId(row, GLPI_TICKET_SEARCH_FIELDS.ID))
          .filter((id): id is number => id !== null),
      ),
    ];
  }

  /**

   * IDs de tickets vinculados a usuario por tipo de actor.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param userId - Parámetro `userId`.
   * @param type - Parámetro `type`.
   * @returns `Promise<number[]>`
   */
  private async listTicketIdsForUser(
    sessionKey: string,
    userId: number,
    type: number,
  ): Promise<number[]>  {
    let fromUserLinks: number[] = [];
    try {
      fromUserLinks = await this.listTicketIdsFromUserTicketUserLinks(sessionKey, userId, type);
    } catch {
      // Continuar con búsqueda GLPI por actor.
    }

    const actorField = TicketsGlpiRepository.resolveTicketActorSearchField(type);
    let fromSearch: number[] = [];
    if (actorField !== null) {
      try {
        fromSearch = await this.searchTicketIdsByActor(sessionKey, actorField, userId);
      } catch {
        // Usar solo vínculos Ticket_User si la búsqueda falla.
      }
    }

    return [...new Set([...fromUserLinks, ...fromSearch])];
  }

  /**

   * IDs desde GET /User/:id/Ticket_User.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param userId - Parámetro `userId`.
   * @param actorType - Parámetro `actorType`.
   * @returns `Promise<number[]>`
   */
  private async listTicketIdsFromUserTicketUserLinks(
    sessionKey: string,
    userId: number,
    actorType: number,
  ): Promise<number[]>  {
    const response = await this.glpi.request<
      Array<{ tickets_id?: number; type?: number | string }>
    >({
      method: "GET",
      path: `${GLPI_ENDPOINTS.USER}/${userId}/${GLPI_ENDPOINTS.TICKET_USER}`,
      sessionKey,
      query: { range: "0-9999" },
    });

    const list = Array.isArray(response.data) ? response.data : [];
    return [
      ...new Set(
        list
          .filter((entry) => Number(entry.type) === actorType)
          .map((entry) => Number(entry.tickets_id ?? 0))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    ];
  }

  /**

   * IDs desde search GLPI por campo de actor.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param field - Parámetro `field`.
   * @param userId - Parámetro `userId`.
   * @returns `Promise<number[]>`
   */
  private async searchTicketIdsByActor(
    sessionKey: string,
    field: number,
    userId: number,
  ): Promise<number[]>  {
    const response = await this.glpi.request<unknown>({
      method: "GET",
      path: `${GLPI_ENDPOINTS.SEARCH}/${GLPI_ENDPOINTS.TICKET}`,
      sessionKey,
      query: {
        is_deleted: 0,
        range: "0-9999",
        "criteria[0][field]": field,
        "criteria[0][searchtype]": "equals",
        "criteria[0][value]": userId,
      },
    });

    const rows = parseGlpiSearchRows(response.data);
    return [
      ...new Set(
        rows
          .map((row) => extractSearchRowId(row, GLPI_TICKET_SEARCH_FIELDS.ID))
          .filter((id): id is number => id !== null),
      ),
    ];
  }

  /**

   * Mapea tipo Ticket_User al campo de búsqueda GLPI.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param type - Parámetro `type`.
   * @returns `number | null`
   */
  private static resolveTicketActorSearchField(type: number): number | null  {
    if (type === GLPI_TICKET_USER_TYPE.REQUESTER) {
      return GLPI_TICKET_SEARCH_FIELDS.REQUESTER;
    }
    if (type === GLPI_TICKET_USER_TYPE.ASSIGNED) {
      return GLPI_TICKET_SEARCH_FIELDS.TECHNICIAN;
    }
    return null;
  }

  /**

   * Carga tickets por ID con concurrencia limitada.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketIds - Parámetro `ticketIds`.
   * @returns `Promise<DomainTicket[]>`
   */
  private async fetchTicketsByIdsInternal(
    sessionKey: string,
    ticketIds: number[],
  ): Promise<DomainTicket[]>  {
    if (ticketIds.length === 0) return [];

    const rawTickets = await TicketsGlpiRepository.runWithConcurrency(
      ticketIds,
      GLPI_REQUEST_CONCURRENCY,
      async (ticketId) => {
        try {
          const response = await this.glpi.request<GlpiTicketRaw>({
            method: "GET",
            path: `${GLPI_ENDPOINTS.TICKET}/${ticketId}`,
            sessionKey,
          });
          return TicketMapper.toDomain(response.data);
        } catch {
          return null;
        }
      },
    );

    return rawTickets.filter(
      (ticket): ticket is DomainTicket => ticket !== null && isActiveTicket(ticket),
    );
  }

  /**

   * Enriquece tickets con solicitante y técnico en lote.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param tickets - Parámetro `tickets`.
   * @returns `Promise<DomainTicket[]>`
   */
  private async attachTicketActors(
    sessionKey: string,
    tickets: DomainTicket[],
  ): Promise<DomainTicket[]>  {
    if (tickets.length === 0) return [];

    const links = await this.fetchTicketUsersBatch(
      sessionKey,
      tickets.map((ticket) => ticket.id),
    );

    return tickets.map((ticket) => {
      const link = links.get(ticket.id);
      return {
        ...ticket,
        requesterId: link?.requesterId ?? ticket.requesterId,
        technicianId: link?.technicianId ?? ticket.technicianId,
      };
    });
  }

  /**

   * Obtiene actores de múltiples tickets en paralelo.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param sessionKey - Parámetro `sessionKey`.
   * @param ticketIds - Parámetro `ticketIds`.
   * @returns `Promise<Map<number,`
   */
  private async fetchTicketUsersBatch(
    sessionKey: string,
    ticketIds: number[],
  ): Promise<Map<number,  { requesterId: number | null; technicianId: number | null }>> {
    const result = new Map<number, { requesterId: number | null; technicianId: number | null }>();

    if (ticketIds.length === 0) return result;

    const links = await TicketsGlpiRepository.runWithConcurrency(
      ticketIds,
      GLPI_REQUEST_CONCURRENCY,
      async (ticketId) => ({
        ticketId,
        actors: await this.fetchTicketUsers(sessionKey, ticketId),
      }),
    );

    for (const entry of links) {
      result.set(entry.ticketId, entry.actors);
    }

    return result;
  }

  /**
   * Ejecuta worker con pool de concurrencia fija.
   * @param items - Elementos a procesar.
   * @param limit - Máximo de tareas concurrentes.
   * @param worker - Función async por elemento.
   * @returns Resultados en el mismo orden que items.
   * @throws Propaga errores del worker.
   */
  private static async runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>,
  ): Promise<R[]> {
    if (items.length === 0) return [];

    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const poolSize = Math.max(1, Math.min(limit, items.length));

    const runners = Array.from({ length: poolSize }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index]);
      }
    });

    await Promise.all(runners);
    return results;
  }

  /**
   * Parsea enlaces Ticket_User a IDs de actores.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   */
  private static parseTicketUserLinks(
    entries: Array<{ tickets_id?: number; users_id?: number; type?: number | string }>,
    ticketId: number,
  ): { requesterId: number | null; technicianId: number | null } {
    let requesterId: number | null = null;
    let technicianId: number | null = null;

    for (const entry of entries) {
      const entryTicketId = Number(entry.tickets_id ?? ticketId);
      if (entryTicketId !== ticketId) continue;

      const userId = Number(entry.users_id ?? 0);
      if (!Number.isFinite(userId) || userId <= 0) continue;

      const actorType = Number(entry.type);
      if (actorType === GLPI_TICKET_USER_TYPE.REQUESTER && !requesterId) {
        requesterId = userId;
      }
      if (actorType === GLPI_TICKET_USER_TYPE.ASSIGNED && !technicianId) {
        technicianId = userId;
      }
    }

    return { requesterId, technicianId };
  }

  /**

   * Aplica filtros locales sobre tickets ya cargados.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param items - Parámetro `items`.
   * @param filter - Parámetro `filter`.
   * @returns `DomainTicket[]`
   */
  private static applyListFilters(
    items: DomainTicket[],
    filter: ListTicketsFilter,
  ): DomainTicket[]  {
    let filtered = items;

    if (filter.status && filter.status.length > 0) {
      filtered = filtered.filter((ticket) =>
        filter.status!.some((status) => TicketMapper.mapStatusToGlpi(ticket.status) === status),
      );
    }
    if (filter.type !== undefined) {
      filtered = filtered.filter(
        (ticket) => TicketMapper.mapTypeToGlpi(ticket.type) === filter.type,
      );
    }
    if (filter.locationId !== undefined) {
      const filterLocationId = normalizeLocationId(filter.locationId);
      if (filterLocationId != null) {
        filtered = filtered.filter(
          (ticket) => normalizeLocationId(ticket.locationId) === filterLocationId,
        );
      }
    }
    if (filter.createdFrom) {
      const from = Date.parse(filter.createdFrom);
      if (Number.isFinite(from)) {
        filtered = filtered.filter((ticket) => {
          const created = Date.parse(ticket.createdAt ?? "");
          return Number.isFinite(created) && created >= from;
        });
      }
    }
    if (filter.createdTo) {
      const to = Date.parse(filter.createdTo);
      if (Number.isFinite(to)) {
        filtered = filtered.filter((ticket) => {
          const created = Date.parse(ticket.createdAt ?? "");
          return Number.isFinite(created) && created <= to;
        });
      }
    }
    if (filter.search) {
      const needle = filter.search.toLowerCase();
      filtered = filtered.filter(
        (ticket) =>
          ticket.subject.toLowerCase().includes(needle) ||
          ticket.description?.toLowerCase().includes(needle),
      );
    }

    return TicketsGlpiRepository.withoutTrashed(filtered);
  }

  /**

   * Excluye tickets marcados como eliminados.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param items - Parámetro `items`.
   * @returns `DomainTicket[]`
   */
  private static withoutTrashed(items: DomainTicket[]): DomainTicket[]  {
    return items.filter(isActiveTicket);
  }

  /**

   * Parsea total desde encabezado Content-Range.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param contentRange - Parámetro `contentRange`.
   * @returns `number | null`
   */
  private static parseTotal(contentRange?: string): number | null  {
    if (!contentRange) return null;
    const match = contentRange.match(/\/(\d+)$/);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  /**

   * Extrae ID de ticket creado desde body o Location.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param data - Parámetro `data`.
   * @param locationHeader - Parámetro `locationHeader`.
   * @returns `number | null`
   */
  private static extractCreatedTicketId(
    data: unknown,
    locationHeader?: string,
  ): number | null  {
    const fromBody = TicketsGlpiRepository.extractIdFromCreateBody(data);
    if (fromBody) return fromBody;
    return TicketsGlpiRepository.extractTicketIdFromLocation(locationHeader);
  }

  /**

   * Busca ID en cuerpo de respuesta de creación.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param data - Parámetro `data`.
   * @returns `number | null`
   */
  private static extractIdFromCreateBody(data: unknown): number | null  {
    if (!data) return null;

    if (Array.isArray(data)) {
      for (const entry of data) {
        const id = TicketsGlpiRepository.readCreateId(entry);
        if (id) return id;
      }
      return null;
    }

    if (typeof data === "object") {
      return TicketsGlpiRepository.readCreateId(data as Record<string, unknown>);
    }

    return null;
  }

  /**

   * Lee ID numérico de un objeto de respuesta POST.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param entry - Parámetro `entry`.
   * @returns `number | null`
   */
  private static readCreateId(entry: unknown): number | null  {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    const rawId = record.id ?? record.ID;
    if (rawId === false || rawId === null || rawId === undefined) return null;
    const id = Number(rawId);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  /**

   * Extrae ID desde cabecera Location de POST.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param locationHeader - Parámetro `locationHeader`.
   * @returns `number | null`
   */
  private static extractTicketIdFromLocation(locationHeader?: string): number | null  {
    if (!locationHeader) return null;
    const match = locationHeader.match(/\/Ticket\/(\d+)\/?(?:\?.*)?$/i);
    if (!match) return null;
    const id = Number(match[1]);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  /**

   * Construye DomainTicket sintético tras creación.
   * @returns Resultado de la operación.
   * @throws {GlpiException} Si GLPI rechaza la petición; {Error} en creación sin ID.
   * @param ticketId - Parámetro `ticketId`.
   * @param input - Parámetro `input`.
   * @returns `DomainTicket`
   */
  private static buildTicketFromCreateInput(
    ticketId: number,
    input: CreateTicketInput,
  ): DomainTicket  {
    const description = input.content?.trim();
    return {
      id: ticketId,
      type: TicketMapper.mapType(input.type),
      status: TicketMapper.mapStatus(input.status),
      urgency: TicketMapper.mapUrgency(input.urgency),
      subject: input.name,
      description: description ? description : null,
      categoryId: input.itilcategories_id,
      locationId: input.locations_id ?? null,
      requesterId: input.requesters_id ?? null,
      technicianId: input.technicians_id ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dueDate: null,
      solvedAt: null,
      closedAt: null,
      isDeleted: false,
    };
  }

}
