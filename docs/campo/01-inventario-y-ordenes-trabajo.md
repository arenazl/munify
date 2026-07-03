# Módulo de Campo · Órdenes de Trabajo + Inventario

> **Para un agente que arranca en frío.** Este doc es la fuente de verdad del
> módulo de campo de Munify: órdenes de trabajo (OT), inventario (activos y
> consumibles) y su cruce. Si vas a tocar cualquiera de esas tres cosas, leé
> esto antes. Complementa `BUILD_GUIDE.md` (patrones de UI) y `CLAUDE.md`
> (reglas duras).

## 1. Qué es y para qué

El módulo de campo formaliza el trabajo operativo de una municipalidad:

- **Orden de Trabajo (OT)**: la unidad formal de trabajo de campo. Se asigna a
  una cuadrilla y/o empleado, se vincula N:M con reclamos, se clasifica por
  **prioridad** y **tipo de trabajo**, consume **recursos del inventario**, y
  se puede imprimir como **planilla (PDF)** para llevar al campo.
- **Inventario**: los bienes y materiales del municipio, con dos naturalezas
  opuestas (ver §3). Se cruza con las OT.

Todo es **opt-in** por municipio (feature flag) y **aditivo**: los munis chicos
que solo asignan un empleado sobre el reclamo no necesitan nada de esto.

## 2. Feature flag

`municipio_modulos.modulo = 'inventario'` (activo/inactivo por muni). Es el mismo
flag que gatea Inventario Y el circuito completo de campo en el frontend. Las OT
tienen su propio flag histórico `ordenes_trabajo`. Para prender todo:

```python
from services.inventario_seed import activar_modulo_inventario
await activar_modulo_inventario(db, municipio_id)
```

El sidebar (`frontend/src/config/navigation.ts`) muestra "Inventario" con
`modulosActivos.has('inventario')` y "Órdenes" con `modulosActivos.has('ordenes_trabajo')`.

## 3. La decisión de diseño central: activo vs consumible

Todo el inventario se apoya en separar **dos naturalezas** (`NaturalezaInventario`):

| | **Activo** | **Consumible** |
|---|---|---|
| Ejemplos | camioneta, retro, motosierra | cemento, caños, pintura |
| Mecánica | se **toma** y se **libera** | se **descuenta** del stock |
| Campos propios | `estado_activo`, `ocupado_por_ot_id` | `stock_actual`, `stock_minimo`, `unidad` |
| En una OT | reserva → `en_uso` hasta cerrar la OT | consumo → descuenta al **completar** |

- La **naturaleza la define la categoría**; el ítem la hereda al crearse (y se
  desnormaliza en `inventario_items.naturaleza`).
- Un activo solo puede estar tomado por **UNA OT a la vez** (`ocupado_por_ot_id`).
- Los consumibles se descuentan al **completar** la OT (si se cancela, no).

## 4. Modelo de datos

Tablas (todas con `municipio_id`, multi-tenant estricto):

- **`ordenes_trabajo`** — la OT. Campos clave: `numero` (OT-YYYY-NNNN correlativo
  por muni/año), `estado` (`EstadoOrdenTrabajo`: pendiente→asignada→en_curso→
  completada / cancelada), `prioridad` (`PrioridadOT`: baja/media/alta/urgente),
  `tipo_trabajo_id` (FK), `cuadrilla_id`/`empleado_id`, `materiales` (JSON libre,
  fallback), horas, notas de cierre.
- **`orden_trabajo_reclamos`** — pivot N:M OT↔reclamo.
- **`orden_trabajo_recursos`** — pivot OT↔ítem de inventario. `tipo`
  (`TipoRecursoOT`: reserva/consumo), `cantidad` (consumo), `item_nombre`
  (snapshot), `aplicado` (stock ya descontado, idempotencia).
- **`ot_tipos_trabajo`** — catálogo configurable de tipos (Poda, Bacheo, ...).
- **`inventario_categorias`** — catálogo configurable con `naturaleza`.
- **`inventario_items`** — bien o material. `categoria_id`, `naturaleza`, campos
  de consumible o de activo según corresponda, `ocupado_por_ot_id` (activos),
  `activo` (soft delete).

Modelos: `backend/models/orden_trabajo.py` (OT, OrdenTrabajoReclamo,
OrdenTrabajoTipo) y `backend/models/inventario.py` (las 3 de inventario).
Enums: `backend/models/enums.py`.

## 5. Flujos (backend)

Toda la lógica del cruce vive en `backend/api/ordenes_trabajo.py`:

- **Crear/editar OT con recursos** → `_sincronizar_recursos()`: reserva activos
  (valida que no estén tomados por otra OT, los marca `en_uso` +
  `ocupado_por_ot_id`), registra consumos planeados. NO descuenta stock acá.
- **Completar OT** → `_cerrar_recursos(descontar_consumos=True)`: libera activos
  + descuenta stock de consumibles.
- **Cancelar OT** → `_cerrar_recursos(descontar_consumos=False)`: libera activos,
  NO toca stock.
- **Validación tenant** del tipo de trabajo: `_validar_tipo_trabajo()`.

Endpoints (todos multi-tenant, roles admin/supervisor salvo lectura que suma empleado):
- `/ordenes-trabajo` (CRUD + `/asignar`, `/iniciar`, `/completar`, `/cancelar`, `/reclamo/{id}`).
- `/ot-tipos-trabajo` (CRUD de tipos — prefijo propio para no chocar con `/ordenes-trabajo/{id}`).
- `/inventario/categorias` y `/inventario/items` (CRUD; `?solo_disponibles=true`
  para el picker de OT).

## 6. Frontend

- **`pages/OrdenesTrabajo.tsx`** — ABM de OT + Sheet con prioridad, tipo, recursos
  del inventario, y botón **Imprimir** (planilla PDF).
- **`pages/Inventario.tsx`** — ABM de ítems (activos + consumibles).
- **`pages/InventarioCategoriasConfig.tsx`** — config de categorías (selector de
  naturaleza, bloqueado si la categoría ya tiene ítems).
- **`pages/OTTiposTrabajoConfig.tsx`** — config de tipos de trabajo.
- **`lib/printOrdenTrabajo.ts`** — genera la planilla imprimible en una ventana
  nueva (HTML autocontenido A4, `window.print()`). No depende del theme.
- Enums (single source of truth): `lib/enums/ordenTrabajo.ts`,
  `lib/enums/prioridadOT.ts`, `lib/enums/inventario.ts`.
- API client: `inventarioApi`, `otTiposTrabajoApi`, `ordenesTrabajoApi` en `lib/api.ts`.
- Config → links a "Categorías Inventario" y "Tipos de Trabajo" en `pages/Configuracion.tsx`.

## 7. Seeds y scripts (`backend/`)

- `services/inventario_seed.py` — `seed_inventario(db, muni, incluir_demo)`
  (categorías template + ítems demo opcionales) y `activar_modulo_inventario`.
- `services/ot_tipos_seed.py` — `seed_tipos_trabajo(db, muni)` (template de tipos).
- `services/seed_demo.py` — munis demo nuevos traen inventario + tipos + flags.
- `scripts/migrate_add_inventario.py` — 3 tablas de inventario (aditiva).
- `scripts/migrate_add_ot_formato.py` — tabla `ot_tipos_trabajo` + columnas
  `prioridad`/`tipo_trabajo_id` en `ordenes_trabajo` (idempotente).
- `scripts/seed_inventario_san_martin.py` — siembra la demo en San Martín (muni 145).
- `scripts/generalizar_modulo_campo.py` — Fase 4: activa flag + template (sin
  ítems demo) en TODOS los munis. `--activar` para aplicar; sin flag = dry-run.

## 8. Cómo extender

- **Nuevo estado de OT / prioridad / naturaleza**: agregar al enum en
  `models/enums.py` + al enum del frontend (`lib/enums/*`). El patrón resiliente
  (fallback) evita romper la UI. Actualizar la migración/ENUM de MySQL si aplica.
- **Nueva categoría/tipo por defecto**: agregar a `TEMPLATE_CATEGORIAS`
  (`inventario_seed.py`) o `TEMPLATE_TIPOS` (`ot_tipos_seed.py`).
- **Nuevo campo en la OT**: modelo + migración ALTER idempotente + schemas
  `OTCreate/Update/Response` + `_to_response` + frontend. OJO §9.

## 9. Gotchas (leer antes de tocar)

- **`OTUpdate` y campos no-columna**: en `actualizar_orden`, el `model_dump`
  EXCLUYE `reclamo_ids`, `materiales`, `recursos` (no son columnas simples; se
  manejan aparte). Si agregás un campo tipo lista/relación, sumalo al `exclude`
  o vas a pisar la relationship con dicts (bug real que ya pasó).
- **`import api` completo falla en local** por mismatch de pydantic
  (local 2.13 vs `requirements.txt` 2.5.2) en el auth router
  (`OAuth2PasswordRequestForm`), NO por este módulo. Para validar backend local:
  cargar los módulos standalone (`importlib.util.spec_from_file_location`) +
  `configure_mappers()`. En prod (2.5.2) construye bien.
- **San Martín = muni 145** (`General San Martín`), NO 120.
- **`materiales` (JSON libre) sigue existiendo** en la OT como fallback para lo
  que no está en catálogo — rotulado "Materiales sueltos" en la UI.
- **Verificar live post-deploy**: el backend lo deploya Infra (CD), no es
  instantáneo. Chequear el OpenAPI de Cloud Run antes de asumir que está vivo.

## 10. Estado (2026-07-03)

- Fases 1-4 COMPLETAS y en prod. Inventario base + cruce OT + formato (prioridad,
  tipo, PDF) + generalizado a todos los munis (130 categorías + 270 tipos sembrados,
  flag activo en todos).
- Demo sembrada en San Martín (145): 15 ítems, 2 OT con recursos vinculados.
- **Posibles siguientes pasos** (no pedidos aún): PDF server-side "formal" con
  reportlab; reserva por rango de fechas (hoy un activo es 1 OT a la vez, sin
  calendario de disponibilidad); alertas de reposición por stock mínimo.
