# asistIA Backend

API NestJS que actúa como capa de negocio entre la SPA React y GLPI 9.4.2.

## Requisitos

- Node.js 18+
- GLPI 9.4.2 accesible vía `apirest.php`
- LDAP corporativo
- PostgreSQL **no requerido**

## Arranque

```bash
npm install
cp .env.example .env
npm run start:dev
```

La API queda en `http://localhost:1001/api/v1` y Swagger en `/api/v1/docs`.

## Scripts

- `npm run start:dev` — desarrollo con watch
- `npm run build` — compila a `dist/`
- `npm run start:prod` — ejecuta `dist/main.js`

## Documentación

- [Endpoints API ↔ GLPI](./docs/API-GLPI.md)
- [Arquitectura](./docs/architecture.md)
- [Variables de entorno](./docs/environment.md)
- [Buenas prácticas](./BACK_BEST_PRACTICES.md)
