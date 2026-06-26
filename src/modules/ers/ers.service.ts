/**
 * @file ers.service.ts
 * @description Orquesta reglas de negocio del módulo ERS (transacciones 1 y 2).
 */
import { HttpStatus, Injectable } from "@nestjs/common";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { CatalogService } from "../catalog/catalog.service";
import { UsersTechniciansSqlRepository } from "../glpi/repositories/users-technicians.sql-repository";
import { isTiGroupName, normalizeRoleToken } from "../glpi/role.utils";
import type { EscalarTicketDto } from "./dto/escalar-ticket.dto";
import type { ListErsQueryDto } from "./dto/list-ers-query.dto";
import type { ListErsTechniciansQueryDto } from "./dto/list-ers-technicians-query.dto";
import type { UpdateErsDto } from "./dto/update-ers.dto";
import { ErsSqlRepository } from "./repositories/ers.sql-repository";
import type { ErsDetail, ErsProjectState, ErsTechnician } from "./ers.types";

/** Servicio de reglas de negocio para ERS. */
@Injectable()
export class ErsService {
  constructor(
    private readonly ersSqlRepository: ErsSqlRepository,
    private readonly usersTechniciansSqlRepository: UsersTechniciansSqlRepository,
    private readonly catalogService: CatalogService,
  ) {}

  /**
   * Transacción 1: escala ticket a proyecto y cierra ticket al final.
   * @param user - Usuario autenticado.
   * @param dto - Datos iniciales del ERS.
   * @returns Detalle del ERS creado.
   */
  async escalate(user: AuthenticatedUser, dto: EscalarTicketDto): Promise<ErsDetail> {
    const context = await this.ersSqlRepository.findTicketEscalationContext(dto.ticketId);
    if (!context) {
      throw new BusinessException({
        message: `Ticket ${dto.ticketId} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    if (user.role !== "technician" && context.requesterId !== user.id) {
      throw new BusinessException({
        message: "You can only escalate tickets where you are the requester",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }

    const allowedResponsibleIds = await this.resolveTechnicianIdsByLocation(context.locationId);
    const requestedResponsibleIds = this.uniquePositive(dto.responsibleIds);
    const invalidResponsible = requestedResponsibleIds.filter((id) => !allowedResponsibleIds.has(id));
    if (invalidResponsible.length > 0) {
      throw new BusinessException({
        message: "Some responsible users are not valid technicians for the requester location",
        code: API_ERROR_CODE.INVALID_TECHNICIAN,
        status: HttpStatus.BAD_REQUEST,
        details: { invalidResponsibleIds: invalidResponsible },
      });
    }

    try {
      const projectId = await this.ersSqlRepository.escalateTicketToProject(dto, user.id, context);
      const detail = await this.ersSqlRepository.findByProjectId(projectId);
      if (!detail) {
        throw new BusinessException({
          message: "ERS project created but could not be loaded",
          code: API_ERROR_CODE.UNKNOWN,
          status: HttpStatus.INTERNAL_SERVER_ERROR,
        });
      }
      return detail;
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      if ((error as Error).message === "ticket_already_scaled") {
        throw new BusinessException({
          message: "Ticket is already linked to an ERS project",
          code: API_ERROR_CODE.CONFLICT,
          status: HttpStatus.CONFLICT,
        });
      }
      throw new BusinessException({
        message: "Could not complete ERS escalation transaction",
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
    return this.ersSqlRepository.list(query, {
      userId: user.id,
      role: user.role,
    });
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
        message: `ERS project ${projectId} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    if (user.role !== "technician" && detail.requesterId !== user.id) {
      throw new BusinessException({
        message: "You can only view your own ERS projects",
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
    if (user.role !== "technician") {
      throw new BusinessException({
        message: "Only technicians can edit ERS TI data",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }

    const uniqueTeamIds = this.uniquePositive(dto.teamMemberIds);
    if (uniqueTeamIds.length !== dto.teamMemberIds.length) {
      dto.teamMemberIds = uniqueTeamIds;
    }

    const ok = await this.ersSqlRepository.saveTiEdition(projectId, dto);
    if (!ok) {
      throw new BusinessException({
        message: `ERS project ${projectId} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }
    return this.findByProjectId(user, projectId);
  }

  /**
   * Lista estados de proyecto.
   * @returns Catálogo de estados.
   */
  async listProjectStates(): Promise<ErsProjectState[]> {
    return this.ersSqlRepository.listProjectStates();
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
    const all = await this.usersTechniciansSqlRepository.listEligibleTechniciansForLocation(
      tiGroupIds,
      query.locationId ?? null,
    );

    const search = (query.search ?? "").trim().toLowerCase();
    const filtered = search
      ? all.filter((user) => {
          const full = `${user.fullName} ${user.login}`.toLowerCase();
          return full.includes(search);
        })
      : all;

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, query.limit ?? 50);
    const start = (page - 1) * limit;
    const items: ErsTechnician[] = filtered.slice(start, start + limit).map((user) => ({
      id: user.id,
      fullName: user.fullName,
      locationId: user.locationId,
    }));

    return {
      items,
      total: filtered.length,
      page,
      limit,
    };
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
}

