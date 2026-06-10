/**
 * @file response.interceptor.ts
 * @description Interceptor que envuelve respuestas exitosas en `{ success, message, data }`.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, map } from "rxjs";

/** Clave de metadatos para el mensaje de respuesta personalizado. */
export const RESPONSE_MESSAGE_KEY = "responseMessage";

/** Clave de metadatos para omitir el sobre de respuesta. */
export const SKIP_RESPONSE_ENVELOPE_KEY = "skipResponseEnvelope";

/**
 * Formato estándar de respuesta exitosa de la API.
 */
export interface EnvelopeSuccess<T> {
  success: true;
  message: string;
  data: T;
}

/** Payload interno que puede indicar respuesta cruda o ya envuelta. */
interface MaybeWrapped<T> {
  __raw?: boolean;
  message?: string;
  data?: T;
}

/**
 * Interceptor global que normaliza respuestas HTTP exitosas al sobre de la API.
 */
@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, EnvelopeSuccess<T> | T>
{
  /** Inyecta el reflector para leer metadatos del handler. */
  constructor(private readonly reflector: Reflector) {}

  /**
   * Envuelve el payload del handler salvo que esté marcado para omitir el sobre.
   * @param context - Contexto de ejecución HTTP.
   * @param next - Cadena de handlers siguientes.
   * @returns Observable con respuesta envuelta o cruda según metadatos.
   */
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<EnvelopeSuccess<T> | T> {
    const handlerMessage = this.reflector.getAllAndOverride<string | undefined>(
      RESPONSE_MESSAGE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const skipEnvelope = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_ENVELOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      map((payload: T) => {
        if (skipEnvelope) {
          return undefined as unknown as T;
        }
        const maybe = payload as unknown as MaybeWrapped<T>;
        if (maybe && typeof maybe === "object" && maybe.__raw === true) {
          return payload;
        }
        if (
          maybe &&
          typeof maybe === "object" &&
          "success" in (maybe as object) &&
          (maybe as { success?: unknown }).success !== undefined
        ) {
          return payload;
        }

        return {
          success: true,
          message: handlerMessage ?? "OK",
          data: payload,
        } satisfies EnvelopeSuccess<T>;
      }),
    );
  }
}
