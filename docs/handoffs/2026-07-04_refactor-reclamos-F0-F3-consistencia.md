# Handoff · Refactor universo Reclamos — F0-F3 + consistencia (2026-07-04)

> **Para el agente que retoma en frío.** Este doc es la FOTO DE ESTADO del refactor del
> universo Reclamos: qué se ejecutó, dónde está en git, qué falta y cómo seguir. El "qué hacer"
> de cada fase pendiente vive en su doc autosuficiente en [`../reclamos/`](../reclamos/) — este
> handoff NO los duplica, los apunta.

## En una línea

Se ejecutaron **F0-F3 + un chunk de consistencia + quick-wins UX** (6 commits, todos verificados
con el protocolo adversarial). Falta la **mitad estructural** (F6/F4/F5) + follow-ups pesados,
que se dejaron para una sesión fresca porque **F6 tiene migraciones de DB** que necesitan
deploy+coordinación con infra.

## Estado en git (branch `qa`)

| Commit | Fase | Push |
|---|---|---|
| `fa091f1` | **F0 hemorragias** (bugs + multi-tenant + fix seguridad crítico) | **pusheado a origin/qa** |
| `f3c685b` | **F1 comunicación** (matriz de notificaciones) | local |
| `c314f46` | **F2 menú + puentes** (universo contiguo, reclamo↔OT, bandeja empleado, mobile) | local |
| `d831c29` | **F3 cohesión visual** (SSoT de colores, gris de Planificación, Mapa) | local |
| `37e4223` | **Consistencia de estados** (validar_transicion único + estadoConfig unificado) | local |
| `1c3366f` | **Quick-wins UX** (botón Gestionar en Mapa + aviso al reasignar) | local |

- `origin/master` = `79fd7bc`, **INTACTO** (nunca se tocó prod).
- **Modo git de este run (instrucción del user): un commit por fase, NO pushear hasta la última
  fase.** F0 quedó pusheado aparte por tener el fix de seguridad crítico. Del resto: `git push
  origin qa` recién cuando esté todo listo, y ahí infra promueve `qa→master`.
- El working tree tiene basura sin trackear (backend/backend/, design/, reels/, sofi/, dist/,
  docs/reels/CONTEXT.md) que NO es del refactor — no commitear.

## Cómo está organizado el trabajo

`docs/reclamos/`: `01-analisis-funcional.md` (maestro + decisiones D1-D16) · `02`-`08` un doc
autosuficiente por fase (F0-F6) · `09-analisis-ux-circuito.md` (49 hallazgos de interacción,
repartidos entre fases). Cada fase tiene tareas con `archivo:línea`, criterio de aceptación y
no-alcance. **Los `archivo:línea` de los docs son de commits viejos — verificar con grep antes
de editar** (F0-F3 ya movieron líneas).

## Lo HECHO (no rehacer)

- **F0**: fix de firma de notificaciones; multi-tenant en ~17 endpoints de reclamos +
  cuadrillas/empleados_gestion; **CRÍTICO: `core/tenancy.py` ya no acepta `X-Municipio-ID` de
  cualquier admin (era spoofing cross-tenant vivo en prod) — solo superadmin real**; deep links
  `/reclamos/{id}`→`/gestion/...`; empleado puede iniciar; escalado apagado; typo WhatsApp.
- **F1**: matriz de notificaciones (in-app+push+email). OT deja de ser muda (D3 iniciar→EN_CURSO,
  D4 completar→opt-in finalizar). Rechazo notifica. Cierre siempre invita a calificar. Ranking
  empleados. **3 críticos cross-tenant cerrados** (estadisticas/reclamo-calificacion sin scope +
  PUT empleado). **D9 WhatsApp NO se hizo** (ver pendientes).
- **F2**: reagrupación del sidebar (universo Reclamos contiguo, D1 variante C); puentes reclamo↔OT
  (panel OT en el Sheet, chips clickeables, botón crear OT, `?abrir=N`); bandeja unificada del
  empleado (incluye reclamos vía OT); mobile de campo; MiRendimiento/MiHistorial habilitados (D8).
- **F3**: `lib/enums/reclamo.ts` como SSoT de estados (mató las 7 paletas); gris de Planificación
  (`getCargaColor(0)`→theme.card); Mapa colores de DB; pasteles→theme; Tablero aplanado.
- **Consistencia**: `validar_transicion` único aplicado a los 8 endpoints de estado (mató los dos
  rulebooks; self-test 23/23); `estadoConfig.ts` deriva del SSoT (una sola paleta).
- **Quick-wins**: botón "Gestionar reclamo" en el drawer del Mapa; aviso de pérdida de resolución
  al reasignar un finalizado/resuelto.

## Lo que FALTA (para esta sesión fresca) — por dónde arrancar

1. **F6 — POI + OT universal** ([`../reclamos/08-fase-6-poi-prioridad-unica.md`](../reclamos/08-fase-6-poi-prioridad-unica.md)).
   La grande. Decisiones D11-D16 ya tomadas (OT universal transparente + prioridad única en la OT
   + POI con radio + mapa polimórfico). **BLOQUEANTE OPERATIVO: crea tablas + data-migration que
   TIENE que correr contra la DB de qa (`sugerenciasmun-qa`).** Bajo "no push hasta el final" +
   infra dueño de la qa, hay que **coordinar con infra** cuándo/cómo correr la migración y
   verificar E2E. Es prerrequisito de F4.
2. **F4 — Despacho** ([`../reclamos/06-fase-4-despacho.md`](../reclamos/06-fase-4-despacho.md)) —
   depende de F6-Etapa A (OT universal).
3. **Resto de F5** ([`../reclamos/07-fase-5-maquina-estados.md`](../reclamos/07-fase-5-maquina-estados.md))
   — T1 (validar_transicion) YA se hizo en el chunk de consistencia; queda T2 (estados legacy),
   T3 (creation service unificado), T4 (SLA vivo), T6 (auditoría OT, con migración), T7-bis (DROP
   `reclamos.prioridad`, acoplado a F6-D12), T8 (plantillas).
4. **Follow-ups pesados de F3** (máximo esfuerzo + validación visual del user): reescritura de SLA
   al patrón ABMPage; ABMSelect→ModernSelect (librería, afecta todos los ABM); converger las 3
   vistas de detalle del reclamo (T7); Mapa drawer→Sheet.
5. **D9 — WhatsApp** ([[feedback_whatsapp_solo_gupshup]]): **Munify usa Meta a propósito** (la
   regla "solo Gupshup" es de SalesBot). Reactivar las notificaciones WhatsApp respetando los
   toggles de `whatsapp_config` — **requiere definir tools, ver si entra en scope** (decisión del
   user). NO bloquear por "jamás Meta".

## Protocolo de trabajo (ratificado por el user)

- **Ambientes**: se trabaja en `qa`; **NUNCA push a `master`**; infra promueve `qa→master`. Ver
  `base-compartida/munify/AMBIENTES.md` + [[reference_ambientes_deploy]].
- **Estrategia 10/10 eficiente** ([[feedback_estrategia_ejecucion_fases]]): spec clara → ejecución
  liviana (workflow de agentes por archivo disjunto) → **verificación PESADA** (revisión manual del
  multi-tenant + pase adversarial `security-reviewer`+`code-reviewer` + gates build/eslint/pyflakes
  + validación real en QA). El esfuerzo va en verificar, no en re-pensar lo especificado.
- **Verificación de eslint**: comparar contra baseline (git stash) para aislar errores NUEVOS; el
  repo ya arrastra ~80 errores pre-existentes. `rules-of-hooks` debe dar SIEMPRE vacío.
- **Al final**: `git push origin qa` (todo junto) → validación visual del user en `munify-qa.netlify.app`
  → infra promueve. **Fast-trackear la promoción de F0** (el fix de tenancy tapa un leak vivo en prod).

## Gotchas para no tropezar

- `import api` completo falla en local por mismatch de pydantic (local vs requirements) — usar
  `pyflakes`/`ast.parse`/`py_compile` por archivo, no levantar el server.
- El `X-Municipio-ID` ahora solo lo respeta un superadmin real (`municipio_id is None`) — si algo
  del panel superadmin deja de ver otro muni, es por esto (esperado).
- `GestionPagos.tsx` NO migró al SSoT de estados a propósito (son estados de PAGO, otro dominio).
- media-studio (reels/contenido) está FUERA del scope de reclamos.
