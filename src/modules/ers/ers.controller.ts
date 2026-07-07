/**
 * @file ers.controller.ts
 * @description Endpoints del módulo ERS (escalado ticket -> proyecto GLPI).
 */
import { Body, Controller, Delete, Get, HttpStatus, Param, ParseIntPipe, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { LocationResponseDto } from "../catalog/dto/location.response.dto";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ResponseMessage, SkipResponseEnvelope } from "../../common/interceptors/response-message.decorator";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { EscalarTicketDto } from "./dto/escalar-ticket.dto";
import { CreateErsDto } from "./dto/create-ers.dto";
import {
  ErsDetailResponseDto,
  ErsEligibleTicketListResponseDto,
  ErsListResponseDto,
  ErsMetricsResponseDto,
  ErsProjectStateResponseDto,
  ErsProjectTypeResponseDto,
  ErsTechnicianListResponseDto,
} from "./dto/ers.response.dto";
import { ListErsQueryDto } from "./dto/list-ers-query.dto";
import { ListErsEligibleTicketsQueryDto } from "./dto/list-ers-eligible-tickets-query.dto";
import { ListErsTechniciansQueryDto } from "./dto/list-ers-technicians-query.dto";
import { ListErsDocumentsQueryDto } from "./dto/list-ers-documents-query.dto";
import { UpdateErsDto } from "./dto/update-ers.dto";
import { ErsDocumentsService } from "./ers-documents.service";
import { ErsService } from "./ers.service";
import type { ErsDocument, ErsDocumentList } from "./ers-documents.types";

/** Controlador del módulo ERS protegido por JWT y permisos de tickets. */
@ApiTags("ers")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("ers")
export class ErsController {
  constructor(
    private readonly ersService: ErsService,
    private readonly documentsService: ErsDocumentsService,
  ) {}

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

  /** Lista sistemas relacionados disponibles para proyectos ERS. */
  @Get("project-types")
  @ApiOperation({ summary: "List GLPI project types used as related systems" })
  @ApiResponse({ status: 200, type: [ErsProjectTypeResponseDto] })
  @ResponseMessage("Sistemas relacionados ERS obtenidos")
  async projectTypes(): Promise<ErsProjectTypeResponseDto[]> {
    return this.ersService.listProjectTypes();
  }

  /** Lista tipos de requerimiento configurados para ERS. */
  @Get("request-types")
  @ApiOperation({ summary: "List configured ERS request types" })
  @ApiResponse({ status: 200, type: [String] })
  @ResponseMessage("Tipos de requerimiento ERS obtenidos")
  async requestTypes(): Promise<string[]> {
    return this.ersService.listRequestTypes();
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
   * @param dto - Estado completo del ERS.
   * @returns Detalle del ERS creado.
   */
  @Post("escalar")
  @Roles("technician")
  @ApiOperation({ summary: "Scale a ticket into a complete ERS project" })
  @ApiResponse({ status: 201, type: ErsDetailResponseDto })
  @ResponseMessage("Ticket escalado a proyecto ERS")
  async escalate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EscalarTicketDto,
  ): Promise<ErsDetailResponseDto> {
    return this.ersService.escalate(user, dto);
  }

  @Get(":projectId/documents")
  @Roles("technician")
  @ApiOperation({ summary: "List documents linked to an ERS project" })
  @ResponseMessage("Documentos ERS obtenidos")
  async listDocuments(
    @Param("projectId", ParseIntPipe) projectId: number,
    @Query() query: ListErsDocumentsQueryDto,
  ): Promise<ErsDocumentList> {
    return this.documentsService.list(projectId, query);
  }

  @Post(":projectId/documents")
  @Roles("technician")
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } })
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Upload a native GLPI document to an ERS project" })
  @ResponseMessage("Documento ERS guardado")
  async uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId", ParseIntPipe) projectId: number,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ErsDocument> {
    if (!file?.path) {
      throw new BusinessException({
        message: "No se recibió ningún archivo",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }
    return this.documentsService.upload(projectId, {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
    }, user.id);
  }

  @Delete(":projectId/documents/:documentId")
  @Roles("technician")
  @ApiOperation({ summary: "Permanently delete a document linked to an ERS project" })
  @ResponseMessage("Documento ERS eliminado")
  async deleteDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId", ParseIntPipe) projectId: number,
    @Param("documentId", ParseIntPipe) documentId: number,
  ): Promise<void> {
    await this.documentsService.delete(projectId, documentId, user.id);
  }

  @Get(":projectId/documents/:documentId/content")
  @Roles("technician")
  @SkipResponseEnvelope()
  @ApiOperation({ summary: "Stream a document linked to an ERS project" })
  async documentContent(
    @Param("projectId", ParseIntPipe) projectId: number,
    @Param("documentId", ParseIntPipe) documentId: number,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.documentsService.content(projectId, documentId);
    response.setHeader("Content-Type", content.mimeType);
    response.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(content.filename)}`,
    );
    if (content.size) response.setHeader("Content-Length", String(content.size));
    content.stream.on("error", () => response.end());
    content.stream.pipe(response);
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

