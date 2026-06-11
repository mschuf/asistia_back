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
import type { TicketCreatedLogResponseDto } from "./dto/ticket-created-log.response.dto";
import {
  buildRequesterLocationByEmail,
  enrichTicketCreatedLogRows,
  filterRowsByLocationId,
  paginateRows,
  sortEnrichedRows,
} from "./mappers/ticket-created-log.enricher";
import { mapTicketCreatedLogRowToResponse } from "./mappers/ticket-created-log.mapper";
import type { ExportTicketCreatedLogsQueryDto } from "./dto/export-ticket-created-logs-query.dto";
import { TicketCreatedLogsSqlRepository } from "./repositories/ticket-created-logs.sql-repository";
import type { TicketCreatedLogBaseFilters, TicketCreatedLogExportResult, TicketCreatedLogRow } from "./reports.types";
import { TicketCreatedLogsExportService } from "./ticket-created-logs-export.service";

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
