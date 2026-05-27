import { Injectable } from "@nestjs/common";
import { GlpiClient } from "../glpi.client";
import {
  GLPI_ENDPOINTS,
  GLPI_TICKET_USER_TYPE,
} from "../glpi.constants";
import { TicketMapper, type DomainTicket } from "../mappers/ticket.mapper";
import type { GlpiTicketRaw } from "../glpi.types";

export interface ListTicketsFilter {
  status?: number[];
  type?: number;
  requesterId?: number;
  technicianId?: number;
  search?: string;
  page: number;
  limit: number;
}

export interface ListTicketsResult {
  items: DomainTicket[];
  total: number;
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

@Injectable()
export class TicketsGlpiRepository {
  constructor(private readonly glpi: GlpiClient) {}

  async list(sessionKey: string, filter: ListTicketsFilter): Promise<ListTicketsResult> {
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
      items = await this.fetchTicketsByIds(sessionKey, ticketIds);
    } else {
      const start = (filter.page - 1) * filter.limit;
      const end = start + filter.limit - 1;

      const query: Record<string, string | number | boolean | undefined> = {
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

      const links = await this.fetchTicketUsersBatch(
        sessionKey,
        items.map((ticket) => ticket.id),
      );
      items = items.map((ticket) => {
        const link = links.get(ticket.id);
        return {
          ...ticket,
          requesterId: link?.requesterId ?? ticket.requesterId,
          technicianId: link?.technicianId ?? ticket.technicianId,
        };
      });
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

    return {
      items: paginated,
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
    const response = await this.glpi.request<
      Array<{ tickets_id?: number; users_id?: number; type?: number }>
    >({
      method: "GET",
      path: GLPI_ENDPOINTS.TICKET_USER,
      sessionKey,
      query: { searchText: `tickets_id:${ticketId}`, range: "0-49" },
    });
    const list = Array.isArray(response.data) ? response.data : [];

    let requesterId: number | null = null;
    let technicianId: number | null = null;

    for (const entry of list) {
      if (entry.tickets_id !== ticketId) continue;
      if (entry.type === GLPI_TICKET_USER_TYPE.REQUESTER && !requesterId) {
        requesterId = entry.users_id ?? null;
      }
      if (entry.type === GLPI_TICKET_USER_TYPE.ASSIGNED && !technicianId) {
        technicianId = entry.users_id ?? null;
      }
    }
    return { requesterId, technicianId };
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

  private async fetchTicketsByIds(
    sessionKey: string,
    ticketIds: number[],
  ): Promise<DomainTicket[]> {
    if (ticketIds.length === 0) return [];

    const rawTickets = await Promise.all(
      ticketIds.map(async (ticketId) => {
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
      }),
    );

    const tickets = rawTickets.filter((ticket): ticket is DomainTicket => ticket !== null);
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
    const idSet = new Set(ticketIds);

    for (const ticketId of ticketIds) {
      result.set(ticketId, { requesterId: null, technicianId: null });
    }

    if (ticketIds.length === 0) return result;

    const response = await this.glpi.request<
      Array<{ tickets_id?: number; users_id?: number; type?: number }>
    >({
      method: "GET",
      path: GLPI_ENDPOINTS.TICKET_USER,
      sessionKey,
      query: { range: "0-9999" },
    });

    for (const entry of Array.isArray(response.data) ? response.data : []) {
      const ticketId = Number(entry.tickets_id ?? 0);
      if (!idSet.has(ticketId)) continue;

      const links = result.get(ticketId);
      if (!links) continue;

      if (entry.type === GLPI_TICKET_USER_TYPE.REQUESTER && !links.requesterId) {
        links.requesterId = entry.users_id ?? null;
      }
      if (entry.type === GLPI_TICKET_USER_TYPE.ASSIGNED && !links.technicianId) {
        links.technicianId = entry.users_id ?? null;
      }
    }

    return result;
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
    if (filter.search) {
      const needle = filter.search.toLowerCase();
      filtered = filtered.filter(
        (ticket) =>
          ticket.subject.toLowerCase().includes(needle) ||
          ticket.description?.toLowerCase().includes(needle),
      );
    }

    return filtered;
  }

  private static parseTotal(contentRange?: string): number | null {
    if (!contentRange) return null;
    const match = contentRange.match(/\/(\d+)$/);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }
}
