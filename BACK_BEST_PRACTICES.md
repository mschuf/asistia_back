# asistIA Backend - Buenas prácticas

## Seguridad y autenticación

- Usar JWT en todos los endpoints protegidos con `JwtAuthGuard`.
- Cuando el token expira, responder 401 con `code = TOKEN_EXPIRED`.
- Autenticación LDAP-only: `POST /auth/login` con `username` y `password`.
- No usar SSO Windows ni registro público en este proyecto.

## GLPI

- Toda la persistencia de tickets vive en GLPI.
- Operaciones CRUD con cuenta de servicio (`GLPI_CATALOG_BOOTSTRAP_*`).
- No usar `synchronize=true` ni base de datos propia para tickets.

## Calidad de código

- Validar DTOs con `class-validator` y `ValidationPipe` global.
- Mantener la traducción GLPI en `modules/glpi/`.
- Centralizar errores de negocio en `BusinessException`.

## Módulo IA

- El módulo `ai/` es scaffold: `GET /ai/health` operativo, `POST /ai/chat` reservado.
