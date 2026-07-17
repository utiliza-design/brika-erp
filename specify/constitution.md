# Constitution — Brika ERP

Este documento define las reglas y restricciones fijas del proyecto. Toda especificación, plan o tarea generada bajo `specify/` debe respetar estos principios. Si un requisito nuevo entra en conflicto con algo aquí, se resuelve actualizando explícitamente esta constitution primero (con aprobación humana), nunca ignorándola en silencio.

## Contexto

Ver `/docs/00-historia.md` (fuera de este repositorio) para el contexto completo de origen del proyecto. En resumen: proyecto heredado, originalmente construido en Replit, en migración a hosting propio (v2nets) con un solo usuario activo.

## Stack técnico (fijo, no renegociable sin decisión explícita)

- **Runtime:** Node.js 20.x
- **Lenguaje:** TypeScript
- **Backend:** Express 5
- **Base de datos:** MySQL / MariaDB (vía Drizzle ORM). PostgreSQL fue descartado — no reintroducir dependencias específicas de Postgres (arrays nativos, JSONB, ILIKE, RETURNING).
- **Frontend:** React 18 + Vite + Tailwind + Radix UI (shadcn/ui)
- **Autenticación:** login propio con `passport-local` (usuario/contraseña, hash con bcrypt). NO reintroducir dependencias de OIDC de Replit (`openid-client`, `REPL_ID`) bajo ninguna circunstancia.
- **Sesiones:** store de sesiones compatible con MySQL (no `connect-pg-simple`).
- **Testing:** Vitest. Los tests son archivos permanentes versionados en Git (`server/__tests__/`), no scripts descartables.
- **Hosting de producción:** v2nets (cPanel + Phusion Passenger + LiteSpeed). El proceso Node debe escuchar en `process.env.PORT` (asignado dinámicamente por Passenger, no fijo).

## Restricciones del entorno de hosting

- No asumir disponibilidad de PostgreSQL, Redis, o procesos gestionados por PM2 — el hosting usa Passenger para mantener el proceso Node vivo.
- WebSockets están soportados por LiteSpeed, pero deben implementarse con heartbeats/ping-pong para evitar desconexión por timeout de conexiones inactivas del hosting compartido.
- Recursos limitados (LVE de CloudLinux): asumir memoria disponible modesta (rango 1-2 GB). Evitar procesos que consuman memoria de forma descontrolada.

## Seguridad y manejo de credenciales

- Ningún archivo con contraseñas, tokens, o llaves reales se commitea a este repositorio, ni siquiera temporalmente. Van en `/docs/` (fuera del repo) o en variables de entorno no versionadas (`.env`, `.env.local`, `.env.production` — ya en `.gitignore`).
- El código de conexión (ej. `server/db.ts`) lee credenciales exclusivamente desde variables de entorno; nunca valores hardcodeados, ni siquiera los de desarrollo local.
- El único usuario del sistema se crea manualmente en la base de datos (vía script de seed ejecutado por humano). No existe endpoint de registro público (`/api/register`) salvo que se apruebe explícitamente lo contrario en una spec futura.

## Flujo de trabajo Git

- Repositorio: `github.com/utiliza-design/brika-erp`, rama principal `main`.
- Ningún cambio se hace directo sobre `main`. Todo trabajo de agente ocurre en una rama de feature, se revisa vía Pull Request, y se mergea solo con aprobación humana.
- **Staging explícito:** al preparar un commit se usa `git add <ruta/archivo>` con rutas específicas — nunca `git add .` ni `git commit -am`. Cada commit debe contener exactamente lo que su mensaje describe, nada más. (Regla establecida tras detectar que un `git add .` arrastró archivos de otro commit planificado.)
- Los cambios grandes se dividen en commits lógicos pequeños, cada uno verificable por separado (tests en verde tras cada commit).

## Interacción de agentes con herramientas

- **Prompts interactivos sobre estructuras de datos:** si una herramienta (drizzle-kit, CLI de base de datos, o cualquier otra) hace una pregunta interactiva que involucre crear, renombrar, truncar o eliminar tablas/columnas/datos, el agente muestra la pregunta textual y sus opciones al humano ANTES de responder, y espera confirmación explícita. Nunca responde por su cuenta. Esta regla es crítica contra bases de datos con datos reales, pero se aplica siempre (también en local) para mantener el hábito.
- Toda operación de borrado o limpieza (archivos, tablas, cachés) requiere confirmación humana previa, sin excepción.

## Principios de desarrollo

- Preferir cambios pequeños y verificables sobre reescrituras grandes de una sola vez.
- Antes de tocar datos existentes (aunque sean de prueba), confirmar explícitamente con el humano.
- Las verificaciones de comportamiento se hacen de forma empírica (probar contra la base real, escribir el test) — no se asume equivalencia entre motores de base de datos sin comprobarla.
- La lógica de negocio compartida se centraliza en funciones puras testeables (ej. `hasValidEmail` en `server/db-helpers.ts`) — no se duplica inline en múltiples lugares.
- Priorizar velocidad de entrega dado que el proyecto tiene bajo riesgo actual (un solo usuario, sin operación crítica en curso), pero sin sacrificar la separación segura entre código y credenciales definida arriba.
