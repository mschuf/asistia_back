/**
 * @file proveedores.service.ts
 * @description Orquesta el CRUD de proveedores contra Postgres y aplica reglas de negocio.
 */
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../common/dto/pagination.dto";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { CreateProveedorInput, UpdateProveedorInput } from "./proveedores.types";
import type { ProveedorResponseDto } from "./dto/proveedor.response.dto";
import { CreateProveedorDto } from "./dto/create-proveedor.dto";
import {
  DEFAULT_PROVEEDORES_PAGE_LIMIT,
  type ListProveedoresQueryDto,
} from "./dto/list-proveedores-query.dto";
import { UpdateProveedorDto } from "./dto/update-proveedor.dto";
import { mapProveedorRowToResponse } from "./mappers/proveedor.mapper";
import { ProveedoresSqlRepository } from "./repositories/proveedores.sql-repository";

/** Servicio de gestión de proveedores con persistencia en Postgres. */
@Injectable()
export class ProveedoresService {
  /** Inyecta el repositorio de proveedores. */
  constructor(private readonly repo: ProveedoresSqlRepository) {}

  /**
   * Lista proveedores paginados aplicando búsqueda y filtros.
   * @param query - Parámetros de paginación, búsqueda y orden.
   * @returns Resultado paginado con DTOs de respuesta.
   */
  async list(query: ListProveedoresQueryDto): Promise<PaginatedResult<ProveedorResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PROVEEDORES_PAGE_LIMIT;
    const result = await this.repo.findAll({
      page,
      limit,
      search: query.search,
      nombre: query.nombre,
      ruc: query.ruc,
      activo: query.activo,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      items: result.items.map(mapProveedorRowToResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * Obtiene un proveedor por su identificador.
   * @param id - ID numérico del proveedor.
   * @returns DTO del proveedor encontrado.
   */
  async findById(id: number): Promise<ProveedorResponseDto> {
    const proveedor = await this.repo.findById(id);
    if (!proveedor) {
      throw new BusinessException({
        message: `Proveedor ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapProveedorRowToResponse(proveedor);
  }

  /**
   * Valida que un proveedor exista, esté activo y devuelve su fila.
   * @param id - ID del proveedor.
   * @returns Fila del proveedor activo.
   */
  async assertActiveProveedor(id: number): Promise<ProveedorResponseDto> {
    const proveedor = await this.findById(id);
    if (!proveedor.activo) {
      throw new BusinessException({
        message: `El proveedor ${id} está inactivo`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    return proveedor;
  }

  /**
   * Crea un proveedor nuevo.
   * @param dto - Datos de creación validados por el DTO.
   * @returns DTO del proveedor creado.
   */
  async create(dto: CreateProveedorDto): Promise<ProveedorResponseDto> {
    const nombre = dto.nombre.trim();
    const ruc = dto.ruc.trim();
    const existing = await this.repo.findByNombre(nombre);
    if (existing) {
      throw new BusinessException({
        message: `Ya existe un proveedor con nombre ${nombre}`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    const existingRuc = await this.repo.findByRuc(ruc);
    if (existingRuc) {
      throw new BusinessException({
        message: `Ya existe un proveedor con RUC ${ruc}`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    const input: CreateProveedorInput = {
      nombre,
      ruc,
      activo: dto.activo ?? true,
    };

    const created = await this.repo.create(input);
    return mapProveedorRowToResponse(created);
  }

  /**
   * Actualiza parcialmente un proveedor existente.
   * @param id - ID del proveedor a modificar.
   * @param dto - Campos a actualizar.
   * @returns DTO del proveedor actualizado.
   */
  async update(id: number, dto: UpdateProveedorDto): Promise<ProveedorResponseDto> {
    await this.ensureExists(id);

    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim();
      const existing = await this.repo.findByNombre(nombre);
      if (existing && Number(existing.id) !== id) {
        throw new BusinessException({
          message: `Ya existe un proveedor con nombre ${nombre}`,
          code: API_ERROR_CODE.CONFLICT,
          status: HttpStatus.CONFLICT,
        });
      }
    }

    if (dto.ruc !== undefined) {
      const ruc = dto.ruc.trim();
      const existing = await this.repo.findByRuc(ruc);
      if (existing && Number(existing.id) !== id) {
        throw new BusinessException({
          message: `Ya existe un proveedor con RUC ${ruc}`,
          code: API_ERROR_CODE.CONFLICT,
          status: HttpStatus.CONFLICT,
        });
      }
    }

    const input: UpdateProveedorInput = {};
    if (dto.nombre !== undefined) input.nombre = dto.nombre.trim();
    if (dto.ruc !== undefined) input.ruc = dto.ruc.trim();
    if (dto.activo !== undefined) input.activo = dto.activo;

    const updated = await this.repo.update(id, input);
    if (!updated) {
      throw new BusinessException({
        message: `Proveedor ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapProveedorRowToResponse(updated);
  }

  /**
   * Desactiva un proveedor (borrado lógico).
   * @param id - ID del proveedor.
   * @returns DTO del proveedor desactivado.
   */
  async deactivate(id: number): Promise<ProveedorResponseDto> {
    await this.ensureExists(id);
    const updated = await this.repo.softDelete(id);
    if (!updated) {
      throw new BusinessException({
        message: `Proveedor ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapProveedorRowToResponse(updated);
  }

  /**
   * Reactiva un proveedor previamente desactivado.
   * @param id - ID del proveedor.
   * @returns DTO del proveedor activado.
   */
  async activate(id: number): Promise<ProveedorResponseDto> {
    await this.ensureExists(id);
    const updated = await this.repo.activate(id);
    if (!updated) {
      throw new BusinessException({
        message: `Proveedor ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapProveedorRowToResponse(updated);
  }

  /**
   * Elimina permanentemente un proveedor de la base de datos.
   * @param id - ID del proveedor.
   * @returns Confirmación con el ID eliminado.
   */
  async deletePermanent(id: number): Promise<{ id: number; deleted: true }> {
    await this.ensureExists(id);

    const linkedPersonas = await this.repo.countPersonas(id);
    if (linkedPersonas > 0) {
      throw new BusinessException({
        message: `No se puede eliminar el proveedor ${id} porque tiene personas asociadas`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    const deletedId = await this.repo.hardDelete(id);
    if (deletedId == null) {
      throw new BusinessException({
        message: `Proveedor ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return { id: deletedId, deleted: true };
  }

  /**
   * Verifica que un proveedor exista antes de operaciones de escritura.
   * @param id - ID del proveedor a validar.
   */
  private async ensureExists(id: number): Promise<void> {
    const proveedor = await this.repo.findById(id);
    if (!proveedor) {
      throw new BusinessException({
        message: `Proveedor ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }
  }
}
