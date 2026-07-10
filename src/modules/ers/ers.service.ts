/**
 * @file ers.service.ts
 * @description Orquesta reglas de negocio del módulo ERS (transacciones 1 y 2).
 */
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { AppConfig } from "../../config/configuration";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { hasTechnicianAccess } from "../../common/utils/auth-access";
import { CatalogService } from "../catalog/catalog.service";
import { ErsHistoryService } from "../ers-history/ers-history.service";
import { LocationsSqlRepository } from "../glpi/repositories/locations.sql-repository";
import { UsersTechniciansSqlRepository } from "../glpi/repositories/users-technicians.sql-repository";
import type { DomainLocation } from "../glpi/mappers/location.mapper";
import { TicketMapper } from "../glpi/mappers/ticket.mapper";
import { isTiGroupName, normalizeRoleToken } from "../glpi/role.utils";
import {
  MAIL_EVENTS,
  type ErsClosedEvent,
  type ErsCreatedEvent,
  type ErsCreatedOrigin,
  type ErsEscalatedEvent,
  type ErsTeamAssignedEvent,
  type MailRecipient,
} from "../mail/mail.events";
import type { EscalarTicketDto } from "./dto/escalar-ticket.dto";
import type { CreateErsDto } from "./dto/create-ers.dto";
import type { GetErsExecutionOrderQueryDto } from "./dto/get-execution-order-query.dto";
import type { ListErsQueryDto } from "./dto/list-ers-query.dto";
import type { ListErsEligibleTicketsQueryDto } from "./dto/list-ers-eligible-tickets-query.dto";
import type { ListErsTechniciansQueryDto } from "./dto/list-ers-technicians-query.dto";
import type { UpdateErsDto } from "./dto/update-ers.dto";
import { ErsSqlRepository } from "./repositories/ers.sql-repository";
import type {
  ErsDetail,
  ErsExecutionOrderSuggestion,
  ErsProjectState,
  ErsProjectType,
  ErsTask,
  ErsTeamMember,
  ErsTechnician,
} from "./ers.types";

/** Evento de historial derivado del diff de tareas. */
interface ErsTaskHistoryEvent {
  actionType: "create" | "update" | "delete";
  summary: string;
  metadata?: Record<string, unknown>;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
}

/** Servicio de reglas de negocio para ERS. */
@Injectable()
export class ErsService {
  private readonly logger = new Logger(ErsService.name);

  constructor(
    private readonly ersSqlRepository: ErsSqlRepository,
    private readonly usersTechniciansSqlRepository: UsersTechniciansSqlRepository,
    private readonly locationsSqlRepository: LocationsSqlRepository,
    private readonly catalogService: CatalogService,
    private readonly ersHistoryService: ErsHistoryService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly events: EventEmitter2,
  ) {}

  /** Crea un ticket técnico cerrado y su proyecto ERS completo de forma atómica. */
  async createStandalone(user: AuthenticatedUser, dto: CreateErsDto): Promise<ErsDetail> {
    if (!hasTechnicianAccess(user)) {
      throw new BusinessException({
        message: "Solo usuarios TI pueden crear proyectos ERS",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }
    dto.requestType = this.validateRequestType(dto.requestType);
    this.assertPriorityAndExecutionOrderAllowedOnCreate(user, dto);
    if (!dto.approved && dto.tasks.length > 0) {
      throw new BusinessException({
        message: "El proyecto debe estar aprobado para crear tareas",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }
    if (
      dto.tasks.some(
        (task) =>
          !task.name.trim() ||
          !(task.content ?? "").trim() ||
          !task.projectStateId ||
          !task.userId ||
          !task.planStartDate ||
          !task.planEndDate,
      )
    ) {
      throw new BusinessException({
        message: "Las tareas deben incluir nombre, descripción, estado, responsable y fechas",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    await this.assertProjectTypeValid(dto.projectTypeId);

    const [requester, locations] = await Promise.all([
      this.usersTechniciansSqlRepository.findById(dto.requesterId),
      this.locationsSqlRepository.listLocationsWithActiveUsers(),
    ]);
    if (!requester?.isActive) {
      throw new BusinessException({
        message: "El solicitante seleccionado no existe o no está activo",
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.BAD_REQUEST,
      });
    }
    if (!locations.some((location) => location.id === dto.locationId)) {
      throw new BusinessException({
        message: "La sede seleccionada no existe o no está disponible",
        code: API_ERROR_CODE.INVALID_LOCATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    const defaultEntityId: number = this.config.get("glpi.defaultEntity", { infer: true });
    const entityId: number = requester.entityId ?? defaultEntityId;
    await this.assertExecutionOrderAvailable(dto.locationId, dto.executionOrder);

    const [siteTechnicianIds, activeTechnicianIds] = await Promise.all([
      this.resolveTechnicianIdsByLocation(dto.locationId),
      this.resolveTechnicianIdsByLocation(null),
    ]);
    const teamMemberIds = this.uniquePositive(dto.teamMemberIds);
    const validTeamMemberIds = new Set(
      teamMemberIds.filter((id) => activeTechnicianIds.has(id)),
    );
    const invalidTechnicianIds = this.uniquePositive([
      ...(dto.approverId && dto.approverId !== user.id && !siteTechnicianIds.has(dto.approverId)
        ? [dto.approverId]
        : []),
      ...teamMemberIds.filter((id) => !activeTechnicianIds.has(id)),
      ...dto.tasks.flatMap((task) =>
        task.userId &&
        !siteTechnicianIds.has(task.userId) &&
        !validTeamMemberIds.has(task.userId)
          ? [task.userId]
          : [],
      ),
    ]);
    if (invalidTechnicianIds.length > 0) {
      throw new BusinessException({
        message: "Algunos usuarios seleccionados no son técnicos válidos para la sede",
        code: API_ERROR_CODE.INVALID_TECHNICIAN,
        status: HttpStatus.BAD_REQUEST,
        details: { invalidTechnicianIds },
      });
    }

    try {
      const created = await this.ersSqlRepository.createStandaloneProject(dto, {
        actorId: user.id,
        entityId,
        ticketType: TicketMapper.mapTypeToGlpi(
          this.config.get("ers.ticketType", { infer: true }),
        ),
      });
      const detail = await this.ersSqlRepository.findByProjectId(created.projectId);
      if (!detail) throw new Error("created_project_not_found");

      await this.registerHistorySafe({
        projectId: detail.projectId,
        actionType: "create",
        summary: `Se creó el proyecto ERS "${detail.projectName}" y el ticket técnico #${created.ticketId}.`,
        actorUserId: user.id,
        metadata: { ticketId: created.ticketId, projectName: detail.projectName },
        beforeState: null,
        afterState: this.toHistoryState(detail),
      });
      this.emitErsCreationMailEvents(detail, "standalone");
      this.emitErsTeamAssignedMailEvent(detail.projectId, detail.projectName, detail.team, user.id);
      return detail;
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      throw new BusinessException({
        message: "No se pudo crear el ticket y proyecto ERS",
        code: API_ERROR_CODE.UNKNOWN,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    }
  }

  /**
   * Transacción 1: escala ticket a proyecto y cierra ticket al final.
   * @param user - Usuario autenticado.
   * @param dto - Estado completo del ERS.
   * @returns Detalle del ERS creado.
   */
  async escalate(user: AuthenticatedUser, dto: EscalarTicketDto): Promise<ErsDetail> {
    const context = await this.ersSqlRepository.findTicketEscalationContext(dto.ticketId);
    if (!context) {
      throw new BusinessException({
        message: `No se encontró el ticket ${dto.ticketId}`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    if (!hasTechnicianAccess(user)) {
      throw new BusinessException({
        message: "Solo usuarios TI pueden escalar tickets a ERS",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }

    if ([5, 6].includes(context.status)) {
      throw new BusinessException({
        message: 'Solo se pueden escalar tickets activos',
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    dto.requestType = this.validateRequestType(dto.requestType);
    this.assertPriorityAndExecutionOrderAllowedOnCreate(user, dto);
    if (!dto.approved && dto.tasks.length > 0) {
      throw new BusinessException({
        message: "El proyecto debe estar aprobado para crear tareas",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }
    if (
      dto.tasks.some(
        (task) =>
          !task.name.trim() ||
          !(task.content ?? "").trim() ||
          !task.projectStateId ||
          !task.userId ||
          !task.planStartDate ||
          !task.planEndDate,
      )
    ) {
      throw new BusinessException({
        message: "Las tareas deben incluir nombre, descripción, estado, responsable y fechas",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    await this.assertProjectTypeValid(dto.projectTypeId);
    await this.assertExecutionOrderAvailable(context.locationId, dto.executionOrder);

    const [siteTechnicianIds, activeTechnicianIds] = await Promise.all([
      this.resolveTechnicianIdsByLocation(context.locationId),
      this.resolveTechnicianIdsByLocation(null),
    ]);
    const teamMemberIds = this.uniquePositive(dto.teamMemberIds);
    const validTeamMemberIds = new Set(
      teamMemberIds.filter((id) => activeTechnicianIds.has(id)),
    );
    const invalidTechnicianIds = this.uniquePositive([
      ...(dto.approverId && dto.approverId !== user.id && !siteTechnicianIds.has(dto.approverId)
        ? [dto.approverId]
        : []),
      ...teamMemberIds.filter((id) => !activeTechnicianIds.has(id)),
      ...dto.tasks.flatMap((task) =>
        task.userId &&
        !siteTechnicianIds.has(task.userId) &&
        !validTeamMemberIds.has(task.userId)
          ? [task.userId]
          : [],
      ),
    ]);
    if (invalidTechnicianIds.length > 0) {
      throw new BusinessException({
        message: "Algunos usuarios seleccionados no son técnicos válidos para la sede",
        code: API_ERROR_CODE.INVALID_TECHNICIAN,
        status: HttpStatus.BAD_REQUEST,
        details: { invalidTechnicianIds },
      });
    }

    try {
      const projectId = await this.ersSqlRepository.escalateTicketToProject(dto, user.id, context);
      const detail = await this.ersSqlRepository.findByProjectId(projectId);
      if (!detail) {
        throw new BusinessException({
          message: "Se creó el proyecto ERS pero no se pudo cargar",
          code: API_ERROR_CODE.UNKNOWN,
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        });
      }
      await this.registerHistorySafe({
        projectId,
        actionType: "create",
        summary: `Se creó el proyecto ERS "${detail.projectName}" a partir del ticket #${detail.ticketId}.`,
        actorUserId: user.id,
        metadata: {
          ticketId: detail.ticketId,
          projectName: detail.projectName,
        },
        beforeState: null,
        afterState: this.toHistoryState(detail),
      });
      this.emitErsCreationMailEvents(detail, "escalated");
      this.emitErsTeamAssignedMailEvent(detail.projectId, detail.projectName, detail.team, user.id);
      return detail;
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      if ((error as Error).message === 'ticket_not_eligible') {
        throw new BusinessException({
          message: 'El ticket ya no está disponible para escalar',
          code: API_ERROR_CODE.CONFLICT,
          status: HttpStatus.CONFLICT,
        });
      }
      if ((error as Error).message === "ticket_already_scaled") {
        throw new BusinessException({
          message: "El ticket ya está vinculado a un proyecto ERS",
          code: API_ERROR_CODE.CONFLICT,
          status: HttpStatus.CONFLICT,
        });
      }
      throw new BusinessException({
        message: "No se pudo completar la transacción de escalado ERS",
        code: API_ERROR_CODE.UNKNOWN,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    }
  }

  /**
   * Lista ERS con alcance por rol.
   * @param user - Usuario autenticado.
   * @param query - Filtros y paginación.
   * @returns Lista paginada.
   */
  async list(user: AuthenticatedUser, query: ListErsQueryDto) {
    return this.ersSqlRepository.listAllProjects(query, {
      userId: user.id,
      role: hasTechnicianAccess(user) ? "technician" : user.role,
    });
  }

  async metrics(user: AuthenticatedUser) {
    return this.ersSqlRepository.getMetrics(user.id, user.locationId);
  }

  async listEligibleTickets(query: ListErsEligibleTicketsQueryDto) {
    return this.ersSqlRepository.listEligibleTickets(
      query.search,
      query.page ?? 1,
      query.limit ?? 15,
    );
  }

  /**
   * Obtiene detalle de ERS por proyecto.
   * @param user - Usuario autenticado.
   * @param projectId - ID del proyecto.
   * @returns Detalle del ERS.
   */
  async findByProjectId(user: AuthenticatedUser, projectId: number): Promise<ErsDetail> {
    const detail = await this.ersSqlRepository.findByProjectId(projectId);
    if (!detail) {
      throw new BusinessException({
        message: `No se encontró el proyecto ERS ${projectId}`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    if (!hasTechnicianAccess(user) && detail.requesterId !== user.id) {
      throw new BusinessException({
        message: "Solo puedes ver tus propios proyectos ERS",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }
    return detail;
  }

  /**
   * Transacción 2: guardado TI de aprobador/estado/equipo/tareas.
   * @param user - Usuario autenticado.
   * @param projectId - Proyecto a editar.
   * @param dto - Estado completo de edición TI.
   * @returns Detalle actualizado.
   */
  async saveTiEdition(
    user: AuthenticatedUser,
    projectId: number,
    dto: UpdateErsDto,
  ): Promise<ErsDetail> {
    if (!hasTechnicianAccess(user)) {
      throw new BusinessException({
        message: "Solo los técnicos pueden editar datos TI de ERS",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }

    dto.requestType = this.validateRequestType(dto.requestType);

    await this.assertProjectTypeValid(dto.projectTypeId);

    const uniqueTeamIds = this.uniquePositive(dto.teamMemberIds);
    if (uniqueTeamIds.length !== dto.teamMemberIds.length) {
      dto.teamMemberIds = uniqueTeamIds;
    }

    const previousDetail = await this.ersSqlRepository.findByProjectId(projectId);
    if (!dto.approved && dto.tasks.length > (previousDetail?.tasks.length ?? 0)) {
      throw new BusinessException({
        message: "El proyecto debe estar aprobado para crear tareas",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    if (!user.isSuperAdmin && previousDetail) {
      if (dto.priority !== previousDetail.priority) {
        throw new BusinessException({
          message: "Solo un superadmin puede modificar la prioridad TI",
          code: API_ERROR_CODE.FORBIDDEN,
          status: HttpStatus.FORBIDDEN,
        });
      }
      if ((dto.executionOrder ?? null) !== previousDetail.executionOrder) {
        throw new BusinessException({
          message: "Solo un superadmin puede modificar el orden de ejecución",
          code: API_ERROR_CODE.FORBIDDEN,
          status: HttpStatus.FORBIDDEN,
        });
      }
    }

    if (dto.executionOrder !== undefined && dto.executionOrder !== previousDetail?.executionOrder) {
      await this.assertExecutionOrderAvailable(
        previousDetail?.locationId ?? null,
        dto.executionOrder,
        projectId,
      );
    }

    const ok = await this.ersSqlRepository.saveTiEdition(projectId, user.id, dto);
    if (!ok) {
      throw new BusinessException({
        message: `No se encontró el proyecto ERS ${projectId}`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }
    const updatedDetail = await this.findByProjectId(user, projectId);
    await this.registerHistoryForEdition({
      userId: user.id,
      projectId,
      previous: previousDetail,
      current: updatedDetail,
    });

    await this.emitErsEditionMailEvents(user.id, previousDetail, updatedDetail);

    return updatedDetail;
  }

  /**
   * Detecta altas de equipo y transición a estado finalizado tras una edición TI, y dispara los correos correspondientes.
   * @param actorUserId - ID del usuario que realizó la edición.
   * @param previous - Detalle del proyecto ERS antes de la edición (`null` si no existía).
   * @param current - Detalle del proyecto ERS después de la edición.
   */
  private async emitErsEditionMailEvents(
    actorUserId: number,
    previous: ErsDetail | null,
    current: ErsDetail,
  ): Promise<void> {
    const previousTeamIds = new Set((previous?.team ?? []).map((member) => member.userId));
    const newMembers = current.team.filter((member) => !previousTeamIds.has(member.userId));
    this.emitErsTeamAssignedMailEvent(current.projectId, current.projectName, newMembers, actorUserId);

    if (previous?.projectStateId === current.projectStateId) return;

    try {
      const states = await this.ersSqlRepository.listProjectStates();
      const statesById = new Map(states.map((state) => [state.id, state]));
      const wasFinished = previous?.projectStateId
        ? statesById.get(previous.projectStateId)?.isFinished ?? false
        : false;
      const currentState = current.projectStateId ? statesById.get(current.projectStateId) : null;
      if (!wasFinished && currentState?.isFinished) {
        this.emitErsClosedMailEvent(current, currentState.name);
      }
    } catch (error) {
      this.logger.warn(
        `[ers-closed] failed to resolve project states for project ${current.projectId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Lista estados de proyecto.
   * @returns Catálogo de estados.
   */
  async listProjectStates(): Promise<ErsProjectState[]> {
    return this.ersSqlRepository.listProjectStates();
  }

  /** Lista los tipos de proyecto disponibles como sistemas relacionados. */
  async listProjectTypes(): Promise<ErsProjectType[]> {
    return this.ersSqlRepository.listProjectTypes();
  }

  /** Lista tipos de requerimiento configurados para ERS. */
  async listRequestTypes(): Promise<string[]> {
    return this.config.get("ers.requestTypes", { infer: true });
  }

  /**
   * Lista técnicos GLPI filtrables por sede.
   * @param query - Parámetros de búsqueda.
   * @returns Resultado paginado.
   */
  async listTechniciansByLocation(
    query: ListErsTechniciansQueryDto,
  ): Promise<{ items: ErsTechnician[]; total: number; page: number; limit: number }> {
    const tiGroupIds = await this.resolveTiGroupIds();
    const [all, locations] = await Promise.all([
      this.usersTechniciansSqlRepository.listEligibleTechniciansForLocation(
        tiGroupIds,
        query.locationId ?? null,
      ),
      this.locationsSqlRepository.listLocationsWithActiveUsers(),
    ]);
    const locationNames = new Map(
      locations.map((location) => [location.id, location.fullPath || location.name]),
    );
    const activeTechnicians = all.filter((user) => user.isActive);

    const search = (query.search ?? "").trim().toLowerCase();
    const filtered = search
      ? activeTechnicians.filter((user) => {
          const full = `${user.id} ${user.fullName} ${user.login}`.toLowerCase();
          return full.includes(search);
        })
      : activeTechnicians;

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, query.limit ?? 50);
    const start = (page - 1) * limit;
    const items: ErsTechnician[] = filtered.slice(start, start + limit).map((user) => ({
      id: user.id,
      fullName: user.fullName,
      locationId: user.locationId,
      locationName: user.locationId ? locationNames.get(user.locationId) ?? null : null,
    }));

    return {
      items,
      total: filtered.length,
      page,
      limit,
    };
  }

  /** Lista solicitantes activos directamente desde MySQL de GLPI. */
  async listRequesters(
    query: ListErsTechniciansQueryDto,
  ): Promise<{ items: ErsTechnician[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, query.limit ?? 50);
    const [result, locations] = await Promise.all([
      this.usersTechniciansSqlRepository.searchActiveUsers(query.search, page, limit),
      this.locationsSqlRepository.listLocationsWithActiveUsers(),
    ]);
    const locationNames = new Map(
      locations.map((location) => [location.id, location.fullPath || location.name]),
    );

    return {
      items: result.items.map((user) => ({
        id: user.id,
        fullName: user.fullName,
        locationId: user.locationId,
        locationName: user.locationId ? locationNames.get(user.locationId) ?? null : null,
      })),
      total: result.total,
      page,
      limit,
    };
  }

  /** Lista sedes con usuarios activos directamente desde MySQL de GLPI. */
  async listFilterLocations(): Promise<DomainLocation[]> {
    return this.locationsSqlRepository.listLocationsWithActiveUsers();
  }

  /**
   * Lista los órdenes de ejecución usados en una sede y sugiere el primer entero libre.
   * @param query - Sede a consultar y proyecto a excluir (edición del propio proyecto).
   * @returns Proyectos con orden asignado en esa sede y el próximo número libre.
   */
  async listExecutionOrders(query: GetErsExecutionOrderQueryDto): Promise<ErsExecutionOrderSuggestion> {
    const items = await this.ersSqlRepository.listExecutionOrdersByLocation(
      query.locationId,
      query.excludeProjectId,
    );
    const used = new Set(items.map((item) => item.executionOrder));
    let nextAvailable = 1;
    while (used.has(nextAvailable)) nextAvailable += 1;

    return { items, nextAvailable };
  }

  private async resolveTiGroupIds(): Promise<number[]> {
    const groups = await this.catalogService.listGroups();
    return groups
      .filter((group) => isTiGroupName(normalizeRoleToken(group.name)))
      .map((group) => group.id);
  }

  private async resolveTechnicianIdsByLocation(locationId: number | null): Promise<Set<number>> {
    const tiGroupIds = await this.resolveTiGroupIds();
    const technicians = await this.usersTechniciansSqlRepository.listEligibleTechniciansForLocation(
      tiGroupIds,
      locationId,
    );
    return new Set(technicians.map((user) => user.id));
  }

  private uniquePositive(values: number[]): number[] {
    return Array.from(new Set(values.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)));
  }

  /**
   * Resuelve nombre y email de un usuario GLPI para destinatarios de correo.
   * @param userId - ID de usuario GLPI, o `null` si no aplica.
   * @returns Destinatario de correo o `null` si no hay ID o el usuario no tiene email registrado.
   */
  private async resolveErsMailRecipient(userId: number | null): Promise<MailRecipient | null> {
    if (!userId) return null;
    const user = await this.usersTechniciansSqlRepository.findById(userId);
    if (!user?.email) {
      this.logger.warn(`No se pudo resolver email de correo para el usuario ${userId}`);
      return null;
    }
    return { name: user.fullName, email: user.email };
  }

  /**
   * Resuelve destinatarios de correo para una lista de miembros de equipo ERS.
   * @param team - Miembros del equipo del proyecto ERS.
   * @returns Destinatarios con email resuelto (se omiten los que no tienen email).
   */
  private async resolveErsTeamRecipients(team: ErsTeamMember[]): Promise<MailRecipient[]> {
    const recipients = await Promise.all(
      team.map((member) => this.resolveErsMailRecipient(member.userId)),
    );
    return recipients.filter((recipient): recipient is MailRecipient => recipient !== null);
  }

  /**
   * Dedupica destinatarios de correo por email (case-insensitive).
   * @param recipients - Listas de destinatarios a combinar.
   * @returns Lista combinada sin emails duplicados.
   */
  private dedupeMailRecipients(...recipients: Array<MailRecipient | null>[]): MailRecipient[] {
    const seen = new Set<string>();
    const result: MailRecipient[] = [];
    for (const list of recipients) {
      for (const recipient of list) {
        if (!recipient) continue;
        const email = recipient.email.trim().toLowerCase();
        if (seen.has(email)) continue;
        seen.add(email);
        result.push(recipient);
      }
    }
    return result;
  }

  /**
   * Notifica al solicitante que su ticket fue escalado a ERS y al revisor (Martin) que se creó un ERS.
   * Envío fire-and-forget: los errores solo se loguean, nunca interrumpen la operación principal.
   * @param detail - Detalle del proyecto ERS recién creado.
   * @param origin - Origen de creación ("escalated" o "standalone").
   */
  private emitErsCreationMailEvents(detail: ErsDetail, origin: ErsCreatedOrigin): void {
    void (async () => {
      try {
        if (origin === "escalated" && detail.ticketId) {
          const requesterRecipient = await this.resolveErsMailRecipient(detail.requesterId);
          if (requesterRecipient) {
            const payload: ErsEscalatedEvent = {
              projectId: detail.projectId,
              projectName: detail.projectName,
              ticketId: detail.ticketId,
              requesterName: detail.requesterName ?? requesterRecipient.name,
              notify: [requesterRecipient],
            };
            this.events.emit(MAIL_EVENTS.ERS_ESCALATED, payload);
          }
        }

        const reviewerTo = this.config.get("mail.reviewerTo", { infer: true });
        if (reviewerTo) {
          const payload: ErsCreatedEvent = {
            projectId: detail.projectId,
            projectName: detail.projectName,
            ticketId: detail.ticketId,
            requesterName: detail.requesterName ?? "Solicitante",
            origin,
            notify: [{ name: "Martin", email: reviewerTo }],
          };
          this.events.emit(MAIL_EVENTS.ERS_CREATED, payload);
        }
      } catch (error) {
        this.logger.warn(
          `[ers-created] mail notification failed for project ${detail.projectId}: ${(error as Error).message}`,
        );
      }
    })();
  }

  /**
   * Notifica a los miembros de equipo recién asignados a un proyecto ERS.
   * Envío fire-and-forget: los errores solo se loguean, nunca interrumpen la operación principal.
   * @param projectId - ID del proyecto ERS.
   * @param projectName - Nombre del proyecto ERS.
   * @param newMembers - Miembros del equipo agregados en esta operación.
   * @param assignedByUserId - ID del usuario que realizó la asignación.
   */
  private emitErsTeamAssignedMailEvent(
    projectId: number,
    projectName: string,
    newMembers: ErsTeamMember[],
    assignedByUserId: number,
  ): void {
    if (newMembers.length === 0) return;
    void (async () => {
      try {
        const notify = await this.resolveErsTeamRecipients(newMembers);
        if (notify.length === 0) return;
        const assignedByUser = await this.usersTechniciansSqlRepository.findById(assignedByUserId);
        const payload: ErsTeamAssignedEvent = {
          projectId,
          projectName,
          assignedBy: assignedByUser?.fullName ?? `Usuario ${assignedByUserId}`,
          notify,
        };
        this.events.emit(MAIL_EVENTS.ERS_TEAM_ASSIGNED, payload);
      } catch (error) {
        this.logger.warn(
          `[ers-team-assigned] mail notification failed for project ${projectId}: ${(error as Error).message}`,
        );
      }
    })();
  }

  /**
   * Notifica a los implicados (solicitante, equipo, Martin) cuando un ERS pasa a un estado finalizado.
   * Envío fire-and-forget: los errores solo se loguean, nunca interrumpen la operación principal.
   * @param detail - Detalle actualizado del proyecto ERS.
   * @param finalStateName - Nombre del estado finalizado alcanzado.
   */
  private emitErsClosedMailEvent(detail: ErsDetail, finalStateName: string): void {
    void (async () => {
      try {
        const [requesterRecipient, teamRecipients] = await Promise.all([
          this.resolveErsMailRecipient(detail.requesterId),
          this.resolveErsTeamRecipients(detail.team),
        ]);
        const reviewerTo = this.config.get("mail.reviewerTo", { infer: true });
        const reviewerRecipient: MailRecipient | null = reviewerTo
          ? { name: "Martin", email: reviewerTo }
          : null;

        const notify = this.dedupeMailRecipients(
          [requesterRecipient],
          teamRecipients,
          [reviewerRecipient],
        );
        if (notify.length === 0) return;

        const payload: ErsClosedEvent = {
          projectId: detail.projectId,
          projectName: detail.projectName,
          ticketId: detail.ticketId,
          finalStateName,
          notify,
        };
        this.events.emit(MAIL_EVENTS.ERS_CLOSED, payload);
      } catch (error) {
        this.logger.warn(
          `[ers-closed] mail notification failed for project ${detail.projectId}: ${(error as Error).message}`,
        );
      }
    })();
  }

  private async registerHistoryForEdition(input: {
    userId: number;
    projectId: number;
    previous: ErsDetail | null;
    current: ErsDetail;
  }): Promise<void> {
    const updateSummary = this.buildUpdateSummary(input.previous, input.current);
    if (updateSummary) {
      await this.registerHistorySafe({
        projectId: input.projectId,
        actionType: "update",
        summary: updateSummary,
        actorUserId: input.userId,
        metadata: {
          ticketId: input.current.ticketId,
          projectName: input.current.projectName,
        },
        beforeState: this.toHistoryState(input.previous),
        afterState: this.toHistoryState(input.current),
      });
    }

    const removedTeamCount = Math.max(
      0,
      (input.previous?.team.length ?? 0) - input.current.team.length,
    );
    if (removedTeamCount > 0) {
      await this.registerHistorySafe({
        projectId: input.projectId,
        actionType: "delete",
        summary: `Se retiraron ${removedTeamCount} integrante(s) del equipo del proyecto.`,
        actorUserId: input.userId,
        metadata: {
          removedTeamCount,
        },
        beforeState: this.toHistoryState({ team: input.previous?.team ?? [] }),
        afterState: this.toHistoryState({ team: input.current.team }),
      });
    }

    const taskHistoryEvents = this.buildTaskHistoryEvents(
      input.previous?.tasks ?? [],
      input.current.tasks,
    );
    for (const event of taskHistoryEvents) {
      await this.registerHistorySafe({
        projectId: input.projectId,
        actionType: event.actionType,
        summary: event.summary,
        actorUserId: input.userId,
        metadata: event.metadata,
        beforeState: event.beforeState,
        afterState: event.afterState,
      });
    }
  }

  private buildUpdateSummary(previous: ErsDetail | null, current: ErsDetail): string | null {
    if (!previous) {
      return "Se actualizó la información general del proyecto ERS.";
    }

    const changes: string[] = [];
    if (previous.projectName !== current.projectName) changes.push("nombre del proyecto");
    if ((previous.objective ?? "") !== (current.objective ?? "")) changes.push("objetivo");
    if ((previous.description ?? "") !== (current.description ?? "")) changes.push("descripción");
    if ((previous.impact ?? "") !== (current.impact ?? "")) changes.push("impacto");
    if ((previous.requestType ?? "") !== (current.requestType ?? "")) changes.push("tipo de requerimiento");
    if (previous.priority !== current.priority) changes.push("prioridad TI");
    if (previous.executionOrder !== current.executionOrder) changes.push("orden de ejecución");
    if (previous.approved !== current.approved) changes.push("aprobación");
    if (previous.approverId !== current.approverId) changes.push("aprobador");
    if (previous.projectStateId !== current.projectStateId) changes.push("estado");
    if (previous.projectTypeId !== current.projectTypeId) changes.push("sistema relacionado");
    if (previous.team.length !== current.team.length) changes.push("equipo");

    if (changes.length === 0) {
      return null;
    }
    return `Se actualizó: ${changes.join(", ")}.`;
  }

  private buildTaskHistoryEvents(previousTasks: ErsTask[], currentTasks: ErsTask[]): ErsTaskHistoryEvent[] {
    const events: ErsTaskHistoryEvent[] = [];
    const unmatchedPrevious = [...previousTasks];
    const addedTasks: ErsTask[] = [];
    const modifiedPairs: Array<{ previous: ErsTask; current: ErsTask }> = [];

    for (const currentTask of currentTasks) {
      const matchIndex = unmatchedPrevious.findIndex((task) => task.name === currentTask.name);
      if (matchIndex >= 0) {
        const [previousTask] = unmatchedPrevious.splice(matchIndex, 1);
        modifiedPairs.push({ previous: previousTask, current: currentTask });
      } else {
        addedTasks.push(currentTask);
      }
    }

    for (const task of addedTasks) {
      events.push({
        actionType: "create",
        summary: `Se agregó la tarea "${task.name}".`,
        metadata: { taskName: task.name },
        beforeState: null,
        afterState: this.toHistoryState(task),
      });
    }

    for (const task of unmatchedPrevious) {
      events.push({
        actionType: "delete",
        summary: `Se eliminó la tarea "${task.name}".`,
        metadata: { taskName: task.name },
        beforeState: this.toHistoryState(task),
        afterState: null,
      });
    }

    for (const { previous, current } of modifiedPairs) {
      const changedFields = this.getTaskChangedFieldLabels(previous, current);
      if (changedFields.length === 0) continue;

      events.push({
        actionType: "update",
        summary: `Se modificó la tarea "${current.name}": ${changedFields.join(", ")}.`,
        metadata: {
          taskName: current.name,
          changedFields,
        },
        beforeState: this.toHistoryState(previous),
        afterState: this.toHistoryState(current),
      });
    }

    return events;
  }

  private getTaskChangedFieldLabels(previous: ErsTask, current: ErsTask): string[] {
    const changes: string[] = [];
    if (this.normalizeOptionalText(previous.content) !== this.normalizeOptionalText(current.content)) {
      changes.push("descripción");
    }
    if (previous.percentDone !== current.percentDone) changes.push("avance");
    if (previous.projectStateId !== current.projectStateId) changes.push("estado");
    if (previous.userId !== current.userId) changes.push("responsable");
    if (this.normalizeOptionalDate(previous.planStartDate) !== this.normalizeOptionalDate(current.planStartDate)) {
      changes.push("fecha de inicio");
    }
    if (this.normalizeOptionalDate(previous.planEndDate) !== this.normalizeOptionalDate(current.planEndDate)) {
      changes.push("fecha de fin");
    }
    return changes;
  }

  private normalizeOptionalText(value: string | null | undefined): string {
    return (value ?? "").trim();
  }

  private normalizeOptionalDate(value: string | null | undefined): string | null {
    if (!value) return null;
    return value.slice(0, 10);
  }

  /** En creación/escalado, un no-superadmin no puede fijar prioridad u orden de ejecución fuera del valor por defecto. */
  private assertPriorityAndExecutionOrderAllowedOnCreate(
    user: AuthenticatedUser,
    dto: { priority: number; executionOrder?: number },
  ): void {
    if (user.isSuperAdmin) return;
    if (dto.priority !== 3 || dto.executionOrder !== undefined) {
      throw new BusinessException({
        message: "Solo un superadmin puede fijar la prioridad TI o el orden de ejecución",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }
  }

  private async assertExecutionOrderAvailable(
    locationId: number | null,
    executionOrder: number | undefined,
    excludeProjectId?: number,
  ): Promise<void> {
    if (executionOrder === undefined) return;
    if (locationId === null) {
      throw new BusinessException({
        message: "No se pudo determinar la sede para validar el orden de ejecución",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }
    const taken = await this.ersSqlRepository.isExecutionOrderTaken(
      locationId,
      executionOrder,
      excludeProjectId,
    );
    if (taken) {
      throw new BusinessException({
        message: "Ya existe un proyecto con ese orden de ejecución en esta sede",
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
        details: { executionOrder },
      });
    }
  }

  private async assertProjectTypeValid(projectTypeId: number | undefined): Promise<void> {
    const normalizedId = Number(projectTypeId ?? 0);
    if (normalizedId === 0) return;
    if (await this.ersSqlRepository.projectTypeExists(normalizedId)) return;

    throw new BusinessException({
      message: "El sistema relacionado seleccionado no existe",
      code: API_ERROR_CODE.VALIDATION,
      status: HttpStatus.BAD_REQUEST,
      details: { projectTypeId: normalizedId },
    });
  }

  private validateRequestType(value: string): string {
    const normalized = value.trim();
    const allowed = this.config.get("ers.requestTypes", { infer: true });
    if (allowed.includes(normalized)) return normalized;

    throw new BusinessException({
      message: "El tipo de requerimiento seleccionado no es válido",
      code: API_ERROR_CODE.VALIDATION,
      status: HttpStatus.BAD_REQUEST,
      details: { requestType: normalized },
    });
  }

  private toHistoryState(value: object | null | undefined): Record<string, unknown> | null {
    if (!value) return null;
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  private async registerHistorySafe(input: {
    projectId: number;
    actionType: "create" | "update" | "delete";
    summary: string;
    actorUserId: number;
    metadata?: Record<string, unknown>;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      await this.ersHistoryService.registerEvent(input);
    } catch {
      // No bloquea la transacción funcional de ERS si falla la auditoría.
    }
  }
}



