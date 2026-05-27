import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { TicketsGlpiRepository } from "../glpi/repositories/tickets.glpi-repository";
import { UsersGlpiRepository } from "../glpi/repositories/users.glpi-repository";
import { GlpiBootstrapService } from "../glpi/glpi-bootstrap.service";
import { CatalogService } from "../catalog/catalog.service";
import type { DomainCategory } from "../glpi/mappers/category.mapper";
import type { DomainLocation } from "../glpi/mappers/location.mapper";
import type { DomainUser } from "../glpi/mappers/user.mapper";
import { isActiveTicket, TicketMapper, type DomainTicket } from "../glpi/mappers/ticket.mapper";
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS,
  canTransitionTo,
  type TicketStatus,
} from "./domain/ticket-status";
import { TICKET_TYPE_LABELS } from "./domain/ticket-type";
import { UrgencyPolicy } from "./domain/urgency.policy";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { AppConfig } from "../../config/configuration";
import { LdapProvider } from "../auth/strategies/ldap.provider";
import {
  MAIL_EVENTS,
  type MailRecipient,
  type TicketAssignedEvent,
  type TicketCreatedEvent,
  type TicketCreatedRecipient,
  type TicketStatusChangedEvent,
} from "../mail/mail.events";
import { UsersService } from "../users/users.service";
import type { CreateTicketDto } from "./dto/create-ticket.dto";
import type { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";
import type {
  CreateTicketResponseDto,
  TicketListResponseDto,
  TicketResponseDto,
} from "./dto/ticket.response.dto";
import type { TicketMetricsResponseDto } from "./dto/ticket-metrics.response.dto";
import {
  computeMyTicketsMetrics,
  computeSiteMetrics,
  computeTypeMetrics,
  isTicketOpen,
  OPEN_STATUSES,
} from "./domain/ticket-metrics.helpers";

/** Límite v1 para pool de abiertos globales (sede + gráfico). TODO: búsqueda GLPI agregada. */
const METRICS_OPEN_POOL_LIMIT = 500;

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly ticketsRepo: TicketsGlpiRepository,
    private readonly usersRepo: UsersGlpiRepository,
    private readonly usersService: UsersService,
    private readonly bootstrap: GlpiBootstrapService,
    private readonly catalogService: CatalogService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly ldap: LdapProvider,
  ) {}

  /**
   * Ejecuta una operaci├│n contra GLPI usando la cuenta de servicio
   * (`GLPI_CATALOG_BOOTSTRAP_*`, elevada con permisos CRUD). Todas las
   * operaciones del m├│dulo de tickets pasan por aqu├¡: la autorizaci├│n
   * a nivel de negocio se valida arriba (rol, ownership) y el actor en
   * los inputs GLPI se setea expl├¡citamente (`_users_id_requester`, etc).
   */
  private asService<T>(fn: (sessionKey: string) => Promise<T>): Promise<T> {
    return this.bootstrap.withCatalogBootstrapSession(fn);
  }

  async getMetrics(user: AuthenticatedUser): Promise<TicketMetricsResponseDto> {
    if (user.role !== "technician") {
      throw new BusinessException({
        message: "Only technicians can access ticket metrics",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }

    const openStatusGlpi = OPEN_STATUSES.map((status) =>
      TicketMapper.mapStatusToGlpi(status),
    );

    const metricsListOptions = { includeActors: false } as const;

    const [assignedTickets, openPoolResult, siteTickets, locations] = await this.asService(
      async (key) => {
        const assignedPromise = this.ticketsRepo
          .listAssignedTicketIds(key, user.id)
          .then((ids) => this.ticketsRepo.fetchTicketsByIds(key, ids));

        const [assigned, openPool, siteResult, locs] = await Promise.all([
          assignedPromise,
          this.ticketsRepo.list(
            key,
            {
              page: 1,
              limit: METRICS_OPEN_POOL_LIMIT,
              status: openStatusGlpi,
            },
            metricsListOptions,
          ),
          user.locationId != null
            ? this.ticketsRepo.list(
                key,
                {
                  page: 1,
                  limit: METRICS_OPEN_POOL_LIMIT,
                  locationId: user.locationId,
                },
                metricsListOptions,
              )
            : Promise.resolve({ items: [] as DomainTicket[], total: 0 }),
          this.catalogService.listLocations(),
        ]);

        return [assigned, openPool.items, siteResult.items, locs] as const;
      },
    );

    const myTickets = computeMyTicketsMetrics(assignedTickets);
    const myIncidents = computeTypeMetrics(assignedTickets, "incident");
    const myRequests = computeTypeMetrics(assignedTickets, "request");
    const mySite =
      user.locationId != null ? computeSiteMetrics(siteTickets) : null;

    const locationNameById = new Map(locations.map((loc) => [loc.id, loc.name]));
    const openByLocationMap = new Map<number, number>();

    for (const ticket of openPoolResult.filter((t) => isActiveTicket(t) && isTicketOpen(t))) {
      if (ticket.locationId == null) continue;
      openByLocationMap.set(
        ticket.locationId,
        (openByLocationMap.get(ticket.locationId) ?? 0) + 1,
      );
    }

    const openByLocation = [...openByLocationMap.entries()]
      .map(([locationId, open]) => ({
        locationId,
        name: locationNameById.get(locationId) ?? `Sede #${locationId}`,
        open,
      }))
      .sort((a, b) => b.open - a.open);

    return {
      myTickets,
      mySite,
      myIncidents,
      myRequests,
      openByLocation,
    };
  }

  async list(user: AuthenticatedUser, query: ListTicketsQueryDto): Promise<TicketListResponseDto> {
    const filter = {
      page: query.page ?? 1,
      limit: query.limit ?? 25,
      status: query.status ? [TicketMapper.mapStatusToGlpi(query.status)] : undefined,
      type: query.type ? TicketMapper.mapTypeToGlpi(query.type) : undefined,
      search: query.search,
      requesterId: user.role === "technician" ? undefined : user.id,
      technicianId: query.assignedToMe
        ? user.id
        : query.technicianId ?? undefined,
      locationId: query.locationId ?? undefined,
    };

    const result = await this.asService((key) => this.ticketsRepo.list(key, filter));

    let items = result.items;
    if (user.role !== "technician") {
      items = items.filter((ticket) => ticket.requesterId === user.id);
    }

    const enriched = await this.enrichTickets(items);

    return {
      items: enriched,
      total: result.total,
      page: filter.page,
      limit: filter.limit,
    };
  }

  async findById(user: AuthenticatedUser, id: number): Promise<TicketResponseDto> {
    const ticket = await this.asService((key) => this.ticketsRepo.findById(key, id));
    if (!ticket) {
      throw new BusinessException({
        message: `Ticket ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }
    if (user.role !== "technician" && ticket.requesterId !== user.id) {
      throw new BusinessException({
        message: "You do not have access to this ticket",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }
    return this.enrichTicket(ticket);
  }

  async create(user: AuthenticatedUser, dto: CreateTicketDto): Promise<CreateTicketResponseDto> {
    const requesterId = await this.resolveRequesterId(user, dto.requesterId);
    await this.assertCategoryExists(dto.categoryId);
    if (dto.locationId) {
      await this.assertLocationExists(dto.locationId);
    }
    if (dto.assignedTechnicianId) {
      await this.assertTechnicianExists(dto.assignedTechnicianId);
    }

    const urgency = UrgencyPolicy.defaultFor(dto.type);
    const statusGlpi = TicketMapper.mapStatusToGlpi(
      dto.assignedTechnicianId ? TICKET_STATUS.ASSIGNED : TICKET_STATUS.NEW,
    );

    const created = await this.asService((key) =>
      this.ticketsRepo.create(key, {
        name: dto.subject,
        content: dto.description,
        type: TicketMapper.mapTypeToGlpi(dto.type),
        status: statusGlpi,
        urgency: TicketMapper.mapUrgencyToGlpi(urgency),
        itilcategories_id: dto.categoryId,
        locations_id: dto.locationId,
        entities_id: this.config.get("glpi.defaultEntity", { infer: true }),
        requesters_id: requesterId,
        technicians_id: dto.assignedTechnicianId,
      }),
    );

    const enriched = await this.enrichTicket(created);

    const [requesterUser, technicianUser] = await this.asService(async (key) => {
      const requester = await this.usersRepo.findById(key, requesterId);
      const technician = dto.assignedTechnicianId
        ? await this.usersRepo.findById(key, dto.assignedTechnicianId)
        : null;
      return [requester, technician];
    });

    const notify: TicketCreatedRecipient[] = [];
    const requesterRecipient = await this.resolveMailRecipient(
      requesterUser,
      requesterId === user.id ? user.email : null,
    );
    if (requesterRecipient) {
      notify.push({ ...requesterRecipient, role: "requester" });
    }

    const technicianRecipient = await this.resolveMailRecipient(technicianUser);
    if (
      technicianRecipient &&
      technicianRecipient.email.toLowerCase() !== requesterRecipient?.email.toLowerCase()
    ) {
      notify.push({ ...technicianRecipient, role: "technician" });
    }

    const payload: TicketCreatedEvent = {
      ticketId: created.id,
      type: TICKET_TYPE_LABELS[dto.type],
      subject: dto.subject,
      description: dto.description,
      requesterName: enriched.requester.name ?? "Solicitante",
      technicianName: enriched.technician?.name ?? null,
      categoryName: enriched.category?.name ?? null,
      locationName: enriched.location?.name ?? null,
      notify,
    };

    this.events.emit(MAIL_EVENTS.TICKET_CREATED, payload);

    return {
      ...enriched,
      mail: { sent: notify.length > 0, error: null },
    };
  }

  private async resolveMailRecipient(
    domainUser: DomainUser | null,
    fallbackEmail?: string | null,
  ): Promise<MailRecipient | null> {
    let email = domainUser?.email ?? fallbackEmail ?? null;
    if (!email && domainUser?.login) {
      email = await this.ldap.lookupEmailByLogin(domainUser.login);
    }
    if (!email) {
      return null;
    }

    return {
      name: domainUser?.fullName ?? "Usuario",
      email,
    };
  }

  async updateStatus(
    user: AuthenticatedUser,
    id: number,
    status: TicketStatus,
  ): Promise<TicketResponseDto> {
    const ticket = await this.asService((key) => this.ticketsRepo.findById(key, id));
    if (!ticket) {
      throw new BusinessException({
        message: `Ticket ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    if (user.role !== "technician" && ticket.requesterId !== user.id) {
      throw new BusinessException({
        message: "You do not have permission to update this ticket",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }

    if (!canTransitionTo(ticket.status, status)) {
      throw new BusinessException({
        message: `Invalid status transition from ${ticket.status} to ${status}`,
        code: API_ERROR_CODE.INVALID_TICKET_STATUS,
      });
    }

    const previousStatus = ticket.status;
    await this.asService((key) =>
      this.ticketsRepo.updateStatus(key, id, TicketMapper.mapStatusToGlpi(status)),
    );

    const refreshed = await this.asService((key) => this.ticketsRepo.findById(key, id));
    const enriched = await this.enrichTicket(refreshed ?? { ...ticket, status });

    if (previousStatus !== status) {
      const requesterUser = ticket.requesterId
        ? await this.asService((key) => this.usersRepo.findById(key, ticket.requesterId!))
        : null;
      const recipients: MailRecipient[] = [];
      if (requesterUser?.email) {
        recipients.push({ name: requesterUser.fullName, email: requesterUser.email });
      }
      const payload: TicketStatusChangedEvent = {
        ticketId: id,
        subject: ticket.subject,
        previousStatus: TICKET_STATUS_LABELS[previousStatus],
        newStatus: TICKET_STATUS_LABELS[status],
        changedBy: user.name,
        recipients,
      };
      this.events.emit(MAIL_EVENTS.TICKET_STATUS_CHANGED, payload);
    }

    return enriched;
  }

  async assignTechnician(
    user: AuthenticatedUser,
    ticketId: number,
    technicianId: number,
  ): Promise<TicketResponseDto> {
    await this.assertTechnicianExists(technicianId);
    const ticket = await this.asService((key) => this.ticketsRepo.findById(key, ticketId));
    if (!ticket) {
      throw new BusinessException({
        message: `Ticket ${ticketId} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    await this.asService((key) =>
      this.ticketsRepo.assignTechnician(key, ticketId, technicianId),
    );
    if (ticket.status === "new") {
      await this.asService((key) =>
        this.ticketsRepo.updateStatus(
          key,
          ticketId,
          TicketMapper.mapStatusToGlpi(TICKET_STATUS.ASSIGNED),
        ),
      );
    }

    const refreshed = await this.asService((key) =>
      this.ticketsRepo.findById(key, ticketId),
    );
    const enriched = await this.enrichTicket(refreshed ?? ticket);

    const technicianUser = await this.asService((key) =>
      this.usersRepo.findById(key, technicianId),
    );
    if (technicianUser?.email) {
      const payload: TicketAssignedEvent = {
        ticketId,
        subject: ticket.subject,
        technicianName: technicianUser.fullName,
        assignedBy: user.name,
        recipients: [{ name: technicianUser.fullName, email: technicianUser.email }],
      };
      this.events.emit(MAIL_EVENTS.TICKET_ASSIGNED, payload);
    }

    return enriched;
  }

  private async resolveRequesterId(
    user: AuthenticatedUser,
    requested?: number,
  ): Promise<number> {
    if (!requested || requested === user.id) return user.id;
    if (user.role !== "technician") {
      throw new BusinessException({
        message: "Only technicians can create tickets on behalf of other users",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }
    const target = await this.asService((key) => this.usersRepo.findById(key, requested));
    if (!target) {
      throw new BusinessException({
        message: `Requester ${requested} not found`,
        code: API_ERROR_CODE.AUTH_USER_NOT_FOUND,
        status: HttpStatus.BAD_REQUEST,
      });
    }
    return target.id;
  }

  private async assertCategoryExists(categoryId: number): Promise<void> {
    const categories = await this.catalogService.listCategories();
    if (!categories.some((category) => category.id === categoryId)) {
      throw new BusinessException({
        message: `Category ${categoryId} is not valid`,
        code: API_ERROR_CODE.INVALID_CATEGORY,
      });
    }
  }

  private async assertLocationExists(locationId: number): Promise<void> {
    const locations = await this.catalogService.listLocations();
    if (!locations.some((location) => location.id === locationId)) {
      throw new BusinessException({
        message: `Location ${locationId} is not valid`,
        code: API_ERROR_CODE.INVALID_LOCATION,
      });
    }
  }

  private async assertTechnicianExists(technicianId: number): Promise<void> {
    const isEligible = await this.usersService.isEligibleTechnician(technicianId);
    if (!isEligible) {
      throw new BusinessException({
        message: `Technician ${technicianId} is not valid`,
        code: API_ERROR_CODE.INVALID_TECHNICIAN,
      });
    }
  }

  private async enrichTicket(ticket: DomainTicket): Promise<TicketResponseDto> {
    const [enriched] = await this.enrichTickets([ticket]);
    return enriched;
  }

  private async enrichTickets(tickets: DomainTicket[]): Promise<TicketResponseDto[]> {
    if (tickets.length === 0) return [];

    const userIds = new Set<number>();
    let needsCategories = false;
    let needsLocations = false;

    for (const ticket of tickets) {
      if (ticket.requesterId) userIds.add(ticket.requesterId);
      if (ticket.technicianId) userIds.add(ticket.technicianId);
      if (ticket.categoryId) needsCategories = true;
      if (ticket.locationId) needsLocations = true;
    }

    const [categories, locations, usersById] = await Promise.all([
      needsCategories
        ? this.catalogService.listCategories()
        : Promise.resolve([] as DomainCategory[]),
      needsLocations
        ? this.catalogService.listLocations()
        : Promise.resolve([] as DomainLocation[]),
      userIds.size > 0
        ? this.loadUsersByIds(userIds)
        : Promise.resolve(new Map<number, DomainUser>()),
    ]);

    return tickets.map((ticket) =>
      this.mapTicketToResponse(ticket, usersById, categories, locations),
    );
  }

  private async loadUsersByIds(userIds: Set<number>): Promise<Map<number, DomainUser>> {
    const usersById = new Map<number, DomainUser>();
    await this.asService(async (key) => {
      const users = await Promise.all(
        [...userIds].map((id) => this.usersRepo.findById(key, id)),
      );
      for (const user of users) {
        if (user) usersById.set(user.id, user);
      }
    });
    return usersById;
  }

  private mapTicketToResponse(
    ticket: DomainTicket,
    usersById: Map<number, DomainUser>,
    categories: DomainCategory[],
    locations: DomainLocation[],
  ): TicketResponseDto {
    const requester = ticket.requesterId ? usersById.get(ticket.requesterId) ?? null : null;
    const technician = ticket.technicianId ? usersById.get(ticket.technicianId) ?? null : null;
    const category = ticket.categoryId
      ? categories.find((entry) => entry.id === ticket.categoryId) ?? null
      : null;
    const location = ticket.locationId
      ? locations.find((entry) => entry.id === ticket.locationId) ?? null
      : null;

    return {
      id: ticket.id,
      type: ticket.type,
      status: ticket.status,
      urgency: ticket.urgency,
      subject: ticket.subject,
      description: ticket.description,
      category: category ? { id: category.id, name: category.name } : null,
      location: location ? { id: location.id, name: location.name } : null,
      requester: {
        id: requester?.id ?? ticket.requesterId,
        name: requester?.fullName ?? null,
        email: requester?.email ?? null,
      },
      technician: technician
        ? {
            id: technician.id,
            name: technician.fullName,
            email: technician.email,
          }
        : null,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    };
  }
}
