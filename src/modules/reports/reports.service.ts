/**
 * @file reports.service.ts
 * @description Orquesta reportes superadmin con persistencia en Postgres.
 */
import { Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../common/dto/pagination.dto";
import {
  DEFAULT_TICKET_CREATED_LOGS_PAGE_LIMIT,
  type ListTicketCreatedLogsQueryDto,
} from "./dto/list-ticket-created-logs-query.dto";
import type { TicketCreatedLogResponseDto } from "./dto/ticket-created-log.response.dto";
import { mapTicketCreatedLogRowToResponse } from "./mappers/ticket-created-log.mapper";
import type { ExportTicketCreatedLogsQueryDto } from "./dto/export-ticket-created-logs-query.dto";
import { TicketCreatedLogsSqlRepository } from "./repositories/ticket-created-logs.sql-repository";
import type { TicketCreatedLogExportResult } from "./reports.types";
import { TicketCreatedLogsExportService } from "./ticket-created-logs-export.service";

/**
 * Servicio de reportes restringidos a super administradores.
 */
@Injectable()
export class ReportsService {
  /**
   * Inyecta repositorio y servicio de exportación.
   * @param ticketCreatedLogsRepo - Repositorio SQL del reporte.
   * @param exportService - Generador PDF/Excel.
   */
  constructor(
    private readonly ticketCreatedLogsRepo: TicketCreatedLogsSqlRepository,
    private readonly exportService: TicketCreatedLogsExportService,
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
    const result = await this.ticketCreatedLogsRepo.findAll({
      page,
      limit,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      categoryName: query.categoryName,
      companyId: query.companyId,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      items: result.items.map(mapTicketCreatedLogRowToResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
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
    return this.exportService.export(query);
  }
}
