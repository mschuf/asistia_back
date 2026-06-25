/**
 * @file personas.service.ts
 * @description Orquesta el CRUD de personas contra Postgres y aplica reglas de negocio.
 */
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../common/dto/pagination.dto";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import { ProveedoresService } from "../proveedores/proveedores.service";
import type { CreatePersonaInput, UpdatePersonaInput } from "./personas.types";
import type { PersonaResponseDto } from "./dto/persona.response.dto";
import { CreatePersonaDto } from "./dto/create-persona.dto";
import {
  DEFAULT_PERSONAS_PAGE_LIMIT,
  type ListPersonasQueryDto,
} from "./dto/list-personas-query.dto";
import {
  DEFAULT_VISIT_CANDIDATES_LIMIT,
  type ListVisitCandidatesQueryDto,
} from "./dto/list-visit-candidates-query.dto";
import { UpdatePersonaDto } from "./dto/update-persona.dto";
import type {
  VisitCandidateListResponseDto,
  VisitCandidateResponseDto,
} from "./dto/visit-candidate.response.dto";
import { mapPersonaRowToResponse } from "./mappers/persona.mapper";
import { processPersonaPhoto } from "./persona-photo.processor";
import { validatePersonaPhotoUpload } from "./persona-photo-validation";
import { PersonasSqlRepository } from "./repositories/personas.sql-repository";

/** Servicio de gestión de personas con persistencia en Postgres. */
@Injectable()
export class PersonasService {
  /** Inyecta repositorios y servicios relacionados. */
  constructor(
    private readonly repo: PersonasSqlRepository,
    private readonly proveedoresService: ProveedoresService,
  ) {}

  /**
   * Lista personas paginadas aplicando búsqueda y filtros.
   * @param query - Parámetros de paginación, búsqueda y orden.
   * @returns Resultado paginado con DTOs de respuesta.
   */
  async list(query: ListPersonasQueryDto): Promise<PaginatedResult<PersonaResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PERSONAS_PAGE_LIMIT;
    const result = await this.repo.findAll({
      page,
      limit,
      search: query.search,
      nombre: query.nombre,
      documento: query.documento,
      proveedor: query.proveedor,
      proveedorId: query.proveedorId,
      activo: query.activo,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      items: result.items.map(mapPersonaRowToResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * Busca personas activas para el selector de visitas.
   * @param query - Texto de búsqueda y límite de resultados.
   * @returns Personas ordenadas por nombre.
   */
  async searchVisitCandidates(
    query: ListVisitCandidatesQueryDto,
  ): Promise<VisitCandidateListResponseDto> {
    const limit = query.limit ?? DEFAULT_VISIT_CANDIDATES_LIMIT;
    const search = query.search?.trim();

    const postgresResult = await this.repo.findAll({
      page: 1,
      limit,
      search,
      activo: true,
      sortBy: "nombre",
      sortOrder: "asc",
    });

    const items: VisitCandidateResponseDto[] = postgresResult.items.map((row) => {
      const documento = row.documento.trim();
      const proveedor = row.proveedor_nombre.trim();
      const subtitleParts = [documento, proveedor].filter(Boolean);

      return {
        id: Number(row.id),
        fullName: row.nombre,
        subtitle: subtitleParts.join(" — "),
      };
    });

    return {
      items,
      total: items.length,
    };
  }

  /**
   * Obtiene una persona por su identificador.
   * @param id - ID numérico de la persona.
   * @returns DTO de la persona encontrada.
   * @throws {BusinessException} Si la persona no existe.
   */
  async findById(id: number): Promise<PersonaResponseDto> {
    const persona = await this.repo.findById(id);
    if (!persona) {
      throw new BusinessException({
        message: `Persona ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapPersonaRowToResponse(persona);
  }

  /**
   * Crea una persona nueva.
   * @param dto - Datos de creación validados por el DTO.
   * @returns DTO de la persona creada.
   */
  async create(dto: CreatePersonaDto): Promise<PersonaResponseDto> {
    await this.proveedoresService.assertActiveProveedor(dto.proveedorId);

    const documento = dto.documento.trim();
    const existing = await this.repo.findByDocumento(documento);
    if (existing) {
      throw new BusinessException({
        message: `Ya existe una persona con documento ${documento}`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    const input: CreatePersonaInput = {
      nombre: dto.nombre.trim(),
      documento,
      proveedorId: dto.proveedorId,
      email: dto.email?.trim() || null,
      telefono: dto.telefono?.trim() || null,
      activo: dto.activo ?? true,
    };

    const created = await this.repo.create(input);
    return mapPersonaRowToResponse(created);
  }

  /**
   * Actualiza parcialmente una persona existente.
   * @param id - ID de la persona a modificar.
   * @param dto - Campos a actualizar.
   * @returns DTO de la persona actualizada.
   */
  async update(id: number, dto: UpdatePersonaDto): Promise<PersonaResponseDto> {
    await this.ensureExists(id);

    if (dto.proveedorId !== undefined) {
      await this.proveedoresService.assertActiveProveedor(dto.proveedorId);
    }

    if (dto.documento !== undefined) {
      const documento = dto.documento.trim();
      const existing = await this.repo.findByDocumento(documento);
      if (existing && Number(existing.id) !== id) {
        throw new BusinessException({
          message: `Ya existe una persona con documento ${documento}`,
          code: API_ERROR_CODE.CONFLICT,
          status: HttpStatus.CONFLICT,
        });
      }
    }

    const input: UpdatePersonaInput = {};
    if (dto.nombre !== undefined) input.nombre = dto.nombre.trim();
    if (dto.documento !== undefined) input.documento = dto.documento.trim();
    if (dto.proveedorId !== undefined) input.proveedorId = dto.proveedorId;
    if (dto.email !== undefined) input.email = dto.email?.trim() || null;
    if (dto.telefono !== undefined) input.telefono = dto.telefono?.trim() || null;
    if (dto.activo !== undefined) input.activo = dto.activo;

    const updated = await this.repo.update(id, input);
    if (!updated) {
      throw new BusinessException({
        message: `Persona ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapPersonaRowToResponse(updated);
  }

  /**
   * Desactiva una persona (borrado lógico).
   * @param id - ID de la persona.
   * @returns DTO de la persona desactivada.
   */
  async deactivate(id: number): Promise<PersonaResponseDto> {
    await this.ensureExists(id);
    const updated = await this.repo.softDelete(id);
    if (!updated) {
      throw new BusinessException({
        message: `Persona ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapPersonaRowToResponse(updated);
  }

  /**
   * Elimina permanentemente una persona de la base de datos.
   * @param id - ID de la persona.
   * @returns Confirmación con el ID eliminado.
   */
  async deletePermanent(id: number): Promise<{ id: number; deleted: true }> {
    await this.ensureExists(id);

    const linkedVisitas = await this.repo.countVisitas(id);
    if (linkedVisitas > 0) {
      throw new BusinessException({
        message:
          "No se puede eliminar esta persona porque tiene visitas registradas. Puede desactivarla si ya no debe usarse en nuevas visitas.",
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    let deletedId: number | null;
    try {
      deletedId = await this.repo.hardDelete(id);
    } catch (error) {
      if (this.isPersonaVisitaFkViolation(error)) {
        throw new BusinessException({
          message:
            "No se puede eliminar esta persona porque tiene visitas registradas. Puede desactivarla si ya no debe usarse en nuevas visitas.",
          code: API_ERROR_CODE.CONFLICT,
          status: HttpStatus.CONFLICT,
        });
      }
      throw error;
    }
    if (deletedId == null) {
      throw new BusinessException({
        message: `Persona ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return { id: deletedId, deleted: true };
  }

  /**
   * Procesa y guarda la foto de una persona existente.
   * @param id - ID de la persona.
   * @param file - Archivo recibido por Multer en memoria.
   * @returns DTO de la persona actualizada.
   */
  async setPhoto(
    id: number,
    file: Pick<Express.Multer.File, "buffer" | "mimetype" | "originalname" | "size">,
  ): Promise<PersonaResponseDto> {
    await this.ensureExists(id);

    validatePersonaPhotoUpload({
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });

    if (!file.buffer?.length) {
      throw new BusinessException({
        message: "No file received under field 'file'",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    const processed = await processPersonaPhoto(file.buffer);
    const updated = await this.repo.updatePhoto(id, processed.buffer, processed.mimeType);
    if (!updated) {
      throw new BusinessException({
        message: `Persona ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapPersonaRowToResponse(updated);
  }

  /**
   * Elimina la foto almacenada de una persona.
   * @param id - ID de la persona.
   * @returns DTO de la persona actualizada.
   */
  async removePhoto(id: number): Promise<PersonaResponseDto> {
    await this.ensureExists(id);
    const updated = await this.repo.clearPhoto(id);
    if (!updated) {
      throw new BusinessException({
        message: `Persona ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapPersonaRowToResponse(updated);
  }

  /**
   * Resuelve la foto almacenada para descarga binaria.
   * @param id - ID de la persona.
   * @returns Buffer, MIME type y tamaño en bytes.
   */
  async getPhoto(id: number): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    await this.ensureExists(id);
    const photo = await this.repo.findPhotoById(id);
    if (!photo) {
      throw new BusinessException({
        message: `Persona ${id} does not have a photo`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return {
      buffer: photo.foto,
      mimeType: photo.foto_mime_type || "image/jpeg",
      size: photo.foto.length,
    };
  }

  /**
   * Verifica que una persona exista antes de operaciones de escritura.
   * @param id - ID de la persona a validar.
   */
  private async ensureExists(id: number): Promise<void> {
    const persona = await this.repo.findById(id);
    if (!persona) {
      throw new BusinessException({
        message: `Persona ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }
  }

  /**
   * Detecta violaciones de FK al eliminar una persona con visitas asociadas.
   * @param error - Error capturado al ejecutar el DELETE.
   * @returns `true` si PostgreSQL bloqueó la eliminación por visitas.
   */
  private isPersonaVisitaFkViolation(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
      return false;
    }

    const pgError = error as { code?: string; constraint?: string };
    return pgError.code === "23503" && pgError.constraint === "visita_persona_id_fkey";
  }
}
