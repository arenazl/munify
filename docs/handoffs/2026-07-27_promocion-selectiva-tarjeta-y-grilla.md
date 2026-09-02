# Handoff a Infra — Promoción SELECTIVA (cherry-pick): Tarjeta de crédito + fix vista cards

> **IMPORTANTE: NO promover todo qa.** qa está 34 commits adelante de prod (todo el
> rework de Reclamos F0–F6, OT universal, POI, etc.) y **eso NO va a prod todavía**,
> por decisión del dueño. Solo se promueven **2 commits** por cherry-pick.

## Qué se promueve (solo esto)

En este orden:

| # | Commit | Qué | Capas |
|---|---|---|---|
| 1 | `9a2fe95` | feat(tesoreria): tarjeta de crédito como caja | front **+ backend** |
| 2 | `597e98a` | fix(abm): vista cards full-width + tabla por defecto | **solo front** |

(El commit `fc7927b` es solo el doc del handoff anterior — no hace falta cherry-pickearlo.)

## Verificado: el cherry-pick aplica LIMPIO

Simulado el **2026-07-27** en un worktree sobre `origin/master` (HEAD prod = `0e13381`):
`git cherry-pick 9a2fe95 597e98a` → **0 conflictos**. `frontend/src/lib/api.ts` y
`frontend/src/types/index.ts` auto-mergean sin intervención. `ABMPage.tsx` aplica limpio
(en prod era idéntico a la base de qa). No se pusheó nada — fue solo verificación.

## Pasos para promover

1. **Git:** cherry-pick de `9a2fe95` y `597e98a` (en ese orden) sobre `master` → push `master`.
2. **Frontend (Netlify):** reconstruye `app.munify.com.ar` → entra la tarjeta (parte front) + la
   grilla full-width + el default de vista = tabla.
3. **Backend (Cloud Run):** deploya `munify-api` → queda vivo `POST /tesoreria/cajas/pagar-tarjeta`.
4. **DB (paso manual, NO es migración de schema):** crear la **caja-tarjeta** en la DB de prod.
   Sin esto el código está pero no hay tarjeta cargada. Dos opciones:
   - **UI:** Configuración → Tesorería → Cajas → Nueva caja. `codigo = TARJETA` (crítico),
     `saldo_inicial = 3000000` (= el LÍMITE; el cliente lo edita después), icono `CreditCard`.
   - **Script idempotente:**
     `DATABASE_URL="<prod, /sugerenciasmun>" python backend/scripts/seed_caja_tarjeta.py --municipio 80 --nombre "Visa Cordobesa 9594" --limite 3000000 --aplicar`

## Verificación post

- `SELECT id,nombre,codigo,saldo_inicial FROM tesoreria_cajas WHERE municipio_id=80 AND codigo='TARJETA';`
- En Pagos, forma de pago **Tarjeta** → paso 5 pide "¿Con qué tarjeta?" (no caja).
- En Pagos, vista **cards** → las cards de pago ocupan todo el ancho (full-width).

## Qué NO entra en esta promoción (queda en qa)

Todo lo demás de qa: rework de Reclamos (F0–F6, OT universal, POI, despacho), fix de seguridad
del link de calificación, campanita, KpiCard compacto, fix de fecha UTC, cambios de infra, etc.
**No se toca prod con nada de eso** hasta nueva orden.

## Notas

- Aditivo y backward-compatible. Rollback: desactivar la caja-tarjeta (`activo=false`) o
  cambiarle el `codigo`; el fix de grilla es solo CSS/layout (revert del commit si molesta).
- El fix `597e98a` cambia el **default de vista a Tabla en TODOS los ABM** que tengan tableView
  — es global, de bajo riesgo (las pantallas sin tableView caen a cards). Tenerlo presente.
- Los gastos históricos con tarjeta de SPN quedan como están (no se migran).
