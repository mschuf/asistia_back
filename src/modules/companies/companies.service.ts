/**
 * @file companies.service.ts
 * @description Orquesta el CRUD de empresas contra Postgres y aplica reglas de negocio.
 */
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../common/dto/pagination.dto";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { CreateCompanyInput, UpdateCompanyInput } from "./companies.types";
import type { CompanyResponseDto } from "./dto/company.response.dto";
import { CreateCompanyDto } from "./dto/create-company.dto";
import {
  DEFAULT_COMPANIES_PAGE_LIMIT,
  type ListCompaniesQueryDto,
} from "./dto/list-companies-query.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { mapCompanyRowToResponse } from "./mappers/company.mapper";
import { CompaniesSqlRepository } from "./repositories/companies.sql-repository";

/**
 * Servicio de gestión de empresas con persistencia en Postgres.
 */
@Injectable()
export class CompaniesService {
  /** Inyecta el repositorio SQL de empresas. */
  constructor(private readonly repo: CompaniesSqlRepository) {}

  /**
   * Lista empresas paginadas aplicando búsqueda y filtro de activas.
   * @param query - Parámetros de paginación, búsqueda y `activeOnly`.
   * @returns Resultado paginado con DTOs de respuesta.
   */
  async list(query: ListCompaniesQueryDto): Promise<PaginatedResult<CompanyResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_COMPANIES_PAGE_LIMIT;
    const result = await this.repo.findAll({
      page,
      limit,
      search: query.search,
      activeOnly: query.activeOnly,
    });

    return {
      items: result.items.map(mapCompanyRowToResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * Obtiene una empresa por su identificador.
   * @param id - ID numérico de la empresa.
   * @returns DTO de la empresa encontrada.
   * @throws {BusinessException} Si la empresa no existe.
   */
  async findById(id: number): Promise<CompanyResponseDto> {
    const company = await this.repo.findById(id);
    if (!company) {
      throw new BusinessException({
        message: `Company ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapCompanyRowToResponse(company);
  }

  /**
   * Crea una empresa con valores por defecto para integración Microsoft y daemon.
   * @param dto - Datos de creación validados por el DTO.
   * @returns DTO de la empresa creada.
   */
  async create(dto: CreateCompanyDto): Promise<CompanyResponseDto> {
    const input: CreateCompanyInput = {
      name: dto.name.trim(),
      isActive: dto.isActive ?? true,
      msTenantId: dto.msTenantId,
      msClientId: dto.msClientId,
      msClientSecret: dto.msClientSecret,
      msMailbox: dto.msMailbox.trim(),
      msMailFolder: dto.msMailFolder?.trim() || "inbox",
      geminiModel: dto.geminiModel?.trim() || "gemini-3-flash-preview",
      daemonMaxEmails: dto.daemonMaxEmails ?? 20,
      daemonIntervalSeconds: dto.daemonIntervalSeconds ?? 60,
    };

    const created = await this.repo.create(input);
    return mapCompanyRowToResponse(created);
  }

  /**
   * Actualiza parcialmente una empresa existente.
   * @param id - ID de la empresa a modificar.
   * @param dto - Campos a actualizar; los omitidos no se modifican.
   * @returns DTO de la empresa actualizada.
   * @throws {BusinessException} Si la empresa no existe.
   */
  async update(id: number, dto: UpdateCompanyDto): Promise<CompanyResponseDto> {
    await this.ensureExists(id);

    const input: UpdateCompanyInput = {};
    if (dto.name !== undefined) input.name = dto.name.trim();
    if (dto.isActive !== undefined) input.isActive = dto.isActive;
    if (dto.msTenantId !== undefined) input.msTenantId = dto.msTenantId;
    if (dto.msClientId !== undefined) input.msClientId = dto.msClientId;
    if (dto.msClientSecret !== undefined && dto.msClientSecret.trim()) {
      input.msClientSecret = dto.msClientSecret;
    }
    if (dto.msMailbox !== undefined) input.msMailbox = dto.msMailbox.trim();
    if (dto.msMailFolder !== undefined) input.msMailFolder = dto.msMailFolder.trim();
    if (dto.geminiModel !== undefined) input.geminiModel = dto.geminiModel.trim();
    if (dto.daemonMaxEmails !== undefined) input.daemonMaxEmails = dto.daemonMaxEmails;
    if (dto.daemonIntervalSeconds !== undefined) {
      input.daemonIntervalSeconds = dto.daemonIntervalSeconds;
    }

    const updated = await this.repo.update(id, input);
    if (!updated) {
      throw new BusinessException({
        message: `Company ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapCompanyRowToResponse(updated);
  }

  /**
   * Desactiva una empresa (borrado lógico).
   * @param id - ID de la empresa.
   * @returns DTO de la empresa desactivada.
   * @throws {BusinessException} Si la empresa no existe.
   */
  async deactivate(id: number): Promise<CompanyResponseDto> {
    await this.ensureExists(id);
    const updated = await this.repo.softDelete(id);
    if (!updated) {
      throw new BusinessException({
        message: `Company ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapCompanyRowToResponse(updated);
  }

  /**
   * Reactiva una empresa previamente desactivada.
   * @param id - ID de la empresa.
   * @returns DTO de la empresa activada.
   * @throws {BusinessException} Si la empresa no existe.
   */
  async activate(id: number): Promise<CompanyResponseDto> {
    await this.ensureExists(id);
    const updated = await this.repo.activate(id);
    if (!updated) {
      throw new BusinessException({
        message: `Company ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapCompanyRowToResponse(updated);
  }

  /**
   * Elimina permanentemente una empresa de la base de datos.
   * @param id - ID de la empresa.
   * @returns Confirmación con el ID eliminado.
   * @throws {BusinessException} Si la empresa no existe.
   */
  async deletePermanent(id: number): Promise<{ id: number; deleted: true }> {
    await this.ensureExists(id);
    const deletedId = await this.repo.hardDelete(id);
    if (deletedId == null) {
      throw new BusinessException({
        message: `Company ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return { id: deletedId, deleted: true };
  }

  /**
   * Verifica que una empresa exista antes de operaciones de escritura.
   * @param id - ID de la empresa a validar.
   * @throws {BusinessException} Si la empresa no existe.
   */
  private async ensureExists(id: number): Promise<void> {
    const company = await this.repo.findById(id);
    if (!company) {
      throw new BusinessException({
        message: `Company ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }
  }
}
