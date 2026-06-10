/**
 * @file tickets.service.ts
 * @description Orquesta tickets contra GLPI/MySQL: CRUD, métricas, asignación y correos.
 */
import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { TicketsGlpiRepository } from "../glpi/repositories/tickets.glpi-repository";
import { TicketsHistorySqlRepository } from "../glpi/repositories/tickets-history.sql-repository";
import { TicketsMetricsSqlRepository } from "../glpi/repositories/tickets-metrics.sql-repository";
import { TicketsStatusSqlRepository } from "../glpi/repositories/tickets-status.sql-repository";
import { TicketsCreateSqlRepository } from "../glpi/repositories/tickets-create.sql-repository";
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
import { TICKET_TYPE, TICKET_TYPE_LABELS, type TicketType } from "./domain/ticket-type";
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
  type TicketReassignedEvent,
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
  isTicketOpen,
  normalizeLocationId,
  OPEN_STATUSES,
} from "./domain/ticket-metrics.helpers";

/** Límite para tickets abiertos de la sede exacta (card Mi Sede). */
const METRICS_SITE_LIMIT = 500;

/** Límite para tickets abiertos globales (Indicadores por sede). */
const METRICS_GLOBAL_OPEN_LIMIT = 9999;

/** Máximo de tickets por página en el listado activo vía GLPI. */
const TICKETS_LIST_MAX_PAGE_SIZE = 15;

/** Tamaño por defecto y máximo del historial paginado vía SQL. */
const TICKETS_HISTORY_DEFAULT_PAGE_SIZE = 15;
const TICKETS_HISTORY_MAX_PAGE_SIZE = 1000;

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
type TicketCreateSource = "mysql" | "glpi-api";
type TicketAssignSource = "mysql" | "glpi-api";
type TicketLocationSource = "mysql" | "glpi-api";
type TicketAutoAssignStrategy = "manual" | "site-last" | "global-last" | "fallback-asistia";

interface ResolvedTicketAssignment {
  technicianId: number | undefined;
  strategy: TicketAutoAssignStrategy;
}

interface InboundTicketInput {
  requesterId: number | null;
  requesterName: string;
  requesterEmail: string;
  categoryId: number;
  categoryName: string;
  description: string;
  locationId?: number;
  type?: TicketType;
}

export interface InboundTicketResponse {
  id: number;
  subject: string;
  type: TicketType;
  mailEvent: TicketCreatedEvent;
}

/**
 * Servicio de tickets: consulta híbrida SQL/GLPI, creación, estados y notificaciones.
 */
@Injectable()
export class TicketsService {
  /** Inyecta repositorios GLPI/SQL, catálogo, usuarios, eventos y configuración. */
  constructor(
    private readonly ticketsRepo: TicketsGlpiRepository,
    private readonly historySqlRepo: TicketsHistorySqlRepository,
    private readonly metricsSqlRepo: TicketsMetricsSqlRepository,
    private readonly statusSqlRepo: TicketsStatusSqlRepository,
    private readonly createSqlRepo: TicketsCreateSqlRepository,
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
   * Ejecuta una operación contra GLPI con la sesión de cuenta de servicio.
   * @param fn - Callback que recibe la clave de sesión bootstrap.
   * @returns Resultado de la operación GLPI.
   * @throws Propaga errores de sesión o de la API GLPI.
   */
  private asService<T>(fn: (sessionKey: string) => Promise<T>): Promise<T> {
    return this.bootstrap.withCatalogBootstrapSession(fn);
  }

  /**
   * Indica si historial o estado están configurados para consulta SQL primero.
   * @returns `true` si `glpi.historySource` o `glpi.statusSource` es `sql`.
   * @throws Ninguno.
   */
  private preferSqlTicketLookup(): boolean {
    const historySource = this.config.get("glpi.historySource", { infer: true });
    const statusSource = this.config.get("glpi.statusSource", { infer: true });
    return historySource === "sql" || statusSource === "sql";
  }

  /**
   * Busca un ticket en MySQL; ante error SQL devuelve null sin propagar.
   * @param id - ID del ticket.
   * @returns Ticket de dominio o `null`.
   * @throws Ninguno.
   */
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
   * Carga un ticket por ID con prioridad SQL y fallback a GLPI.
   * @param id - ID del ticket.
   * @returns Ticket encontrado o `null`.
   * @throws Ninguno.
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

  /**
   * Carga previa a `updateStatus`; con `GLPI_STATUS_SOURCE=sql` prioriza MySQL.
   * @param id - ID del ticket.
   * @returns Ticket o `null` si no existe en SQL ni GLPI.
   * @throws Ninguno.
   */
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

  /**
   * Carga previa a asignación o cambio de sede; con `GLPI_ASSIGN_SOURCE=sql` prioriza MySQL.
   * @param id - ID del ticket.
   * @returns Ticket o `null` si no existe en SQL ni GLPI.
   * @throws Ninguno.
   */
  private async findTicketForMutation(id: number): Promise<DomainTicket | null> {
    const assignSource = this.config.get("glpi.assignSource", { infer: true });
    if (assignSource === "sql") {
      const fromSql = await this.tryFindTicketFromSql(id);
      if (fromSql) {
        return fromSql;
      }
      return this.asService((key) => this.ticketsRepo.findById(key, id));
    }
    return this.findTicketById(id);
  }

  /**
   * Refleja en memoria la asignación de técnico sin reconsultar GLPI/MySQL.
   * @param ticket - Ticket cargado antes de persistir.
   * @param technicianId - Técnico asignado.
   * @returns Copia del ticket con técnico y estado actualizados.
   * @throws Ninguno.
   */
  private patchTicketAfterAssign(ticket: DomainTicket, technicianId: number): DomainTicket {
    return {
      ...ticket,
      technicianId,
      status: ticket.status === TICKET_STATUS.NEW ? TICKET_STATUS.ASSIGNED : ticket.status,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Refleja en memoria el cambio de sede sin reconsultar GLPI/MySQL.
   * @param ticket - Ticket cargado antes de persistir.
   * @param locationId - Nueva sede.
   * @returns Copia del ticket con sede actualizada.
   * @throws Ninguno.
   */
  private patchTicketAfterLocationUpdate(
    ticket: DomainTicket,
    locationId: number,
  ): DomainTicket {
    return {
      ...ticket,
      locationId,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Emite correos de asignación/reasignación sin bloquear la respuesta HTTP.
   * @param input - Actores y metadatos del ticket.
   * @returns void
   * @throws Ninguno; los errores se registran en log.
   */
  private emitAssignNotificationEmails(input: {
    user: AuthenticatedUser;
    ticket: DomainTicket;
    technicianId: number;
    previousTechnicianId: number | null;
  }): void {
    void (async () => {
      try {
        const userIds = new Set<number>([input.technicianId, input.user.id]);
        if (input.previousTechnicianId != null) {
          userIds.add(input.previousTechnicianId);
        }

        const usersById = await this.loadUsersByIds(userIds);
        const technicianUser = usersById.get(input.technicianId);
        const assignedBy =
          usersById.get(input.user.id)?.fullName ?? `Usuario ${input.user.id}`;

        if (technicianUser?.email) {
          const payload: TicketAssignedEvent = {
            ticketId: input.ticket.id,
            subject: input.ticket.subject,
            technicianName: technicianUser.fullName,
            assignedBy,
            recipients: [{ name: technicianUser.fullName, email: technicianUser.email }],
          };
          this.events.emit(MAIL_EVENTS.TICKET_ASSIGNED, payload);
        }

        const isReassignment =
          input.previousTechnicianId != null &&
          input.previousTechnicianId !== input.technicianId &&
          input.previousTechnicianId !== input.user.id;

        if (isReassignment && technicianUser) {
          const previousTechnician = usersById.get(input.previousTechnicianId!);
          if (previousTechnician?.email) {
            const payload: TicketReassignedEvent = {
              ticketId: input.ticket.id,
              subject: input.ticket.subject,
              previousTechnicianName: previousTechnician.fullName,
              newTechnicianName: technicianUser.fullName,
              reassignedBy: assignedBy,
              recipients: [
                { name: previousTechnician.fullName, email: previousTechnician.email },
              ],
            };
            this.events.emit(MAIL_EVENTS.TICKET_REASSIGNED, payload);
          }
        }
      } catch (error) {
        this.logger.warn(
          { ticketId: input.ticket.id, err: error },
          `[assign] mail notification failed message=${(error as Error).message}`,
        );
      }
    })();
  }

  /**
   * Obtiene métricas según rol (técnico o solicitante) y fuente configurada.
   * @param user - Usuario autenticado.
   * @returns Métricas agregadas del dashboard.
   * @throws Ninguno; ante error SQL en métricas hace fallback a GLPI.
   */
  async getMetrics(user: AuthenticatedUser): Promise<TicketMetricsResponseDto> {
    if (user.role === "technician") {
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

    return this.getMetricsForRequester(user);
  }

  /**
   * Métricas para solicitantes con fuente SQL o fallback GLPI.
   * @param user - Usuario solicitante autenticado.
   * @returns Métricas de sus tickets y sede.
   * @throws Ninguno.
   */
  private async getMetricsForRequester(
    user: AuthenticatedUser,
  ): Promise<TicketMetricsResponseDto> {
    const metricsSource = this.config.get("glpi.metricsSource", { infer: true });
    if (metricsSource === "sql") {
      try {
        const result = await this.metricsSqlRepo.getMetricsForRequester({
          requesterId: user.id,
          locationId: normalizeLocationId(user.locationId),
        });
        this.logger.info(
          {
            metricsSource: "mysql",
            userId: user.id,
            role: user.role,
            locationId: user.locationId ?? null,
          },
          "[metrics] source=mysql requester",
        );
        return result;
      } catch (error) {
        this.logger.warn(
          {
            metricsSource: "glpi-fallback",
            reason: "sql_error",
            userId: user.id,
            role: user.role,
            err: error,
          },
          `[metrics] source=glpi-fallback requester message=${(error as Error).message}`,
        );
        return this.getMetricsFromGlpiForRequester(user);
      }
    }

    const result = await this.getMetricsFromGlpiForRequester(user);
    this.logger.info(
      {
        metricsSource: "glpi-api",
        configured: metricsSource,
        userId: user.id,
        role: user.role,
      },
      "[metrics] source=glpi-api requester",
    );
    return result;
  }

  /**
   * Calcula métricas de solicitante consultando directamente GLPI.
   * @param user - Usuario solicitante.
   * @returns Métricas derivadas de tickets del requester.
   * @throws Propaga errores de sesión o API GLPI.
   */
  private async getMetricsFromGlpiForRequester(
    user: AuthenticatedUser,
  ): Promise<TicketMetricsResponseDto> {
    const [requesterTickets, locations] = await this.asService(async (key) => {
      const [tickets, locs] = await Promise.all([
        this.ticketsRepo.listRequesterTicketsForMetrics(key, user.id),
        this.catalogService.listLocations(),
      ]);
      return [tickets, locs] as const;
    });

    const myTickets = computeMyTicketsMetrics(requesterTickets);
    const myIncidents = computeTypeMetrics(requesterTickets, "incident");
    const myRequests = computeTypeMetrics(requesterTickets, "request");

    const normalizedLocationId = normalizeLocationId(user.locationId);
    const mySitePool =
      normalizedLocationId != null
        ? requesterTickets.filter(
            (ticket) =>
              normalizeLocationId(ticket.locationId) === normalizedLocationId &&
              isTicketOpen(ticket),
          )
        : [];
    const mySite = normalizedLocationId != null ? computeSiteMetrics(mySitePool) : null;

    const openRequesterTickets = requesterTickets.filter(isTicketOpen);
    const locationIds = new Set<number>();
    for (const ticket of openRequesterTickets) {
      const locationId = normalizeLocationId(ticket.locationId);
      if (locationId != null) {
        locationIds.add(locationId);
      }
    }
    const locationNameById = new Map(
      locations
        .filter((loc) => {
          const id = normalizeLocationId(loc.id);
          return id != null && locationIds.has(id);
        })
        .map((loc) => [normalizeLocationId(loc.id) ?? loc.id, loc.name]),
    );
    const openByLocation = buildOpenByLocationMetrics(openRequesterTickets, locationNameById);

    return {
      myTickets,
      mySite,
      myIncidents,
      myRequests,
      openByLocation,
    };
  }

  /**
   * Calcula métricas de técnico consultando GLPI (asignados, sede, globales).
   * @param user - Técnico autenticado.
   * @returns Métricas de tickets asignados y abiertos por sede.
   * @throws Propaga errores de sesión o API GLPI.
   */
  private async getMetricsFromGlpi(
    user: AuthenticatedUser,
  ): Promise<TicketMetricsResponseDto> {
    const openStatusGlpi = OPEN_STATUSES.map((status) =>
      TicketMapper.mapStatusToGlpi(status),
    );

    const [assignedTickets, locations, mySitePool, globalOpenPool] =
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

        const [assigned, locs, mySiteItems, globalOpenItems] = await Promise.all([
          this.ticketsRepo.listAssignedTicketsForMetrics(key, user.id),
          this.catalogService.listLocations(),
          mySitePromise,
          this.ticketsRepo.listAllOpenTicketsForLocationMetrics(
            key,
            openStatusGlpi,
            METRICS_GLOBAL_OPEN_LIMIT,
          ),
        ]);

        return [assigned, locs, mySiteItems, globalOpenItems] as const;
      });

    const myTickets = computeMyTicketsMetrics(assignedTickets);
    const myIncidents = computeTypeMetrics(assignedTickets, "incident");
    const myRequests = computeTypeMetrics(assignedTickets, "request");
    const mySite = user.locationId != null ? computeSiteMetrics(mySitePool) : null;

    const locationNameById = new Map(
      locations.map((loc) => [normalizeLocationId(loc.id) ?? loc.id, loc.name]),
    );
    const openByLocation = buildOpenByLocationMetrics(globalOpenPool, locationNameById);

    return {
      myTickets,
      mySite,
      myIncidents,
      myRequests,
      openByLocation,
    };
  }

  /**
   * Historial paginado desde MySQL (`GLPI_HISTORY_SOURCE=sql` obligatorio).
   * @param user - Usuario autenticado.
   * @param query - Filtros y paginación.
   * @param meta - Objeto opcional para registrar fuente en cabecera HTTP.
   * @returns Listado paginado de historial.
   * @throws {BusinessException} Si el historial no está configurado en SQL.
   */
  async listHistory(
    user: AuthenticatedUser,
    query: ListTicketsQueryDto,
    meta?: HistoryListMeta,
  ): Promise<TicketListResponseDto> {
    const limit = Math.min(
      Math.max(query.limit ?? TICKETS_HISTORY_DEFAULT_PAGE_SIZE, 1),
      TICKETS_HISTORY_MAX_PAGE_SIZE,
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
      technicianId: query.assignedToMe
        ? user.id
        : query.technicianId ?? undefined,
      locationId: query.locationId ?? undefined,
    };

    const historySource = this.config.get("glpi.historySource", { infer: true });
    if (historySource !== "sql") {
      throw new BusinessException({
        message: "Ticket history requires GLPI_HISTORY_SOURCE=sql",
        code: API_ERROR_CODE.NOT_IMPLEMENTED,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    }

    const sqlResult = await this.historySqlRepo.listHistoryPageAsResponse(filter);

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
  }

  /**
   * Lista tickets activos visibles para el usuario vía API GLPI.
   * @param user - Usuario autenticado.
   * @param query - Filtros y paginación.
   * @returns Listado enriquecido paginado.
   * @throws Propaga errores de sesión o API GLPI.
   */
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

  /**
   * Obtiene un ticket por ID tras validar acceso del usuario.
   * @param user - Usuario autenticado.
   * @param id - ID del ticket.
   * @returns DTO enriquecido del ticket.
   * @throws {BusinessException} Si no existe o no hay permiso.
   */
  async findById(user: AuthenticatedUser, id: number): Promise<TicketResponseDto> {
    const ticket = await this.assertTicketAccess(user, id);
    return this.enrichTicket(ticket);
  }

  /**
   * Carga el ticket y verifica que el usuario pueda acceder.
   * @param user - Usuario autenticado.
   * @param id - ID del ticket.
   * @returns Ticket de dominio si el acceso es válido.
   * @throws {BusinessException} Si no existe o el solicitante no es el dueño.
   */
  async assertTicketAccess(user: AuthenticatedUser, id: number): Promise<DomainTicket> {
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
    return ticket;
  }

  /**
   * Crea un ticket con validación de catálogo, auto-asignación y correo.
   * @param user - Usuario creador (solicitante o técnico).
   * @param dto - Datos del ticket.
   * @returns ID, asunto y estado del envío de correo.
   * @throws {BusinessException} Por categoría, sede, técnico o permisos inválidos.
   */
  async create(user: AuthenticatedUser, dto: CreateTicketDto): Promise<CreateTicketResponseDto> {
    const locationId = dto.locationId ?? normalizeLocationId(user.locationId) ?? undefined;

    const [categories, locations, requesterId, assignment] = await Promise.all([
      this.catalogService.listCategories(),
      locationId
        ? this.catalogService.listLocations()
        : Promise.resolve([] as DomainLocation[]),
      this.resolveRequesterId(user, dto.requesterId),
      this.resolveAssignedTechnicianForCreate(user, dto, locationId),
    ]);

    const assignedTechnicianId = assignment.technicianId;

    this.assertCategoryInList(categories, dto.categoryId);
    if (locationId) {
      this.assertLocationInList(locations, locationId);
    }

    const urgency = UrgencyPolicy.defaultFor(dto.type);
    const statusGlpi = TicketMapper.mapStatusToGlpi(
      assignedTechnicianId ? TICKET_STATUS.ASSIGNED : TICKET_STATUS.NEW,
    );

    const { ticket: created, source: createSource } = await this.applyCreateTicket({
      name: dto.subject,
      content: dto.description,
      type: TicketMapper.mapTypeToGlpi(dto.type),
      status: statusGlpi,
      urgency: TicketMapper.mapUrgencyToGlpi(urgency),
      itilcategories_id: dto.categoryId,
      locations_id: locationId,
      entities_id: this.config.get("glpi.defaultEntity", { infer: true }),
      requesters_id: requesterId,
      technicians_id: assignedTechnicianId,
    });

    this.logger.info(
      {
        createSource,
        ticketId: created.id,
        requesterId,
        technicianId: assignedTechnicianId ?? null,
        assignSource: user.role === "technician" ? "manual" : "sql",
        assignStrategy: assignment.strategy,
        locationId: locationId ?? null,
      },
      "[create] ticket created",
    );

    const categoryName =
      categories.find((category) => category.id === dto.categoryId)?.name ?? null;
    const locationEntry = locationId
      ? locations.find((location) => location.id === locationId)
      : undefined;
    const locationName = locationEntry
      ? locationEntry.name || locationEntry.fullPath
      : null;

    const mailEvent = await this.buildTicketCreatedEvent({
      ticketId: created.id,
      ticketType: dto.type,
      subject: dto.subject,
      description: dto.description,
      requesterId,
      requesterNameFallback: "Solicitante",
      requesterEmailFallback: null,
      technicianId: assignedTechnicianId,
      categoryName,
      locationName,
    });
    this.events.emit(MAIL_EVENTS.TICKET_CREATED, mailEvent);

    return {
      id: created.id,
      subject: created.subject,
      mail: { sent: mailEvent.notify.length > 0, error: null },
    };
  }

  /**
   * Crea un ticket desde correo entrante con técnico por defecto configurado.
   * @param input - Datos normalizados del mensaje inbound.
   * @returns Ticket creado y evento de correo sin emitir aún.
   * @throws {BusinessException} Si el técnico por defecto no es válido.
   */
  async createFromInbound(input: InboundTicketInput): Promise<InboundTicketResponse> {
    const technicianId = this.config.get("mail.inboundDefaultTechnicianId", { infer: true });
    const ticketType: TicketType =
      input.type ??
      this.config.get("mail.inboundDefaultTicketType", { infer: true }) ??
      TICKET_TYPE.REQUEST;
    const normalizedLocationId = normalizeLocationId(input.locationId) ?? undefined;
    const trimmedDescription = input.description.trim();
    const subject = input.categoryName;
    const serviceUserId = this.config.get("glpi.serviceUserId", { infer: true });

    await this.assertInboundTechnicianExists(technicianId, serviceUserId);

    const urgency = UrgencyPolicy.defaultFor(ticketType);
    const { ticket: created, source: createSource } = await this.applyCreateTicket({
      name: subject,
      content: trimmedDescription,
      type: TicketMapper.mapTypeToGlpi(ticketType),
      status: TicketMapper.mapStatusToGlpi(TICKET_STATUS.ASSIGNED),
      urgency: TicketMapper.mapUrgencyToGlpi(urgency),
      itilcategories_id: input.categoryId,
      locations_id: normalizedLocationId,
      entities_id: this.config.get("glpi.defaultEntity", { infer: true }),
      requesters_id: input.requesterId ?? undefined,
      technicians_id: technicianId,
    });

    this.logger.info(
      {
        createSource,
        ticketId: created.id,
        requesterId: input.requesterId,
        technicianId,
        inbound: true,
      },
      "[create] inbound ticket created",
    );

    const mailEvent = await this.buildTicketCreatedEvent({
      ticketId: created.id,
      ticketType,
      subject,
      description: trimmedDescription,
      requesterId: input.requesterId,
      requesterNameFallback: input.requesterName,
      requesterEmailFallback: input.requesterEmail,
      technicianId,
      categoryName: input.categoryName,
      locationName: null,
    });

    return {
      id: created.id,
      subject,
      type: ticketType,
      mailEvent,
    };
  }

  /**
   * Resuelve destinatario de correo desde GLPI, fallback o LDAP.
   * @param domainUser - Usuario GLPI o `null`.
   * @param fallbackEmail - Correo alternativo si falta en GLPI.
   * @returns Destinatario con nombre y email o `null`.
   * @throws Ninguno.
   */
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

  /**
   * Actualiza estado con validación de transición, nota de resolución y correo.
   * @param user - Usuario que realiza el cambio.
   * @param id - ID del ticket.
   * @param status - Estado destino.
   * @param resolutionNote - Nota obligatoria al marcar resuelto (técnicos).
   * @returns ID y estado confirmado.
   * @throws {BusinessException} Por permisos, transición inválida o verificación GLPI fallida.
   */
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
   * Aplica cambio de estado en SQL o GLPI según `GLPI_STATUS_SOURCE`.
   * @param ticketId - ID del ticket.
   * @param statusGlpi - Código de estado GLPI.
   * @param resolutionNote - Nota a concatenar o `null`.
   * @returns Origen efectivo de la escritura (`mysql` o `glpi-api`).
   * @throws Propaga errores de API GLPI si SQL falla y el fallback también.
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

  /**
   * Verifica que el estado se aplicó leyendo SQL o GLPI según configuración.
   * @param ticketId - ID del ticket.
   * @param previousTicket - Snapshot previo para fusionar campos.
   * @param source - Origen de la escritura (`mysql` o `glpi-api`).
   * @returns Ticket actualizado con el nuevo estado.
   * @throws {BusinessException} Si no se puede verificar tras la actualización.
   */
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

  /**
   * Asigna un técnico al ticket y emite correos de asignación/reasignación.
   * @param user - Técnico que ejecuta la asignación.
   * @param ticketId - ID del ticket.
   * @param technicianId - ID del técnico destino.
   * @returns Ticket enriquecido tras la asignación.
   * @throws {BusinessException} Si el ticket o técnico no son válidos.
   */
  async assignTechnician(
    user: AuthenticatedUser,
    ticketId: number,
    technicianId: number,
  ): Promise<TicketResponseDto> {
    await this.assertTechnicianExists(technicianId);
    const ticket = await this.findTicketForMutation(ticketId);
    if (!ticket) {
      throw new BusinessException({
        message: `Ticket ${ticketId} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    const previousTechnicianId = ticket.technicianId;

    const assignSource = await this.applyAssignTechnician(ticketId, technicianId);
    this.logger.info({ assignSource, ticketId, technicianId }, "[assign] technician assigned");

    const enriched = await this.enrichTicket(this.patchTicketAfterAssign(ticket, technicianId));

    this.emitAssignNotificationEmails({
      user,
      ticket,
      technicianId,
      previousTechnicianId,
    });

    return enriched;
  }

  /**
   * Actualiza la sede del ticket validando el catálogo de locations.
   * @param user - Técnico autenticado.
   * @param ticketId - ID del ticket.
   * @param locationId - Nueva sede.
   * @returns Ticket enriquecido con la sede actualizada.
   * @throws {BusinessException} Si el ticket o la sede no son válidos.
   */
  async updateLocation(
    user: AuthenticatedUser,
    ticketId: number,
    locationId: number,
  ): Promise<TicketResponseDto> {
    const [ticket, locations] = await Promise.all([
      this.findTicketForMutation(ticketId),
      this.catalogService.listLocations(),
    ]);
    if (!ticket) {
      throw new BusinessException({
        message: `Ticket ${ticketId} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    this.assertLocationInList(locations, locationId);

    const locationSource = await this.applyUpdateLocation(ticketId, locationId);
    this.logger.info({ locationSource, ticketId, locationId }, "[location] ticket location updated");

    return this.enrichTicket(this.patchTicketAfterLocationUpdate(ticket, locationId));
  }

  /**
   * Persiste un ticket nuevo en SQL o GLPI según `GLPI_CREATE_SOURCE`.
   * @param input - Payload de creación en formato GLPI.
   * @returns Ticket creado y origen de escritura.
   * @throws Propaga errores SQL/GLPI si ambos fallan.
   */
  private async applyCreateTicket(input: {
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
  }): Promise<{ ticket: DomainTicket; source: TicketCreateSource }> {
    const createSource = this.config.get("glpi.createSource", { infer: true });

    if (createSource === "sql") {
      try {
        const created = await this.createSqlRepo.create(input);
        return { ticket: created, source: "mysql" };
      } catch (error) {
        this.logger.warn(
          { createSource: "glpi-fallback", reason: "sql_error", err: error },
          `[create] source=glpi-fallback message=${(error as Error).message}`,
        );
      }
    }

    const created = await this.asService((key) => this.ticketsRepo.create(key, input));
    return { ticket: created, source: "glpi-api" };
  }

  /**
   * Asigna técnico en SQL o GLPI según `GLPI_ASSIGN_SOURCE`.
   * @param ticketId - ID del ticket.
   * @param technicianId - ID del técnico.
   * @returns Origen efectivo (`mysql` o `glpi-api`).
   * @throws Propaga errores de API GLPI si SQL no actualiza filas.
   */
  private async applyAssignTechnician(
    ticketId: number,
    technicianId: number,
  ): Promise<TicketAssignSource> {
    const assignSource = this.config.get("glpi.assignSource", { infer: true });

    if (assignSource === "sql") {
      try {
        const updated = await this.createSqlRepo.assignTechnician(ticketId, technicianId);
        if (updated) {
          return "mysql";
        }
        this.logger.warn(
          { assignSource: "glpi-fallback", reason: "sql_no_rows", ticketId, technicianId },
          "[assign] source=glpi-fallback reason=sql_no_rows",
        );
      } catch (error) {
        this.logger.warn(
          { assignSource: "glpi-fallback", reason: "sql_error", ticketId, err: error },
          `[assign] source=glpi-fallback message=${(error as Error).message}`,
        );
      }
    }

    await this.asService((key) => this.ticketsRepo.assignTechnician(key, ticketId, technicianId));
    return "glpi-api";
  }

  /**
   * Actualiza sede en SQL o GLPI reutilizando `GLPI_ASSIGN_SOURCE`.
   * @param ticketId - ID del ticket.
   * @param locationId - Nueva sede.
   * @returns Origen efectivo (`mysql` o `glpi-api`).
   * @throws Propaga errores de API GLPI si SQL no actualiza filas.
   */
  private async applyUpdateLocation(
    ticketId: number,
    locationId: number,
  ): Promise<TicketLocationSource> {
    const assignSource = this.config.get("glpi.assignSource", { infer: true });

    if (assignSource === "sql") {
      try {
        const updated = await this.createSqlRepo.updateLocation(ticketId, locationId);
        if (updated) {
          return "mysql";
        }
        this.logger.warn(
          { locationSource: "glpi-fallback", reason: "sql_no_rows", ticketId, locationId },
          "[location] source=glpi-fallback reason=sql_no_rows",
        );
      } catch (error) {
        this.logger.warn(
          { locationSource: "glpi-fallback", reason: "sql_error", ticketId, err: error },
          `[location] source=glpi-fallback message=${(error as Error).message}`,
        );
      }
    }

    await this.asService((key) => this.ticketsRepo.updateLocation(key, ticketId, locationId));
    return "glpi-api";
  }

  /**
   * Resuelve el ID del solicitante permitiendo override solo a técnicos.
   * @param user - Usuario creador.
   * @param requested - ID solicitado opcional.
   * @returns ID del solicitante efectivo.
   * @throws {BusinessException} Si un no-técnico pide otro usuario o no existe.
   */
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

  /**
   * Obtiene el nombre visible de un usuario para correos y logs.
   * @param userId - ID del actor en GLPI.
   * @returns Nombre completo o etiqueta `Usuario {id}`.
   * @throws Ninguno.
   */
  private async resolveActorDisplayName(userId: number): Promise<string> {
    const actor = await this.asService((key) => this.usersRepo.findById(key, userId));
    return actor?.fullName ?? `Usuario ${userId}`;
  }

  /**
   * Valida que la categoría exista en el catálogo cargado.
   * @param categories - Lista de categorías válidas.
   * @param categoryId - ID a validar.
   * @returns Nada si es válida.
   * @throws {BusinessException} Si la categoría no está en la lista.
   */
  private assertCategoryInList(categories: DomainCategory[], categoryId: number): void {
    if (!categories.some((category) => category.id === categoryId)) {
      throw new BusinessException({
        message: `Category ${categoryId} is not valid`,
        code: API_ERROR_CODE.INVALID_CATEGORY,
      });
    }
  }

  /**
   * Convierte filtros `status` o `statuses` del query a códigos GLPI.
   * @param query - Parámetros de listado.
   * @returns Array de estados GLPI o `undefined` si no hay filtro.
   * @throws Ninguno.
   */
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

  /**
   * Valida que la sede exista en el catálogo cargado.
   * @param locations - Lista de sedes válidas.
   * @param locationId - ID a validar.
   * @returns Nada si es válida.
   * @throws {BusinessException} Si la sede no está en la lista.
   */
  private assertLocationInList(locations: DomainLocation[], locationId: number): void {
    if (!locations.some((location) => location.id === locationId)) {
      throw new BusinessException({
        message: `Location ${locationId} is not valid`,
        code: API_ERROR_CODE.INVALID_LOCATION,
      });
    }
  }

  /**
   * Determina técnico y estrategia de auto-asignación al crear ticket.
   * @param user - Usuario creador.
   * @param dto - DTO con asignación manual opcional.
   * @param locationId - Sede efectiva del ticket.
   * @returns ID de técnico y estrategia aplicada.
   * @throws {BusinessException} Si el técnico manual o fallback no es válido.
   */
  private async resolveAssignedTechnicianForCreate(
    user: AuthenticatedUser,
    dto: CreateTicketDto,
    locationId: number | undefined,
  ): Promise<ResolvedTicketAssignment> {
    if (user.role === "technician") {
      if (dto.assignedTechnicianId) {
        await this.assertTechnicianExists(dto.assignedTechnicianId);
      }
      return {
        technicianId: dto.assignedTechnicianId,
        strategy: "manual",
      };
    }

    const normalizedLocationId = normalizeLocationId(locationId);
    const strategy: TicketAutoAssignStrategy =
      normalizedLocationId != null ? "site-last" : "global-last";
    const technician = await this.usersService.resolveLastTechnicianForLocation(
      normalizedLocationId,
    );

    if (technician) {
      await this.assertTechnicianExists(technician.id);
      return {
        technicianId: technician.id,
        strategy,
      };
    }

    const fallbackTechnicianId = this.config.get("mail.inboundDefaultTechnicianId", {
      infer: true,
    });
    await this.assertAutoAssignFallbackTechnician(fallbackTechnicianId);

    return {
      technicianId: fallbackTechnicianId,
      strategy: "fallback-asistia",
    };
  }

  /**
   * Valida que el técnico fallback de auto-asignación exista en GLPI.
   * @param technicianId - ID del técnico configurado.
   * @returns Nada si existe.
   * @throws {BusinessException} Si el técnico no existe.
   */
  private async assertAutoAssignFallbackTechnician(technicianId: number): Promise<void> {
    const technician = await this.asService((key) => this.usersRepo.findById(key, technicianId));
    if (!technician) {
      throw new BusinessException({
        message: `Technician ${technicianId} is not valid`,
        code: API_ERROR_CODE.INVALID_TECHNICIAN,
      });
    }
  }

  /**
   * Verifica que el ID corresponda a un técnico elegible en Asistia.
   * @param technicianId - ID del técnico.
   * @returns Nada si es elegible.
   * @throws {BusinessException} Si no es un técnico válido.
   */
  private async assertTechnicianExists(technicianId: number): Promise<void> {
    const isEligible = await this.usersService.isEligibleTechnician(technicianId);
    if (!isEligible) {
      throw new BusinessException({
        message: `Technician ${technicianId} is not valid`,
        code: API_ERROR_CODE.INVALID_TECHNICIAN,
      });
    }
  }

  /**
   * Valida técnico inbound; relaja reglas si coincide con usuario de servicio.
   * @param technicianId - ID del técnico por defecto inbound.
   * @param serviceUserId - ID del usuario de servicio GLPI o `null`.
   * @returns Nada si es válido.
   * @throws {BusinessException} Si el técnico no existe o no es elegible.
   */
  private async assertInboundTechnicianExists(
    technicianId: number,
    serviceUserId: number | null,
  ): Promise<void> {
    if (serviceUserId !== null && technicianId === serviceUserId) {
      const technician = await this.asService((key) => this.usersRepo.findById(key, technicianId));
      if (!technician) {
        throw new BusinessException({
          message: `Technician ${technicianId} is not valid`,
          code: API_ERROR_CODE.INVALID_TECHNICIAN,
        });
      }
      return;
    }

    await this.assertTechnicianExists(technicianId);
  }

  /**
   * Arma el evento de correo `TICKET_CREATED` con destinatarios resueltos.
   * @param input - Metadatos del ticket y actores.
   * @returns Payload listo para emitir por EventEmitter.
   * @throws Ninguno.
   */
  private async buildTicketCreatedEvent(input: {
    ticketId: number;
    ticketType: TicketType;
    subject: string;
    description: string;
    requesterId: number | null;
    requesterNameFallback: string;
    requesterEmailFallback: string | null;
    technicianId?: number;
    categoryName: string | null;
    locationName: string | null;
  }): Promise<TicketCreatedEvent> {
    const mailUserIds = new Set<number>();
    if (input.requesterId) {
      mailUserIds.add(input.requesterId);
    }
    if (input.technicianId) {
      mailUserIds.add(input.technicianId);
    }
    const usersById = await this.loadUsersByIds(mailUserIds);

    const notify: TicketCreatedRecipient[] = [];
    const requesterRecipient = await this.resolveMailRecipient(
      input.requesterId ? usersById.get(input.requesterId) ?? null : null,
      input.requesterEmailFallback,
    );
    if (requesterRecipient) {
      notify.push({ ...requesterRecipient, role: "requester" });
    }

    const technicianRecipient = await this.resolveMailRecipient(
      input.technicianId ? usersById.get(input.technicianId) ?? null : null,
    );
    if (
      technicianRecipient &&
      technicianRecipient.email.toLowerCase() !== requesterRecipient?.email.toLowerCase()
    ) {
      notify.push({ ...technicianRecipient, role: "technician" });
    }

    return {
      ticketId: input.ticketId,
      type: TICKET_TYPE_LABELS[input.ticketType],
      subject: input.subject,
      description: input.description,
      requesterName:
        (input.requesterId ? usersById.get(input.requesterId)?.fullName : null) ??
        input.requesterNameFallback,
      technicianName: input.technicianId
        ? usersById.get(input.technicianId)?.fullName ?? null
        : null,
      categoryName: input.categoryName,
      locationName: input.locationName,
      notify,
    };
  }

  /**
   * Enriquece un único ticket con usuarios, categoría y sede.
   * @param ticket - Ticket de dominio.
   * @returns DTO de respuesta enriquecido.
   * @throws Propaga errores de catálogo o GLPI al cargar usuarios.
   */
  private async enrichTicket(ticket: DomainTicket): Promise<TicketResponseDto> {
    const { items } = await this.enrichTicketsWithUsers([ticket]);
    return items[0];
  }

  /**
   * Enriquece una lista de tickets para la API.
   * @param tickets - Tickets de dominio.
   * @returns Lista de DTOs enriquecidos.
   * @throws Propaga errores de catálogo o GLPI.
   */
  private async enrichTickets(tickets: DomainTicket[]): Promise<TicketResponseDto[]> {
    const { items } = await this.enrichTicketsWithUsers(tickets);
    return items;
  }

  /**
   * Carga catálogos y usuarios necesarios y mapea tickets a DTOs.
   * @param tickets - Tickets a enriquecer.
   * @returns DTOs y mapa de usuarios cargados.
   * @throws Propaga errores de catálogo o GLPI.
   */
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

  /**
   * Carga usuarios GLPI por conjunto de IDs en una sesión de servicio.
   * @param userIds - IDs únicos a resolver.
   * @returns Mapa id → usuario de dominio.
   * @throws Propaga errores de sesión o API GLPI.
   */
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

  /**
   * Mapea un ticket de dominio a DTO de respuesta con datos ya cargados.
   * @param ticket - Ticket de dominio.
   * @param usersById - Usuarios precargados por ID.
   * @param categories - Categorías del catálogo.
   * @param locations - Sedes del catálogo.
   * @returns DTO listo para serializar en la API.
   * @throws Ninguno.
   */
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
