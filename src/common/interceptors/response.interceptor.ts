import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, map } from "rxjs";

export const RESPONSE_MESSAGE_KEY = "responseMessage";
export const SKIP_RESPONSE_ENVELOPE_KEY = "skipResponseEnvelope";

export interface EnvelopeSuccess<T> {
  success: true;
  message: string;
  data: T;
}

interface MaybeWrapped<T> {
  __raw?: boolean;
  message?: string;
  data?: T;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, EnvelopeSuccess<T> | T>
{
  constructor(private readonly reflector: Reflector) {}

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
