# Handoff 2026-07-06 — Reclamos completo en qa · cierre bloqueado por ambiente · rediseño "nunca DB directo"

> Para retomar en frío. Sesión larga y caótica pero productiva. Todo el trabajo quedó en `qa`
> (branch `qa`), nada tocó producción — eso es lo único que evitó un desastre. Leer §3 y §4 ANTES
> de tocar cualquier cosa de ambientes o de la base.

## TL;DR — estado
1. **Refactor COMPLETO del universo Reclamos** (F6-A prioridad única, F6-B Puntos de Interés, F4
   despacho con datos reales, F5 estados/creación/auditoría) — todo en `qa`, hasta commit `7c4726d`.
   Buildea, migraciones aplicadas en la DB de qa.
2. **La prueba integral de cierre está BLOQUEADA por 2 problemas del AMBIENTE qa** (config de Infra,
   NO del código). Handoff a Infra dejado en `base-compartida/CANAL_AGENTES.md` (`MSG-20260706-0324-01`).
3. **Se descubrió un lío de RESPONSABILIDADES de ambientes** (yo creí que el cableado front↔back del
   qa era mío; es de Infra). Lucas lo está cruzando con Infra. **NO tocar el cableado/config de
   ambientes hasta que él alinee.**
4. **REGLA NUEVA CRÍTICA (grabada): NUNCA pegarle a la DB directo — todo vía un módulo admin en el
   backend (API).** Es el próximo trabajo grande.

## 1. Lo hecho — Reclamos, las 5 fases en `qa`
| Fase | Qué | Commit(s) |
|---|---|---|
| F6-A | Prioridad única: se lee de la OT (`services/prioridad.py`, `prioridad_ot` en ReclamoResponse); lectores migrados; **arreglado el bug del pool de planificación** | `a1d3de9` |
| F6-B | **POIs en el mapa** (pedido de la clienta): modelos `poi_tipos`/`puntos_interes`, matching haversine, consolidación en OT de zona, banner en el Sheet, mapa polimórfico, `Slider` nuevo, ABM tipos | `f91d30d` `2d9a0e8` `d5dfd64` |
| F4 | **Despacho con datos reales**: `services/asignacion.py` (carga/disponibilidad/validación reales), auto-asignar real, endpoint de disponibilidad real, canvas ve las OTs, estado `bloqueada`, consumo real, widget de candidatos | `5019d0c` `ecb15ef` |
| F5 | Cierre unificado en FINALIZADO, `services/reclamo_create.py`, auditoría de OT (`historial_ordenes_trabajo`), schema deja de exponer `prioridad` | `7c4726d` |

Migraciones YA aplicadas en `sugerenciasmun-qa` (idempotentes): `poi`, `ot_bloqueada`, `historial_ot`
(`ot_origen` de F6-A ya estaba). Rollout demo: flag `poi` + 9 tipos en **muni 145** (San Martín; NO en
SPN 80). Verificación por fase: build (tsc/pyflakes) + pase adversarial code+security + (durante la
sesión) scripts contra la DB de qa — **eso último ya no se hace más, ver §4**.

## 2. El cierre — prueba integral BLOQUEADA por el ambiente qa
El criterio de cierre (pedido por Lucas): **test integral que golpee TODOS los endpoints tocados
(directa/indirectamente) + navegación del front, en el `qa` deployado.** Se armó el harness
(`scratchpad/integral_reclamos.py`). Al correrlo salieron 2 problemas de AMBIENTE (verificados con
evidencia, NO son del código):
- **El front qa proxea a PROD, no a qa.** `netlify.toml` y `frontend/public/_redirects` hardcodean
  `munify-api-1060106389361.us-east4.run.app` (= `munify-api` producción). Por eso vía
  `munify-qa.netlify.app` el reclamo sale sin `prioridad_ot`/`poi` y `/poi/tipos` da 404.
- **`munify-api-qa` = 512Mi vs 1Gi de prod → OOM.** Log: `Memory limit of 512 MiB exceeded with 535
  MiB used`. El backend arranca (openapi con todos los endpoints nuevos responde) pero login/requests
  dan 500.

**Golpeando el backend qa directo** confirmé que el código nuevo está deployado (openapi tiene
`/poi/*`, `/reclamos/empleado/{id}/disponibilidad`, `/ordenes-trabajo/{id}/bloquear`). El código está
sano; falta el ambiente. Pedido a Infra en el canal (`MSG-20260706-0324-01`): (1) apuntar el proxy del
front qa a `munify-api-qa`; (2) subir `munify-api-qa` a 1Gi. **Apenas Infra deje el qa sano, re-correr
el harness y cerrar.**

## 3. LÍO DE RESPONSABILIDADES — leer antes de tocar ambientes (NO tocar todavía)
Durante el diagnóstico apliqué mal la **regla dura 15 global** (*"la app hace el wiring front↔back"*)
y asumí que el cableado del ambiente qa era mío. **Es de Infra.** `base-compartida/munify/AMBIENTES.md`
lo dice explícito: *"el detalle de cómo se armó/mantiene la infra vive del lado de Infra"* y *"Infra de
QA (DB + backend + **front**) viva y validada"*. Además el 512Mi figura ahí como *"económico"* (decisión
de Infra, no un bug). **Yo, en el handoff del 2026-07-05, borré la env `VITE_API_URL` del site qa
(d437d5af) para arreglar que el front no cargaba — casi seguro rompí ahí el cableado que Infra había
puesto, dejándolo caer al proxy→prod.**

**Contradicciones de doc a curar (con Infra):**
1. Regla 15 global (*"wiring front↔back = la app"*) vs AMBIENTES.md (*"armar/mantener el ambiente qa,
   front incluido = Infra"*). Aclarar: **setup inicial de una app = la app; diseño y cableado de
   ambientes (qa/prod) = Infra.**
2. `reference_ambientes_deploy` (hoy quedó con *"la DB prod→qa me la traigo yo"*) vs AMBIENTES.md
   (*"Refrescar la DB de QA con datos de prod: **lo hace Infra**, on-demand"*). Responsabilidad cruzada
   sin alinear.
> **NO modificar el cableado (netlify/_redirects), ni la config de Cloud Run, ni estas memorias, hasta
> que Lucas cierre con Infra quién hace qué.** El mensaje del canal queda como está.

## 4. REGLA NUEVA CRÍTICA — nunca DB directo, todo por la API (próximo trabajo grande)
Grabado en memoria `feedback_nunca_db_directo`. **JAMÁS abrir conexión a la base desde mi máquina**
(`create_async_engine`, scripts locales) — un glitch/error de agente/contradicción de regla, con el
connection string mal apuntado, podría **romper PRODUCCIÓN** (cambiar modelo / borrar datos = la app se
funde; un commit se revierte, esto no).

**Rediseño a implementar:**
- Un **módulo admin en el backend** (endpoints + auth) que dispare TODOS los procesos transaccionales:
  migraciones (ALTER/CREATE), seeds, clonado prod→qa, verificaciones. Yo los llamo por **HTTP**.
- **Por qué es mejor:** la API ya está deployada en SU ambiente (`munify-api-qa`→`sugerenciasmun-qa`,
  prod→`sugerenciasmun`) → imposible apuntar mal; y corre en us-east4 (junto a la base) → más rápido.
- **Método health (doble verificación, 1 vez por sesión):** tabla marcador `_ambiente` (fila
  `entorno='qa'|'prod'`). El endpoint admin, antes de transaccionar, chequea `_ambiente` **Y** el nombre
  de la DB; si discrepan o dice `prod` inesperado, **aborta**.
- Migra el patrón actual: los `migrate_*.py` siguen como lógica, pero se disparan desde el endpoint
  admin, no a mano. "Traé prod→qa" también por ahí.
- El principio agnóstico ("ningún agente le pega a la DB directo") lo sube Lucas/Infra a la memoria
  GLOBAL; la implementación concreta (módulo admin de Munify) vive en el repo.

**Arranque sugerido:** crear `backend/api/admin_ops.py` (router `/admin`, auth fuerte) con: `POST
/admin/migrar/{nombre}` (dispara un migrate_* registrado, con dry-run/aplicar), `GET /admin/ambiente`
(devuelve `_ambiente` + DB name), y la tabla `_ambiente`. Push a qa, y de ahí en más toda migración
pasa por HTTP.

## 5. Deudas de F5 (documentadas, no bloquean)
- **DROP de `reclamos.prioridad` DIFERIDO.** El schema ya no la expone (se usa `prioridad_ot`), pero la
  columna se MANTIENE deprecada porque 4 endpoints activos (`chat.py`, `portal_publico.py`, `turnos.py`,
  `vecino.py`) + `escalado.py` aún la leen. El DROP físico es un release aparte: migrar esos 5 a
  `prioridad_ot` primero, después dropear (vía el módulo admin de §4).
- **T4 SLA vivo (job/cron):** el endpoint de vencimiento SLA no se hizo; necesita Cloud Scheduler
  (Infra) + `X-Cron-Key`. Pendiente.
- **T5 Escalado:** queda apagado (desde F0). Borrar el módulo entero requiere OK explícito de Lucas.
- Data-fix `resuelto→finalizado`: NO se corrió (se resolvió por sinónimo en las métricas). Si algún día
  se quiere migrar los datos, va por el módulo admin.

## 6. Cómo retomar (orden sugerido)
1. **Ver si Infra ya destrabó el qa** (§2): front qa→backend qa + memoria a 1Gi. Si sí → re-correr
   `scratchpad/integral_reclamos.py` (ajustando BASE al proxy sano) + navegación Playwright → cerrar la
   prueba integral.
2. **Confirmar con Lucas el reparto de responsabilidades** (§3) y curar las 2 contradicciones de doc.
3. **Armar el módulo admin `/admin`** (§4) — de ahí en más ninguna migración se corre a mano.
4. Deudas de F5 (§5) cuando corresponda.

## Gotchas / método (lo que hizo que la sesión saliera con rigor)
- Ciclo: **codificar → build (tsc/pyflakes) → unit test → push a `qa` → prueba integral en el SERVER.**
  Nada local. **Y ahora: nada directo a la DB** (§4).
- Fases grandes → workflow multi-agente por archivo disjunto + **chequeo interno pesado** (gates +
  pase adversarial code+security) ANTES de cada push.
- Deploy lo dispara Infra; el push a `qa` versiona pero el ambiente puede tardar/estar desalineado
  (fue el caso). **Verificar LIVE contra el openapi/logs, no asumir por el commit.**
- Unit tests del repo NO corren en el entorno local (mismatch fastapi/pydantic: `'FieldInfo' has no
  attribute 'in_'`) — corren en el server.
