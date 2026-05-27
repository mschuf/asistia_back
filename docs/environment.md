# Variables de entorno — asistIA Backend

Copiar `.env.example` a `.env` y completar los valores.

## Servidor

| Variable | Default | Descripción |
|----------|---------|-------------|
| `SERVER_PORT` | `1001` | Puerto HTTP |
| `SERVER_HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | Entorno |
| `CORS_ORIGIN` | `http://localhost:5173` | Orígenes permitidos (coma) |
| `LOG_LEVEL` | `info` | Nivel Pino |

## JWT

| Variable | Descripción |
|----------|-------------|
| `JWT_SECRET` | Secreto de firma (32+ chars) |
| `JWT_EXPIRES_IN` | Ej: `8h`, `1h` |

## LDAP

| Variable | Descripción |
|----------|-------------|
| `AUTH_PROVIDER` | Debe ser `ldap` |
| `LDAP_URL` | URL del servidor LDAP |
| `LDAP_DOMAIN` | Dominio AD |
| `LDAP_BASE_DN` | Base DN de búsqueda |
| `LDAP_ADMIN` | Usuario bind (opcional) |
| `LDAP_ADMIN_PWD` | Password bind (opcional) |

## GLPI

| Variable | Descripción |
|----------|-------------|
| `GLPI_BASE_URL` | URL hasta `apirest.php` o raíz GLPI |
| `GLPI_APP_TOKEN` | App-Token de GLPI |
| `GLPI_CATALOG_BOOTSTRAP_LOGIN` | Cuenta de servicio |
| `GLPI_CATALOG_BOOTSTRAP_PASSWORD` | Password cuenta de servicio |

## IA (scaffold)

| Variable | Descripción |
|----------|-------------|
| `AI_PROVIDER` | Reservado para futuro |
| `OPENAI_API_KEY` | Reservado para futuro |

## Frontend

En `asistia_front/.env`:

```env
VITE_API_URL=http://localhost:1001/api/v1
```
