/**
 * @file prompts.service.ts
 * @description Orquesta el CRUD de prompts por empresa contra Postgres y aplica reglas de negocio.
 */
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../common/dto/pagination.dto";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { CreatePromptInput, UpdatePromptInput } from "./prompts.types";
import { CreatePromptDto } from "./dto/create-prompt.dto";
import {
  DEFAULT_PROMPTS_PAGE_LIMIT,
  type ListPromptsQueryDto,
} from "./dto/list-prompts-query.dto";
import type { PromptResponseDto } from "./dto/prompt.response.dto";
import { UpdatePromptDto } from "./dto/update-prompt.dto";
import { mapPromptRowToResponse } from "./mappers/prompt.mapper";
import { PromptsSqlRepository } from "./repositories/prompts.sql-repository";

/**
 * Servicio de gestión de prompts de IA asociados a empresas.
 */
@Injectable()
export class PromptsService {
  /**
   * Inyecta el repositorio SQL de prompts.
   * @param repo - Repositorio Postgres de prompts.
   */
  constructor(private readonly repo: PromptsSqlRepository) {}

  /**
   * Lista prompts paginados con búsqueda y filtro por empresa.
   * @param query - Parámetros de paginación, búsqueda y `companyId`.
   * @returns Resultado paginado con DTOs de respuesta.
   */
  async list(query: ListPromptsQueryDto): Promise<PaginatedResult<PromptResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PROMPTS_PAGE_LIMIT;
    const result = await this.repo.findAll({
      page,
      limit,
      search: query.search,
      companyId: query.companyId,
    });

    return {
      items: result.items.map(mapPromptRowToResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * Obtiene un prompt por su identificador.
   * @param id - ID numérico del prompt.
   * @returns DTO del prompt encontrado.
   * @throws {BusinessException} Si el prompt no existe.
   */
  async findById(id: number): Promise<PromptResponseDto> {
    const prompt = await this.repo.findById(id);
    if (!prompt) {
      throw new BusinessException({
        message: `Prompt ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapPromptRowToResponse(prompt);
  }

  /**
   * Crea un prompt único para una empresa.
   * @param dto - Datos de creación validados por el DTO.
   * @returns DTO del prompt creado.
   * @throws {BusinessException} Si la empresa no existe o ya tiene prompt.
   */
  async create(dto: CreatePromptDto): Promise<PromptResponseDto> {
    await this.ensureCompanyExists(dto.companyId);
    await this.ensureCompanyHasNoPrompt(dto.companyId);

    const input: CreatePromptInput = {
      companyId: dto.companyId,
      systemInstruction: dto.systemInstruction.trim(),
      promptTemplate: dto.promptTemplate.trim(),
    };

    const created = await this.repo.create(input);
    return mapPromptRowToResponse(created);
  }

  /**
   * Actualiza parcialmente un prompt existente.
   * @param id - ID del prompt a modificar.
   * @param dto - Campos a actualizar; los omitidos no se modifican.
   * @returns DTO del prompt actualizado.
   * @throws {BusinessException} Si el prompt o la empresa destino no existen, o hay conflicto de unicidad.
   */
  async update(id: number, dto: UpdatePromptDto): Promise<PromptResponseDto> {
    await this.ensureExists(id);

    if (dto.companyId !== undefined) {
      await this.ensureCompanyExists(dto.companyId);
      const existingForCompany = await this.repo.findByCompanyId(dto.companyId);
      if (existingForCompany && Number(existingForCompany.id) !== id) {
        throw new BusinessException({
          message: `Company ${dto.companyId} already has a prompt`,
          code: API_ERROR_CODE.CONFLICT,
          status: HttpStatus.CONFLICT,
        });
      }
    }

    const input: UpdatePromptInput = {};
    if (dto.companyId !== undefined) input.companyId = dto.companyId;
    if (dto.systemInstruction !== undefined) {
      input.systemInstruction = dto.systemInstruction.trim();
    }
    if (dto.promptTemplate !== undefined) input.promptTemplate = dto.promptTemplate.trim();

    const updated = await this.repo.update(id, input);
    if (!updated) {
      throw new BusinessException({
        message: `Prompt ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapPromptRowToResponse(updated);
  }

  /**
   * Elimina permanentemente un prompt.
   * @param id - ID del prompt.
   * @returns Confirmación con el ID eliminado.
   * @throws {BusinessException} Si el prompt no existe.
   */
  async delete(id: number): Promise<{ id: number; deleted: true }> {
    await this.ensureExists(id);
    const deletedId = await this.repo.hardDelete(id);
    if (deletedId == null) {
      throw new BusinessException({
        message: `Prompt ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return { id: deletedId, deleted: true };
  }

  /**
   * Verifica que un prompt exista antes de operaciones de escritura.
   * @param id - ID del prompt a validar.
   * @throws {BusinessException} Si el prompt no existe.
   */
  private async ensureExists(id: number): Promise<void> {
    const prompt = await this.repo.findById(id);
    if (!prompt) {
      throw new BusinessException({
        message: `Prompt ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }
  }

  /**
   * Verifica que la empresa referenciada exista en Postgres.
   * @param companyId - ID de la empresa a validar.
   * @throws {BusinessException} Si la empresa no existe.
   */
  private async ensureCompanyExists(companyId: number): Promise<void> {
    const exists = await this.repo.companyExists(companyId);
    if (!exists) {
      throw new BusinessException({
        message: `Company ${companyId} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }
  }

  /**
   * Garantiza relación uno-a-uno: una empresa no puede tener más de un prompt.
   * @param companyId - ID de la empresa a validar.
   * @throws {BusinessException} Si la empresa ya tiene un prompt asociado.
   */
  private async ensureCompanyHasNoPrompt(companyId: number): Promise<void> {
    const existing = await this.repo.findByCompanyId(companyId);
    if (existing) {
      throw new BusinessException({
        message: `Company ${companyId} already has a prompt`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }
  }
}
