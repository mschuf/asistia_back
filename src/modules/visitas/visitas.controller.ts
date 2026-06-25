/**
 * @file visitas.controller.ts
 * @description Endpoints HTTP CRUD de visitas para el módulo Portería.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { PorteriaGuard } from "../../common/guards/porteria.guard";
import { ResponseMessage, SkipResponseEnvelope } from "../../common/interceptors/response-message.decorator";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { personaPhotoMulterOptions } from "../personas/persona-photo.multer.config";
import { VisitasService } from "./visitas.service";
import { CreateVisitaDto } from "./dto/create-visita.dto";
import { ListVisitasQueryDto } from "./dto/list-visitas-query.dto";
import { UpdateVisitaDto } from "./dto/update-visita.dto";
import { VisitaMetricsResponseDto } from "./dto/visita-metrics.response.dto";
import { VisitaMetricsQueryDto } from "./dto/visita-metrics-query.dto";
import { VisitaListResponseDto, VisitaResponseDto } from "./dto/visita.response.dto";
import { ListResponsableCandidatesQueryDto } from "./dto/list-responsable-candidates-query.dto";
import { ResponsableCandidateListResponseDto } from "./dto/responsable-candidate.response.dto";

/** Controlador REST de visitas con guard JWT. */
@ApiTags("visitas")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PorteriaGuard)
@Controller("visitas")
export class VisitasController {
  /** Inyecta el servicio de visitas. */
  constructor(private readonly visitasService: VisitasService) {}

  /**
   * Lista visitas con paginación, filtros y orden opcional.
   * @param query - Parámetros de consulta.
   * @returns Lista paginada de visitas.
   */
  @Get()
  @ApiOperation({ summary: "List visitas with pagination, filters and sorting" })
  @ApiResponse({ status: 200, type: VisitaListResponseDto })
  @ResponseMessage("Visitas retrieved")
  async list(@Query() query: ListVisitasQueryDto): Promise<VisitaListResponseDto> {
    return this.visitasService.list(query);
  }

  /**
   * Obtiene métricas agregadas de visitas para el dashboard de Portería.
   * @returns Contadores de visitas por mes, día y zonas activas.
   */
  @Get("metrics")
  @ApiOperation({ summary: "Get visita metrics for Porteria dashboard cards" })
  @ApiResponse({ status: 200, type: VisitaMetricsResponseDto })
  @ResponseMessage("Visita metrics retrieved")
  async getMetrics(@Query() query: VisitaMetricsQueryDto): Promise<VisitaMetricsResponseDto> {
    return this.visitasService.getMetrics(query);
  }

  /**
   * Busca usuarios GLPI activos para el selector de responsable al crear visitas.
   * @param query - Texto de búsqueda, ID puntual o límite de resultados.
   * @returns Lista de candidatos responsables.
   */
  @Get("responsable-candidates")
  @ApiOperation({ summary: "Search active GLPI users for visit responsable selector" })
  @ApiResponse({ status: 200, type: ResponsableCandidateListResponseDto })
  @ResponseMessage("Responsable candidates retrieved")
  async searchResponsableCandidates(
    @Query() query: ListResponsableCandidatesQueryDto,
  ): Promise<ResponsableCandidateListResponseDto> {
    return this.visitasService.searchResponsableCandidates(query);
  }

  /**
   * Obtiene una visita por identificador.
   * @param id - ID numérico de la visita.
   * @returns DTO de la visita.
   */
  @Get(":id")
  @ApiOperation({ summary: "Get visita by id" })
  @ApiResponse({ status: 200, type: VisitaResponseDto })
  @ResponseMessage("Visita retrieved")
  async findById(@Param("id", ParseIntPipe) id: number): Promise<VisitaResponseDto> {
    return this.visitasService.findById(id);
  }

  /**
   * Obtiene la foto de una visita como stream binario.
   * @param id - ID numérico de la visita.
   * @param res - Respuesta Express para escribir bytes.
   */
  @Get(":id/foto")
  @SkipResponseEnvelope()
  @ApiOperation({ summary: "Get visita photo as binary image" })
  @ApiResponse({ status: 200, description: "Binary image stream" })
  async getPhoto(@Param("id", ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const photo = await this.visitasService.getPhoto(id);
    res.setHeader("Content-Type", photo.mimeType);
    res.setHeader("Content-Length", String(photo.size));
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(photo.buffer);
  }

  /**
   * Sube o reemplaza la foto de una visita vía multipart/form-data.
   * @param id - ID numérico de la visita.
   * @param file - Archivo recibido bajo el campo `file`.
   * @returns DTO de la visita actualizada.
   */
  @Post(":id/foto")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
      },
    },
  })
  @UseInterceptors(FileInterceptor("file", personaPhotoMulterOptions))
  @ApiOperation({ summary: "Upload or replace visita photo (optional, max 15 MB after processing)" })
  @ApiResponse({ status: 200, type: VisitaResponseDto })
  @ResponseMessage("Visita photo uploaded")
  async uploadPhoto(
    @Param("id", ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<VisitaResponseDto> {
    if (!file) {
      throw new BusinessException({
        message: "No file received under field 'file'",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    return this.visitasService.setPhoto(id, file);
  }

  /**
   * Crea una visita nueva.
   * @param dto - Datos de creación.
   * @returns DTO de la visita creada.
   */
  @Post()
  @ApiOperation({ summary: "Create visita" })
  @ApiResponse({ status: 201, type: VisitaResponseDto })
  @ResponseMessage("Visita created")
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVisitaDto,
  ): Promise<VisitaResponseDto> {
    return this.visitasService.create(user.id, dto);
  }

  /**
   * Actualiza parcialmente una visita existente.
   * @param id - ID de la visita.
   * @param dto - Campos a actualizar.
   * @returns DTO de la visita actualizada.
   */
  @Patch(":id")
  @ApiOperation({ summary: "Update visita" })
  @ApiResponse({ status: 200, type: VisitaResponseDto })
  @ResponseMessage("Visita updated")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateVisitaDto,
  ): Promise<VisitaResponseDto> {
    return this.visitasService.update(user.id, id, dto);
  }

  /**
   * Elimina una visita no activa y registra el evento en auditoría.
   * @param id - ID de la visita.
   * @returns Confirmación de eliminación o cancelación.
   */
  @Delete(":id")
  @ApiOperation({ summary: "Delete visita (cancel if active) and log audit event" })
  @ResponseMessage("Visita deleted")
  async deletePermanent(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseIntPipe) id: number,
  ): Promise<{ id: number; deleted: true } | { id: number; cancelled: true }> {
    return this.visitasService.deletePermanent(user.id, id);
  }
}
