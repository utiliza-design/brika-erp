# Spec 002 — Gestión de usuarios (perfil y contraseñas)

**Proyecto:** Brika ERP (cloud.brikaorganics.cl)
**Repo:** github.com/utiliza-design/brika-erp
**Rama base:** `main`
**Rama de feature:** `002-gestion-usuarios`
**Estado:** Tareas 4.1, 4.2 y 4.3 completadas y comiteadas. Continuando con 4.4.

> **Nota de versión:** esta versión reemplaza el diseño original de la Tarea 4.4
> (reseteo por link de email vía `resend`) por un mecanismo de clave temporal
> sin dependencia de email, y agrega la Tarea 4.6 (creación de usuario) que no
> existía en la versión anterior. Motivo: el proyecto no tiene un servicio de
> envío de email contratado, y se prefiere mantener el sistema simple (KISS)
> en vez de contratar/configurar uno solo para esto.

---

## 1. Contexto

Al migrar el sistema de login OIDC de Replit (Google) a autenticación local con
`passport-local`, varias funcionalidades que antes dependían del proveedor
externo nunca se reconstruyeron:

1. El logout del frontend llamaba a `GET /api/logout` (vía `window.location.href`),
   pero el backend solo exponía esa ruta como `POST`. Resultado: 404 al cerrar
   sesión. **(Resuelto en Tarea 4.1, ver sección 7.)**
2. No existe ningún mecanismo — ni UI ni endpoint — para que un usuario cambie
   su propia contraseña.
3. No existe ningún mecanismo para que un usuario edite su propio perfil (nombre).
4. El campo `nombre` se completaba antes con los claims que devolvía Google/Replit
   en el primer login. Sin ese flujo, cualquier usuario que no tenga nombre cargado
   queda mostrando su email como nombre, de forma permanente y sin manera de
   corregirlo desde la aplicación.

Adicionalmente, no existe ningún flujo para que un administrador cree un usuario
nuevo, ni para que restablezca la contraseña de uno existente. Ambos casos
comparten el mismo problema de fondo: **cómo hacerle llegar una clave a la
persona sin depender de email**, dado que el proyecto no tiene un servicio de
envío de correo contratado.

**Decisión de diseño:** en ambos casos (creación y reseteo), el admin genera
una **clave temporal** que el sistema le muestra **una sola vez** en pantalla,
para que el propio admin se la entregue a la persona por un canal fuera del
sistema (WhatsApp, en persona, etc.). La persona queda obligada a cambiar esa
clave temporal en su primer inicio de sesión, antes de poder usar el resto de
la aplicación.

## 2. Alcance

### Incluido
- Fix del logout (bug de método HTTP). **Completado — ver sección 7.**
- Cambio de contraseña propia, con verificación de la contraseña actual.
- Edición de perfil propio (nombre).
- Reseteo de contraseña por parte de un admin, mediante clave temporal
  generada por el sistema y mostrada una sola vez (sin email).
- Creación de usuario/admin nuevo por parte de un admin, con el mismo
  mecanismo de clave temporal (sin flujo de invitación por email).
- Cambio de contraseña obligatorio en el primer login cuando la clave viene
  de un reseteo o de una creación de usuario.
- Invalidación de otras sesiones al cambiar contraseña (propio cambio,
  reseteo de admin, o cambio obligatorio de primer login).

### Fuera de alcance (no-goals)
- Cambio de email del usuario.
- Recuperación de contraseña autoiniciada por el propio usuario ("olvidé mi
  contraseña" desde la pantalla de login sin admin de por medio) — al no haber
  email, este flujo requeriría necesariamente pasar por un admin de todas
  formas; queda descartado por ahora, no solo pospuesto.
- Cualquier servicio de envío de email (se descarta explícitamente para esta
  spec, no solo se simplifica).
- Roles y permisos nuevos (se asume que ya existe distinción admin / no-admin
  en el sistema actual; esta spec no la crea).
- 2FA / MFA.
- Auditoría/logging extendido más allá de lo mínimo necesario para invalidar
  sesiones.

## 3. Consideraciones técnicas transversales

- Stack: Node/TypeScript/Express/React, Drizzle ORM sobre MySQL/MariaDB,
  sesiones con `passport-local`.
- Build en el servidor v2nets requiere `GOMAXPROCS=1`; Node se activa con
  `source /opt/alt/alt-nodejs20/enable`.
- Flujo de git: siempre rama de feature + PR revisado y mergeado por Stanley.
  Staging explícito por archivo (nunca `git add .` ni `commit -am`).
- Cualquier comando destructivo o prompt interactivo se muestra completo antes
  de ejecutar, con aprobación explícita — sin excepciones.
- Los archivos de `specify/` los entrega Claude; Antigravity no los escribe
  directamente — Stanley los guarda y commitea.
- **`resend` ya no es necesario para esta spec** — no se agrega ninguna
  dependencia de envío de email. Si `resend` sigue instalado en el proyecto
  por otra razón, no se toca; simplemente no se usa aquí.
- Fortaleza mínima de contraseña (propia, de reseteo, y temporal generada por
  el sistema): **8 caracteres como piso**, sin exigir mayúsculas/números.
- Requiere un campo nuevo en el usuario para forzar cambio de contraseña en
  el próximo login (ver Tarea 4.4 y 4.6) — sugerido `mustChangePassword`
  (boolean, default `false`) en `app_users` (`schema.ts`). Antigravity debe
  confirmar el nombre exacto de columna/convención usada en el schema actual
  antes de crear la migración.

## 4. Tareas

### Tarea 4.1 — Fix del logout (GET → POST) — ✅ COMPLETADA

Ver sección 7 para el detalle de lo implementado y verificado.

---

### Tarea 4.2 — Cambio de contraseña propia — ✅ COMPLETADA

Ver sección 7 para el detalle de lo implementado y verificado.

**Backend:**
- Nuevo endpoint, p. ej. `POST /api/account/change-password`, que recibe
  `currentPassword` y `newPassword`.
- Verifica `currentPassword` contra el hash almacenado antes de permitir el
  cambio (mismo mecanismo de hashing que ya usa `passport-local`).
- Si `currentPassword` no coincide, responde 401/403 sin revelar más detalle
  del necesario.
- Valida que `newPassword` tenga al menos 8 caracteres.
- Al cambiar la contraseña con éxito, dispara la invalidación de otras
  sesiones (ver Tarea 4.5).

**Frontend:**
- Nueva sección "Cambiar contraseña" en la pantalla de perfil/cuenta, con
  tres campos: contraseña actual, nueva contraseña, confirmar nueva
  contraseña.
- Validación en cliente de que "nueva contraseña" y "confirmar" coincidan
  antes de enviar.
- Mensajes de error claros si la contraseña actual es incorrecta o si la
  nueva no cumple el mínimo de 8 caracteres.

**Criterios de aceptación:**
- [x] Un usuario autenticado puede cambiar su contraseña ingresando su
      contraseña actual correctamente.
- [x] Si ingresa la contraseña actual incorrecta, el cambio es rechazado y se
      muestra un error, sin modificar la contraseña almacenada.
- [x] Si "nueva contraseña" tiene menos de 8 caracteres, se rechaza (tanto en
      frontend como en backend).
- [x] Si "nueva contraseña" y "confirmar" no coinciden, el frontend bloquea el
      envío antes de llamar al backend.
- [x] Tras un cambio exitoso, el usuario puede iniciar sesión con la nueva
      contraseña y ya no puede hacerlo con la anterior.
- [ ] Tras un cambio exitoso, las demás sesiones activas del usuario quedan
      invalidadas (ver 4.5), pero la sesión actual desde la que se hizo el
      cambio permanece activa. **(Pendiente — depende de la Tarea 4.5, no
      implementada todavía; el TODO queda marcado en el código.)**

---

### Tarea 4.3 — Edición de perfil propio (nombre) — ✅ COMPLETADA

Ver sección 7 para el detalle de lo implementado y verificado.

**Backend:**
- Nuevo endpoint, p. ej. `PATCH /api/account/profile`, que permite actualizar
  el campo `nombre` del propio usuario autenticado.
- No permite modificar campos sensibles (email, rol, id) desde este endpoint.

**Frontend:**
- Sección "Mi perfil" (puede convivir con la de cambio de contraseña en la
  misma pantalla de cuenta) con un campo editable para el nombre y botón de
  guardar.
- Refleja el nombre actualizado en la UI (header/sidebar) sin requerir
  logout/login.

**Criterios de aceptación:**
- [x] Un usuario puede editar su propio nombre y guardarlo.
- [x] El nuevo nombre se refleja en la interfaz (header/sidebar) inmediatamente
      tras guardar.
- [x] Un usuario sin nombre cargado (mostrando su email como nombre) puede
      corregirlo mediante esta pantalla.
- [x] El endpoint rechaza intentos de modificar campos distintos de `nombre`
      (email, rol, id) aunque se incluyan en el payload.
- [x] Un usuario no puede editar el perfil de otro usuario a través de este
      endpoint (verifica que el `id` del usuario a editar sea siempre el de
      la sesión autenticada, ignorando cualquier id enviado en el body) —
      verificado explícitamente con curl inyectando el id de otro usuario.

---

### Tarea 4.4 — Reseteo de contraseña por un admin (clave temporal, sin email)

**Flujo:**
1. Un admin, desde la vista de gestión de usuarios, selecciona "Restablecer
   contraseña" sobre un usuario, con una confirmación previa ("esto invalidará
   la contraseña actual del usuario").
2. El backend genera una clave temporal aleatoria (ver "Generación de clave
   temporal" más abajo), la hashea y la guarda como la nueva contraseña del
   usuario, y marca `mustChangePassword = true`.
3. El backend devuelve la clave temporal **en texto plano, una sola vez**, en
   la respuesta de este endpoint — no se guarda en ningún lado en texto plano,
   ni se puede volver a consultar después.
4. El frontend muestra la clave temporal en un modal/diálogo con: la clave en
   texto claro, un botón "copiar", y una advertencia explícita de que no se
   volverá a mostrar y que el admin debe entregarla directamente a la persona.
5. Cuando el usuario inicia sesión con la clave temporal, el backend detecta
   `mustChangePassword = true` y el frontend lo redirige obligatoriamente a
   una pantalla de "Debes definir una nueva contraseña" antes de dejarlo
   acceder a cualquier otra parte de la aplicación.
6. Al definir la nueva contraseña, se limpia `mustChangePassword`, se invalidan
   las demás sesiones del usuario (ver Tarea 4.5), y recién ahí queda con
   acceso normal.

**Backend — endpoints sugeridos:**
- `POST /api/admin/users/:id/reset-password` (requiere rol admin): genera la
  clave temporal, actualiza el usuario, y devuelve `{ temporaryPassword }` en
  la respuesta (solo esta vez, solo a este admin, en esta petición).
- Middleware/chequeo en el flujo de sesión existente: si `mustChangePassword`
  es `true`, cualquier ruta protegida distinta del endpoint de "definir nueva
  contraseña" responde de forma que el frontend sepa que debe redirigir a esa
  pantalla (p. ej. un campo en la respuesta de `/api/me`, o un código de
  estado específico — a definir con Antigravity según lo que sea menos
  invasivo en el código existente).
- Reutiliza (o comparte lógica con) el endpoint de cambio de contraseña de la
  Tarea 4.2, pero sin exigir `currentPassword` cuando la razón del cambio es
  `mustChangePassword` — es decir, dos entradas al mismo mecanismo interno de
  "setear nueva contraseña + invalidar sesiones", una que pide clave actual
  (4.2) y otra que no la pide porque parte de una clave temporal ya conocida
  por el sistema como forzada (4.4/4.6).

**Generación de clave temporal:**
- Aleatoria, criptográficamente segura (no `Math.random()`).
- Evitar caracteres ambiguos al dictarla/copiarla por WhatsApp (por ejemplo,
  excluir `l`, `1`, `O`, `0` si se usa un alfabeto alfanumérico reducido) —
  a definir el criterio exacto con Antigravity, priorizando que sea fácil de
  transcribir manualmente.
- Longitud sugerida: 10-12 caracteres.

**Frontend:**
- Botón "Restablecer contraseña" en la vista de admin de usuarios, con
  confirmación antes de disparar la generación.
- Modal con la clave temporal, botón de copiar, advertencia de "una sola vez".
- Pantalla de "Definir nueva contraseña" para el usuario con
  `mustChangePassword = true`, que bloquea el acceso al resto de la app hasta
  completarse.

**Criterios de aceptación:**
- [ ] Un admin puede disparar el reseteo de contraseña de otro usuario desde
      la UI de gestión de usuarios, con confirmación previa.
- [ ] El sistema genera una clave temporal y la muestra en pantalla al admin,
      en texto claro, una sola vez.
- [ ] La clave temporal no se puede volver a consultar después (ni por API ni
      recargando la página) — solo aparece en la respuesta inmediata de la
      acción de reseteo.
- [ ] El usuario puede iniciar sesión con la clave temporal.
- [ ] Al iniciar sesión con una clave temporal (`mustChangePassword = true`),
      el usuario es redirigido obligatoriamente a definir una nueva
      contraseña antes de poder acceder a cualquier otra pantalla de la app.
- [ ] Tras definir la nueva contraseña, `mustChangePassword` queda en `false`
      y el usuario accede con normalidad.
- [ ] Un usuario no-admin no puede acceder al endpoint
      `POST /api/admin/users/:id/reset-password` (verificar respuesta 403).
- [ ] Tras completar el cambio obligatorio, las demás sesiones activas del
      usuario (si las había) quedan invalidadas.

---

### Tarea 4.5 — Invalidación de otras sesiones al cambiar contraseña

Aplica a los tres casos: cambio propio (4.2), reseteo de admin (4.4), y
cambio obligatorio de primer login (4.4/4.6).

**Enfoque propuesto:** dado que las sesiones se manejan del lado del servidor
(passport + almacenamiento de sesión), invalidar todas las sesiones del
usuario excepto —cuando corresponda— la sesión activa desde la que se
originó el cambio (caso 4.2, cambio propio con clave actual conocida). En los
casos de clave temporal (4.4/4.6) no hay "sesión previa" relevante que
preservar más allá de la sesión recién creada tras definir la clave nueva.

**Criterios de aceptación:**
- [ ] Tras un cambio de contraseña propio, cualquier otra sesión abierta en
      otro dispositivo/navegador para ese usuario deja de ser válida en la
      siguiente petición que haga (se le exige volver a iniciar sesión).
- [ ] La sesión desde la que se hizo el cambio propio permanece activa sin
      requerir volver a loguearse.
- [ ] Tras completar un cambio obligatorio de contraseña (originado por
      reseteo de admin o por creación de usuario), todas las sesiones previas
      del usuario (si las había) quedan invalidadas.
- [ ] La invalidación ocurre de forma inmediata (no depende de que expire un
      TTL largo de sesión).

**Nota técnica pendiente de confirmar con Antigravity:** dónde vive hoy el
almacenamiento de sesiones (memoria, tabla en la BD, store externo) — esto
determina cómo se implementa la invalidación en concreto.

---

### Tarea 4.6 — Creación de usuario/admin nuevo (sin invitación por email)

**Flujo:** idéntico en espíritu al reseteo (4.4), reutilizando el mismo
mecanismo de clave temporal:

1. Un admin, desde la vista de gestión de usuarios, completa un formulario
   simple: email, nombre, rol (admin / usuario regular, según los roles ya
   existentes en el sistema).
2. El backend crea el usuario, genera una clave temporal (mismo mecanismo que
   4.4), marca `mustChangePassword = true`, y devuelve la clave temporal en
   texto claro, una sola vez, en la respuesta.
3. El frontend muestra la clave temporal al admin (mismo modal/patrón que
   4.4) para que se la entregue a la persona por fuera del sistema.
4. El primer login de la persona sigue el mismo flujo obligatorio de cambio
   de contraseña que en 4.4.

**Backend — endpoint sugerido:**
- `POST /api/admin/users` (requiere rol admin): recibe `email`, `nombre`,
  `rol`; valida que el email no exista ya como usuario; crea el registro con
  clave temporal y `mustChangePassword = true`; devuelve `{ temporaryPassword }`.

**Frontend:**
- Formulario simple de "Crear usuario" en la vista de admin de usuarios
  (email, nombre, rol).
- Mismo modal de clave temporal que en 4.4 tras la creación exitosa.

**Criterios de aceptación:**
- [ ] Un admin puede crear un usuario nuevo indicando email, nombre y rol.
- [ ] El sistema rechaza la creación si el email ya existe.
- [ ] Tras crear el usuario, se muestra la clave temporal en pantalla al
      admin, en texto claro, una sola vez (mismo comportamiento que 4.4).
- [ ] El usuario nuevo puede iniciar sesión con la clave temporal y es
      redirigido obligatoriamente a definir su propia contraseña antes de
      acceder al resto de la aplicación.
- [ ] Un usuario no-admin no puede acceder al endpoint `POST /api/admin/users`
      (verificar respuesta 403).
- [ ] El nombre indicado por el admin al crear el usuario queda guardado y
      visible desde el primer login (no depende de que la persona lo cargue
      ella misma, aunque puede editarlo después vía Tarea 4.3).

### Tarea 4.7 — Mensaje de contacto en pantalla de login (clave olvidada)

No es un flujo de recuperación real (sigue sin haber nada automático) — es
solo una guía visual en la pantalla de login para que la persona sepa qué
hacer si olvidó su contraseña.

**Diseño (KISS):** un texto estático, sin listar emails ni datos dinámicos,
del tipo "¿Olvidaste tu contraseña? Contacta al administrador de tu cuenta."
No requiere ningún endpoint nuevo, ninguna consulta a la base de datos, ni
mantenimiento cuando cambien los admins.

**Frontend:**
- Agregar el mensaje debajo del formulario de login existente.
- Sin links a emails específicos, sin lógica condicional — solo texto fijo.

**Criterios de aceptación:**
- [ ] La pantalla de login muestra un mensaje visible indicando que, ante
      contraseña olvidada, se debe contactar al administrador.
- [ ] El mensaje no incluye emails ni datos específicos de ningún admin.
- [ ] No se agrega ningún endpoint ni consulta nueva a la base de datos para
      esta tarea.

---

## 5. Plan de trabajo

1. Rama `002-gestion-usuarios` ya creada; Tarea 4.1 ya comiteada en ella.
2. Continuar tarea por tarea (4.2 → 4.7) con prompts individuales a
   Antigravity, cada uno revisado por Stanley antes de ejecutarse, con
   commits individuales por tarea (mismo patrón que 4.1: implementar,
   verificar en local, mostrar diff, aprobar staging, commit).
3. **Un solo Pull Request al final**, cuando las 7 tareas (4.1–4.7) estén
   completas y verificadas en la rama — no se abre PR por tarea.
4. Al completar todas las tareas y validar en local, abrir el PR contra
   `main` para revisión y merge.
5. Deploy a v2nets siguiendo el procedimiento ya establecido (`GOMAXPROCS=1`,
   activar Node con `source /opt/alt/alt-nodejs20/enable`).
6. Validar en producción (`cloud.brikaorganics.cl`) cada criterio de
   aceptación antes de dar la spec por cerrada.

## 6. Preguntas abiertas / a confirmar antes de cada tarea

- ~~Requisito de fortaleza de contraseña~~ — **Confirmado: 8 caracteres mínimo.**
- ~~Mecanismo de reseteo/creación (email vs. clave temporal)~~ — **Confirmado:
  clave temporal sin email, mostrada una sola vez al admin.**
- ~~Cómo mostrar contacto de admins ante clave olvidada~~ — **Confirmado:
  mensaje estático genérico, sin listar emails ni consultar la BD (Tarea 4.7).**
- Dónde vive hoy el almacenamiento de sesiones (memoria, tabla en la BD, store
  externo) — necesario para implementar correctamente la Tarea 4.5.
- Nombre y convención exactos del campo `mustChangePassword` (o equivalente)
  a agregar en el schema — a confirmar con Antigravity revisando `schema.ts`
  antes de escribir la migración.
- Criterio exacto de generación de la clave temporal (alfabeto permitido,
  longitud final) — se deja a discreción de Antigravity dentro de los
  lineamientos de la sección "Generación de clave temporal" (Tarea 4.4),
  reportando la elección antes de aplicarla.

## 7. Historial de tareas completadas

### Tarea 4.1 — Fix del logout (GET → POST)

- **Commit:** `3ca5b8f` en la rama `002-gestion-usuarios`.
- **Cambios:** `client/src/hooks/use-auth.ts` y
  `client/src/components/app-sidebar.tsx`. El logout ahora se dispara con
  `POST /api/logout` vía fetch en vez de una navegación `GET`.
- **Corrección adicional detectada durante la tarea:** `useAuth()` apuntaba a
  `/api/auth/user` (endpoint legacy de Replit Auth, roto tras la migración a
  `passport-local` porque `claims.sub` ya no existe). Se unificó a `/api/me`,
  el mismo endpoint que ya usa `App.tsx` para validar sesión. Esto restauró
  la visibilidad de paneles de importación condicionados a
  `natyjelen@gmail.com` en `caja-security.tsx`, `centro-costos.tsx` y
  `facturas-revision.tsx`, que llevaban sin renderizarse desde la migración
  sin que se notara.
- **Verificado end-to-end en local** (`BYPASS_AUTH=false`): login, `/api/me`
  200, logout 200, `/api/me` post-logout 401.
- **Deuda técnica anotada (no resuelta en esta tarea):** los tres archivos
  mencionados condicionan paneles a un email hardcodeado en vez de un
  rol/permiso.

### Tarea 4.2 — Cambio de contraseña propia

- **Commit:** `721a402` en la rama `002-gestion-usuarios`.
- **Cambios:** nuevo endpoint `POST /api/account/change-password`
  (`server/routes.ts`), función compartida `updateUserPassword()` en
  `server/replit_integrations/auth/replitAuth.ts` (hashea con `bcrypt`,
  factor 10 — mismo mecanismo ya usado en el proyecto; no valida identidad
  por sí misma, deja esa responsabilidad al llamador), nueva función
  `updateAppUserPassword()` en `storage.ts`, y nueva pantalla
  `client/src/pages/perfil.tsx` con el formulario de cambio de contraseña.
- **TODO explícito dejado en el código** para la Tarea 4.5 (invalidación de
  otras sesiones), en el punto exacto donde debe integrarse.
- **Verificado en local** (`BYPASS_AUTH=false`): endpoint sin sesión responde
  401 limpio (cubierto por el middleware global `requireAppAccess`); flujo
  completo login → cambio de contraseña → logout → login con clave nueva
  (éxito) → login con clave anterior (rechazado, 401).

### Tarea 4.3 — Edición de perfil propio (nombre)

- **Commit:** `b516ff1` en la rama `002-gestion-usuarios`.
- **Cambios:** nuevo endpoint `PATCH /api/account/profile` (`server/routes.ts`),
  nueva función `updateAppUserName()` en `storage.ts`, y sección "Mi perfil"
  agregada a `perfil.tsx` (junto a la de cambio de contraseña), con
  actualización inmediata de la caché de React Query (`["/api/me"]`) tras
  guardar.
- **Verificado en local:** intento de inyectar el `id` de otro usuario en el
  body del `PATCH` no afecta al otro usuario (probado con `curl` directo);
  nombre vacío/solo espacios rechazado con 400; se confirmó que
  `passport.deserializeUser` consulta la base de datos en cada request, por
  lo que no hace falta ninguna mutación manual de `req.user` tras el cambio
  — se eliminó un bloque de código muerto que intentaba hacer eso.
