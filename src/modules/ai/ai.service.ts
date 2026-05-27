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
  chat(request: ChatRequestDto): Promise<ChatResponseDto>;
}

@Injectable()
export class AiService {
  health(): AiHealthResponseDto {
    return {
      status: "ok",
      module: "ai",
      ready: false,
    };
  }

  chat(_request: ChatRequestDto): Promise<ChatResponseDto> {
    throw new BusinessException({
      message: "El asistente de IA aún no está implementado.",
      code: API_ERROR_CODE.NOT_IMPLEMENTED,
      status: HttpStatus.NOT_IMPLEMENTED,
    });
  }
}
