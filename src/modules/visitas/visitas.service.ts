/**
 * @file visitas.service.ts
 * @description Orquesta el CRUD de visitas contra Postgres y aplica reglas de negocio.
 */
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../common/dto/pagination.dto";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import { PersonasSqlRepository } from "../personas/repositories/personas.sql-repository";
import type { CreateVisitaInput, UpdateVisitaInput } from "./visitas.types";
import type { VisitaMetricsResponseDto } from "./dto/visita-metrics.response.dto";
import type { VisitaResponseDto } from "./dto/visita.response.dto";
import { CreateVisitaDto } from "./dto/create-visita.dto";
import {
  DEFAULT_VISITAS_PAGE_LIMIT,
  type ListVisitasQueryDto,
} from "./dto/list-visitas-query.dto";
import { UpdateVisitaDto } from "./dto/update-visita.dto";
import {
  isVisitaTarjetaColor,
  resolveZonasFromTarjetaColor,
  zonasMatchTarjetaColor,
  type VisitaTarjetaColor,
} from "./domain/visita-tarjeta-color";
import { requiresTarjetaDisponibilidad } from "./domain/visita-tarjeta-disponibilidad";
import type { VisitaEstado } from "./domain/visita-estado";
import type { VisitaZona } from "./domain/visita-zona";
import { mapVisitaRowToResponse } from "./mappers/visita.mapper";
import { VisitasSqlRepository } from "./repositories/visitas.sql-repository";

/** Servicio de gestión de visitas con persistencia en Postgres. */
@Injectable()
export class VisitasService {
  /** Inyecta repositorios SQL de visitas y personas. */
  constructor(
    private readonly repo: VisitasSqlRepository,
    private readonly personasRepo: PersonasSqlRepository,
  ) {}

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
    excludeVisitaId?: number,
  ): Promise<void> {
    const conflict = await this.repo.findActiveByPersonaId(personaId, excludeVisitaId);
    if (!conflict) return;

    throw new BusinessException({
      message: `El visitante ${conflict.visitante} ya tiene una visita activa (visita #${conflict.id}).`,
      code: API_ERROR_CODE.CONFLICT,
      status: HttpStatus.CONFLICT,
    });
  }

  /**
   * Obtiene métricas agregadas de visitas para las cards de Portería.
   * @returns Contadores de visitas por mes, día y zonas activas.
   */
  async getMetrics(): Promise<VisitaMetricsResponseDto> {
    const row = await this.repo.getMetrics();

    return {
      monthVisits: Number(row.month_visits ?? 0),
      dayVisits: Number(row.day_visits ?? 0),
      activeOnlyAdmin: Number(row.active_only_admin ?? 0),
      activeOnlyFactory: Number(row.active_only_factory ?? 0),
      activeBothZones: Number(row.active_both_zones ?? 0),
      activeStaleWithoutCheckout: Number(row.active_stale_without_checkout ?? 0),
    };
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
   * Crea una visita nueva.
   * @param dto - Datos de creación validados por el DTO.
   * @returns DTO de la visita creada.
   */
  async create(dto: CreateVisitaDto): Promise<VisitaResponseDto> {
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

    const zonasPermitidas = resolveZonasFromTarjetaColor(dto.tarjetaColor);
    if (dto.zonasPermitidas !== undefined) {
      this.rejectInconsistentZonas(dto.tarjetaColor, dto.zonasPermitidas);
    }

    const estado = dto.estado ?? "activa";
    const credencialNumero = dto.credencialNumero?.trim() || null;

    if (requiresTarjetaDisponibilidad(estado) && credencialNumero) {
      await this.assertCredencialNumeroDisponible(credencialNumero);
    }

    if (requiresTarjetaDisponibilidad(estado)) {
      await this.assertPersonaSinVisitaActiva(dto.personaId);
    }

    const input: CreateVisitaInput = {
      personaId: dto.personaId,
      motivo: dto.motivo.trim(),
      responsableNombre: dto.responsableNombre.trim(),
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
    return mapVisitaRowToResponse(created);
  }

  /**
   * Actualiza parcialmente una visita existente.
   * @param id - ID de la visita a modificar.
   * @param dto - Campos a actualizar.
   * @returns DTO de la visita actualizada.
   */
  async update(id: number, dto: UpdateVisitaDto): Promise<VisitaResponseDto> {
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
    }

    const input: UpdateVisitaInput = {};
    const nextTarjetaColor = this.resolveCurrentTarjetaColor(current.tarjeta_color, dto.tarjetaColor);
    const nextEstado = (dto.estado ?? current.estado) as VisitaEstado;
    const nextPersonaId = dto.personaId ?? Number(current.persona_id);
    const nextCredencialNumero =
      dto.credencialNumero !== undefined
        ? dto.credencialNumero?.trim() || null
        : current.credencial_numero?.trim() || null;

    if (requiresTarjetaDisponibilidad(nextEstado) && nextCredencialNumero) {
      await this.assertCredencialNumeroDisponible(nextCredencialNumero, id);
    }

    if (requiresTarjetaDisponibilidad(nextEstado)) {
      await this.assertPersonaSinVisitaActiva(nextPersonaId, id);
    }

    if (dto.personaId !== undefined) input.personaId = dto.personaId;
    if (dto.motivo !== undefined) input.motivo = dto.motivo.trim();
    if (dto.responsableNombre !== undefined) input.responsableNombre = dto.responsableNombre.trim();
    if (dto.estado !== undefined) input.estado = dto.estado;
    if (dto.estadoSeguimiento !== undefined) input.estadoSeguimiento = dto.estadoSeguimiento;
    if (dto.credencialNumero !== undefined) input.credencialNumero = dto.credencialNumero?.trim() || null;
    if (dto.entradaAt !== undefined) input.entradaAt = dto.entradaAt ? new Date(dto.entradaAt) : null;
    if (dto.salidaAt !== undefined) input.salidaAt = dto.salidaAt ? new Date(dto.salidaAt) : null;
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

    return mapVisitaRowToResponse(updated);
  }

  /**
   * Elimina permanentemente una visita programada o cancelada.
   * @param id - ID de la visita.
   * @returns Confirmación con el ID eliminado.
   */
  async deletePermanent(id: number): Promise<{ id: number; deleted: true }> {
    const visita = await this.repo.findById(id);
    if (!visita) {
      throw new BusinessException({
        message: `Visita ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    if (!["programada", "cancelada"].includes(visita.estado)) {
      throw new BusinessException({
        message: `Solo se pueden eliminar visitas programadas o canceladas`,
        code: API_ERROR_CODE.CONFLICT,
        status: HttpStatus.CONFLICT,
      });
    }

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
}
