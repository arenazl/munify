# Handoff · Módulo Inventario + cruce con Órdenes de Trabajo

**Fecha:** 2026-07-03
**Estado:** Fase 1 (inventario base) + Fase 2 (cruce OT) COMPLETAS y pusheadas.
Fase 3 (formato/PDF de OT) y Fase 4 (generalizar seed a todos los munis) PENDIENTES.

## Qué se hizo

Módulo de **inventario municipal** con dos naturalezas, interrelacionado con las
órdenes de trabajo existentes.

### Concepto central: activo vs consumible
- **Activo** (camioneta, retro, motosierra): bien reutilizable. Una OT lo *toma*
  → queda `en_uso` con `ocupado_por_ot_id`; se *libera* al completar/cancelar la OT.
- **Consumible** (cemento, caños): material con stock. Una OT planea un consumo;
  el stock se *descuenta* recién al **completar** la OT (si se cancela, no).

La **naturaleza la define la categoría**; el ítem la hereda al crearse.

### Backend
- Enums: `NaturalezaInventario`, `EstadoActivo`, `TipoRecursoOT` (`models/enums.py`).
- Modelos (`models/inventario.py`): `InventarioCategoria`, `InventarioItem`,
  `OrdenTrabajoRecurso` (pivot OT↔ítem). Migración: `scripts/migrate_add_inventario.py`
  (3 tablas, aditiva, ya ejecutada en Aiven).
- API `api/inventario.py` (prefix `/inventario`): CRUD de categorías e ítems +
  `?solo_disponibles=true` para el picker de OT. Multi-tenant estricto, roles admin/supervisor.
- Cruce en `api/ordenes_trabajo.py`: `OTCreate/Update/Response` ahora llevan `recursos`;
  helpers `_sincronizar_recursos` (reservar activos / registrar consumos, valida que un
  activo no esté tomado por otra OT) y `_cerrar_recursos` (liberar + descontar al cerrar).

### Frontend
- Tipos + `inventarioApi` + `lib/enums/inventario.ts`.
- `pages/Inventario.tsx` (ABM de ítems, filtro por naturaleza/categoría, muestra
  stock o estado + "tomado por OT-XXXX").
- `pages/InventarioCategoriasConfig.tsx` (config de categorías con selector de naturaleza,
  bloqueado si la categoría ya tiene ítems).
- Sección **"Recursos del inventario"** en el Sheet de `OrdenesTrabajo.tsx` (elegir
  activos a reservar + consumibles con cantidad). Se muestra solo si hay inventario.
- Sidebar (`navigation.ts`, item "Inventario", opt-in `modulosActivos.has('inventario')`),
  ruta `/gestion/inventario`, link en Configuración → "Categorías Inventario".

### Seed
- `services/inventario_seed.py`: template genérico (Vehículos/Maquinaria/Herramientas =
  activos; Materiales/Insumos = consumibles) + ítems demo. Idempotente.
- Integrado en `seed_demo.py` (munis demo nuevos traen inventario + flag activado).
- `scripts/seed_inventario_san_martin.py`: sembró **General San Martín (muni 145)** —
  5 categorías, 15 ítems, flag activo, 2 OTs vigentes con recursos vinculados
  (Camioneta→OT-2026-0003, Camión→OT-2026-0004 + consumos). Verificado a nivel datos.

## Gotchas / notas
- **San Martín = muni 145** (`General San Martín`), NO 120 (la memoria vieja decía 120,
  ese id no existe).
- Feature flag: `municipio_modulos.modulo = 'inventario'` (opt-in, como `ordenes_trabajo`).
- El entorno local tiene pydantic 2.13 (requirements fija 2.5.2): `import api` completo
  falla local por el auth router (`OAuth2PasswordRequestForm`), NO por este módulo.
  Validado cargando `api/inventario.py` y `api/ordenes_trabajo.py` standalone (9 rutas c/u)
  + `configure_mappers()`. En prod (2.5.2) construye bien.
- Se mantuvo el campo `materiales` (texto libre) de la OT como fallback para lo que no
  está en catálogo — ahora rotulado "Materiales sueltos".

## Qué falta (próximos pasos)
1. **Fase 3 — Formato de OT**: `prioridad` + `tipo_trabajo` (template configurable) +
   planilla imprimible/PDF (vista `@media print` con firma). Es lo que pidió el cliente.
2. **Fase 4 — Generalizar**: activar el módulo + sembrar el template en el resto de los
   munis (hoy solo San Martín + munis demo nuevos).
3. Verificar live post-deploy contra el OpenAPI de Cloud Run (`/inventario/*`).
