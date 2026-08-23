# Spec 004 — Invalidación quirúrgica de caché en Facturas Revisión

**Proyecto:** Brika ERP (cloud.brikaorganics.cl)
**Repo:** github.com/utiliza-design/brika-erp
**Rama base:** `main`
**Rama de feature:** `004-cache-facturas-revision`
**Estado:** 🟢 Priorizado — Fase 1 (ver `docs/07-decision-priorizacion-mejoras-v2.md`). Tareas y criterios de aceptación definidos, lista para planificar/implementar.

---

## 1. Contexto

Diagnóstico completo en `docs/04-diagnostico-performance-facturas-revision-v2.md` (código real, no hipótesis: `server/routes.ts`, `server/storage.ts`, `server/cache.ts`).

El caché de `GET /api/facturas-revision` (clave `"fr:main"`, TTL 5 min) se implementa con un store simple en memoria (`server/cache.ts`, `Map<string, {value, expiresAt}>`, sin soporte hoy para actualizar una entrada puntual dentro de un valor cacheado). Los 4 endpoints de mutación de la página —

- `POST /api/facturas-revision/:facturaKey` (marcar pagado/pendiente)
- `POST /api/facturas-revision/:facturaKey/propuestas` (agregar propuesta de pago)
- `DELETE /api/facturas-revision/:facturaKey/propuestas/:id` (eliminar propuesta)
- `POST /api/facturas-revision/:facturaKey/reject-automatch` (descartar recomendación automática)

— terminan las cuatro con las mismas dos líneas:

```js
cacheInvalidatePrefix("fr:");
cacheInvalidatePrefix("cc:");
```

Esto borra el caché completo de Facturas Revisión (forzando un recálculo pesado en el siguiente `GET`) y, además, el de Centro de Costos (`cc:`), un módulo sin relación funcional conocida con esta página.

## 2. Alcance

### Incluido
1. Actualizar en memoria solo el registro puntual afectado dentro del array ya cacheado en `"fr:main"`, en vez de invalidar el prefijo completo.
2. Dejar de invalidar el prefijo `"cc:"` desde los 4 endpoints de mutación de Facturas Revisión.
3. Tests (Vitest) que verifiquen ambos comportamientos.

### Explícitamente fuera de alcance
- Mover el matching factura↔movimiento bancario de JavaScript en memoria a SQL indexado (mejora de fondo, opción 2 del diagnóstico original).
- Paralelizar con `Promise.all` las ~6 consultas secuenciales del handler de `GET /api/facturas-revision` (opción 3 del diagnóstico original).
- Cualquier cambio a la página de Centro de Costos en sí misma — esta spec solo evita que Facturas Revisión la afecte de rebote.

Ambos puntos fuera de alcance quedan como mejora de fondo posterior, sin fecha definida, si el patch quirúrgico no resulta suficiente.

## 3. Consideraciones técnicas transversales

- Stack: Node/TypeScript/Express, caché propio en `server/cache.ts` (sin Redis ni librería externa — no agregar una solo para esto).
- Este cambio **no toca el schema de base de datos** — no requiere migración ni coordinación de orden de despliegue.
- Flujo de git: rama de feature (`004-cache-facturas-revision`) + PR revisado y mergeado por Stanley. Staging explícito por archivo (nunca `git add .` ni `commit -am`), como ya exige `constitution.md`.
- Tests: Vitest, permanentes en `server/__tests__/` (no scripts descartables).
- El campo que identifica cada fila dentro del array cacheado de `"fr:main"` es previsiblemente `facturaKey` (es el identificador usado de forma consistente en el resto de la página y de los endpoints) — Antigravity debe confirmarlo contra la forma real del objeto `resultWithLogs` antes de implementar el patch.

## 4. Tareas

### Tarea 4.1 — Función de patch quirúrgico sobre el caché

**Requisito:** agregar a `server/cache.ts` una forma de actualizar una entrada puntual dentro de un valor cacheado (sin recalcular ni borrar el resto), reutilizable por los 4 endpoints.

**Criterios de aceptación:**
- [ ] Existe una función nueva en `server/cache.ts` (nombre y firma exacta a criterio de Antigravity) que, dado el key del caché (`"fr:main"`) y una forma de identificar/actualizar un elemento del array (ej. por `facturaKey`), reemplaza ese elemento sin tocar el resto del array ni recalcular nada.
- [ ] Si la entrada de caché no existe (expiró por TTL, o nunca se calculó), la función no falla — no fuerza un cálculo ni crea la entrada desde cero; el próximo `GET` normal la recalculará por el camino existente.
- [ ] La entrada actualizada conserva un TTL válido (se puede resetear a los 5 minutos estándar al hacer el patch).

### Tarea 4.2 — Usar el patch en los 4 endpoints de mutación

**Requisito:** reemplazar `cacheInvalidatePrefix("fr:")` por la función de la Tarea 4.1 en los 4 endpoints listados en la sección 1.

**Criterios de aceptación:**
- [ ] Los 4 endpoints (`POST /:facturaKey`, `POST /:facturaKey/propuestas`, `DELETE /:facturaKey/propuestas/:id`, `POST /:facturaKey/reject-automatch`) actualizan el registro correspondiente en `"fr:main"` en vez de invalidar el prefijo completo.
- [ ] Un test confirma que, tras cada una de las 4 mutaciones, un `GET /api/facturas-revision` inmediato refleja el cambio (ej. `estado: "pagado"`) sin que se haya vuelto a ejecutar el cálculo pesado (verificable con un mock/spy sobre la función de cálculo, que debe registrar 0 llamadas adicionales).

### Tarea 4.3 — Separar el prefijo `cc:` de `fr:`

**Requisito:** eliminar `cacheInvalidatePrefix("cc:")` de los 4 endpoints de mutación de Facturas Revisión.

**Criterios de aceptación:**
- [ ] Las 4 líneas `cacheInvalidatePrefix("cc:")` se eliminan de los handlers de Facturas Revisión.
- [ ] Un test confirma que, tras cualquiera de las 4 mutaciones, una entrada previamente cacheada con prefijo `"cc:"` permanece intacta.
- [ ] Antes de eliminar la línea, Antigravity confirma que no hay ninguna relación funcional real entre ambos módulos que dependa de esa invalidación cruzada (por el diagnóstico ya hecho no la hay, pero se pide la confirmación explícita como resguardo). Si encuentra algo, lo reporta a Stanley antes de continuar.

### Tarea 4.4 — Test de regresión del camino frío

**Requisito:** confirmar que las operaciones que sí deben invalidar el caché completo (ej. subir un archivo nuevo de cobranza o de banco) lo siguen haciendo sin cambios.

**Criterios de aceptación:**
- [ ] Existe al menos un test que sube/registra un archivo nuevo y confirma que el siguiente `GET /api/facturas-revision` recalcula correctamente y refleja los datos nuevos (usa `cacheInvalidatePrefix`/`cacheInvalidateAll` como corresponda, sin cambios respecto a hoy).
- [ ] Queda un comentario breve en el código (o en esta spec, sección "Notas de implementación" si Antigravity la agrega) indicando qué operaciones invalidan el caché completo vs. cuáles hacen patch quirúrgico.

## 5. Verificación final de la spec

Esta spec se considera completa cuando:
1. Las 4 acciones de la tabla de Facturas Revisión responden sin el freeze reportado (~5s), probado con un volumen de datos de prueba similar al real.
2. El caché de Centro de Costos ya no se ve afectado por acciones en Facturas Revisión.
3. El camino frío (carga de archivo nuevo, TTL de 5 minutos) sigue funcionando exactamente igual que antes.
4. Los tests nuevos (Vitest) pasan y quedan versionados en `server/__tests__/`.
5. PR revisado y aprobado por Stanley, mergeado a `main`.
