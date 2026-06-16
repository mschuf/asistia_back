/**
 * @file reports.controller.ts
 * @description Endpoints HTTP de reportes restringidos a super administradores.
 */
import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { SuperAdmin } from "../../common/decorators/super-admin.decorator";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard";
import { ResponseMessage, SkipResponseEnvelope } from "../../common/interceptors/response-message.decorator";
import { ExportTicketCreatedLogsQueryDto } from "./dto/export-ticket-created-logs-query.dto";
import { ExportVisitasReportQueryDto } from "./dto/export-visitas-report-query.dto";
import { ListTicketCreatedLogsQueryDto } from "./dto/list-ticket-created-logs-query.dto";
import { ListVisitasReportQueryDto } from "./dto/list-visitas-report-query.dto";
import { TicketCreatedLogListResponseDto } from "./dto/ticket-created-log.response.dto";
import { VisitaReportLogListResponseDto } from "./dto/visita-report.response.dto";
import { ReportsService } from "./reports.service";

/** Controlador REST de reportes con guardas JWT y super admin. */
@ApiTags("reports")
@ApiBearerAuth()
@SuperAdmin()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller("reports")
export class ReportsController {
  /**
   * Inyecta el servicio de reportes.
   * @param reportsService - Servicio de negocio de reportes.
   */
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Lista logs del evento ticket.created con filtros y paginación.
   * @param query - Parámetros de paginación, fechas, categoría, empresa y ordenación.
   * @returns Lista paginada de logs.
   */
  @Get("ticket-created")
  @ApiOperation({ summary: "Paginated ticket.created logs report (super admin)" })
  @ApiResponse({ status: 200, type: TicketCreatedLogListResponseDto })
  @ResponseMessage("Ticket created logs retrieved")
  async listTicketCreatedLogs(
    @Query() query: ListTicketCreatedLogsQueryDto,
  ): Promise<TicketCreatedLogListResponseDto> {
    return this.reportsService.listTicketCreatedLogs(query);
  }

  /**
   * Exporta logs del evento ticket.created a PDF o Excel.
   * @param query - Filtros y formato de exportación.
   * @param res - Respuesta Express para enviar el archivo binario.
   * @returns Promesa vacía; el cuerpo se escribe en la respuesta HTTP.
   */
  @Get("ticket-created/export")
  @SkipResponseEnvelope()
  @ApiOperation({ summary: "Export ticket.created logs as PDF or Excel (super admin)" })
  @ApiProduces("application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @ApiResponse({ status: 200, description: "Binary export file" })
  async exportTicketCreatedLogs(
    @Query() query: ExportTicketCreatedLogsQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.reportsService.exportTicketCreatedLogs(query);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.send(file.buffer);
  }

  /**
   * Lista visitas de portería con filtros y paginación.
   * @param query - Parámetros de paginación, fechas, estado y ordenación.
   * @returns Lista paginada de visitas.
   */
  @Get("visitas")
  @ApiOperation({ summary: "Paginated porteria visitas report (super admin)" })
  @ApiResponse({ status: 200, type: VisitaReportLogListResponseDto })
  @ResponseMessage("Porteria visitas report retrieved")
  async listVisitasReport(
    @Query() query: ListVisitasReportQueryDto,
  ): Promise<VisitaReportLogListResponseDto> {
    return this.reportsService.listVisitasReport(query);
  }

  /**
   * Exporta visitas de portería a PDF o Excel.
   * @param query - Filtros y formato de exportación.
   * @param res - Respuesta Express para enviar el archivo binario.
   * @returns Promesa vacía; el cuerpo se escribe en la respuesta HTTP.
   */
  @Get("visitas/export")
  @SkipResponseEnvelope()
  @ApiOperation({ summary: "Export porteria visitas as PDF or Excel (super admin)" })
  @ApiProduces("application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @ApiResponse({ status: 200, description: "Binary export file" })
  async exportVisitasReport(
    @Query() query: ExportVisitasReportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.reportsService.exportVisitasReport(query);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.send(file.buffer);
  }
}
