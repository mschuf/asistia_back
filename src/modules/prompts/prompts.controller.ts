/**
 * @file prompts.controller.ts
 * @description Endpoints HTTP CRUD de prompts de IA restringidos a super administradores.
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
import { SuperAdmin } from "../../common/decorators/super-admin.decorator";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import { CreatePromptDto } from "./dto/create-prompt.dto";
import { ListPromptsQueryDto } from "./dto/list-prompts-query.dto";
import { PromptDeleteResponseDto } from "./dto/prompt-delete.response.dto";
import { PromptListResponseDto, PromptResponseDto } from "./dto/prompt.response.dto";
import { UpdatePromptDto } from "./dto/update-prompt.dto";
import { PromptsService } from "./prompts.service";

/** Controlador REST de prompts con guardas JWT y super admin. */
@ApiTags("prompts")
@ApiBearerAuth()
@SuperAdmin()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller("prompts")
export class PromptsController {
  /**
   * Inyecta el servicio de prompts.
   * @param promptsService - Servicio de negocio de prompts.
   */
  constructor(private readonly promptsService: PromptsService) {}

  /**
   * Lista prompts con paginación y búsqueda opcional.
   * @param query - Parámetros de paginación, búsqueda y filtro por empresa.
   * @returns Lista paginada de prompts.
   */
  @Get()
  @ApiOperation({ summary: "List prompts with pagination and optional search" })
  @ApiResponse({ status: 200, type: PromptListResponseDto })
  @ResponseMessage("Prompts retrieved")
  async list(@Query() query: ListPromptsQueryDto): Promise<PromptListResponseDto> {
    return this.promptsService.list(query);
  }

  /**
   * Obtiene un prompt por identificador.
   * @param id - ID numérico del prompt.
   * @returns DTO del prompt.
   * @throws {BusinessException} Si el prompt no existe.
   */
  @Get(":id")
  @ApiOperation({ summary: "Get a prompt by id" })
  @ApiResponse({ status: 200, type: PromptResponseDto })
  @ResponseMessage("Prompt retrieved")
  async byId(@Param("id", ParseIntPipe) id: number): Promise<PromptResponseDto> {
    return this.promptsService.findById(id);
  }

  /**
   * Crea un nuevo prompt para una empresa.
   * @param dto - Datos de creación validados.
   * @returns DTO del prompt creado.
   * @throws {BusinessException} Si la empresa no existe o ya tiene prompt.
   */
  @Post()
  @ApiOperation({ summary: "Create a prompt" })
  @ApiResponse({ status: 201, type: PromptResponseDto })
  @ResponseMessage("Prompt created")
  async create(@Body() dto: CreatePromptDto): Promise<PromptResponseDto> {
    return this.promptsService.create(dto);
  }

  /**
   * Actualiza parcialmente un prompt existente.
   * @param id - ID del prompt a modificar.
   * @param dto - Campos a actualizar.
   * @returns DTO del prompt actualizado.
   * @throws {BusinessException} Si el prompt no existe o hay conflicto de unicidad.
   */
  @Patch(":id")
  @ApiOperation({ summary: "Update a prompt" })
  @ApiResponse({ status: 200, type: PromptResponseDto })
  @ResponseMessage("Prompt updated")
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdatePromptDto,
  ): Promise<PromptResponseDto> {
    return this.promptsService.update(id, dto);
  }

  /**
   * Elimina permanentemente un prompt.
   * @param id - ID del prompt.
   * @returns Confirmación con el ID eliminado.
   * @throws {BusinessException} Si el prompt no existe.
   */
  @Delete(":id")
  @ApiOperation({ summary: "Permanently delete a prompt" })
  @ApiResponse({ status: 200, type: PromptDeleteResponseDto })
  @ResponseMessage("Prompt deleted")
  async delete(@Param("id", ParseIntPipe) id: number): Promise<PromptDeleteResponseDto> {
    return this.promptsService.delete(id);
  }
}
