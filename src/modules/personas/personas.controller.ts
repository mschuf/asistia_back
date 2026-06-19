/**
 * @file personas.controller.ts
 * @description Endpoints HTTP CRUD de personas para el módulo Portería.
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
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { PorteriaGuard } from "../../common/guards/porteria.guard";
import { ResponseMessage, SkipResponseEnvelope } from "../../common/interceptors/response-message.decorator";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import { PersonasService } from "./personas.service";
import { CreatePersonaDto } from "./dto/create-persona.dto";
import { ListPersonasQueryDto } from "./dto/list-personas-query.dto";
import { ListVisitCandidatesQueryDto } from "./dto/list-visit-candidates-query.dto";
import { UpdatePersonaDto } from "./dto/update-persona.dto";
import { PersonaListResponseDto, PersonaResponseDto } from "./dto/persona.response.dto";
import {
  VisitCandidateListResponseDto,
} from "./dto/visit-candidate.response.dto";
import { personaPhotoMulterOptions } from "./persona-photo.multer.config";

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
   * Busca personas activas para el selector de visitas.
   * @param query - Texto de búsqueda y límite.
   * @returns Lista de candidatos ordenada por nombre.
   */
  @Get("visit-candidates")
  @ApiOperation({ summary: "Search active personas for visit person selector" })
  @ApiResponse({ status: 200, type: VisitCandidateListResponseDto })
  @ResponseMessage("Visit person candidates retrieved")
  async searchVisitCandidates(
    @Query() query: ListVisitCandidatesQueryDto,
  ): Promise<VisitCandidateListResponseDto> {
    return this.personasService.searchVisitCandidates(query);
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
   * Obtiene la foto de una persona como stream binario.
   * @param id - ID numérico de la persona.
   * @param res - Respuesta Express para escribir bytes.
   */
  @Get(":id/foto")
  @SkipResponseEnvelope()
  @ApiOperation({ summary: "Get persona photo as binary image" })
  @ApiResponse({ status: 200, description: "Binary image stream" })
  async getPhoto(@Param("id", ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const photo = await this.personasService.getPhoto(id);
    res.setHeader("Content-Type", photo.mimeType);
    res.setHeader("Content-Length", String(photo.size));
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(photo.buffer);
  }

  /**
   * Sube o reemplaza la foto de una persona vía multipart/form-data.
   * @param id - ID numérico de la persona.
   * @param file - Archivo recibido bajo el campo `file`.
   * @returns DTO de la persona actualizada.
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
  @ApiOperation({ summary: "Upload or replace persona photo (optional, max 15 MB after processing)" })
  @ApiResponse({ status: 200, type: PersonaResponseDto })
  @ResponseMessage("Persona photo uploaded")
  async uploadPhoto(
    @Param("id", ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<PersonaResponseDto> {
    if (!file) {
      throw new BusinessException({
        message: "No file received under field 'file'",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    return this.personasService.setPhoto(id, file);
  }

  /**
   * Elimina la foto almacenada de una persona.
   * @param id - ID numérico de la persona.
   * @returns DTO de la persona actualizada.
   */
  @Delete(":id/foto")
  @ApiOperation({ summary: "Remove persona photo" })
  @ApiResponse({ status: 200, type: PersonaResponseDto })
  @ResponseMessage("Persona photo removed")
  async removePhoto(@Param("id", ParseIntPipe) id: number): Promise<PersonaResponseDto> {
    return this.personasService.removePhoto(id);
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
