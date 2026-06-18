/**
 * @file visitas.controller.ts
 * @description Endpoints HTTP CRUD de visitas para el módulo Portería.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { PorteriaGuard } from "../../common/guards/porteria.guard";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import { VisitasService } from "./visitas.service";
import { CreateVisitaDto } from "./dto/create-visita.dto";
import { ListVisitasQueryDto } from "./dto/list-visitas-query.dto";
import { UpdateVisitaDto } from "./dto/update-visita.dto";
import { VisitaMetricsResponseDto } from "./dto/visita-metrics.response.dto";
import { VisitaMetricsQueryDto } from "./dto/visita-metrics-query.dto";
import { VisitaListResponseDto, VisitaResponseDto } from "./dto/visita.response.dto";

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
   * Crea una visita nueva.
   * @param dto - Datos de creación.
   * @returns DTO de la visita creada.
   */
  @Post()
  @ApiOperation({ summary: "Create visita" })
  @ApiResponse({ status: 201, type: VisitaResponseDto })
  @ResponseMessage("Visita created")
  async create(@Body() dto: CreateVisitaDto): Promise<VisitaResponseDto> {
    return this.visitasService.create(dto);
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
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateVisitaDto,
  ): Promise<VisitaResponseDto> {
    return this.visitasService.update(id, dto);
  }

  /**
   * Elimina permanentemente una visita programada o cancelada.
   * @param id - ID de la visita.
   * @returns Confirmación de eliminación.
   */
  @Delete(":id")
  @ApiOperation({ summary: "Permanently delete visita" })
  @ResponseMessage("Visita deleted")
  async deletePermanent(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<{ id: number; deleted: true }> {
    return this.visitasService.deletePermanent(id);
  }
}
