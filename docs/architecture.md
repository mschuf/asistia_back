# Arquitectura de asistIA

API NestJS que actúa como **capa de negocio (Anti-Corruption Layer)** entre la SPA React/Vite de asistIA y **GLPI 9.4.2 vía `apirest.php`**.

## Principios

- **Modular NestJS**: dominio (`tickets`, `users`, `catalog`) separado de GLPI en `modules/glpi/`.
- **Sin DB propia**: persistencia delegada a GLPI.
- **LDAP + JWT**: identidad corporativa; operaciones GLPI con cuenta de servicio.
- **IA scaffold**: módulo `ai/` preparado para integración futura.

## Capas

```text
React/Vite (asistia_front)
        │ Bearer JWT
        ▼
NestJS API (asistia_back)  /api/v1
        │
        ├── auth (LDAP + JWT)
        ├── tickets / catalog / users
        ├── glpi (client, repositories, mappers)
        ├── mail / attachments / cache / health
        └── ai (scaffold)
        │
        ▼
GLPI apirest.php + LDAP + SMTP (opcional)
```

## Estructura

```text
asistia_back/src/
  main.ts
  app.module.ts
  common/
  config/
  modules/
    auth/
    glpi/
    tickets/
    catalog/
    users/
    mail/
    attachments/
    cache/
    health/
    ai/
```
