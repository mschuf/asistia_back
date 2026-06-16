/**
 * @file personas.controller.ts
 * @description Endpoints HTTP CRUD de personas para el módulo Portería.
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
import { PersonasService } from "./personas.service";
import { CreatePersonaDto } from "./dto/create-persona.dto";
import { ListPersonasQueryDto } from "./dto/list-personas-query.dto";
import { ListVisitCandidatesQueryDto } from "./dto/list-visit-candidates-query.dto";
import { UpdatePersonaDto } from "./dto/update-persona.dto";
import { PersonaListResponseDto, PersonaResponseDto } from "./dto/persona.response.dto";
import {
  VisitCandidateListResponseDto,
} from "./dto/visit-candidate.response.dto";
import { GlpiPersonaPreviewResponseDto } from "./dto/glpi-persona-preview.response.dto";

/** Controlador REST de personas con guard JWT. */
@ApiTags("personas")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PorteriaGuard)
@Controller("personas")
export class PersonasController {
  /** Inyecta el servicio de personas. */
  constructor(private readonly personasService: PersonasService) {}

  /**
   * Lista personas con paginación, filtros y orden opcional.
   * @param query - Parámetros de consulta.
   * @returns Lista paginada de personas.
   */
  @Get()
  @ApiOperation({ summary: "List personas with pagination, filters and sorting" })
  @ApiResponse({ status: 200, type: PersonaListResponseDto })
  @ResponseMessage("Personas retrieved")
  async list(@Query() query: ListPersonasQueryDto): Promise<PersonaListResponseDto> {
    return this.personasService.list(query);
  }

  /**
   * Busca candidatos unificados (Postgres + GLPI) para el selector de visitas.
   * @param query - Texto de búsqueda y límite.
   * @returns Lista de candidatos ordenada por nombre.
   */
  @Get("visit-candidates")
  @ApiOperation({ summary: "Search visit person candidates from Postgres and GLPI" })
  @ApiResponse({ status: 200, type: VisitCandidateListResponseDto })
  @ResponseMessage("Visit person candidates retrieved")
  async searchVisitCandidates(
    @Query() query: ListVisitCandidatesQueryDto,
  ): Promise<VisitCandidateListResponseDto> {
    return this.personasService.searchVisitCandidates(query);
  }

  /**
   * Obtiene o crea una persona vinculada a un usuario GLPI.
   * @param glpiUserId - ID numérico del usuario GLPI.
   * @returns DTO de la persona vinculada.
   */
  @Post("from-glpi/:glpiUserId")
  @ApiOperation({ summary: "Ensure persona linked to a GLPI user" })
  @ApiResponse({ status: 201, type: PersonaResponseDto })
  @ResponseMessage("Persona linked from GLPI user")
  async ensureFromGlpi(
    @Param("glpiUserId", ParseIntPipe) glpiUserId: number,
  ): Promise<PersonaResponseDto> {
    return this.personasService.ensureFromGlpiUser(glpiUserId);
  }

  /**
   * Vista previa de persona a partir de un usuario GLPI sin persistir.
   * @param glpiUserId - ID numérico del usuario GLPI.
   * @returns Datos precargables para el formulario de creación.
   */
  @Get("glpi-preview/:glpiUserId")
  @ApiOperation({ summary: "Preview persona fields from a GLPI user" })
  @ApiResponse({ status: 200, type: GlpiPersonaPreviewResponseDto })
  @ResponseMessage("GLPI persona preview retrieved")
  async previewFromGlpi(
    @Param("glpiUserId", ParseIntPipe) glpiUserId: number,
  ): Promise<GlpiPersonaPreviewResponseDto> {
    return this.personasService.previewFromGlpiUser(glpiUserId);
  }

  /**
   * Obtiene una persona por identificador.
   * @param id - ID numérico de la persona.
   * @returns DTO de la persona.
   */
  @Get(":id")
  @ApiOperation({ summary: "Get persona by id" })
  @ApiResponse({ status: 200, type: PersonaResponseDto })
  @ResponseMessage("Persona retrieved")
  async findById(@Param("id", ParseIntPipe) id: number): Promise<PersonaResponseDto> {
    return this.personasService.findById(id);
  }

  /**
   * Crea una persona nueva.
   * @param dto - Datos de creación.
   * @returns DTO de la persona creada.
   */
  @Post()
  @ApiOperation({ summary: "Create persona" })
  @ApiResponse({ status: 201, type: PersonaResponseDto })
  @ResponseMessage("Persona created")
  async create(@Body() dto: CreatePersonaDto): Promise<PersonaResponseDto> {
    return this.personasService.create(dto);
  }

  /**
   * Actualiza parcialmente una persona existente.
   * @param id - ID de la persona.
   * @param dto - Campos a actualizar.
   * @returns DTO de la persona actualizada.
   */
  @Patch(":id")
  @ApiOperation({ summary: "Update persona" })
  @ApiResponse({ status: 200, type: PersonaResponseDto })
  @ResponseMessage("Persona updated")
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdatePersonaDto,
  ): Promise<PersonaResponseDto> {
    return this.personasService.update(id, dto);
  }

  /**
   * Desactiva una persona (soft delete).
   * @param id - ID de la persona.
   * @returns DTO de la persona desactivada.
   */
  @Patch(":id/deactivate")
  @ApiOperation({ summary: "Deactivate persona" })
  @ApiResponse({ status: 200, type: PersonaResponseDto })
  @ResponseMessage("Persona deactivated")
  async deactivate(@Param("id", ParseIntPipe) id: number): Promise<PersonaResponseDto> {
    return this.personasService.deactivate(id);
  }

  /**
   * Elimina permanentemente una persona sin visitas activas.
   * @param id - ID de la persona.
   * @returns Confirmación de eliminación.
   */
  @Delete(":id")
  @ApiOperation({ summary: "Permanently delete persona" })
  @ResponseMessage("Persona deleted")
  async deletePermanent(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<{ id: number; deleted: true }> {
    return this.personasService.deletePermanent(id);
  }
}
