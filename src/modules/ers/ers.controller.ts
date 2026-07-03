/**
 * @file ers.controller.ts
 * @description Endpoints del módulo ERS (escalado ticket -> proyecto GLPI).
 */
import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { LocationResponseDto } from "../catalog/dto/location.response.dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { EscalarTicketDto } from "./dto/escalar-ticket.dto";
import { CreateErsDto } from "./dto/create-ers.dto";
import {
  ErsDetailResponseDto,
  ErsEligibleTicketListResponseDto,
  ErsListResponseDto,
  ErsMetricsResponseDto,
  ErsProjectStateResponseDto,
  ErsTechnicianListResponseDto,
} from "./dto/ers.response.dto";
import { ListErsQueryDto } from "./dto/list-ers-query.dto";
import { ListErsEligibleTicketsQueryDto } from "./dto/list-ers-eligible-tickets-query.dto";
import { ListErsTechniciansQueryDto } from "./dto/list-ers-technicians-query.dto";
import { UpdateErsDto } from "./dto/update-ers.dto";
import { ErsService } from "./ers.service";

/** Controlador del módulo ERS protegido por JWT y permisos de tickets. */
@ApiTags("ers")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("ers")
export class ErsController {
  constructor(private readonly ersService: ErsService) {}

  @Post()
  @Roles("technician")
  @ApiOperation({ summary: "Create ticket and complete ERS project atomically" })
  @ApiResponse({ status: 201, type: ErsDetailResponseDto })
  @ResponseMessage("Proyecto ERS creado")
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateErsDto,
  ): Promise<ErsDetailResponseDto> {
    return this.ersService.createStandalone(user, dto);
  }

  /**
   * Lista ERS con paginación server-side.
   * @param user - Usuario autenticado.
   * @param query - Filtros/sort/paginación.
   * @returns Resultado paginado.
   */
  @Get()
  @ApiOperation({ summary: "List ERS projects" })
  @ApiResponse({ status: 200, type: ErsListResponseDto })
  @ResponseMessage("Proyectos ERS obtenidos")
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListErsQueryDto,
  ): Promise<ErsListResponseDto> {
    return this.ersService.list(user, query);
  }

  @Get('metrics')
  @Roles('technician')
  @ApiOperation({ summary: 'Get ERS project metrics' })
  @ApiResponse({ status: 200, type: ErsMetricsResponseDto })
  @ResponseMessage('Indicadores ERS obtenidos')
  async metrics(@CurrentUser() user: AuthenticatedUser) {
    return this.ersService.metrics(user);
  }

  @Get('eligible-tickets')
  @Roles('technician')
  @ApiOperation({ summary: 'List tickets eligible for ERS escalation' })
  @ApiResponse({ status: 200, type: ErsEligibleTicketListResponseDto })
  @ResponseMessage('Tickets elegibles para ERS obtenidos')
  async eligibleTickets(@Query() query: ListErsEligibleTicketsQueryDto) {
    return this.ersService.listEligibleTickets(query);
  }

  /**
   * Lista catálogo de estados de proyecto.
   * @returns Estados de proyecto.
   */
  @Get("states")
  @ApiOperation({ summary: "List GLPI project states" })
  @ApiResponse({ status: 200, type: [ErsProjectStateResponseDto] })
  @ResponseMessage("Estados de proyecto ERS obtenidos")
  async states(): Promise<ErsProjectStateResponseDto[]> {
    return this.ersService.listProjectStates();
  }

  /**
   * Lista técnicos elegibles por sede.
   * @param query - Filtro de sede/búsqueda/paginación.
   * @returns Técnicos paginados.
   */
  @Get("technicians")
  @ApiOperation({ summary: "List eligible technicians for ERS selects" })
  @ApiResponse({ status: 200, type: ErsTechnicianListResponseDto })
  @ResponseMessage("Técnicos ERS obtenidos")
  async technicians(
    @Query() query: ListErsTechniciansQueryDto,
  ): Promise<ErsTechnicianListResponseDto> {
    return this.ersService.listTechniciansByLocation(query);
  }

  @Get("requesters")
  @Roles("technician")
  @ApiOperation({ summary: "List active GLPI requesters directly from MySQL" })
  @ApiResponse({ status: 200, type: ErsTechnicianListResponseDto })
  @ResponseMessage("Solicitantes ERS obtenidos")
  async requesters(
    @Query() query: ListErsTechniciansQueryDto,
  ): Promise<ErsTechnicianListResponseDto> {
    return this.ersService.listRequesters(query);
  }

  @Get("locations")
  @Roles("technician")
  @ApiOperation({ summary: "List GLPI locations directly from MySQL" })
  @ApiResponse({ status: 200, type: [LocationResponseDto] })
  @ResponseMessage("Sedes ERS obtenidas")
  async locations(): Promise<LocationResponseDto[]> {
    return this.ersService.listFilterLocations();
  }

  /**
   * Transacción 1: escala ticket a ERS.
   * @param user - Usuario autenticado.
   * @param dto - Datos iniciales del ERS.
   * @returns Detalle del ERS creado.
   */
  @Post("escalar")
  @Roles("technician")
  @ApiOperation({ summary: "Scale a ticket into a project (ERS transaction 1)" })
  @ApiResponse({ status: 201, type: ErsDetailResponseDto })
  @ResponseMessage("Ticket escalado a proyecto ERS")
  async escalate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EscalarTicketDto,
  ): Promise<ErsDetailResponseDto> {
    return this.ersService.escalate(user, dto);
  }

  /**
   * Obtiene detalle ERS por proyecto.
   * @param user - Usuario autenticado.
   * @param projectId - ID del proyecto.
   * @returns Detalle.
   */
  @Get(":projectId")
  @ApiOperation({ summary: "Get ERS project detail by id" })
  @ApiResponse({ status: 200, type: ErsDetailResponseDto })
  @ResponseMessage("Proyecto ERS obtenido")
  async findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId", ParseIntPipe) projectId: number,
  ): Promise<ErsDetailResponseDto> {
    return this.ersService.findByProjectId(user, projectId);
  }

  /**
   * Transacción 2: guardado TI atómico.
   * @param user - Usuario autenticado.
   * @param projectId - ID del proyecto.
   * @param dto - Estado completo de edición TI.
   * @returns Detalle actualizado.
   */
  @Put(":projectId")
  @Roles("technician")
  @ApiOperation({ summary: "Save TI ERS edition in a single transaction (transaction 2)" })
  @ApiResponse({ status: 200, type: ErsDetailResponseDto })
  @ResponseMessage("Proyecto ERS actualizado")
  async saveTiEdition(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId", ParseIntPipe) projectId: number,
    @Body() dto: UpdateErsDto,
  ): Promise<ErsDetailResponseDto> {
    return this.ersService.saveTiEdition(user, projectId, dto);
  }
}

