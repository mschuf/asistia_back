import "reflect-metadata";
import { NestFactory, Reflector } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import cookieParser from "cookie-parser";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import type { AppConfig } from "./config/configuration";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.use(cookieParser());

  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const nodeEnv = config.get("server.nodeEnv", { infer: true });
  if (nodeEnv === "production") {
    app.set("trust proxy", 1);
  }

  const corsOrigins = config.get("server.corsOrigin", { infer: true });
  const corsAllowAll = corsOrigins.includes("*");

  app.enableCors({
    origin: (origin, callback) => {
      // Postman, curl y health checks no env├¡an Origin.
      // CORS_ORIGIN=* refleja cualquier Origin (credentials sigue permitido).
      if (corsAllowAll || !origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "x-schema",
      "x-user",
      "Origin",
      "X-Requested-With",
    ],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  const globalPrefix = config.get("server.globalPrefix", { infer: true });
  const apiVersion = config.get("server.apiVersion", { infer: true });
  const combinedPrefix = `${globalPrefix}/${apiVersion}`;
  app.setGlobalPrefix(combinedPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableShutdownHooks();
  app.use((_req: unknown, res: { setHeader?: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader?.("X-Service", "asistIA API");
    next();
  });

  const configuredPort = config.get("server.port", { infer: true });
  const host = config.get("server.host", { infer: true });
  const iisNodePort = process.env.PORT?.trim();
  const listenTarget = iisNodePort || configuredPort;

  const swaggerConfig = new DocumentBuilder()
    .setTitle("asistIA API")
    .setDescription(
      "Capa de negocio entre asistIA (React/Vite) y GLPI 9.4.2 (apirest.php). " +
        "Autenticación vía LDAP; operaciones GLPI con cuenta de servicio.",
    )
    .setVersion("1.0.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT legacy (prefer session cookie from POST /auth/login)",
      },
      "bearer",
    )
    .addCookieAuth("asistia_access_token", {
      type: "apiKey",
      in: "cookie",
      name: "asistia_access_token",
      description: "HttpOnly session cookie set by POST /auth/login",
    }, "session")
    .addServer(`http://localhost:${configuredPort}`)
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${globalPrefix}/${apiVersion}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true },
    jsonDocumentUrl: `${globalPrefix}/${apiVersion}/docs-json`,
  });

  if (typeof listenTarget === "string" && Number.isNaN(Number(listenTarget))) {
    await app.listen(listenTarget);
  } else {
    await app.listen(Number(listenTarget), host);
  }

  const logger = app.get(Logger);
  const listenDescription = iisNodePort
    ? `iisnode target ${listenTarget}`
    : `http://${host}:${configuredPort}`;
  logger.log(
    `asistIA API listening on ${listenDescription}/${globalPrefix}/${apiVersion} (docs: /${globalPrefix}/${apiVersion}/docs)`,
  );

  // touch Reflector to keep it tree-shake safe
  app.get(Reflector);
}

bootstrap().catch((error) => {
  console.error("Fatal bootstrap error", error);
  process.exit(1);
});
