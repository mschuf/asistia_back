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
import { appendResolutionNote } from "./domain/ticket-resolution.helpers";
import { RESOLUTION_NOTE_MIN_LENGTH } from "./dto/update-ticket-status.dto";
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
  buildOpenByLocationMetrics,
  computeMyTicketsMetrics,
  computeSiteMetrics,
  computeTypeMetrics,
  normalizeLocationId,
  OPEN_STATUSES,
} from "./domain/ticket-metrics.helpers";

/** Límite para tickets abiertos de la sede exacta (card Mi Sede). */
const METRICS_SITE_LIMIT = 500;

/** Límite para abiertos asignados al técnico (listado Abiertos por sede). */
const METRICS_ASSIGNED_OPEN_LIMIT = 9999;

/** Máximo de tickets por página en el listado (historial). */
const TICKETS_LIST_MAX_PAGE_SIZE = 15;

/** Estados por defecto en Historial cuando no hay filtro explícito. */
const DEFAULT_HISTORY_STATUSES: TicketStatus[] = [
  TICKET_STATUS.ASSIGNED,
  TICKET_STATUS.PLANNED,
];

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

    const [assignedTickets, locations, mySitePool, assignedOpenPool] =
      await this.asService(async (key) => {
        const mySitePromise =
          user.locationId != null
            ? this.ticketsRepo.listOpenTicketsForLocationMetrics(
                key,
                user.locationId,
                openStatusGlpi,
                METRICS_SITE_LIMIT,
              )
            : Promise.resolve([] as DomainTicket[]);

        const [assigned, locs, mySiteItems, assignedOpenItems] = await Promise.all([
          this.ticketsRepo.listAssignedTicketsForMetrics(key, user.id),
          this.catalogService.listLocations(),
          mySitePromise,
          this.ticketsRepo.listOpenAssignedTicketsForMetrics(
            key,
            user.id,
            openStatusGlpi,
            METRICS_ASSIGNED_OPEN_LIMIT,
          ),
        ]);

        return [assigned, locs, mySiteItems, assignedOpenItems] as const;
      });

    const myTickets = computeMyTicketsMetrics(assignedTickets);
    const myIncidents = computeTypeMetrics(assignedTickets, "incident");
    const myRequests = computeTypeMetrics(assignedTickets, "request");
    const mySite = user.locationId != null ? computeSiteMetrics(mySitePool) : null;

    const locationNameById = new Map(
      locations.map((loc) => [normalizeLocationId(loc.id) ?? loc.id, loc.name]),
    );
    const openByLocation = buildOpenByLocationMetrics(assignedOpenPool, locationNameById);

    return {
      myTickets,
      mySite,
      myIncidents,
      myRequests,
      openByLocation,
    };
  }

  async listHistory(
    user: AuthenticatedUser,
    query: ListTicketsQueryDto,
  ): Promise<TicketListResponseDto> {
    const limit = Math.min(
      Math.max(query.limit ?? TICKETS_LIST_MAX_PAGE_SIZE, 1),
      TICKETS_LIST_MAX_PAGE_SIZE,
    );
    const trimmedSearch = query.search?.trim();
    let statusFilter = TicketsService.resolveListStatusFilter(query);
    if (!statusFilter && !trimmedSearch) {
      statusFilter = DEFAULT_HISTORY_STATUSES.map((status) =>
        TicketMapper.mapStatusToGlpi(status),
      );
    }

    const filter = {
      page: query.page ?? 1,
      limit,
      status: statusFilter,
      type: query.type ? TicketMapper.mapTypeToGlpi(query.type) : undefined,
      search: query.search,
      requesterId: user.role === "technician" ? undefined : user.id,
      technicianId:
        user.role === "technician"
          ? query.technicianId ?? user.id
          : undefined,
      locationId: query.locationId ?? undefined,
    };

    const result = await this.asService((key) =>
      this.ticketsRepo.listHistoryPage(key, filter),
    );

    let items = result.items.filter(isActiveTicket);
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

  async list(user: AuthenticatedUser, query: ListTicketsQueryDto): Promise<TicketListResponseDto> {
    const limit = Math.min(Math.max(query.limit ?? TICKETS_LIST_MAX_PAGE_SIZE, 1), TICKETS_LIST_MAX_PAGE_SIZE);
    const filter = {
      page: query.page ?? 1,
      limit,
      status: TicketsService.resolveListStatusFilter(query),
      type: query.type ? TicketMapper.mapTypeToGlpi(query.type) : undefined,
      search: query.search,
      requesterId: user.role === "technician" ? undefined : user.id,
      technicianId: query.assignedToMe
        ? user.id
        : query.technicianId ?? undefined,
      locationId: query.locationId ?? undefined,
    };

    const result = await this.asService((key) => this.ticketsRepo.list(key, filter));

    let items = result.items.filter(isActiveTicket);
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
    const locationId = dto.locationId ?? normalizeLocationId(user.locationId) ?? undefined;
    const technicianCheck = dto.assignedTechnicianId
      ? this.assertTechnicianExists(dto.assignedTechnicianId)
      : Promise.resolve();

    const [categories, locations, requesterId] = await Promise.all([
      this.catalogService.listCategories(),
      locationId
        ? this.catalogService.listLocations()
        : Promise.resolve([] as DomainLocation[]),
      this.resolveRequesterId(user, dto.requesterId),
      technicianCheck,
    ]);

    this.assertCategoryInList(categories, dto.categoryId);
    if (locationId) {
      this.assertLocationInList(locations, locationId);
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
        locations_id: locationId,
        entities_id: this.config.get("glpi.defaultEntity", { infer: true }),
        requesters_id: requesterId,
        technicians_id: dto.assignedTechnicianId,
      }),
    );

    const mailUserIds = new Set<number>([requesterId]);
    if (dto.assignedTechnicianId) {
      mailUserIds.add(dto.assignedTechnicianId);
    }
    const usersById = await this.loadUsersByIds(mailUserIds);

    const notify: TicketCreatedRecipient[] = [];
    const requesterRecipient = await this.resolveMailRecipient(
      usersById.get(requesterId) ?? null,
      requesterId === user.id ? user.email : null,
    );
    if (requesterRecipient) {
      notify.push({ ...requesterRecipient, role: "requester" });
    }

    const technicianRecipient = await this.resolveMailRecipient(
      dto.assignedTechnicianId
        ? usersById.get(dto.assignedTechnicianId) ?? null
        : null,
    );
    if (
      technicianRecipient &&
      technicianRecipient.email.toLowerCase() !== requesterRecipient?.email.toLowerCase()
    ) {
      notify.push({ ...technicianRecipient, role: "technician" });
    }

    const categoryName =
      categories.find((category) => category.id === dto.categoryId)?.name ?? null;
    const locationEntry = locationId
      ? locations.find((location) => location.id === locationId)
      : undefined;
    const locationName = locationEntry
      ? locationEntry.name || locationEntry.fullPath
      : null;

    const payload: TicketCreatedEvent = {
      ticketId: created.id,
      type: TICKET_TYPE_LABELS[dto.type],
      subject: dto.subject,
      description: dto.description,
      requesterName: usersById.get(requesterId)?.fullName ?? user.name ?? "Solicitante",
      technicianName: dto.assignedTechnicianId
        ? usersById.get(dto.assignedTechnicianId)?.fullName ?? null
        : null,
      categoryName,
      locationName,
      notify,
    };

    this.events.emit(MAIL_EVENTS.TICKET_CREATED, payload);

    return {
      id: created.id,
      subject: created.subject,
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
    resolutionNote?: string,
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

    const technicianResolving = user.role === "technician" && status === TICKET_STATUS.SOLVED;
    if (technicianResolving) {
      const trimmedNote = resolutionNote?.trim() ?? "";
      if (trimmedNote.length < RESOLUTION_NOTE_MIN_LENGTH) {
        throw new BusinessException({
          message: `Al marcar como resuelto debe indicar lo realizado (mínimo ${RESOLUTION_NOTE_MIN_LENGTH} caracteres).`,
          code: API_ERROR_CODE.VALIDATION,
          status: HttpStatus.BAD_REQUEST,
        });
      }
    }

    const previousStatus = ticket.status;
    const statusGlpi = TicketMapper.mapStatusToGlpi(status);

    if (technicianResolving) {
      const note = resolutionNote!.trim();
      await this.asService(async (key) => {
        const rawContent = await this.ticketsRepo.getRawContent(key, id);
        const updatedContent = appendResolutionNote(rawContent, note);
        await this.ticketsRepo.updateStatus(key, id, statusGlpi, updatedContent);
      });
    } else {
      await this.asService((key) => this.ticketsRepo.updateStatus(key, id, statusGlpi));
    }

    const refreshed = await this.asService((key) => this.ticketsRepo.findById(key, id));
    if (!refreshed) {
      throw new BusinessException({
        message: `Ticket ${id} could not be verified after status update`,
        code: API_ERROR_CODE.GLPI_UNAVAILABLE,
        status: HttpStatus.BAD_GATEWAY,
      });
    }
    if (refreshed.status !== status) {
      throw new BusinessException({
        message: `GLPI did not apply status "${TICKET_STATUS_LABELS[status]}". Current status: ${TICKET_STATUS_LABELS[refreshed.status]}`,
        code: API_ERROR_CODE.INVALID_TICKET_STATUS,
      });
    }
    const enriched = await this.enrichTicket(refreshed);

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

  private assertCategoryInList(categories: DomainCategory[], categoryId: number): void {
    if (!categories.some((category) => category.id === categoryId)) {
      throw new BusinessException({
        message: `Category ${categoryId} is not valid`,
        code: API_ERROR_CODE.INVALID_CATEGORY,
      });
    }
  }

  private static resolveListStatusFilter(query: ListTicketsQueryDto): number[] | undefined {
    if (query.status) {
      return [TicketMapper.mapStatusToGlpi(query.status)];
    }

    const rawStatuses = query.statuses
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!rawStatuses?.length) {
      return undefined;
    }

    const allowed = new Set(Object.values(TICKET_STATUS));
    const parsed = rawStatuses.filter((value): value is TicketStatus =>
      allowed.has(value as TicketStatus),
    );

    if (parsed.length === 0) {
      return undefined;
    }

    return parsed.map((status) => TicketMapper.mapStatusToGlpi(status));
  }

  private assertLocationInList(locations: DomainLocation[], locationId: number): void {
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
    const { items } = await this.enrichTicketsWithUsers([ticket]);
    return items[0];
  }

  private async enrichTickets(tickets: DomainTicket[]): Promise<TicketResponseDto[]> {
    const { items } = await this.enrichTicketsWithUsers(tickets);
    return items;
  }

  private async enrichTicketsWithUsers(tickets: DomainTicket[]): Promise<{
    items: TicketResponseDto[];
    usersById: Map<number, DomainUser>;
  }> {
    if (tickets.length === 0) {
      return { items: [], usersById: new Map() };
    }

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

    return {
      items: tickets.map((ticket) =>
        this.mapTicketToResponse(ticket, usersById, categories, locations),
      ),
      usersById,
    };
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
    const ticketLocationId = normalizeLocationId(ticket.locationId);
    const location =
      ticketLocationId != null
        ? locations.find(
            (entry) => normalizeLocationId(entry.id) === ticketLocationId,
          ) ?? null
        : null;

    return {
      id: ticket.id,
      type: ticket.type,
      status: ticket.status,
      urgency: ticket.urgency,
      subject: ticket.subject,
      description: ticket.description,
      category: category ? { id: category.id, name: category.name } : null,
      location: location
        ? { id: location.id, name: location.name || location.fullPath }
        : null,
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
