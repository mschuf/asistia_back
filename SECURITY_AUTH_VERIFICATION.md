# Verificacion de seguridad: login cifrado y sesion HttpOnly

Este documento sirve para comprobar que las mejoras de seguridad del login LDAP y la sesion se implementaron correctamente.

## Objetivo

Validar que:

- La contrasena ya no viaja en texto plano al backend.
- El backend recibe `encryptedPassword` y lo descifra antes de autenticar contra LDAP.
- El JWT ya no se guarda en `localStorage`.
- La sesion se mantiene mediante una cookie `HttpOnly`.
- Las peticiones autenticadas funcionan cuando frontend y backend estan en sitios diferentes.

## Configuracion requerida

### Backend `.env`

Cuando frontend y backend estan en sitios diferentes, el backend debe permitir el origen exacto del frontend y emitir una cookie cross-site segura:

```env
CORS_ORIGIN=https://front.tu-dominio.com

AUTH_RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
AUTH_RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

AUTH_COOKIE_NAME=asistia_access_token
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAME_SITE=none
AUTH_COOKIE_MAX_AGE=0
```

Notas:

- `CORS_ORIGIN` no debe ser `*` si se usan cookies. Debe ser la URL exacta del frontend.
- `AUTH_COOKIE_SECURE=true` requiere HTTPS.
- `AUTH_COOKIE_SAME_SITE=none` es necesario si el frontend y el backend estan en sitios distintos.
- `AUTH_COOKIE_MAX_AGE=0` hace que la cookie use la duracion del JWT (`JWT_EXPIRES_IN`).
- `AUTH_RSA_PRIVATE_KEY` es obligatoria en produccion. En desarrollo el backend puede generar una clave temporal, pero esa clave cambia al reiniciar.
- Si se define `AUTH_RSA_PRIVATE_KEY`, `AUTH_RSA_PUBLIC_KEY` puede configurarse explicitamente para facilitar auditoria, aunque el backend puede derivar la publica desde la privada.

Ejemplo con valores de sesion:

```env
JWT_EXPIRES_IN=8h
AUTH_COOKIE_NAME=asistia_access_token
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAME_SITE=none
AUTH_COOKIE_MAX_AGE=0
```

### Frontend `.env`

Cuando el frontend llama a un backend publicado en otro sitio:

```env
VITE_API_URL=https://api.tu-dominio.com/api/v1
```

Notas:

- Debe apuntar al backend real, no al proxy local `/api/v1`.
- El frontend ya envia cookies con `credentials: "include"` desde `apiClient`.
- El backend debe responder con CORS habilitado para el origen exacto del frontend.

### Desarrollo local con proxy Vite

Para desarrollo local, se recomienda usar el proxy de Vite para evitar problemas de cookies cross-site en HTTP:

Frontend `.env`:

```env
VITE_API_URL=/api/v1
```

Backend `.env`:

```env
CORS_ORIGIN=http://localhost:5173
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAME_SITE=lax
AUTH_COOKIE_MAX_AGE=0
```

## Pasos de verificacion

### 1. Verificar clave publica

Abrir en el navegador o probar con una herramienta HTTP:

```text
GET https://api.tu-dominio.com/api/v1/auth/public-key
```

Resultado esperado:

- Respuesta exitosa.
- El body contiene `publicKey`.
- La clave empieza con `-----BEGIN PUBLIC KEY-----`.

### 2. Verificar que el login no envia password en texto plano

En DevTools del navegador:

1. Abrir la pestana `Network`.
2. Iniciar sesion.
3. Seleccionar la request `POST /auth/login`.
4. Revisar el request payload.

Resultado esperado:

```json
{
  "username": "usuario",
  "encryptedPassword": "base64..."
}
```

No debe aparecer:

```json
{
  "password": "mi-contrasena"
}
```

### 3. Verificar cookie HttpOnly

En la respuesta de `POST /auth/login`, revisar los headers.

Resultado esperado:

```text
Set-Cookie: asistia_access_token=...; HttpOnly; Secure; SameSite=None; Path=/
```

Para desarrollo local con proxy, es aceptable:

```text
Set-Cookie: asistia_access_token=...; HttpOnly; SameSite=Lax; Path=/
```

Importante:

- En produccion debe tener `Secure`.
- Si frontend y backend estan en sitios diferentes debe tener `SameSite=None`.
- `HttpOnly` debe estar presente.

### 3.1 Verificar payload mínimo del JWT

Con la cookie de sesión creada, decodificar el payload del token (sin verificar firma) y revisar claims.

Resultado esperado:

- Deben existir `sub`, `role`, `locationId`, `iat` y `exp`.
- No deben existir `login`, `name`, `email`, `groupIds`, `entityId` ni `entityName`.

### 4. Verificar que no hay datos de sesion en localStorage

En DevTools:

1. Ir a `Application`.
2. Abrir `Local Storage`.
3. Revisar el origen del frontend.

Resultado esperado:

No deben existir estas claves:

```text
asistia_token
asistia_user
asistia_expires_at
```

Si existian de una version anterior, la app debe eliminarlas al iniciar.

### 5. Verificar sesion al recargar

1. Iniciar sesion.
2. Recargar la pagina.
3. Observar las requests iniciales.

Resultado esperado:

- El frontend llama a `GET /auth/me`.
- La request incluye la cookie automaticamente.
- La app restaura el usuario sin leer `localStorage`.
- No redirige a `/login` si la cookie sigue vigente.

### 6. Verificar peticiones autenticadas

Con sesion iniciada, abrir una pantalla que consuma datos protegidos, por ejemplo tickets.

Resultado esperado:

- Las requests no envian `Authorization: Bearer ...`.
- Las requests si incluyen la cookie de sesion.
- El backend responde correctamente.

### 7. Verificar logout

1. Iniciar sesion.
2. Cerrar sesion desde la UI.
3. Revisar la respuesta de `POST /auth/logout`.

Resultado esperado:

- El backend envia un `Set-Cookie` que elimina `asistia_access_token`.
- La app limpia el estado local.
- La app redirige a `/login`.
- Al recargar, no se restaura la sesion.

### 8. Verificar expiracion

Para una prueba rapida, configurar temporalmente:

```env
JWT_EXPIRES_IN=1m
AUTH_COOKIE_MAX_AGE=0
```

Resultado esperado:

- Luego de expirar el JWT, una request protegida responde 401.
- El frontend limpia la sesion.
- El usuario vuelve a `/login`.

## Checklist rapido

- `POST /auth/login` envia `encryptedPassword`, no `password`.
- `POST /auth/login` devuelve cookie `HttpOnly`.
- En produccion la cookie tiene `Secure`.
- Con frontend y backend en sitios distintos la cookie tiene `SameSite=None`.
- `localStorage` no contiene `asistia_token`, `asistia_user` ni `asistia_expires_at`.
- `GET /auth/me` restaura la sesion al recargar.
- Las requests protegidas usan cookie, no Bearer token desde JavaScript.
- El JWT contiene solo `sub`, `role` y `locationId` (además de `iat`/`exp`).
- `POST /auth/logout` elimina la cookie.
- `CORS_ORIGIN` contiene el origen exacto del frontend.
- `VITE_API_URL` apunta al backend publicado.

## Problemas comunes

### La cookie no se guarda en el navegador

Revisar:

- El backend esta en HTTPS.
- `AUTH_COOKIE_SECURE=true`.
- `AUTH_COOKIE_SAME_SITE=none` si los sitios son distintos.
- `CORS_ORIGIN` coincide exactamente con la URL del frontend.
- La request del frontend usa `credentials: "include"`.

### El login responde OK pero al recargar vuelve a `/login`

Revisar:

- La cookie fue seteada correctamente.
- `GET /auth/me` se esta llamando contra el mismo dominio donde se seteo la cookie.
- La cookie no esta expirada.
- `JWT_SECRET` no cambio entre el login y la recarga.

### Funciona en local pero no en produccion

Revisar:

- En local puede funcionar con `SameSite=Lax` por proxy.
- En produccion con sitios distintos se necesita `SameSite=None` y `Secure`.
- El certificado HTTPS debe ser valido.
- No usar `CORS_ORIGIN=*` con cookies.

