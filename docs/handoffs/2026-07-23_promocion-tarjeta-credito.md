# Handoff a Infra — Promoción: Tarjeta de crédito como caja (Tesorería)

> **Para Infra: NO hay migración de schema.** Este cambio no altera la estructura de
> ninguna tabla. Solo hay que promover git y crear **una fila de catálogo** (una caja).
> Contrato general: `base-compartida/10-AMBIENTES-Y-MIGRACIONES.md`.

## Qué se promueve

- Feature: **la tarjeta de crédito pasa a ser una CAJA**. Un gasto pagado con tarjeta ya
  no descuenta de una caja real: acumula deuda en la caja-tarjeta, que después se salda
  con "Pagar tarjeta" (ingreso en la tarjeta + egreso en la caja real de donde sale la plata).
- Rama: **qa** (commit `9a2fe95`) → **master**.
- Muni afectado: **San Pedro Norte (80)**, único productivo que usa Tesorería.
- Archivos: `backend/{models,schemas}/tesoreria_extra.py`, `backend/api/tesoreria_cajas.py`,
  `backend/scripts/seed_caja_tarjeta.py` (nuevo), `frontend/src/types/index.ts`,
  `frontend/src/lib/api.ts`, `frontend/src/components/tesoreria/{CrearGastoWizard,PagarTarjetaModal}.tsx`,
  `frontend/src/pages/TesoreriaCajas.tsx`.

> En `qa` también está pendiente de promoción el commit `7604949` (seguridad del link
> público de calificación + campanita que navega + notificaciones in-app que se perdían).
> **Ese tampoco necesita migración ni pasos manuales.**

## Paso 1 — Promover git

`qa` → `master` (tu rutina). Netlify reconstruye el front; Cloud Run `munify-api` deploya
el back por tu CD. **Sin pasos de DB en este paso.**

## Paso 2 — Crear la caja-tarjeta en prod (ÚNICO paso manual)

No es una migración: es **una fila de catálogo**, una caja más. Dos formas — elegí la que prefieras.

### Opción A (recomendada, cero riesgo): desde la UI

Configuración → Tesorería → Cajas → Nueva caja:

| Campo | Valor |
|---|---|
| Nombre | `Visa Cordobesa 9594` |
| **Código** | **`TARJETA`** ← **crítico**: este valor es lo que hace que se comporte como tarjeta |
| Saldo inicial | `3000000` ← es el **LÍMITE** de la tarjeta (el cliente lo edita después) |
| Ícono (sugerido) | `CreditCard` |

### Opción B: script idempotente

```
DATABASE_URL="<DATABASE_URL de prod, termina en /sugerenciasmun>" \
  python backend/scripts/seed_caja_tarjeta.py --municipio 80 \
    --nombre "Visa Cordobesa 9594" --limite 3000000 --aplicar
```

Sin `--aplicar` es dry-run. Si la caja ya existe, **no la duplica** (informa y sale).

## Paso 3 — Verificar (post)

- La caja existe y es tarjeta:
  `SELECT id, nombre, codigo, saldo_inicial FROM tesoreria_cajas WHERE municipio_id=80 AND codigo='TARJETA';`
- En la pantalla **Cajas** aparece con "Crédito disponible", debajo "Límite … · Deuda …",
  y el botón **Pagar tarjeta**.
- En **Nuevo pago**, con forma de pago **Tarjeta**, el paso 5 dice *"¿Con qué tarjeta se paga?"*
  y lista **solo** la tarjeta.
- Con cualquier otra forma de pago, el paso 5 lista **solo las cajas reales** (la tarjeta no aparece).

## Por qué NO hay migración

El discriminador y el límite reutilizan columnas que **ya existen** en `tesoreria_cajas`:

- `codigo == 'TARJETA'` marca el tipo (no se agregó columna de tipo).
- `saldo_inicial` se reinterpreta como **límite**, por lo que el saldo ya calculado
  (`saldo_inicial + ingresos − egresos`) **es el crédito disponible**.
- `es_tarjeta`, `limite` y `deuda_actual` son campos **calculados en el response**, no columnas.

## Notas / riesgos

- **Aditivo y backward-compatible.** Sin la fila de catálogo la app se comporta igual que hoy
  (no hay tarjetas → el wizard avisa que no hay tarjetas cargadas). No rompe nada existente.
- **Los gastos históricos NO se migran.** Los 16 gastos con tarjeta de SPN
  ($1.713.033,65, may–jul 2026) que habían descontado de cajas reales **quedan como están**,
  por decisión del dueño. La deuda de la tarjeta arranca en cero.
- **Rollback:** desactivar la caja-tarjeta (`activo=false`) o cambiarle el `codigo`.
  Sin pérdida de datos y sin tocar schema.
- **Multi-tenant:** la caja se crea por municipio; ningún otro muni se ve afectado.
- El endpoint nuevo `POST /tesoreria/cajas/pagar-tarjeta` valida que la tarjeta sea del muni,
  que sea realmente una tarjeta, y que la caja de origen no lo sea.

## Cómo se validó en qa

- Semilla aplicada: caja **#261 "Visa Cordobesa 9594"**, límite $3.000.000 (muni 80).
- Gates: `py_compile` + `pyflakes` limpios; ESLint **sin errores** en los archivos nuevos/tocados;
  build del front OK (`tsc` + `vite`).
- Análisis previo hecho **read-only contra prod** (solo SELECT) para dimensionar el caso real.
- **Fix colateral incluido:** `TesoreriaCajas.tsx` tenía un `return` por rol **antes** de los
  hooks (violación `rules-of-hooks` → React #310 en runtime). Movido después de los hooks.
