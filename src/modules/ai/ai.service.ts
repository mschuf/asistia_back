/**
 * @file ai.service.ts
 * @description Servicio del módulo de IA: health check y punto de extensión para chat (MVP sin implementar).
 */
import { HttpStatus, Injectable } from "@nestjs/common";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { ChatRequestDto } from "./dto/chat-request.dto";
import type { AiHealthResponseDto, ChatResponseDto } from "./dto/chat-response.dto";

/**
 * Punto de extensión para proveedores de IA (OpenAI, Azure OpenAI, etc.).
 * En el MVP solo expone health; chat queda reservado para una iteración futura.
 */
export interface AiProvider {
  /**
   * Procesa un mensaje de chat con el proveedor de IA.
   * @param request - Mensaje y sesión opcional del usuario.
   * @returns Respuesta generada por el proveedor.
   */
  chat(request: ChatRequestDto): Promise<ChatResponseDto>;
}

/** Servicio de salud y chat de IA (chat aún no implementado). */
@Injectable()
export class AiService {
  /**
   * Devuelve el estado operativo del módulo de IA.
   * @returns Objeto de health con bandera `ready: false` en el MVP.
   */
  health(): AiHealthResponseDto {
    return {
      status: "ok",
      module: "ai",
      ready: false,
    };
  }

  /**
   * Endpoint reservado de chat; lanza error hasta integrar un proveedor.
   * @param _request - Cuerpo de la petición de chat (no procesado aún).
   * @returns Nunca resuelve en el MVP.
   * @throws {BusinessException} Siempre con código NOT_IMPLEMENTED.
   */
  chat(_request: ChatRequestDto): Promise<ChatResponseDto> {
    throw new BusinessException({
      message: "El asistente de IA aún no está implementado.",
      code: API_ERROR_CODE.NOT_IMPLEMENTED,
      status: HttpStatus.NOT_IMPLEMENTED,
    });
  }
}
