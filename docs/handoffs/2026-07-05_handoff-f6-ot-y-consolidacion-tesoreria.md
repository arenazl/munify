# Handoff 2026-07-05 — F6 OT universal (cerrado) + arranque consolidación Tesorería

> Para retomar en frío. Todo está en `qa` (branch `qa`), backend qa Cloud Run
> `munify-api-qa` (`https://munify-api-qa-vmpxsxe7ra-uk.a.run.app`), front qa
> `https://munify-qa.netlify.app`. El deploy y la promoción qa→prod los dispara **Infra**,
> no Claude. qa se puede romper (se restaura de backup).

## TL;DR — estado
1. **F6 OT universal**: CERRADO, en qa (commit `2ce6111`), migración probada de un click. Falta que Infra promueva a prod + corra la migración. Handoff a Infra: `base-compartida/munify/PROMOCION-F6-OT-UNIVERSAL.md`.
2. **Fix front qa**: el site qa tenía `VITE_API_URL` sin `/api` → el front no cargaba nada. RESUELTO (borré esa env del site Netlify qa `d437d5af-…`, rebuild). qa funciona.
3. **Consolidación Tesorería**: análisis exhaustivo hecho (doc completo abajo). **F0a HECHO** (fix del `/merge`, commit `1b75149`, probado con dato real de SPN). Resto = por hacer.

## Cómo conectarse a qa (patrón)
```bash
cd backend
PROD_URL=$(grep -E "^DATABASE_URL=" .env | head -1 | sed -E 's/^DATABASE_URL=//' | tr -d '\r')
export DATABASE_URL="${PROD_URL%/sugerenciasmun}/sugerenciasmun-qa"   # mismo cluster Aiven, DB -qa
```
Login demo qa: `admin@general-san-martin.demo.com` / `demo123` (o super admin `superadmin@test.com`/`demo123`, sin municipio_id). SPN productivo = muni **80**.

## 1. F6 OT universal — QUÉ QUEDA
Código en qa (`2ce6111`). La OT implícita corre para TODOS los munis (D11, sin gate). Migración `backend/scripts/migrate_add_ot_origen.py --aplicar` probada desde cero en qa. **Pendiente: Infra promueve `qa`→`master` + corre esa línea en prod.** Detalle: `base-compartida/munify/PROMOCION-F6-OT-UNIVERSAL.md`. Memoria: `project_ot_universal_modelo_unico`.

## 2. Consolidación Tesorería — DÓNDE ESTAMOS
**Doc maestro (leer primero): `docs/tesoreria/01-consolidacion-analisis.md`.** Memoria: `project_consolidacion_tesoreria`.

Resumen del análisis (workflow 10 agentes, datos reales de qa):
- La duplicación NO es de datos (solapamiento contactos↔empleados en SPN = **0**). El plantel real de SPN vive en `contactos` (1185, 64% de la tabla), NO en `empleados` (7 = seed). El motor de sueldos corre 100% sobre `contacto_id`. El concepto "empleado" está modelado 3 veces.
- **Enfoque destino: Persona = evolucionar `contactos` IN-PLACE** (conservar tabla + PK; NO tabla nueva). Perfiles Empleado/Usuario colgados por FK nullable; `persona_roles` N:M (con municipio_id); taxonomía de cargo unificada; identidad compuesta `(origen,id)` en el façade.
- **Estrategia de ejecución (decisión del user): VENTANA ÚNICA (big-bang)**, no 7 fases incrementales. Con SPN parado ~1 día + backup previo, se va directo al modelo destino. Preparar+probar todo en qa con clon de SPN → ventana (backup → migración → gate de paridad → arrancar/rollback).
- **PRUEBA FINAL (criterio de aceptación):** paridad de API para SPN 80. Baseline = todos los GET de tesorería del muni 80 en prod (capturar ANTES de tocar), post = mismos endpoints en qa con modelo nuevo, éxito = **diff 0 (100% integridad)**.

### Hecho: F0a — fix del `/merge` (commit `1b75149`)
`backend/api/contactos.py::merge_contactos` ahora reapunta también `ordenes_pago.destino_contacto_id` (antes solo gastos + pagos_programados → fusionar un contacto con OPs las orfanaba). Agregado import `OrdenPago`, el UPDATE, y `ordenes_pago_reapuntadas` al `MergeResponse`. Probado en qa con dato real (SPN tiene 5 OPs con contacto; el reapunte deja 0 orfanas). **Pendiente: smoke del endpoint real cuando Infra deploye qa.**

### Próximos pasos (en orden, del plan §3.1)
1. **Barrido de auth DRY POR ARCHIVO** (NO mecánico): reemplazar los ~14 `_require_admin` locales por `require_roles` de `core/security.py:100`, PERO preservar `tesoreria_import` como ADMIN-only (hoy es `if rol != ADMIN` — cambiarlo mecánicamente a admin+supervisor = **escalada de privilegios**), preservar el guard de municipio de `tasas.py`, y sacar/variantizar el `print('[AUTH]…')` de `require_roles`. Factory de catálogos (6 ABMs) = aparte, después.
2. **Diseñar el modelo destino completo** resolviendo TODOS los huecos de §4 del doc (colisión de IDs en façade, persona_roles con municipio_id, no crear "Persona espejo" para vecinos, normalizar dni/cuit `''`→NULL antes del UNIQUE, KPIs de Sueldos sin los 7 empleados seed).
3. **Limpieza de datos** (dni/cuit ''→NULL, dedup por nombre, dry-run + backup).
4. **Escribir la migración** (schema nuevo vía `Base.metadata.create_all`, core/database.py:37; Alembic congelado, no sirve). Datos idempotente + backup JSON.
5. **Probar contra clon de SPN en qa** hasta paridad 100%.
6. **Ventana con el cliente** → ejecutar.

## Reglas/aprendizajes nuevos de esta sesión (memorias)
- `feedback_tomar_decisiones_tecnicas`: el user delega las decisiones técnicas; solo preguntarle lo crítico que arriesgue integridad, con argumento funcional. Resolver y plantear estrategia, no micro-decisiones.
- `feedback_probar_front_real`: antes de decir "listo", abrir la app real en qa con navegador (Playwright) y ver que la pantalla del user carga/renderiza datos, 0 requests 4xx. Curl a endpoints NO alcanza. Gotcha: `VITE_API_URL` sin `/api` rompe todo el front con backend sano.
- Manual agnóstico de migración probada de un click: `base-compartida/12-MIGRACION-PROBADA-DE-UN-CLICK.md`.

## Verificar qué está live (no asumir desde commits)
- Backend qa: `curl -s https://munify-api-qa-vmpxsxe7ra-uk.a.run.app/openapi.json` o `gcloud run revisions list --service=munify-api-qa --region=us-east4 --project=munify-api`.
- Front qa: probe con Playwright (`frontend/node_modules`, script `.cjs` porque `type:module`).
