/**
 * @file motivos-visita.controller.ts
 * @description Endpoints HTTP CRUD de motivos de visita para el módulo Portería.
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
import { MotivosVisitaService } from "./motivos-visita.service";
import { CreateMotivoVisitaDto } from "./dto/create-motivo-visita.dto";
import { ListMotivosVisitaQueryDto } from "./dto/list-motivos-visita-query.dto";
import { ListMotivoVisitCandidatesQueryDto } from "./dto/list-visit-candidates-query.dto";
import { UpdateMotivoVisitaDto } from "./dto/update-motivo-visita.dto";
import {
  MotivoVisitaListResponseDto,
  MotivoVisitaResponseDto,
} from "./dto/motivo-visita.response.dto";
import { MotivoVisitCandidateListResponseDto } from "./dto/visit-candidate.response.dto";

/** Controlador REST de motivos de visita con guard JWT. */
@ApiTags("motivos-visita")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PorteriaGuard)
@Controller("motivos-visita")
export class MotivosVisitaController {
  /** Inyecta el servicio de motivos de visita. */
  constructor(private readonly motivosVisitaService: MotivosVisitaService) {}

  /**
   * Lista motivos de visita con paginación, filtros y orden opcional.
   * @param query - Parámetros de consulta.
   * @returns Lista paginada de motivos de visita.
   */
  @Get()
  @ApiOperation({ summary: "List motivos de visita with pagination, filters and sorting" })
  @ApiResponse({ status: 200, type: MotivoVisitaListResponseDto })
  @ResponseMessage("Motivos de visita retrieved")
  async list(@Query() query: ListMotivosVisitaQueryDto): Promise<MotivoVisitaListResponseDto> {
    return this.motivosVisitaService.list(query);
  }

  /**
   * Busca motivos de visita activos para el selector de visitas.
   * @param query - Texto de búsqueda y límite.
   * @returns Lista de candidatos ordenada por nombre.
   */
  @Get("visit-candidates")
  @ApiOperation({ summary: "Search active motivos de visita for visit motivo selector" })
  @ApiResponse({ status: 200, type: MotivoVisitCandidateListResponseDto })
  @ResponseMessage("Visit motivo candidates retrieved")
  async searchVisitCandidates(
    @Query() query: ListMotivoVisitCandidatesQueryDto,
  ): Promise<MotivoVisitCandidateListResponseDto> {
    return this.motivosVisitaService.searchVisitCandidates(query);
  }

  /**
   * Obtiene un motivo de visita por identificador.
   * @param id - ID numérico del motivo.
   * @returns DTO del motivo.
   */
  @Get(":id")
  @ApiOperation({ summary: "Get motivo de visita by id" })
  @ApiResponse({ status: 200, type: MotivoVisitaResponseDto })
  @ResponseMessage("Motivo de visita retrieved")
  async findById(@Param("id", ParseIntPipe) id: number): Promise<MotivoVisitaResponseDto> {
    return this.motivosVisitaService.findById(id);
  }

  /**
   * Crea un motivo de visita nuevo.
   * @param dto - Datos de creación.
   * @returns DTO del motivo creado.
   */
  @Post()
  @ApiOperation({ summary: "Create motivo de visita" })
  @ApiResponse({ status: 201, type: MotivoVisitaResponseDto })
  @ResponseMessage("Motivo de visita created")
  async create(@Body() dto: CreateMotivoVisitaDto): Promise<MotivoVisitaResponseDto> {
    return this.motivosVisitaService.create(dto);
  }

  /**
   * Actualiza parcialmente un motivo de visita existente.
   * @param id - ID del motivo.
   * @param dto - Campos a actualizar.
   * @returns DTO del motivo actualizado.
   */
  @Patch(":id")
  @ApiOperation({ summary: "Update motivo de visita" })
  @ApiResponse({ status: 200, type: MotivoVisitaResponseDto })
  @ResponseMessage("Motivo de visita updated")
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateMotivoVisitaDto,
  ): Promise<MotivoVisitaResponseDto> {
    return this.motivosVisitaService.update(id, dto);
  }

  /**
   * Desactiva un motivo de visita (soft delete).
   * @param id - ID del motivo.
   * @returns DTO del motivo desactivado.
   */
  @Patch(":id/deactivate")
  @ApiOperation({ summary: "Deactivate motivo de visita" })
  @ApiResponse({ status: 200, type: MotivoVisitaResponseDto })
  @ResponseMessage("Motivo de visita deactivated")
  async deactivate(@Param("id", ParseIntPipe) id: number): Promise<MotivoVisitaResponseDto> {
    return this.motivosVisitaService.deactivate(id);
  }

  /**
   * Reactiva un motivo de visita desactivado.
   * @param id - ID del motivo.
   * @returns DTO del motivo activado.
   */
  @Patch(":id/activate")
  @ApiOperation({ summary: "Activate motivo de visita" })
  @ApiResponse({ status: 200, type: MotivoVisitaResponseDto })
  @ResponseMessage("Motivo de visita activated")
  async activate(@Param("id", ParseIntPipe) id: number): Promise<MotivoVisitaResponseDto> {
    return this.motivosVisitaService.activate(id);
  }

  /**
   * Elimina permanentemente un motivo de visita sin visitas asociadas.
   * @param id - ID del motivo.
   * @returns Confirmación de eliminación.
   */
  @Delete(":id")
  @ApiOperation({ summary: "Permanently delete motivo de visita" })
  @ResponseMessage("Motivo de visita deleted")
  async deletePermanent(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<{ id: number; deleted: true }> {
    return this.motivosVisitaService.deletePermanent(id);
  }
}
