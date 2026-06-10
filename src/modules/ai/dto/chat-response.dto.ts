/**
 * @file chat-response.dto.ts
 * @description DTOs de respuesta del chat y del health check del módulo de IA.
 */

/** Respuesta del asistente de IA a un mensaje de chat. */
export class ChatResponseDto {
  reply!: string;
  sessionId?: string;
}

/** Respuesta del endpoint de salud del módulo de IA. */
export class AiHealthResponseDto {
  status!: "ok";
  module!: "ai";
  ready!: boolean;
}
