/**
 * @file tickets-close.service.ts
 * @description Orquesta consulta y cierre masivo de tickets 100% vía SQL (super admin).
 * No usa la API REST de GLPI ni `TicketsService.updateStatus` (evita fallback y correos).
 */
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../common/dto/pagination.dto";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import { TicketsCloseSqlRepository } from "../glpi/repositories/tickets-close.sql-repository";
import type { CloseBulkResponseDto } from "./dto/close-bulk.dto";
import type { CloseCandidatesQueryDto } from "./dto/close-candidates-query.dto";
import type { TicketResponseDto } from "./dto/ticket.response.dto";

/**
 * Servicio SQL-only de candidatos a cierre masivo (super admin).
 */
@Injectable()
export class TicketsCloseService {
  /** Inyecta el repositorio SQL dedicado. */
  constructor(private readonly closeRepo: TicketsCloseSqlRepository) {}

  /**
   * Lista página de tickets candidatos a cierre masivo.
   * @param query - Filtros y paginación validados.
   * @returns Resultado paginado con DTOs de respuesta.
   * @throws {BusinessException} Si no se especifica ningún límite de fecha.
   */
  async listCandidates(query: CloseCandidatesQueryDto): Promise<PaginatedResult<TicketResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const includeOpen = query.includeOpen ?? false;
    const includeSolved = query.includeSolved ?? false;

    if (!query.dateFrom && !query.dateTo) {
      throw new BusinessException({
        message: "dateFrom or dateTo is required",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    if (!includeOpen && !includeSolved) {
      return { items: [], total: 0, page, limit };
    }

    const { items, total } = await this.closeRepo.listCandidatesAsResponse({
      page,
      limit,
      includeOpen,
      includeSolved,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return { items, total, page, limit };
  }

  /**
   * Obtiene el detalle de un candidato a cierre masivo.
   * @param ticketId - ID del ticket GLPI.
   * @returns Ticket enriquecido.
   * @throws {BusinessException} 404 si no existe, está borrado o ya cerrado.
   */
  async getCandidateDetail(ticketId: number): Promise<TicketResponseDto> {
    const ticket = await this.closeRepo.findCandidateById(ticketId);
    if (!ticket) {
      throw new BusinessException({
        message: "Ticket not found or not eligible for bulk close",
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }
    return ticket;
  }

  /**
   * Cierra en bloque los tickets indicados, 100% vía SQL.
   * @param ticketIds - IDs de tickets a cerrar.
   * @returns Conteo de solicitados, cerrados, omitidos y fallidos.
   */
  async closeBulk(ticketIds: number[]): Promise<CloseBulkResponseDto> {
    return this.closeRepo.closeBulk(ticketIds);
  }
}
