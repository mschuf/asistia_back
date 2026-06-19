/**
 * @file reports.service.ts
 * @description Orquesta reportes superadmin con persistencia en Postgres.
 */
import { Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../common/dto/pagination.dto";
import { CatalogService } from "../catalog/catalog.service";
import { UsersService } from "../users/users.service";
import {
  DEFAULT_TICKET_CREATED_LOGS_PAGE_LIMIT,
  type ListTicketCreatedLogsQueryDto,
} from "./dto/list-ticket-created-logs-query.dto";
import {
  DEFAULT_VISITAS_REPORT_PAGE_LIMIT,
  MAX_VISITAS_REPORT_PAGE_LIMIT,
  type ListVisitasReportQueryDto,
} from "./dto/list-visitas-report-query.dto";
import {
  DEFAULT_PORTERIA_AUDIT_PAGE_LIMIT,
  type ListPorteriaAuditQueryDto,
} from "./dto/list-porteria-audit-query.dto";
import type { TicketCreatedLogResponseDto } from "./dto/ticket-created-log.response.dto";
import type { PorteriaAuditLogResponseDto } from "./dto/porteria-audit.response.dto";
import type { VisitaReportLogResponseDto } from "./dto/visita-report.response.dto";
import {
  buildRequesterLocationByEmail,
  enrichTicketCreatedLogRows,
  filterRowsByLocationId,
  paginateRows,
  sortEnrichedRows,
} from "./mappers/ticket-created-log.enricher";
import { mapTicketCreatedLogRowToResponse } from "./mappers/ticket-created-log.mapper";
import type { ExportTicketCreatedLogsQueryDto } from "./dto/export-ticket-created-logs-query.dto";
import type { ExportVisitasReportQueryDto } from "./dto/export-visitas-report-query.dto";
import { TicketCreatedLogsSqlRepository } from "./repositories/ticket-created-logs.sql-repository";
import type {
  TicketCreatedLogBaseFilters,
  TicketCreatedLogExportResult,
  TicketCreatedLogRow,
  VisitaReportExportResult,
} from "./reports.types";
import { TicketCreatedLogsExportService } from "./ticket-created-logs-export.service";
import { VisitasExportService } from "./visitas-export.service";
import { mapVisitaListRowToReportResponse } from "./mappers/visita-report.mapper";
import { VisitaAuditSqlRepository } from "../visitas/repositories/visita-audit.sql-repository";
import { VisitasSqlRepository } from "../visitas/repositories/visitas.sql-repository";
import type { VisitaAuditLogRow, VisitaListFilters } from "../visitas/visitas.types";

/**
 * Servicio de reportes restringidos a super administradores.
 */
@Injectable()
export class ReportsService {
  /**
   * Inyecta repositorio, exportación y servicios GLPI para enriquecer sede.
   * @param ticketCreatedLogsRepo - Repositorio SQL del reporte.
   * @param exportService - Generador PDF/Excel.
   * @param users - Usuarios GLPI cacheados.
   * @param catalog - Catálogo de sedes GLPI.
   */
  constructor(
    private readonly ticketCreatedLogsRepo: TicketCreatedLogsSqlRepository,
    private readonly exportService: TicketCreatedLogsExportService,
    private readonly visitasExportService: VisitasExportService,
    private readonly visitasSqlRepo: VisitasSqlRepository,
    private readonly visitaAuditSqlRepo: VisitaAuditSqlRepository,
    private readonly users: UsersService,
    private readonly catalog: CatalogService,
  ) {}

  /**
   * Lista logs del evento ticket.created con filtros y paginación.
   * @param query - Parámetros de consulta validados.
   * @returns Resultado paginado con DTOs de respuesta.
   */
  async listTicketCreatedLogs(
    query: ListTicketCreatedLogsQueryDto,
  ): Promise<PaginatedResult<TicketCreatedLogResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_TICKET_CREATED_LOGS_PAGE_LIMIT;
    const baseFilters: TicketCreatedLogBaseFilters = {
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      categoryName: query.categoryName,
      companyId: query.companyId,
      locationId: query.locationId,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };

    const requiresInMemoryPipeline =
      query.locationId !== undefined || query.sortBy === "requesterLocation";

    if (requiresInMemoryPipeline) {
      const enriched = await this.loadEnrichedTicketCreatedLogs(baseFilters);
      const paginated = paginateRows(enriched, page, limit);
      return {
        items: paginated.items.map(mapTicketCreatedLogRowToResponse),
        total: paginated.total,
        page: paginated.page,
        limit: paginated.limit,
      };
    }

    const enriched = await this.enrichPageRows(
      await this.ticketCreatedLogsRepo.findAll({
        page,
        limit,
        createdFrom: query.createdFrom,
        createdTo: query.createdTo,
        categoryName: query.categoryName,
        companyId: query.companyId,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      }),
    );

    return {
      items: enriched.items.map(mapTicketCreatedLogRowToResponse),
      total: enriched.total,
      page: enriched.page,
      limit: enriched.limit,
    };
  }

  /**
   * Exporta logs del evento ticket.created a PDF o Excel.
   * @param query - Filtros y formato de exportación.
   * @returns Buffer, nombre de archivo y MIME type.
   */
  async exportTicketCreatedLogs(
    query: ExportTicketCreatedLogsQueryDto,
  ): Promise<TicketCreatedLogExportResult> {
    const rows = await this.loadEnrichedTicketCreatedLogs({
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      categoryName: query.categoryName,
      companyId: query.companyId,
      locationId: query.locationId,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return this.exportService.exportFromRows(rows, {
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      categoryName: query.categoryName,
      companyId: query.companyId,
      locationId: query.locationId,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      format: query.format,
    });
  }

  /**
   * Lista visitas de portería con filtros y paginación.
   * @param query - Parámetros de consulta validados.
   * @returns Resultado paginado con DTOs del reporte.
   */
  async listVisitasReport(
    query: ListVisitasReportQueryDto,
  ): Promise<PaginatedResult<VisitaReportLogResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_VISITAS_REPORT_PAGE_LIMIT;
    const result = await this.visitasSqlRepo.findAll(
      this.buildVisitaReportFilters(query, page, limit),
    );

    return {
      items: result.items.map(mapVisitaListRowToReportResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * Exporta visitas de portería a PDF o Excel.
   * @param query - Filtros y formato de exportación.
   * @returns Buffer, nombre de archivo y MIME type.
   */
  async exportVisitasReport(
    query: ExportVisitasReportQueryDto,
  ): Promise<VisitaReportExportResult> {
    const { items } = await this.visitasSqlRepo.findAll(
      this.buildVisitaReportFilters(query, 1, MAX_VISITAS_REPORT_PAGE_LIMIT),
    );

    return this.visitasExportService.exportFromRows(items, query);
  }

  /**
   * Lista auditoría completa de portería con filtros, orden y paginación server-side.
   * @param query - Parámetros de consulta validados.
   * @returns Resultado paginado con eventos de auditoría.
   */
  async listPorteriaAuditLogs(
    query: ListPorteriaAuditQueryDto,
  ): Promise<{
    items: PorteriaAuditLogResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PORTERIA_AUDIT_PAGE_LIMIT;
    const result = await this.visitaAuditSqlRepo.findAll({
      page,
      limit,
      q: query.q,
      action: query.action,
      actorUserId: query.actorUserId,
      visitaId: query.visitaId,
      visitante: query.visitante,
      documento: query.documento,
      occurredFrom: query.occurredFrom,
      occurredTo: query.occurredTo,
      estadoBefore: query.estadoBefore,
      estadoAfter: query.estadoAfter,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const users = await this.users.listAll();
    const userNameById = new Map<number, string>(
      users.map((user) => [user.id, user.fullName || user.login]),
    );

    return {
      items: result.items.map((row) => this.mapAuditRow(row, userNameById)),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
    };
  }

  private mapAuditRow(
    row: VisitaAuditLogRow,
    userNameById: Map<number, string>,
  ): PorteriaAuditLogResponseDto {
    const actorUserId = Number(row.actor_user_id);
    return {
      id: Number(row.id),
      visitaId: Number(row.visita_id),
      action: row.action,
      actorUserId,
      actorName: actorUserId === 0 ? "Sistema" : (userNameById.get(actorUserId) ?? null),
      occurredAt: new Date(row.occurred_at).toISOString(),
      visitante: row.visitante ?? null,
      documento: row.documento ?? null,
      estadoBefore: row.estado_before ?? null,
      estadoAfter: row.estado_after ?? null,
      changedFields: Array.isArray(row.changed_fields) ? row.changed_fields : [],
      beforeState:
        row.before_state && typeof row.before_state === "object"
          ? (row.before_state as unknown as Record<string, unknown>)
          : null,
      afterState:
        row.after_state && typeof row.after_state === "object"
          ? (row.after_state as unknown as Record<string, unknown>)
          : null,
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    };
  }

  /**
   * Mapea query del reporte de visitas a filtros del repositorio SQL.
   * @param query - Parámetros de consulta o exportación.
   * @param page - Página solicitada.
   * @param limit - Límite de registros.
   * @returns Filtros normalizados para Postgres.
   */
  private buildVisitaReportFilters(
    query: ListVisitasReportQueryDto | ExportVisitasReportQueryDto,
    page: number,
    limit: number,
  ): VisitaListFilters {
    const hasDateRange = Boolean(query.entradaFrom && query.entradaTo);

    return {
      page,
      limit,
      entradaFrom: query.entradaFrom,
      entradaTo: query.entradaTo,
      includeProgramadasSinEntrada: hasDateRange ? true : undefined,
      estado: query.estado,
      empresa: query.empresa,
      visitante: query.visitante,
      documento: query.documento,
      motivo: query.motivo,
      responsable: query.responsable,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };
  }

  /**
   * Carga filas base, enriquece sede, filtra y ordena en memoria.
   * @param filters - Filtros del reporte.
   * @returns Filas listas para paginar o exportar.
   */
  async loadEnrichedTicketCreatedLogs(
    filters: TicketCreatedLogBaseFilters,
  ): Promise<TicketCreatedLogRow[]> {
    const useInMemorySort =
      filters.sortBy === "requesterLocation" || filters.locationId !== undefined;

    const { items } = await this.ticketCreatedLogsRepo.findAllForExport({
      createdFrom: filters.createdFrom,
      createdTo: filters.createdTo,
      categoryName: filters.categoryName,
      companyId: filters.companyId,
      sortBy: useInMemorySort ? undefined : filters.sortBy,
      sortOrder: useInMemorySort ? undefined : filters.sortOrder,
    });

    let rows = await this.enrichRows(items);

    if (filters.locationId !== undefined) {
      rows = filterRowsByLocationId(rows, filters.locationId);
    }

    if (useInMemorySort) {
      rows = sortEnrichedRows(rows, filters.sortBy, filters.sortOrder);
    }

    return rows;
  }

  /**
   * Enriquece las filas de una página ya paginada por SQL.
   * @param result - Resultado paginado del repositorio.
   * @returns Mismo contenedor con filas enriquecidas.
   */
  private async enrichPageRows(
    result: PaginatedResult<TicketCreatedLogRow>,
  ): Promise<PaginatedResult<TicketCreatedLogRow>> {
    return {
      ...result,
      items: await this.enrichRows(result.items),
    };
  }

  /**
   * Resuelve sede del solicitante para un conjunto de filas.
   * @param rows - Filas crudas de Postgres.
   * @returns Filas con requester_location.
   */
  private async enrichRows(rows: TicketCreatedLogRow[]): Promise<TicketCreatedLogRow[]> {
    if (rows.length === 0) return rows;

    const [users, locations] = await Promise.all([
      this.users.listAll(),
      this.catalog.listLocations(),
    ]);
    const locationByEmail = buildRequesterLocationByEmail(users, locations);
    return enrichTicketCreatedLogRows(rows, locationByEmail);
  }
}
