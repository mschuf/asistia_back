/**
 * @file visitas.service.ts
 * @description Orquesta el CRUD de visitas contra Postgres y aplica reglas de negocio.
 */
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../common/dto/pagination.dto";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { DomainUser } from "../glpi/mappers/user.mapper";
import { MotivosVisitaService } from "../motivos-visita/motivos-visita.service";
import { PersonasSqlRepository } from "../personas/repositories/personas.sql-repository";
import type { PersonaRow } from "../personas/personas.types";
import { PROVEEDOR_SIN_ASIGNAR_NOMBRE } from "../personas/personas.types";
import { processPersonaPhoto } from "../personas/persona-photo.processor";
import { validatePersonaPhotoUpload } from "../personas/persona-photo-validation";
import { UsersService } from "../users/users.service";
import { CatalogService } from "../catalog/catalog.service";
import type { DomainLocation } from "../glpi/mappers/location.mapper";
import type { CreateVisitaInput, UpdateVisitaInput, VisitaMetricsRange } from "./visitas.types";
import type { VisitaMetricsResponseDto } from "./dto/visita-metrics.response.dto";
import type { VisitaMetricsQueryDto } from "./dto/visita-metrics-query.dto";
import type { VisitaResponseDto } from "./dto/visita.response.dto";
import { CreateVisitaDto } from "./dto/create-visita.dto";
import {
  DEFAULT_VISITAS_PAGE_LIMIT,
  type ListVisitasQueryDto,
} from "./dto/list-visitas-query.dto";
import { UpdateVisitaDto } from "./dto/update-visita.dto";
import {
  DEFAULT_RESPONSABLE_CANDIDATES_LIMIT,
  type ListResponsableCandidatesQueryDto,
} from "./dto/list-responsable-candidates-query.dto";
import type { ResponsableCandidateListResponseDto } from "./dto/responsable-candidate.response.dto";
import {
  isVisitaTarjetaColor,
  resolveZonasFromTarjetaColor,
  zonasMatchTarjetaColor,
  type VisitaTarjetaColor,
} from "./domain/visita-tarjeta-color";
import {
  diffVisitaAuditFields,
  resolveVisitaAuditAction,
} from "./domain/visita-audit.helpers";
import { requiereCancelacionAlEliminar } from "./domain/visita-estado.helpers";
import { requiresTarjetaDisponibilidad } from "./domain/visita-tarjeta-disponibilidad";
import type { VisitaEstado } from "./domain/visita-estado";
import type { VisitaZona } from "./domain/visita-zona";
import { mapVisitaRowToResponse } from "./mappers/visita.mapper";
import { VisitaAuditSqlRepository } from "./repositories/visita-audit.sql-repository";
import { VisitasSqlRepository } from "./repositories/visitas.sql-repository";
import type {
  VisitaAuditAction,
  VisitaAuditSnapshot,
  VisitaListRow,
} from "./visitas.types";

/** Servicio de gestión de visitas con persistencia en Postgres. */
@Injectable()
export class VisitasService {
  private staleSyncDayKey: string | null = null;

  /** Inyecta repositorios SQL de visitas y personas. */
  constructor(
    private readonly repo: VisitasSqlRepository,
    private readonly auditRepo: VisitaAuditSqlRepository,
    private readonly personasRepo: PersonasSqlRepository,
    private readonly motivosVisitaService: MotivosVisitaService,
    private readonly usersService: UsersService,
    private readonly catalogService: CatalogService,
  ) {}

  private toAuditSnapshot(row: VisitaListRow): VisitaAuditSnapshot {
    const dto = mapVisitaRowToResponse(row);
    return {
      id: dto.id,
      personaId: dto.personaId,
      visitante: dto.visitante,
      documento: dto.documento,
      empresa: dto.empresa,
      motivo: dto.motivo,
      responsableNombre: dto.responsableNombre,
      estado: dto.estado,
      estadoSeguimiento: dto.estadoSeguimiento,
      zonasPermitidas: [...dto.zonasPermitidas],
      credencialNumero: dto.credencialNumero,
      tarjetaColor: dto.tarjetaColor,
      entradaAt: dto.entradaAt,
      salidaAt: dto.salidaAt,
      observaciones: dto.observaciones,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
    };
  }

  private async logAuditEvent(input: {
    visitaId: number;
    actorUserId: number;
    action: VisitaAuditAction;
    before: VisitaListRow | null;
    after: VisitaListRow | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const beforeState = input.before ? this.toAuditSnapshot(input.before) : null;
    const afterState = input.after ? this.toAuditSnapshot(input.after) : null;
    const changedFields = diffVisitaAuditFields(beforeState, afterState);
    await this.logAuditSnapshots({
      visitaId: input.visitaId,
      actorUserId: input.actorUserId,
      action: input.action,
      beforeState,
      afterState,
      changedFields,
      metadata: input.metadata,
    });
  }

  private async logAuditSnapshots(input: {
    visitaId: number;
    actorUserId: number;
    action: VisitaAuditAction;
    beforeState: VisitaAuditSnapshot | null;
    afterState: VisitaAuditSnapshot | null;
    changedFields: string[];
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.auditRepo.create({
      visitaId: input.visitaId,
      actorUserId: input.actorUserId,
      action: input.action,
      beforeState: input.beforeState,
      afterState: input.afterState,
      changedFields: input.changedFields,
      metadata: input.metadata,
    });
  }

  private rejectInconsistentZonas(tarjetaColor: VisitaTarjetaColor, zonas: VisitaZona[]): void {
    if (!zonasMatchTarjetaColor(tarjetaColor, zonas)) {
      throw new BusinessException({
        message: "Las zonas permitidas no coinciden con el color de tarjeta seleccionado",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }
  }

  private resolveCurrentTarjetaColor(
    currentColor: string | null,
    dtoColor: VisitaTarjetaColor | undefined,
  ): VisitaTarjetaColor | null {
    if (dtoColor !== undefined) return dtoColor;
    return isVisitaTarjetaColor(currentColor) ? currentColor : null;
  }

  private async assertCredencialNumeroDisponible(
    credencialNumero: string,
    excludeVisitaId?: number,
  ): Promise<void> {
    const normalized = credencialNumero.trim();
    if (!normalized) return;

    const conflict = await this.repo.findActiveByCredencialNumero(normalized, excludeVisitaId);
    if (!conflict) return;

    throw new BusinessException({
      message: `La tarjeta Nº ${normalized} ya está en uso por ${conflict.visitante} (visita #${conflict.id}).`,
      code: API_ERROR_CODE.CONFLICT,
      status: HttpStatus.CONFLICT,
    });
  }

  private async assertPersonaSinVisitaActiva(
    personaId: number,
    referenceDate: Date,
    excludeVisitaId?: number,
  ): Promise<void> {
    const { start, end } = this.getLocalDayBounds(referenceDate);
    const conflict = await this.repo.findActiveByPersonaId(personaId, excludeVisitaId, start, end);
    if (!conflict) return;

    throw new BusinessException({
      message: `El visitante ${conflict.visitante} ya tiene una visita activa (visita #${conflict.id}).`,
      code: API_ERROR_CODE.CONFLICT,
      status: HttpStatus.CONFLICT,
    });
  }

  private async assertPersonaConProveedorValido(persona: PersonaRow): Promise<void> {
    if (persona.proveedor_nombre === PROVEEDOR_SIN_ASIGNAR_NOMBRE) {
      throw new BusinessException({
        message: `La persona ${persona.id} no tiene proveedor asignado. Edítela en Personas y seleccione un proveedor.`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    if (!persona.proveedor_activo) {
      throw new BusinessException({
        message: `El proveedor de la persona ${persona.id} está inactivo`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }
  }

  private rejectManualSinSalidaEstado(estado: VisitaEstado | undefined): void {
    if (estado === "sin_salida") {
      throw new BusinessException({
        message: "El estado sin_salida solo se asigna automáticamente",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }
  }

  private getLocalDayKey(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }

  private getStartOfToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }

  private getLocalDayBounds(reference: Date): { start: Date; end: Date } {
    const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate(), 0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private async syncStaleVisitasIfNeeded(): Promise<void> {
    const dayKey = this.getLocalDayKey();
    if (this.staleSyncDayKey === dayKey) return;

    const startOfToday = this.getStartOfToday();
    const beforeRows = await this.repo.findStaleCandidates(startOfToday);
    const beforeSnapshotsById = new Map(
      beforeRows.map((row) => [String(row.id), this.toAuditSnapshot(row)]),
    );

    const afterRows = await this.repo.markStaleWithoutCheckout(startOfToday);

    for (const afterRow of afterRows) {
      const beforeSnapshot = beforeSnapshotsById.get(String(afterRow.id));
      if (!beforeSnapshot) continue;

      const afterSnapshot = this.toAuditSnapshot(afterRow);
      const changedFields = diffVisitaAuditFields(beforeSnapshot, afterSnapshot);
      if (changedFields.length === 0) continue;

      await this.logAuditSnapshots({
        visitaId: Number(afterRow.id),
        actorUserId: 0,
        action: "visita.updated",
        beforeState: beforeSnapshot,
        afterState: afterSnapshot,
        changedFields,
        metadata: { source: "daily_stale_sync" },
      });
    }

    this.staleSyncDayKey = dayKey;
  }

  /**
   * @param query - Rango opcional de entrada_at (por defecto últimos 7 días).
   * @returns Contadores de visitas por período, último día y zonas activas.
   */
  async getMetrics(query: VisitaMetricsQueryDto = {}): Promise<VisitaMetricsResponseDto> {
    await this.syncStaleVisitasIfNeeded();
    const range = this.resolveMetricsRange(query);
    const row = await this.repo.getMetrics(range);

    return {
      monthVisits: Number(row.month_visits ?? 0),
      dayVisits: Number(row.day_visits ?? 0),
      activeOnlyAdmin: Number(row.active_only_admin ?? 0),
      activeOnlyFactory: Number(row.active_only_factory ?? 0),
      activeBothZones: Number(row.active_both_zones ?? 0),
      activeStaleWithoutCheckout: Number(row.active_stale_without_checkout ?? 0),
    };
  }

  private resolveMetricsRange(query: VisitaMetricsQueryDto): VisitaMetricsRange {
    const now = new Date();
    const defaultTo = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );
    const defaultFrom = new Date(defaultTo);
    defaultFrom.setDate(defaultFrom.getDate() - 6);
    defaultFrom.setHours(0, 0, 0, 0);

    const entradaTo = query.entradaTo ? new Date(query.entradaTo) : defaultTo;
    const entradaFrom = query.entradaFrom ? new Date(query.entradaFrom) : defaultFrom;

    if (Number.isNaN(entradaFrom.getTime()) || Number.isNaN(entradaTo.getTime())) {
      throw new BusinessException({
        message: "Las fechas del rango de métricas no son válidas",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    if (entradaFrom.getTime() > entradaTo.getTime()) {
      throw new BusinessException({
        message: "La fecha desde no puede ser posterior a la fecha hasta",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    const lastDayStart = new Date(entradaTo);
    lastDayStart.setHours(0, 0, 0, 0);

    return { entradaFrom, entradaTo, lastDayStart };
  }

  /**
   * Lista visitas paginadas aplicando búsqueda y filtros.
   * @param query - Parámetros de paginación, búsqueda y orden.
   * @returns Resultado paginado con DTOs de respuesta.
   */
  async list(query: ListVisitasQueryDto): Promise<PaginatedResult<VisitaResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_VISITAS_PAGE_LIMIT;
    const result = await this.repo.findAll({
      page,
      limit,
      search: query.search,
      visitante: query.visitante,
      documento: query.documento,
      empresa: query.empresa,
      motivo: query.motivo,
      responsable: query.responsable,
      estado: query.estado,
      personaId: query.personaId,
      entradaFrom: query.entradaFrom,
      entradaTo: query.entradaTo,
      includeProgramadasSinEntrada: query.includeProgramadasSinEntrada,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      items: result.items.map(mapVisitaRowToResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * Obtiene una visita por su identificador.
   * @param id - ID numérico de la visita.
   * @returns DTO de la visita encontrada.
   */
  async findById(id: number): Promise<VisitaResponseDto> {
    const visita = await this.repo.findById(id);
    if (!visita) {
      throw new BusinessException({
        message: `Visita ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapVisitaRowToResponse(visita);
  }

  /**
   * Procesa y guarda la foto de una visita existente.
   * @param id - ID de la visita.
   * @param file - Archivo recibido por Multer en memoria.
   * @returns DTO de la visita actualizada.
   */
  async setPhoto(
    id: number,
    file: Pick<Express.Multer.File, "buffer" | "mimetype" | "originalname" | "size">,
  ): Promise<VisitaResponseDto> {
    await this.findById(id);

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
        message: `Visita ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapVisitaRowToResponse(updated);
  }

  /**
   * Resuelve la foto almacenada de una visita para descarga binaria.
   * @param id - ID de la visita.
   * @returns Buffer, MIME type y tamaño en bytes.
   */
  async getPhoto(id: number): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    await this.findById(id);
    const photo = await this.repo.findPhotoById(id);
    if (!photo) {
      throw new BusinessException({
        message: `Visita ${id} does not have a photo`,
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
   * Crea una visita nueva.
   * @param dto - Datos de creación validados por el DTO.
   * @returns DTO de la visita creada.
   */
  async create(actorUserId: number, dto: CreateVisitaDto): Promise<VisitaResponseDto> {
    if (dto.personaId == null || dto.personaId < 1) {
      throw new BusinessException({
        message: "La persona es obligatoria para crear una visita",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }
    if (dto.motivoVisitaId == null || dto.motivoVisitaId < 1) {
      throw new BusinessException({
        message: "El motivo es obligatorio para crear una visita",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }
    if (!dto.responsableNombre?.trim()) {
      throw new BusinessException({
        message: "El responsable es obligatorio para crear una visita",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }
    if (dto.responsableId == null || dto.responsableId < 1) {
      throw new BusinessException({
        message: "El responsable es obligatorio para crear una visita",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    const persona = await this.personasRepo.findById(dto.personaId);
    if (!persona) {
      throw new BusinessException({
        message: `Persona ${dto.personaId} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    if (!persona.activo) {
      throw new BusinessException({
        message: `La persona ${dto.personaId} está inactiva`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

    await this.assertPersonaConProveedorValido(persona);
    const responsable = await this.assertResponsableActivoGlpi(dto.responsableId);

    this.rejectManualSinSalidaEstado(dto.estado);

    const zonasPermitidas = resolveZonasFromTarjetaColor(dto.tarjetaColor);
    if (dto.zonasPermitidas !== undefined) {
      this.rejectInconsistentZonas(dto.tarjetaColor, dto.zonasPermitidas);
    }

    const estado = dto.estado ?? "activa";
    const credencialNumero = dto.credencialNumero?.trim() || null;
    if (!credencialNumero) {
      throw new BusinessException({
        message: "El número de tarjeta es obligatorio para crear una visita",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    if (requiresTarjetaDisponibilidad(estado) && credencialNumero) {
      await this.assertCredencialNumeroDisponible(credencialNumero);
    }

    if (requiresTarjetaDisponibilidad(estado)) {
      const referenceDate = dto.entradaAt ? new Date(dto.entradaAt) : new Date();
      await this.assertPersonaSinVisitaActiva(dto.personaId, referenceDate);
    }

    const motivoVisita = await this.motivosVisitaService.assertActiveMotivoVisita(dto.motivoVisitaId);

    const input: CreateVisitaInput = {
      personaId: dto.personaId,
      motivoVisitaId: dto.motivoVisitaId,
      motivo: motivoVisita.nombre,
      responsableNombre: responsable.fullName.trim(),
      estado,
      estadoSeguimiento: dto.estadoSeguimiento ?? (estado === "activa" ? "activo" : null),
      zonasPermitidas,
      credencialNumero,
      tarjetaColor: dto.tarjetaColor,
      entradaAt: dto.entradaAt ? new Date(dto.entradaAt) : new Date(),
      salidaAt: dto.salidaAt ? new Date(dto.salidaAt) : null,
      observaciones: dto.observaciones?.trim() || null,
    };

    const created = await this.repo.create(input);
    await this.personasRepo.updateUltimosVisita(dto.personaId, {
      ultimoMotivo: dto.motivoVisitaId,
      ultimoResponsable: dto.responsableId,
    });
    await this.logAuditEvent({
      visitaId: Number(created.id),
      actorUserId,
      action: "visita.created",
      before: null,
      after: created,
    });
    return mapVisitaRowToResponse(created);
  }

  /**
   * Actualiza parcialmente una visita existente.
   * @param id - ID de la visita a modificar.
   * @param dto - Campos a actualizar.
   * @returns DTO de la visita actualizada.
   */
  async update(actorUserId: number, id: number, dto: UpdateVisitaDto): Promise<VisitaResponseDto> {
    const current = await this.repo.findById(id);
    if (!current) {
      throw new BusinessException({
        message: `Visita ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    if (dto.personaId !== undefined) {
      const persona = await this.personasRepo.findById(dto.personaId);
      if (!persona) {
        throw new BusinessException({
          message: `Persona ${dto.personaId} not found`,
          code: API_ERROR_CODE.NOT_FOUND,
          status: HttpStatus.NOT_FOUND,
        });
      }
      if (!persona.activo) {
        throw new BusinessException({
          message: `La persona ${dto.personaId} está inactiva`,
          code: API_ERROR_CODE.CONFLICT,
          status: HttpStatus.CONFLICT,
        });
      }
      await this.assertPersonaConProveedorValido(persona);
    }

    this.rejectManualSinSalidaEstado(dto.estado);

    const input: UpdateVisitaInput = {};
    const nextTarjetaColor = this.resolveCurrentTarjetaColor(current.tarjeta_color, dto.tarjetaColor);
    const nextEstado = (dto.estado ?? current.estado) as VisitaEstado;
    const isClosingVisit = dto.estado === "finalizada" && current.estado !== "finalizada";
    const nextPersonaId = dto.personaId ?? Number(current.persona_id);
    const nextCredencialNumero =
      dto.credencialNumero !== undefined
        ? dto.credencialNumero?.trim() || null
        : current.credencial_numero?.trim() || null;

    if (requiresTarjetaDisponibilidad(nextEstado) && nextCredencialNumero) {
      await this.assertCredencialNumeroDisponible(nextCredencialNumero, id);
    }

    if (requiresTarjetaDisponibilidad(nextEstado)) {
      const referenceDate = dto.entradaAt
        ? new Date(dto.entradaAt)
        : current.entrada_at
          ? new Date(current.entrada_at)
          : new Date();
      await this.assertPersonaSinVisitaActiva(nextPersonaId, referenceDate, id);
    }

    if (dto.personaId !== undefined) input.personaId = dto.personaId;
    if (dto.motivoVisitaId !== undefined) {
      const motivoVisita = await this.motivosVisitaService.assertActiveMotivoVisita(dto.motivoVisitaId);
      input.motivoVisitaId = dto.motivoVisitaId;
      input.motivo = motivoVisita.nombre;
    }
    if (dto.responsableNombre !== undefined) input.responsableNombre = dto.responsableNombre.trim();
    if (dto.estado !== undefined) input.estado = dto.estado;
    if (dto.estadoSeguimiento !== undefined) {
      input.estadoSeguimiento = dto.estadoSeguimiento;
    } else if (isClosingVisit) {
      input.estadoSeguimiento = null;
    }
    if (dto.credencialNumero !== undefined) input.credencialNumero = dto.credencialNumero?.trim() || null;
    if (dto.entradaAt !== undefined) input.entradaAt = dto.entradaAt ? new Date(dto.entradaAt) : null;
    if (isClosingVisit) {
      input.salidaAt = new Date();
    } else if (dto.salidaAt !== undefined) {
      input.salidaAt = dto.salidaAt ? new Date(dto.salidaAt) : null;
    }
    if (dto.observaciones !== undefined) input.observaciones = dto.observaciones?.trim() || null;

    if (dto.tarjetaColor !== undefined) {
      input.tarjetaColor = dto.tarjetaColor;
    }

    if (dto.zonasPermitidas !== undefined || dto.tarjetaColor !== undefined) {
      if (!nextTarjetaColor) {
        throw new BusinessException({
          message: "Debe seleccionar un color de tarjeta válido para definir las zonas permitidas",
          code: API_ERROR_CODE.VALIDATION,
          status: HttpStatus.BAD_REQUEST,
        });
      }

      if (dto.zonasPermitidas !== undefined) {
        this.rejectInconsistentZonas(nextTarjetaColor, dto.zonasPermitidas);
      }

      input.zonasPermitidas = resolveZonasFromTarjetaColor(nextTarjetaColor);
    }

    const updated = await this.repo.update(id, input);
    if (!updated) {
      throw new BusinessException({
        message: `Visita ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    const action = resolveVisitaAuditAction(current, updated, "visita.updated");
    const beforeSnapshot = this.toAuditSnapshot(current);
    const afterSnapshot = this.toAuditSnapshot(updated);
    const changedFields = diffVisitaAuditFields(beforeSnapshot, afterSnapshot);
    if (changedFields.length > 0) {
      await this.logAuditEvent({
        visitaId: id,
        actorUserId,
        action,
        before: current,
        after: updated,
      });
    }

    return mapVisitaRowToResponse(updated);
  }

  /**
   * Busca usuarios activos de GLPI para el selector de responsable al crear visitas.
   * @param query - Texto de búsqueda, ID puntual o límite de resultados.
   * @returns Candidatos responsables ordenados por nombre.
   */
  async searchResponsableCandidates(
    query: ListResponsableCandidatesQueryDto,
  ): Promise<ResponsableCandidateListResponseDto> {
    const locations = await this.catalogService.listLocations();
    const locationNames = VisitasService.buildLocationNameMap(locations);

    if (query.id != null) {
      const user = await this.usersService.findById(query.id);
      const items =
        user?.isActive === true
          ? [VisitasService.toResponsableCandidate(user, locationNames)]
          : [];
      return { items, total: items.length };
    }

    const limit = query.limit ?? DEFAULT_RESPONSABLE_CANDIDATES_LIMIT;
    const result = await this.usersService.list({
      search: query.search,
      limit,
      page: 1,
    });

    const items = result.items
      .filter((user) => user.isActive)
      .map((user) => VisitasService.toResponsableCandidate(user, locationNames));

    return {
      items,
      total: items.length,
    };
  }

  /**
   * Elimina una visita: cancela las abiertas (activa/sin_salida) o borra permanentemente el resto.
   * @param id - ID de la visita.
   * @returns Confirmación de cancelación o eliminación definitiva.
   */
  async deletePermanent(
    actorUserId: number,
    id: number,
  ): Promise<{ id: number; deleted: true } | { id: number; cancelled: true }> {
    const visita = await this.repo.findById(id);
    if (!visita) {
      throw new BusinessException({
        message: `Visita ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    if (requiereCancelacionAlEliminar(visita.estado)) {
      const updated = await this.repo.update(id, {
        estado: "cancelada",
        estadoSeguimiento: null,
      });
      if (!updated) {
        throw new BusinessException({
          message: `Visita ${id} not found`,
          code: API_ERROR_CODE.NOT_FOUND,
          status: HttpStatus.NOT_FOUND,
        });
      }

      await this.logAuditEvent({
        visitaId: id,
        actorUserId,
        action: "visita.deleted",
        before: visita,
        after: updated,
      });
      return { id, cancelled: true };
    }

    await this.logAuditEvent({
      visitaId: id,
      actorUserId,
      action: "visita.deleted",
      before: visita,
      after: null,
    });

    const deleted = await this.repo.hardDelete(id);
    if (!deleted) {
      throw new BusinessException({
        message: `Visita ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return { id: Number(deleted.id), deleted: true };
  }

  private static buildLocationNameMap(locations: DomainLocation[]): Map<number, string> {
    return new Map(
      locations.map((location) => [location.id, location.name.trim() || location.fullPath.trim()]),
    );
  }

  private static toResponsableCandidate(
    user: DomainUser,
    locationNames: Map<number, string>,
  ) {
    const subtitle =
      user.locationId != null ? locationNames.get(user.locationId)?.trim() ?? "" : "";
    return {
      id: user.id,
      fullName: user.fullName,
      subtitle,
    };
  }

  private async assertResponsableActivoGlpi(responsableId: number): Promise<DomainUser> {
    const user = await this.usersService.findById(responsableId);
    if (!user?.isActive) {
      throw new BusinessException({
        message: "El responsable debe ser un usuario activo de GLPI",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }
    return user;
  }
}
