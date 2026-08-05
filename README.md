# Guijo Social

Proyecto base para una red social local tipo X/Twitter con:

- Frontend en React + Vite.
- Backend en Cloudflare Workers + Hono.
- Base de datos en Supabase.
- Registro por numero reservado con formato `ANONIMO-<numero>`.

## Estructura

- `apps/web`: interfaz React.
- `apps/api`: API para autenticacion, feed, likes, posts, comentarios y denuncias.
- `supabase/schema.sql`: tablas y vista inicial para Supabase.

## Variables necesarias

Frontend:

1. Copia `apps/web/.env.example` a `.env`.
2. Ajusta `VITE_API_URL`.

Backend:

1. Copia `apps/api/.dev.vars.example` a `.dev.vars`.
2. Rellena `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `JWT_SECRET`.

## Arranque local

1. En Supabase ejecuta `supabase/schema.sql`.
2. En la raiz ejecuta `npm install`.
3. Lanza la API con `npm run dev:api`.
4. Lanza el frontend con `npm run dev:web`.

## Notas funcionales

- El registro pide numero anonimo reservado, contrasena, edad y aceptacion de politicas y privacidad.
- La privacidad informa de recopilacion de dispositivo y contexto de uso para seguridad.
- Las denuncias piden motivo y quedan en revision antes del borrado.