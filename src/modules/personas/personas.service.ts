/**
 * @file personas.service.ts
 * @description Orquesta el CRUD de personas contra Postgres y aplica reglas de negocio.
 */
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../common/dto/pagination.dto";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import { CatalogService } from "../catalog/catalog.service";
import type { DomainLocation } from "../glpi/mappers/location.mapper";
import { UsersService } from "../users/users.service";
import type { CreatePersonaInput, PersonaRow, UpdatePersonaInput } from "./personas.types";
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
import type { GlpiPersonaPreviewResponseDto } from "./dto/glpi-persona-preview.response.dto";
import { mapPersonaRowToResponse } from "./mappers/persona.mapper";
import { processPersonaPhoto } from "./persona-photo.processor";
import { validatePersonaPhotoUpload } from "./persona-photo-validation";
import { PersonasSqlRepository } from "./repositories/personas.sql-repository";

/** Servicio de gestión de personas con persistencia en Postgres. */
@Injectable()
export class PersonasService {
  /** Inyecta repositorios y servicios de integración. */
  constructor(
    private readonly repo: PersonasSqlRepository,
    private readonly usersService: UsersService,
    private readonly catalogService: CatalogService,
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
      empresa: query.empresa,
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
   * Busca candidatos unificados para el selector de persona en visitas.
   * @param query - Texto de búsqueda y límite de resultados.
   * @returns Personas Postgres y usuarios GLPI no vinculados, ordenados por nombre.
   */
  async searchVisitCandidates(
    query: ListVisitCandidatesQueryDto,
  ): Promise<VisitCandidateListResponseDto> {
    const limit = query.limit ?? DEFAULT_VISIT_CANDIDATES_LIMIT;
    const search = query.search?.trim();

    const [postgresResult, glpiResult, linkedGlpiUserIds, locations] = await Promise.all([
      this.repo.findAll({
        page: 1,
        limit,
        search,
        activo: true,
        sortBy: "nombre",
        sortOrder: "asc",
      }),
      this.usersService.list({ page: 1, limit, search }),
      this.repo.findLinkedGlpiUserIds(),
      this.catalogService.listLocations(),
    ]);

    const locationById = this.buildLocationMap(locations);

    const postgresCandidates: VisitCandidateResponseDto[] = postgresResult.items.map((row) => ({
      source: "postgres",
      id: Number(row.id),
      fullName: row.nombre,
      subtitle: row.documento,
    }));

    const glpiCandidates: VisitCandidateResponseDto[] = glpiResult.items
      .filter((user) => user.isActive && !linkedGlpiUserIds.has(user.id))
      .map((user) => ({
        source: "glpi",
        id: user.id,
        fullName: user.fullName,
        subtitle: this.resolveLocationName(locationById, user.locationId),
      }));

    const merged = [...postgresCandidates, ...glpiCandidates].sort((left, right) =>
      left.fullName.localeCompare(right.fullName, "es", { sensitivity: "base" }),
    );

    const items = merged.slice(0, limit);

    return {
      items,
      total: items.length,
    };
  }

  /**
   * Obtiene o crea una persona vinculada a un usuario GLPI.
   * @param glpiUserId - ID numérico del usuario en GLPI.
   * @returns DTO de la persona vinculada.
   */
  async ensureFromGlpiUser(glpiUserId: number): Promise<PersonaResponseDto> {
    const existing = await this.repo.findByGlpiUserId(glpiUserId);
    if (existing) {
      let persona = existing;
      if (!persona.activo) {
        const reactivated = await this.repo.update(Number(persona.id), { activo: true });
        if (reactivated) {
          persona = reactivated;
        }
      }
      persona = await this.normalizeGlpiLinkedDocumento(glpiUserId, persona);
      return mapPersonaRowToResponse(persona);
    }

    const input = await this.buildPersonaInputFromGlpiUser(glpiUserId);
    const created = await this.repo.create(input);
    return mapPersonaRowToResponse(created);
  }

  /**
   * Devuelve una vista previa de persona a partir de un usuario GLPI sin persistir.
   * @param glpiUserId - ID numérico del usuario en GLPI.
   * @returns Datos precargables para el formulario de creación.
   */
  async previewFromGlpiUser(glpiUserId: number): Promise<GlpiPersonaPreviewResponseDto> {
    const linked = await this.repo.findByGlpiUserId(glpiUserId);
    if (linked) {
      throw new BusinessException({
        message: `El usuario GLPI ${glpiUserId} ya está vinculado a una persona`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    const input = await this.buildPersonaInputFromGlpiUser(glpiUserId);

    return {
      glpiUserId: input.glpiUserId!,
      nombre: input.nombre,
      documento: "",
      email: input.email,
      telefono: input.telefono,
      empresa: input.empresa,
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
    const documento = dto.documento.trim();
    const existing = await this.repo.findByDocumento(documento);
    if (existing) {
      throw new BusinessException({
        message: `Ya existe una persona con documento ${documento}`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    let glpiUserId: number | null = null;
    if (dto.glpiUserId != null) {
      await this.assertGlpiUserAvailableForLink(dto.glpiUserId);
      glpiUserId = dto.glpiUserId;
    }

    const input: CreatePersonaInput = {
      nombre: dto.nombre.trim(),
      documento,
      empresa: dto.empresa?.trim() || null,
      email: dto.email?.trim() || null,
      telefono: dto.telefono?.trim() || null,
      glpiUserId,
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
    if (dto.empresa !== undefined) input.empresa = dto.empresa?.trim() || null;
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

    const activeVisitas = await this.repo.countActiveVisitas(id);
    if (activeVisitas > 0) {
      throw new BusinessException({
        message: `No se puede eliminar la persona ${id} porque tiene visitas activas o programadas`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    const deletedId = await this.repo.hardDelete(id);
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
   * Construye mapa de ubicaciones GLPI por ID.
   * @param locations - Catálogo de ubicaciones.
   * @returns Mapa id → ubicación.
   */
  private buildLocationMap(locations: DomainLocation[]): Map<number, DomainLocation> {
    return new Map(locations.map((location) => [location.id, location]));
  }

  /**
   * Resuelve el nombre legible de una ubicación GLPI.
   * @param locationById - Mapa de ubicaciones.
   * @param locationId - ID de ubicación o null.
   * @returns Nombre de sede o cadena vacía.
   */
  private resolveLocationName(
    locationById: Map<number, DomainLocation>,
    locationId: number | null,
  ): string {
    if (locationId == null) {
      return "";
    }

    const location = locationById.get(locationId);
    if (!location) {
      return "";
    }

    return location.name || location.fullPath || "";
  }

  /**
   * Limpia documentos sintéticos heredados (login LDAP o GLPI-{id}) en personas vinculadas.
   * @param glpiUserId - ID numérico del usuario en GLPI.
   * @param persona - Persona vinculada existente.
   * @returns Persona con documento vacío si tenía un valor sintético de GLPI.
   */
  private async normalizeGlpiLinkedDocumento(
    glpiUserId: number,
    persona: PersonaRow,
  ): Promise<PersonaRow> {
    const documento = persona.documento.trim();
    if (!documento) {
      return persona;
    }

    const glpiUser = await this.usersService.findById(glpiUserId);
    if (!glpiUser) {
      return persona;
    }

    const login = glpiUser.login.trim();
    const legacyFallback = `GLPI-${glpiUserId}`;
    if (documento !== login && documento !== legacyFallback) {
      return persona;
    }

    const updated = await this.repo.update(Number(persona.id), { documento: "" });
    return updated ?? persona;
  }

  /**
   * Construye el input de creación a partir de un usuario GLPI activo.
   * @param glpiUserId - ID numérico del usuario en GLPI.
   * @returns Datos listos para insertar o previsualizar.
   */
  private async buildPersonaInputFromGlpiUser(glpiUserId: number): Promise<CreatePersonaInput> {
    const glpiUser = await this.usersService.findById(glpiUserId);
    if (!glpiUser || !glpiUser.isActive) {
      throw new BusinessException({
        message: `Usuario GLPI ${glpiUserId} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    const telefono = glpiUser.phone?.trim() || glpiUser.mobile?.trim() || null;

    return {
      nombre: glpiUser.fullName.trim() || glpiUser.login,
      documento: "",
      empresa: glpiUser.userTitle?.trim() || null,
      email: glpiUser.email?.trim() || null,
      telefono,
      glpiUserId,
      activo: true,
    };
  }

  /**
   * Valida que un usuario GLPI exista, esté activo y no esté ya vinculado.
   * @param glpiUserId - ID numérico del usuario en GLPI.
   */
  private async assertGlpiUserAvailableForLink(glpiUserId: number): Promise<void> {
    const linked = await this.repo.findByGlpiUserId(glpiUserId);
    if (linked) {
      throw new BusinessException({
        message: `El usuario GLPI ${glpiUserId} ya está vinculado a una persona`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    const glpiUser = await this.usersService.findById(glpiUserId);
    if (!glpiUser || !glpiUser.isActive) {
      throw new BusinessException({
        message: `Usuario GLPI ${glpiUserId} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }
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
}
