# Reorganización del menú y de los módulos (2026-07-02)

**Commit:** `6d9a8ae` · **Estado:** hecho y en producción (Netlify auto-build).

## Qué se hizo

**Menú (navigation.ts):**
- Nueva categoría **Trámites** con la unidad consolidada del turnero:
  `Trámites` (gestión) + `Agenda` (turnos del día, check-in) + `Horarios`
  (config de cupos/feriados). Los tres gateados por el módulo `tramites`.
- Murió la categoría **"Programación"** que estaba al final del sidebar con
  `Agenda` y `Turnos` (nombres confusos, desconectados de Trámites).
- Tesorería: **"Pagos" → "Gastos"** (es lo que la pantalla muestra).
  **"Tarjetas"** se mudó de Configuración a Tesorería, con su flag.
- SPN ya no ve Agenda/Horarios ni Contaduría (antes se colaban sin flag).

**Módulos (SSoT `lib/enums/modulos.ts` + tabla `municipio_modulos`):**
- `sueldos` y `contaduria` son **flags propios opt-in**, separados del
  cluster `tesoreria`. Sin renombrar tablas de la BD.
- Siembra según **uso real verificado** (script
  `backend/scripts/migrate_flags_sueldos_contaduria.py`, ejecutado):
  - SPN (80): `sueldos` ON — la agenda de liquidaciones está viva
    (241 pagos programados, último creado 2026-07-01).
  - Contaduría: **oculta para todos** — SPN tiene solo 5 OPs de prueba
    del 21-22/05, abandonadas. Se prende por muni cuando alguien la pida.
  - Munis demo (55): `sueldos` + `contaduria` + `ordenes_trabajo` ON.
- Las pantallas del superadmin (Módulos, Suscripciones) leen del SSoT:
  los flags nuevos aparecen sin tocar nada.

## Qué falta / decisiones abiertas

1. **Doble "Órdenes"** (Campo=OT vs Contaduría=OP) convive — aceptado porque
   con contaduría apagada casi nunca coexisten. Si molesta en demos, buscar
   otra palabra de una sola pieza para OP.
2. **Gating backend laxo**: las rutas de OP/sueldos no validan flag por
   endpoint (el gate es solo visual, sidebar + rutas por rol). Anotado como
   ítem del análisis de tesorería.
3. **Análisis de cohesión de Tesorería** (pedido de Lucas): las partes que
   Bartolo no usa (conciliación, proyección, ubicación, OP) — propuesto
   barrido multi-agente, esperando OK.
4. **Semilla demo genérica completa** (reemplaza a la idea de demo custom
   SM): ~10 ítems por módulo incl. tesorería, OTs, turnos, modos de
   atención. Pendiente.
5. **Autocomplete de municipios** en el alta demo: tabla local de 5 columnas
   (id georef, nombre, provincia, lat, lng) cargada 1 vez desde la API
   georef de datos.gob.ar. Pendiente.

## Cómo retomar

Leer este doc + `docs/turnos/02-turnero-consolidado.md`. El estado de flags
por muni se ve en la pantalla superadmin → Módulos, o en la tabla
`municipio_modulos`.
