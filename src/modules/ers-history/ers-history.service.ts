/**
 * @file ers-history.service.ts
 * @description Reglas de negocio para historial de ERS (auditoría informativa).
 */
import { HttpStatus, Injectable } from "@nestjs/common";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { ListErsHistoryQueryDto } from "./dto/list-ers-history-query.dto";
import type { CreateErsHistoryInput, ErsHistoryActionType, ErsHistoryItem, ErsHistoryMetadata } from "./ers-history.types";
import { ErsHistorySqlRepository } from "./repositories/ers-history.sql-repository";

/** Servicio de historial para proyectos ERS. */
@Injectable()
export class ErsHistoryService {
  constructor(private readonly ersHistorySqlRepository: ErsHistorySqlRepository) {}

  /**
   * Registra un evento de historial con tono informativo.
   * @param input - Datos base del evento.
   * @returns Evento guardado.
   */
  async registerEvent(input: {
    projectId: number;
    actionType: ErsHistoryActionType;
    summary: string;
    actorUserId: number;
    metadata?: ErsHistoryMetadata;
  }) {
    const actorDisplayName = await this.ersHistorySqlRepository.resolveActorDisplayName(input.actorUserId);
    const payload: CreateErsHistoryInput = {
      projectId: input.projectId,
      actionType: input.actionType,
      summary: this.normalizeSummary(input.summary),
      actorUserId: input.actorUserId,
      actorDisplayName,
      metadata: input.metadata,
    };
    return this.ersHistorySqlRepository.create(payload);
  }

  /**
   * Lista el historial de un proyecto validando alcance por rol.
   * @param user - Usuario autenticado.
   * @param projectId - ID del proyecto.
   * @param query - Paginación.
   * @returns Historial paginado.
   */
  async listByProject(
    user: AuthenticatedUser,
    projectId: number,
    query: ListErsHistoryQueryDto,
  ): Promise<{ items: ErsHistoryItem[]; total: number; page: number; limit: number }> {
    const access = await this.ersHistorySqlRepository.findProjectAccess(projectId);
    if (!access) {
      throw new BusinessException({
        message: `No se encontró el proyecto ERS ${projectId}`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    if (user.role !== "technician" && access.requesterId !== user.id) {
      throw new BusinessException({
        message: "Solo puedes ver el historial de tus propios proyectos ERS",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }

    return this.ersHistorySqlRepository.listByProject(
      projectId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  private normalizeSummary(summary: string): string {
    const text = summary.trim();
    if (text.length > 0) return text;
    return "Se registró una actualización en el proyecto ERS.";
  }
}

