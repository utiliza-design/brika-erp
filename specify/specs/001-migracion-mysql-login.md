# Spec 001 — Migración de base de datos a MySQL/MariaDB y autenticación local

Estado: Completada (fecha de cierre: 2026-07-16)
Depende de: `specify/constitution.md`

## Contexto

El proyecto fue construido originalmente asumiendo el entorno de Replit (PostgreSQL nativo, login OIDC propio de Replit). El destino de producción es v2nets, que no ofrece PostgreSQL ni el login de Replit. Esta spec cubre los dos cambios necesarios para que el proyecto pueda desplegarse ahí, manteniendo el resto del stack (Node/TypeScript/Express/React) sin cambios.

El proyecto tiene actualmente **un solo usuario real**, con volumen de datos bajo. Esto permite priorizar velocidad de entrega sobre migraciones de datos sofisticadas.

## Alcance

### Incluido
1. Migración del schema de Drizzle ORM de PostgreSQL a MySQL/MariaDB.
2. Migración de los datos existentes desde la base Postgres local de desarrollo a MySQL.
3. Reemplazo del store de sesiones (de `connect-pg-simple` a uno compatible con MySQL).
4. Reemplazo de la autenticación OIDC de Replit por login propio con `passport-local`.
5. Actualización de variables de entorno para reflejar la nueva configuración.

### Explícitamente fuera de alcance
- No se implementa pantalla de registro público (`/api/register`). El único usuario se crea manualmente en la base de datos (ver Tarea 4).
- No se integra ningún proveedor OAuth (Google u otro).
- No se modifica ninguna lógica de negocio existente (parsers de Excel, cálculos, reportes) — este cambio es puramente de infraestructura de datos y autenticación.
- No se despliega a producción como parte de esta spec — el despliegue en v2nets es una spec separada, posterior a esta.

## Tarea 1 — Migración del schema

**Requisito:** `shared/schema.ts` debe usar `mysqlTable` (de `drizzle-orm/mysql-core`) en vez de `pgTable`, con los tipos de columna equivalentes en MySQL.

**Criterios de aceptación:**
- [x] El archivo `shared/schema.ts` no contiene ninguna importación de `drizzle-orm/pg-core`.
- [x] Todo tipo `serial` se reemplaza por `int().autoincrement()` (o equivalente MySQL).
- [x] Todo tipo `jsonb` se reemplaza por `json`.
- [x] Si existe algún uso de arrays nativos de Postgres, `ILIKE`, o `RETURNING`, se reporta a Stanley antes de traducirlo — estas construcciones no tienen equivalente directo en MySQL y requieren decisión caso a caso.
- [x] `drizzle.config.ts` tiene `dialect: "mysql"` (no `"postgresql"`).
- [x] Las migraciones antiguas en `migrations/` (generadas para Postgres) se eliminan.
- [x] Se generan migraciones nuevas para MySQL con `drizzle-kit generate`, y `npm run db:push` (o el comando equivalente) se ejecuta sin errores contra una base MySQL local de prueba.

## Tarea 2 — Store de sesiones

**Requisito:** reemplazar `connect-pg-simple` por un store de sesiones compatible con MySQL.

**Criterios de aceptación:**
- [x] `connect-pg-simple` se elimina de `package.json`.
- [x] Se agrega un store compatible con MySQL (ej. `express-mysql-session`).
- [x] El código de configuración de sesiones (ubicación actual: revisar `server/`) usa el nuevo store, apuntando a la misma conexión MySQL que Drizzle.
- [x] Una sesión de login persiste correctamente entre requests en un entorno de prueba local.

## Tarea 3 — Migración de datos existentes

**Requisito:** preservar los datos actualmente cargados en la base Postgres local de desarrollo.

**Criterios de aceptación:**
- [x] Se exportan los datos de cada tabla de la base Postgres actual (JSON o CSV, uno por tabla).
- [x] Se escribe un script simple de importación que carga esos datos en las tablas nuevas de MySQL.
- [x] Después de importar, el conteo de filas por tabla coincide entre el origen (Postgres) y el destino (MySQL).
- [x] Se hace una revisión manual de al menos una relación entre tablas (foreign key) para confirmar que las referencias no se rompieron en la migración.
- [x] Antes de ejecutar la importación real, Antigravity confirma con Stanley que tiene un respaldo/export completo tomado, por si hay que repetir el proceso.

## Tarea 4 — Login local con passport-local

**Requisito:** reemplazar la autenticación OIDC de Replit por un login propio de usuario/contraseña.

**Criterios de aceptación:**
- [x] El archivo de autenticación (actualmente `server/replit_integrations/auth/replitAuth.ts`) ya no importa `openid-client` ni referencia `process.env.REPL_ID`.
- [x] Se implementa `LocalStrategy` de `passport-local`, comparando la contraseña ingresada contra un hash guardado (bcrypt).
- [x] La tabla de usuarios (en el nuevo schema MySQL) incluye un campo de contraseña hasheada y un campo de identificador de login (username o email).
- [x] Existe una ruta `POST /api/login` que autentica correctamente con credenciales válidas y rechaza credenciales inválidas con un mensaje de error apropiado (sin revelar si el usuario existe o no, por buena práctica de seguridad).
- [x] **No existe** ninguna ruta de registro público. La creación del único usuario se hace vía un script de seed que Stanley ejecuta manualmente una sola vez (Antigravity debe proveer este script, no una ruta HTTP).
- [x] `POST /api/logout` destruye la sesión local correctamente, sin ningún intento de redirección a un endpoint de logout de Replit.
- [x] Se genera un `SESSION_SECRET` nuevo (aleatorio, no el valor de desarrollo actual) para usar en producción — Antigravity debe generarlo y entregárselo a Stanley para guardar en `docs/`, no dejarlo hardcodeado en ningún archivo del repo.

## Variables de entorno afectadas

Este cambio requiere actualizar (no necesariamente en este mismo paso, pero quedan documentadas aquí para la spec de despliegue posterior):
- `DATABASE_URL` — pasa de apuntar a Postgres a apuntar a MySQL.
- Eliminar cualquier variable relacionada a Replit (`REPL_ID`, y las que dependan de `openid-client`).
- `SESSION_SECRET` — nuevo valor para producción.

## Verificación final de la spec

Esta spec se considera completa cuando:
1. La aplicación arranca localmente contra una base MySQL (no Postgres) sin errores.
2. Un usuario creado vía el script de seed puede iniciar sesión con `POST /api/login` and acceder a rutas protegidas.
3. Los datos migrados desde Postgres son visibles y correctos en la aplicación corriendo contra MySQL.
4. No queda ninguna referencia a PostgreSQL, `openid-client`, o `REPL_ID` en el código (`grep` limpio).
