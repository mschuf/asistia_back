import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { TicketsGlpiRepository } from "../glpi/repositories/tickets.glpi-repository";
import { TicketsHistorySqlRepository } from "../glpi/repositories/tickets-history.sql-repository";
import { TicketsMetricsSqlRepository } from "../glpi/repositories/tickets-metrics.sql-repository";
import { TicketsStatusSqlRepository } from "../glpi/repositories/tickets-status.sql-repository";
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
  UpdateTicketStatusResponseDto,
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

export type HistoryListSource = "mysql" | "glpi-api" | "glpi-fallback";

export interface HistoryListMeta {
  source: HistoryListSource;
}

type StatusUpdateSource = "mysql" | "glpi-api";

@Injectable()
export class TicketsService {
  constructor(
    private readonly ticketsRepo: TicketsGlpiRepository,
    private readonly historySqlRepo: TicketsHistorySqlRepository,
    private readonly metricsSqlRepo: TicketsMetricsSqlRepository,
    private readonly statusSqlRepo: TicketsStatusSqlRepository,
    private readonly usersRepo: UsersGlpiRepository,
    private readonly usersService: UsersService,
    private readonly bootstrap: GlpiBootstrapService,
    private readonly catalogService: CatalogService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly ldap: LdapProvider,
    @InjectPinoLogger(TicketsService.name)
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TicketsService.name);
  }

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

  private preferSqlTicketLookup(): boolean {
    const historySource = this.config.get("glpi.historySource", { infer: true });
    const statusSource = this.config.get("glpi.statusSource", { infer: true });
    return historySource === "sql" || statusSource === "sql";
  }

  private async tryFindTicketFromSql(id: number): Promise<DomainTicket | null> {
    try {
      const fromSql = await this.historySqlRepo.findById(id);
      if (fromSql) {
        this.logger.info({ ticketId: id, source: "mysql" }, "[ticket] findById source=mysql");
      }
      return fromSql;
    } catch (error) {
      this.logger.warn(
        { ticketId: id, reason: "sql_error", err: error },
        `[ticket] findById sql failed message=${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Carga un ticket por ID. Con historial o estado en SQL, consulta primero
   * `v_asistia_ticket_history`; si no hay fila, hace fallback a la API de GLPI.
   */
  private async findTicketById(id: number): Promise<DomainTicket | null> {
    if (this.preferSqlTicketLookup()) {
      const fromSql = await this.tryFindTicketFromSql(id);
      if (fromSql) {
        return fromSql;
      }
    }

    const fromGlpi = await this.asService((key) => this.ticketsRepo.findById(key, id));
    if (fromGlpi) {
      return fromGlpi;
    }

    if (!this.preferSqlTicketLookup()) {
      return null;
    }

    return null;
  }

  /** Carga previa a `updateStatus`: con `GLPI_STATUS_SOURCE=sql` prioriza MySQL. */
  private async findTicketForStatusUpdate(id: number): Promise<DomainTicket | null> {
    const statusSource = this.config.get("glpi.statusSource", { infer: true });
    if (statusSource === "sql") {
      const fromSql = await this.tryFindTicketFromSql(id);
      if (fromSql) {
        return fromSql;
      }
      return this.asService((key) => this.ticketsRepo.findById(key, id));
    }
    return this.findTicketById(id);
  }

  async getMetrics(user: AuthenticatedUser): Promise<TicketMetricsResponseDto> {
    if (user.role !== "technician") {
      throw new BusinessException({
        message: "Only technicians can access ticket metrics",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }

    const metricsSource = this.config.get("glpi.metricsSource", { infer: true });
    if (metricsSource === "sql") {
      try {
        const result = await this.metricsSqlRepo.getMetricsForTechnician({
          technicianId: user.id,
          locationId: normalizeLocationId(user.locationId),
        });
        this.logger.info(
          {
            metricsSource: "mysql",
            userId: user.id,
            locationId: user.locationId ?? null,
          },
          "[metrics] source=mysql",
        );
        return result;
      } catch (error) {
        this.logger.warn(
          {
            metricsSource: "glpi-fallback",
            reason: "sql_error",
            userId: user.id,
            err: error,
          },
          `[metrics] source=glpi-fallback message=${(error as Error).message}`,
        );
        return this.getMetricsFromGlpi(user);
      }
    }

    const result = await this.getMetricsFromGlpi(user);
    this.logger.info(
      {
        metricsSource: "glpi-api",
        configured: metricsSource,
        userId: user.id,
      },
      "[metrics] source=glpi-api",
    );
    return result;
  }

  private async getMetricsFromGlpi(
    user: AuthenticatedUser,
  ): Promise<TicketMetricsResponseDto> {
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
    meta?: HistoryListMeta,
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

    const historySource = this.config.get("glpi.historySource", { infer: true });
    let sqlFallback = false;
    if (historySource === "sql") {
      try {
        let sqlResult = await this.historySqlRepo.listHistoryPageAsResponse(filter);
        if (user.role !== "technician") {
          sqlResult = {
            ...sqlResult,
            items: sqlResult.items.filter((ticket) => ticket.requester.id === user.id),
          };
        }
        this.logger.info(
          {
            historySource: "mysql",
            userId: user.id,
            role: user.role,
            page: filter.page,
            limit: filter.limit,
            total: sqlResult.total,
            items: sqlResult.items.length,
          },
          "[history] source=mysql",
        );
        if (meta) meta.source = "mysql";
        return {
          items: sqlResult.items,
          total: sqlResult.total,
          page: filter.page,
          limit: filter.limit,
        };
      } catch (error) {
        sqlFallback = true;
        if (meta) meta.source = "glpi-fallback";
        this.logger.warn(
          {
            historySource: "glpi-fallback",
            reason: "sql_error",
            userId: user.id,
            page: filter.page,
            err: error,
          },
          `[history] source=glpi-fallback message=${(error as Error).message}`,
        );
      }
    }

    const result = await this.asService((key) =>
      this.ticketsRepo.listHistoryPage(key, filter),
    );

    let items = result.items.filter(isActiveTicket);
    if (user.role !== "technician") {
      items = items.filter((ticket) => ticket.requesterId === user.id);
    }

    const enriched = await this.enrichTickets(items);

    if (meta) meta.source = "glpi-api";
    this.logger.info(
      {
        historySource: "glpi-api",
        sqlFallback,
        configured: historySource,
        userId: user.id,
        role: user.role,
        page: filter.page,
        limit: filter.limit,
        total: result.total,
        items: enriched.length,
        enriched: true,
      },
      "[history] source=glpi-api",
    );

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
    const ticket = await this.findTicketById(id);
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
      requesterName: usersById.get(requesterId)?.fullName ?? "Solicitante",
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
  ): Promise<UpdateTicketStatusResponseDto> {
    const ticket = await this.findTicketForStatusUpdate(id);
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
    const resolutionNoteToAppend = technicianResolving ? resolutionNote!.trim() : null;

    const statusUpdateSource = await this.applyStatusUpdate(id, statusGlpi, resolutionNoteToAppend);

    const refreshed = await this.verifyStatusUpdate(id, ticket, statusUpdateSource);
    if (refreshed.status !== status) {
      throw new BusinessException({
        message: `GLPI did not apply status "${TICKET_STATUS_LABELS[status]}". Current status: ${TICKET_STATUS_LABELS[refreshed.status]}`,
        code: API_ERROR_CODE.INVALID_TICKET_STATUS,
      });
    }

    if (previousStatus !== status) {
      void (async () => {
        const [requesterUser, changedBy] = await Promise.all([
          ticket.requesterId
            ? this.asService((key) => this.usersRepo.findById(key, ticket.requesterId!))
            : Promise.resolve(null),
          this.resolveActorDisplayName(user.id),
        ]);
        const recipients: MailRecipient[] = [];
        if (requesterUser?.email) {
          recipients.push({ name: requesterUser.fullName, email: requesterUser.email });
        }
        const payload: TicketStatusChangedEvent = {
          ticketId: id,
          subject: ticket.subject,
          previousStatus: TICKET_STATUS_LABELS[previousStatus],
          newStatus: TICKET_STATUS_LABELS[status],
          changedBy,
          recipients,
        };
        this.events.emit(MAIL_EVENTS.TICKET_STATUS_CHANGED, payload);
      })();
    }

    return {
      id,
      status: refreshed.status,
    };
  }

  /**
   * Aplica el cambio de estado según `GLPI_STATUS_SOURCE`.
   * Con `sql` escribe primero en MySQL (rápido); si falla, fallback a la API REST.
   * La verificación posterior usa el mismo origen efectivo.
   */
  private async applyStatusUpdate(
    ticketId: number,
    statusGlpi: number,
    resolutionNote: string | null,
  ): Promise<StatusUpdateSource> {
    const statusSource = this.config.get("glpi.statusSource", { infer: true });

    if (statusSource === "sql") {
      try {
        let content: string | undefined;
        if (resolutionNote) {
          const rawContent = await this.statusSqlRepo.getRawContent(ticketId);
          content = appendResolutionNote(rawContent, resolutionNote);
        }
        const updated = await this.statusSqlRepo.updateStatus(ticketId, statusGlpi, content);
        if (!updated) {
          this.logger.warn(
            { statusSource: "glpi-fallback", reason: "sql_no_rows", ticketId, statusGlpi },
            "[status] source=glpi-fallback reason=sql_no_rows",
          );
        } else {
          this.logger.info(
            { statusSource: "mysql", ticketId, statusGlpi },
            "[status] source=mysql",
          );
          return "mysql";
        }
      } catch (error) {
        this.logger.warn(
          { statusSource: "glpi-fallback", reason: "sql_error", ticketId, err: error },
          `[status] source=glpi-fallback message=${(error as Error).message}`,
        );
      }
    }

    if (resolutionNote) {
      await this.asService(async (key) => {
        const rawContent = await this.ticketsRepo.getRawContent(key, ticketId);
        const updatedContent = appendResolutionNote(rawContent, resolutionNote);
        await this.ticketsRepo.updateStatus(key, ticketId, statusGlpi, updatedContent);
      });
    } else {
      await this.asService((key) => this.ticketsRepo.updateStatus(key, ticketId, statusGlpi));
    }
    return "glpi-api";
  }

  private async verifyStatusUpdate(
    ticketId: number,
    previousTicket: DomainTicket,
    source: StatusUpdateSource,
  ): Promise<DomainTicket> {
    const statusSource = this.config.get("glpi.statusSource", { infer: true });
    if (statusSource === "sql" && source === "mysql") {
      const refreshedStatus = await this.statusSqlRepo.getStatus(ticketId);
      if (!refreshedStatus) {
        throw new BusinessException({
          message: `Ticket ${ticketId} could not be verified after status update`,
          code: API_ERROR_CODE.GLPI_UNAVAILABLE,
          status: HttpStatus.BAD_GATEWAY,
        });
      }
      return { ...previousTicket, status: refreshedStatus };
    }

    const refreshed = await this.asService((key) => this.ticketsRepo.findById(key, ticketId));
    if (!refreshed) {
      throw new BusinessException({
        message: `Ticket ${ticketId} could not be verified after status update`,
        code: API_ERROR_CODE.GLPI_UNAVAILABLE,
        status: HttpStatus.BAD_GATEWAY,
      });
    }
    return refreshed;
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
        assignedBy: await this.resolveActorDisplayName(user.id),
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

  private async resolveActorDisplayName(userId: number): Promise<string> {
    const actor = await this.asService((key) => this.usersRepo.findById(key, userId));
    return actor?.fullName ?? `Usuario ${userId}`;
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
