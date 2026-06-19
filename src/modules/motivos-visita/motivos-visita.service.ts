/**
 * @file motivos-visita.service.ts
 * @description Orquesta el CRUD de motivos de visita contra Postgres y aplica reglas de negocio.
 */
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../common/dto/pagination.dto";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { CreateMotivoVisitaInput, UpdateMotivoVisitaInput } from "./motivos-visita.types";
import type { MotivoVisitaResponseDto } from "./dto/motivo-visita.response.dto";
import { CreateMotivoVisitaDto } from "./dto/create-motivo-visita.dto";
import {
  DEFAULT_MOTIVOS_VISITA_PAGE_LIMIT,
  type ListMotivosVisitaQueryDto,
} from "./dto/list-motivos-visita-query.dto";
import {
  DEFAULT_MOTIVO_VISIT_CANDIDATES_LIMIT,
  type ListMotivoVisitCandidatesQueryDto,
} from "./dto/list-visit-candidates-query.dto";
import { UpdateMotivoVisitaDto } from "./dto/update-motivo-visita.dto";
import type { MotivoVisitCandidateListResponseDto } from "./dto/visit-candidate.response.dto";
import { mapMotivoVisitaRowToResponse } from "./mappers/motivo-visita.mapper";
import { MotivosVisitaSqlRepository } from "./repositories/motivos-visita.sql-repository";

/** Servicio de gestión de motivos de visita con persistencia en Postgres. */
@Injectable()
export class MotivosVisitaService {
  /** Inyecta el repositorio de motivos de visita. */
  constructor(private readonly repo: MotivosVisitaSqlRepository) {}

  /**
   * Lista motivos de visita paginados aplicando búsqueda y filtros.
   * @param query - Parámetros de paginación, búsqueda y orden.
   * @returns Resultado paginado con DTOs de respuesta.
   */
  async list(query: ListMotivosVisitaQueryDto): Promise<PaginatedResult<MotivoVisitaResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_MOTIVOS_VISITA_PAGE_LIMIT;
    const result = await this.repo.findAll({
      page,
      limit,
      search: query.search,
      nombre: query.nombre,
      activo: query.activo,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      items: result.items.map(mapMotivoVisitaRowToResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * Busca motivos de visita activos para el selector de visitas.
   * @param query - Texto de búsqueda y límite de resultados.
   * @returns Motivos ordenados por nombre.
   */
  async searchVisitCandidates(
    query: ListMotivoVisitCandidatesQueryDto,
  ): Promise<MotivoVisitCandidateListResponseDto> {
    const limit = query.limit ?? DEFAULT_MOTIVO_VISIT_CANDIDATES_LIMIT;
    const search = query.search?.trim();

    const postgresResult = await this.repo.findAll({
      page: 1,
      limit,
      search,
      activo: true,
      sortBy: "nombre",
      sortOrder: "asc",
    });

    const items = postgresResult.items.map((row) => ({
      id: Number(row.id),
      fullName: row.nombre,
      subtitle: "",
    }));

    return {
      items,
      total: items.length,
    };
  }

  /**
   * Obtiene un motivo de visita por su identificador.
   * @param id - ID numérico del motivo.
   * @returns DTO del motivo encontrado.
   */
  async findById(id: number): Promise<MotivoVisitaResponseDto> {
    const motivo = await this.repo.findById(id);
    if (!motivo) {
      throw new BusinessException({
        message: `Motivo de visita ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapMotivoVisitaRowToResponse(motivo);
  }

  /**
   * Valida que un motivo de visita exista, esté activo y devuelva su DTO.
   * @param id - ID del motivo.
   * @returns DTO del motivo activo.
   */
  async assertActiveMotivoVisita(id: number): Promise<MotivoVisitaResponseDto> {
    const motivo = await this.findById(id);
    if (!motivo.activo) {
      throw new BusinessException({
        message: `El motivo de visita ${id} está inactivo`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    return motivo;
  }

  /**
   * Crea un motivo de visita nuevo.
   * @param dto - Datos de creación validados por el DTO.
   * @returns DTO del motivo creado.
   */
  async create(dto: CreateMotivoVisitaDto): Promise<MotivoVisitaResponseDto> {
    const nombre = dto.nombre.trim();
    const existing = await this.repo.findByNombre(nombre);
    if (existing) {
      throw new BusinessException({
        message: `Ya existe un motivo de visita con nombre ${nombre}`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    const input: CreateMotivoVisitaInput = {
      nombre,
      activo: dto.activo ?? true,
    };

    const created = await this.repo.create(input);
    return mapMotivoVisitaRowToResponse(created);
  }

  /**
   * Actualiza parcialmente un motivo de visita existente.
   * @param id - ID del motivo a modificar.
   * @param dto - Campos a actualizar.
   * @returns DTO del motivo actualizado.
   */
  async update(id: number, dto: UpdateMotivoVisitaDto): Promise<MotivoVisitaResponseDto> {
    await this.ensureExists(id);

    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim();
      const existing = await this.repo.findByNombre(nombre);
      if (existing && Number(existing.id) !== id) {
        throw new BusinessException({
          message: `Ya existe un motivo de visita con nombre ${nombre}`,
          code: API_ERROR_CODE.CONFLICT,
          status: HttpStatus.CONFLICT,
        });
      }
    }

    const input: UpdateMotivoVisitaInput = {};
    if (dto.nombre !== undefined) input.nombre = dto.nombre.trim();
    if (dto.activo !== undefined) input.activo = dto.activo;

    const updated = await this.repo.update(id, input);
    if (!updated) {
      throw new BusinessException({
        message: `Motivo de visita ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapMotivoVisitaRowToResponse(updated);
  }

  /**
   * Desactiva un motivo de visita (borrado lógico).
   * @param id - ID del motivo.
   * @returns DTO del motivo desactivado.
   */
  async deactivate(id: number): Promise<MotivoVisitaResponseDto> {
    await this.ensureExists(id);
    const updated = await this.repo.softDelete(id);
    if (!updated) {
      throw new BusinessException({
        message: `Motivo de visita ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapMotivoVisitaRowToResponse(updated);
  }

  /**
   * Reactiva un motivo de visita previamente desactivado.
   * @param id - ID del motivo.
   * @returns DTO del motivo activado.
   */
  async activate(id: number): Promise<MotivoVisitaResponseDto> {
    await this.ensureExists(id);
    const updated = await this.repo.activate(id);
    if (!updated) {
      throw new BusinessException({
        message: `Motivo de visita ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapMotivoVisitaRowToResponse(updated);
  }

  /**
   * Elimina permanentemente un motivo de visita de la base de datos.
   * @param id - ID del motivo.
   * @returns Confirmación con el ID eliminado.
   */
  async deletePermanent(id: number): Promise<{ id: number; deleted: true }> {
    await this.ensureExists(id);

    const linkedVisitas = await this.repo.countVisitas(id);
    if (linkedVisitas > 0) {
      throw new BusinessException({
        message: `No se puede eliminar el motivo de visita ${id} porque tiene visitas asociadas`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    const deletedId = await this.repo.hardDelete(id);
    if (deletedId == null) {
      throw new BusinessException({
        message: `Motivo de visita ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return { id: deletedId, deleted: true };
  }

  /**
   * Verifica que un motivo de visita exista antes de operaciones de escritura.
   * @param id - ID del motivo a validar.
   */
  private async ensureExists(id: number): Promise<void> {
    const motivo = await this.repo.findById(id);
    if (!motivo) {
      throw new BusinessException({
        message: `Motivo de visita ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }
  }
}
