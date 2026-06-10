/**
 * @file chat-request.dto.ts
 * @description DTO de validación para peticiones de chat con el asistente de IA.
 */
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

/** Cuerpo HTTP de una petición de chat al módulo de IA. */
export class ChatRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;
}
