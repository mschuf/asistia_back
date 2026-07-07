/**
 * @file tickets.controller.ts
 * @description Endpoints REST de tickets: listado, métricas, historial, CRUD y asignación.
 */
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { SuperAdmin } from "../../common/decorators/super-admin.decorator";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import { RequestTimeoutMs } from "../../common/interceptors/request-timeout.decorator";
import {
  METRICS_HTTP_TIMEOUT_MS,
  TICKET_CREATE_HTTP_TIMEOUT_MS,
} from "../../common/interceptors/timeout.interceptor";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TicketsService, type HistoryListMeta } from "./tickets.service";
import { TicketsCloseService } from "./tickets-close.service";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { UpdateTicketStatusDto } from "./dto/update-ticket-status.dto";
import { AssignTechnicianDto } from "./dto/assign-technician.dto";
import { UpdateTicketLocationDto } from "./dto/update-ticket-location.dto";
import { UpdateTicketRequesterDto } from "./dto/update-ticket-requester.dto";
import { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";
import { CloseCandidatesQueryDto } from "./dto/close-candidates-query.dto";
import { CloseBulkDto, CloseBulkResponseDto } from "./dto/close-bulk.dto";
import {
  CreateTicketResponseDto,
  TicketListResponseDto,
  TicketResponseDto,
  UpdateTicketStatusResponseDto,
} from "./dto/ticket.response.dto";
import { TicketMetricsResponseDto } from "./dto/ticket-metrics.response.dto";

/**
 * Controlador HTTP del módulo de tickets protegido por JWT y roles.
 */
@ApiTags("tickets")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("tickets")
export class TicketsController {
  /** Inyecta los servicios de orquestación de tickets y de cierre masivo SQL-only. */
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly ticketsCloseService: TicketsCloseService,
  ) {}

  /**
   * Lista tickets visibles para el usuario autenticado.
   * @param user - Usuario autenticado desde el JWT.
   * @param query - Filtros y paginación.
   * @returns Listado paginado de tickets enriquecidos.
   * @throws Propaga excepciones del servicio (p. ej. GLPI no disponible).
   */
  @Get()
  @ApiOperation({ summary: "List tickets visible to the current user" })
  @ApiResponse({ status: 200, type: TicketListResponseDto })
  @ResponseMessage("Tickets retrieved")
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTicketsQueryDto,
  ): Promise<TicketListResponseDto> {
    return this.ticketsService.list(user, query);
  }

  /**
   * Devuelve métricas agregadas de tickets para el usuario actual.
   * @param user - Usuario autenticado.
   * @returns Métricas de mis tickets, sede, tipos y abiertos por sede.
   * @throws Propaga excepciones del servicio o timeout HTTP configurado.
   */
  @Get("metrics")
  @RequestTimeoutMs(METRICS_HTTP_TIMEOUT_MS)
  @ApiOperation({ summary: "Aggregated ticket metrics for the current user" })
  @ApiResponse({ status: 200, type: TicketMetricsResponseDto })
  @ResponseMessage("Ticket metrics retrieved")
  async metrics(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketMetricsResponseDto> {
    return this.ticketsService.getMetrics(user);
  }

  /**
   * Historial paginado de tickets (pestaña Historial).
   * @param user - Usuario autenticado.
   * @param query - Filtros y paginación.
   * @param res - Respuesta HTTP para cabecera `X-History-Source`.
   * @returns Listado paginado desde MySQL.
   * @throws {BusinessException} Si `GLPI_HISTORY_SOURCE` no es `sql`.
   */
  @Get("history")
  @ApiOperation({ summary: "Paginated ticket history for the current user (Historial tab)" })
  @ApiResponse({ status: 200, type: TicketListResponseDto })
  @ResponseMessage("Ticket history retrieved")
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTicketsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TicketListResponseDto> {
    const meta: HistoryListMeta = { source: "glpi-api" };
    const result = await this.ticketsService.listHistory(user, query, meta);
    res.setHeader("X-History-Source", meta.source);
    return result;
  }

  /**
   * Lista tickets candidatos a cierre masivo, 100% vía SQL (super admin).
   *
   * ATENCIÓN: debe permanecer declarado antes de `findOne(":id")` — Express
   * resuelve rutas en orden de declaración y `:id` capturaría "close-candidates".
   * @param query - Filtros de estado, fecha, búsqueda, orden y paginación.
   * @returns Listado paginado desde MySQL.
   * @throws {BusinessException} Si no se especifica rango de fechas.
   */
  @Get("close-candidates")
  @SuperAdmin()
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "List tickets eligible for bulk close (super admin, SQL-only)" })
  @ApiResponse({ status: 200, type: TicketListResponseDto })
  @ResponseMessage("Close candidates retrieved")
  async closeCandidates(
    @Query() query: CloseCandidatesQueryDto,
  ): Promise<TicketListResponseDto> {
    return this.ticketsCloseService.listCandidates(query);
  }

  /**
   * Detalle de un candidato a cierre masivo, 100% vía SQL (super admin).
   *
   * ATENCIÓN: debe permanecer declarado antes de `findOne(":id")` por el mismo
   * motivo que `closeCandidates`.
   * @param id - ID numérico del ticket.
   * @returns Ticket enriquecido.
   * @throws {BusinessException} 404 si no existe, está borrado o ya cerrado.
   */
  @Get("close-candidates/:id")
  @SuperAdmin()
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Get a bulk-close candidate ticket by id (super admin, SQL-only)" })
  @ApiResponse({ status: 200, type: TicketResponseDto })
  @ResponseMessage("Close candidate retrieved")
  async closeCandidateDetail(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<TicketResponseDto> {
    return this.ticketsCloseService.getCandidateDetail(id);
  }

  /**
   * Cierra en bloque los tickets indicados, 100% vía SQL (super admin).
   * @param dto - IDs de tickets a cerrar.
   * @returns Conteo de solicitados, cerrados, omitidos y fallidos.
   */
  @Post("close-bulk")
  @SuperAdmin()
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Bulk close tickets (super admin, SQL-only, transactional)" })
  @ApiResponse({ status: 200, type: CloseBulkResponseDto })
  @ResponseMessage("Bulk close completed")
  async closeBulk(@Body() dto: CloseBulkDto): Promise<CloseBulkResponseDto> {
    return this.ticketsCloseService.closeBulk(dto.ticketIds);
  }

  /**
   * Obtiene un ticket por ID con control de acceso.
   * @param user - Usuario autenticado.
   * @param id - ID numérico del ticket.
   * @returns Ticket enriquecido con categoría, sede y actores.
   * @throws {BusinessException} Si no existe o el usuario no tiene acceso.
   */
  @Get(":id")
  @ApiOperation({ summary: "Get a ticket by id" })
  @ApiResponse({ status: 200, type: TicketResponseDto })
  @ResponseMessage("Ticket retrieved")
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseIntPipe) id: number,
  ): Promise<TicketResponseDto> {
    return this.ticketsService.findById(user, id);
  }

  /**
   * Crea un ticket nuevo con auto-asignación según rol.
   * @param user - Usuario autenticado (solicitante o técnico).
   * @param dto - Datos del ticket a crear.
   * @returns ID, asunto y estado del envío de correo.
   * @throws {BusinessException} Por validación de catálogo, técnico o permisos.
   */
  @Post()
  @RequestTimeoutMs(TICKET_CREATE_HTTP_TIMEOUT_MS)
  @ApiOperation({ summary: "Create a new ticket" })
  @ApiResponse({ status: 201, type: CreateTicketResponseDto })
  @ResponseMessage("Ticket created successfully")
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTicketDto,
  ): Promise<CreateTicketResponseDto> {
    return this.ticketsService.create(user, dto);
  }

  /**
   * Actualiza el estado de un ticket.
   * @param user - Usuario autenticado.
   * @param id - ID del ticket.
   * @param dto - Nuevo estado y nota de resolución opcional.
   * @returns ID y estado confirmado.
   * @throws {BusinessException} Por transición inválida, permisos o nota insuficiente.
   */
  @Patch(":id/status")
  @ApiOperation({ summary: "Update the status of a ticket" })
  @ApiResponse({ status: 200, type: UpdateTicketStatusResponseDto })
  @ResponseMessage("Ticket status updated")
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateTicketStatusDto,
  ): Promise<UpdateTicketStatusResponseDto> {
    return this.ticketsService.updateStatus(user, id, dto.status, dto.resolutionNote);
  }

  /**
   * Asigna un técnico al ticket (solo rol technician).
   * @param user - Técnico que realiza la asignación.
   * @param id - ID del ticket.
   * @param dto - ID del técnico destino.
   * @returns Ticket enriquecido tras la asignación.
   * @throws {BusinessException} Si el ticket o técnico no son válidos.
   */
  @Post(":id/assign")
  @Roles("technician")
  @ApiOperation({ summary: "Assign a technician to a ticket" })
  @ApiResponse({ status: 200, type: TicketResponseDto })
  @ResponseMessage("Technician assigned")
  async assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: AssignTechnicianDto,
  ): Promise<TicketResponseDto> {
    return this.ticketsService.assignTechnician(user, id, dto.technicianId);
  }

  /**
   * Actualiza la sede del ticket (solo rol technician).
   * @param user - Técnico autenticado.
   * @param id - ID del ticket.
   * @param dto - Nueva sede (location).
   * @returns Ticket enriquecido con la sede actualizada.
   * @throws {BusinessException} Si el ticket o la sede no son válidos.
   */
  @Patch(":id/location")
  @Roles("technician")
  @ApiOperation({ summary: "Update the location (sede) of a ticket" })
  @ApiResponse({ status: 200, type: TicketResponseDto })
  @ResponseMessage("Ticket location updated")
  async updateLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateTicketLocationDto,
  ): Promise<TicketResponseDto> {
    return this.ticketsService.updateLocation(user, id, dto.locationId);
  }

  /**
   * Actualiza el solicitante del ticket (solo rol technician).
   * @param user - Técnico autenticado.
   * @param id - ID del ticket.
   * @param dto - Nuevo solicitante.
   * @returns Ticket enriquecido con el solicitante actualizado.
   * @throws {BusinessException} Si el ticket o el usuario no son válidos.
   */
  @Patch(":id/requester")
  @Roles("technician")
  @ApiOperation({ summary: "Update the requester of a ticket" })
  @ApiResponse({ status: 200, type: TicketResponseDto })
  @ResponseMessage("Ticket requester updated")
  async updateRequester(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateTicketRequesterDto,
  ): Promise<TicketResponseDto> {
    return this.ticketsService.updateRequester(user, id, dto.requesterId);
  }
}
