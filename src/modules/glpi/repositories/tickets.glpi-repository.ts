import { Injectable } from "@nestjs/common";
import { GlpiClient } from "../glpi.client";
import {
  GLPI_ENDPOINTS,
  GLPI_TICKET_USER_TYPE,
} from "../glpi.constants";
import { isActiveTicket, TicketMapper, type DomainTicket } from "../mappers/ticket.mapper";
import type { GlpiTicketRaw } from "../glpi.types";

export interface ListTicketsFilter {
  status?: number[];
  type?: number;
  requesterId?: number;
  technicianId?: number;
  locationId?: number;
  createdFrom?: string;
  createdTo?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface ListTicketsResult {
  items: DomainTicket[];
  total: number;
}

export interface ListTicketsOptions {
  /** Solicitante/técnico vía Ticket_User. Desactivar en métricas agregadas. */
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
  requesters_id: number;
  technicians_id?: number;
}

const GLPI_REQUEST_CONCURRENCY = 6;

@Injectable()
export class TicketsGlpiRepository {
  constructor(private readonly glpi: GlpiClient) {}

  async list(
    sessionKey: string,
    filter: ListTicketsFilter,
    options: ListTicketsOptions = {},
  ): Promise<ListTicketsResult> {
    const includeActors = options.includeActors ?? true;
    let ticketIds: number[] | null = null;

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

    items = TicketsGlpiRepository.applyListFilters(items, filter);
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

  async findById(sessionKey: string, id: number): Promise<DomainTicket | null> {
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

  async fetchTicketUsers(
    sessionKey: string,
    ticketId: number,
  ): Promise<{ requesterId: number | null; technicianId: number | null }> {
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

  async create(sessionKey: string, input: CreateTicketInput): Promise<DomainTicket> {
    const response = await this.glpi.request<{ id: number } | Array<{ id: number }>>({
      method: "POST",
      path: GLPI_ENDPOINTS.TICKET,
      sessionKey,
      body: {
        input: {
          name: input.name,
          content: input.content,
          type: input.type,
          status: input.status,
          urgency: input.urgency,
          itilcategories_id: input.itilcategories_id,
          locations_id: input.locations_id,
          entities_id: input.entities_id,
          _users_id_requester: input.requesters_id,
          _users_id_assign: input.technicians_id,
        },
      },
    });

    const created = Array.isArray(response.data) ? response.data[0] : response.data;
    const ticket = await this.findById(sessionKey, Number(created.id));
    if (!ticket) {
      throw new Error("Ticket created but could not be fetched");
    }
    return ticket;
  }

  async updateStatus(sessionKey: string, ticketId: number, statusGlpi: number): Promise<void> {
    await this.glpi.request<unknown>({
      method: "PUT",
      path: `${GLPI_ENDPOINTS.TICKET}/${ticketId}`,
      sessionKey,
      body: {
        input: { id: ticketId, status: statusGlpi },
      },
    });
  }

  async listAssignedTicketIds(sessionKey: string, technicianId: number): Promise<number[]> {
    return this.listTicketIdsForUser(
      sessionKey,
      technicianId,
      GLPI_TICKET_USER_TYPE.ASSIGNED,
    );
  }

  async fetchTicketsByIds(sessionKey: string, ticketIds: number[]): Promise<DomainTicket[]> {
    return this.fetchTicketsByIdsInternal(sessionKey, ticketIds);
  }

  async assignTechnician(
    sessionKey: string,
    ticketId: number,
    technicianId: number,
  ): Promise<void> {
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

  private async listTicketIdsForUser(
    sessionKey: string,
    userId: number,
    type: number,
  ): Promise<number[]> {
    const response = await this.glpi.request<Array<{ tickets_id?: number }>>({
      method: "GET",
      path: GLPI_ENDPOINTS.TICKET_USER,
      sessionKey,
      query: {
        "searchText[users_id]": userId,
        "searchText[type]": type,
        range: "0-9999",
      },
    });

    const list = Array.isArray(response.data) ? response.data : [];
    return [
      ...new Set(
        list
          .map((entry) => Number(entry.tickets_id ?? 0))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    ];
  }

  private async fetchTicketsByIdsInternal(
    sessionKey: string,
    ticketIds: number[],
  ): Promise<DomainTicket[]> {
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

  private async attachTicketActors(
    sessionKey: string,
    tickets: DomainTicket[],
  ): Promise<DomainTicket[]> {
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

  private async fetchTicketUsersBatch(
    sessionKey: string,
    ticketIds: number[],
  ): Promise<Map<number, { requesterId: number | null; technicianId: number | null }>> {
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

  private static applyListFilters(
    items: DomainTicket[],
    filter: ListTicketsFilter,
  ): DomainTicket[] {
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
      filtered = filtered.filter((ticket) => ticket.locationId === filter.locationId);
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

  private static withoutTrashed(items: DomainTicket[]): DomainTicket[] {
    return items.filter(isActiveTicket);
  }

  private static parseTotal(contentRange?: string): number | null {
    if (!contentRange) return null;
    const match = contentRange.match(/\/(\d+)$/);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }
}
