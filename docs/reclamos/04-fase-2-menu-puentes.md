# Fase 2 · Menú y puentes — un solo universo navegable

> **Para un agente que arranca en frío.** Contexto: [01-analisis-funcional.md](01-analisis-funcional.md)
> §4 (navegación) y §5 (refutados — el puente Sheet→OT YA existe, no recrearlo).
> Decisiones que toca: **D1 (reagrupación), D8 (MiRendimiento/MiHistorial), D10 (dependencias)**
> — confirmar con el user antes. Referencias = commit `7aeb780`; verificar con grep.
> **Regla dura #11 del CLAUDE.md del repo: navigation.ts es módulo central — proponer el
> cambio concreto y esperar OK explícito antes de editarlo.**
> Regla dura #10: items del sidebar = UNA sola palabra.

## Objetivo

Hoy el universo está partido en 4 categorías del sidebar con 16-23 items de
Tesorería/Sueldos/Contaduría en el medio (`navigation.ts`: Principal :140-163, Campo
:189-215, Operación :348-379; el orden del array define el orden visual, `Layout.tsx:643-659`).
Empleados/Cuadrillas/Ausencias solo existen como tiles de Configuración (`Configuracion.tsx:626-628`).
Y las piezas no se linkean entre sí. Esta fase junta todo.

## Tareas

### T1. Reagrupar el sidebar **[D1 — esperar OK]**
Dos variantes especificadas; el user elige (recomendación: C ya, B como destino):

- **Variante C (mínima, un commit):** reordenar el array de `navigation.ts` para que
  Principal → Campo → Operación queden contiguas ANTES del bloque financiero. No cambia
  ningún href (los `hrefsOcultos` matchean por href, `:531` — siguen funcionando). Sumar
  'Personal' (Empleados de campo) y 'Cuadrillas' como items (ver T2).
- **Variante B (destino):** dos categorías adyacentes — **Reclamos** = Reclamos, Mapa,
  Tablero, SLA · **Campo** = Trabajos, Órdenes, Planificación, Inventario, Cuadrillas,
  Personal. Decidir con el user dónde cae Tablero.
- **Gotcha de gating (del verificador):** el gating es heterogéneo — Reclamos/Mapa/Tablero/
  Planificación/SLA usan `moduloOn()` **opt-out** (default activo, `navigation.ts:76`), pero
  Órdenes/Inventario usan `modulosActivos.has()` **opt-in** (:203, :212). Un muni chico sin
  config ve Planificación y SLA igual. Personal/Cuadrillas hoy no tienen flag — decidir si
  se les da uno o quedan por rol.
- Labels duplicados: los ABMs de Configuración ('Reclamos' :382, 'Trámites' :390) renombrar
  a algo no colisionante (ej. 'Categorías') o dejarlos solo como tiles de Configuración.

### T2. Personal, Cuadrillas y Ausencias salen del sótano
- `pages/Empleados.tsx` (tabla `empleados`, campo) y `pages/GestionCuadrillas.tsx` son
  operación viva (a ellos se asignan reclamos y OTs) pero solo se llega por tiles de
  Configuración. Subir como items de sidebar: **Personal** y **Cuadrillas** (una palabra).
  Los tiles de Configuración quedan como acceso secundario.
- Ausencias: accesible desde Planificación (headerAction o tab) — es dato operativo semanal.
- Ojo naming: hay DOS "Empleados" (campo=`empleados` vs sueldos=`contactos` tipo empleado,
  `SueldosEmpleados.tsx:49`, sin FK entre sí). El de campo pasa a 'Personal'; el de Sueldos
  queda 'Empleados'. No intentar unificar tablas en esta fase.

### T3. Puentes reclamo↔OT (la vuelta que falta)
- **Panel "Orden de trabajo" en el Sheet de Reclamos:** consumir
  `ordenesTrabajoApi.porReclamo` (`api.ts:1408`, endpoint vivo
  `ordenes_trabajo.py:482-499`, HOY sin ningún consumidor) y mostrar número + estado +
  responsable + recursos + link. Nota: la interface `Reclamo` (`types/index.ts:266-301`) no
  tiene campo de OT — el panel hace su fetch al abrir el Sheet.
- **Chips de reclamo clickeables en la OT:** `OrdenesTrabajo.tsx:691-704` renderiza los
  reclamos vinculados como `<span>` sin link (cero `useNavigate` en la página) → linkear al
  Sheet del reclamo (`/gestion/reclamos?abrir={id}` o navigate). El backend ya devuelve el
  estado de cada reclamo (`ReclamoMini.estado`, `ordenes_trabajo.py:202-210`) y la UI no lo
  pinta → mostrar badge de estado en el chip.
- **Botón "Crear OT" en ReclamoDetalle:** la página no menciona OT ni una vez. El deep-link
  receptor YA está implementado (`OrdenesTrabajo.tsx:158-168` abre el sheet de creación con
  `?reclamo_id=N` pre-vinculado) pero nadie lo genera → agregar botón gateado por
  `modulosActivos.has('ordenes_trabajo')`.
- (El puente de IDA desde el Sheet de Reclamos YA existe — `handleVincularOT`,
  `Reclamos.tsx:1502-1540`. No duplicarlo.)

### T4. Bandeja unificada del empleado
- Hoy `/gestion/mis-trabajos` (= `<Reclamos soloMisTrabajos />`, `routes.tsx:232`) filtra
  SOLO `Reclamo.empleado_id` directo (`reclamos.py:461-466`); TODO lo canalizado por OT
  (cuadrilla o empleado — la vinculación por OT nunca setea `Reclamo.empleado_id`) es
  invisible en su pantalla default.
- Backend: `solo_mis_tareas` suma reclamos vinculados a OTs vigentes donde el user es
  responsable o miembro de cuadrilla (join `orden_trabajo_reclamos` + criterio de
  `ordenes_trabajo.py:442-454`).
- Frontend: la card muestra el número de OT cuando el reclamo viene por esa vía.

### T5. Mobile de campo
- `getMobileTabs` solo distingue admin/supervisor vs "resto" (`Layout.tsx:23-48`): el
  empleado hereda el footer del VECINO. Agregar rama empleado: **Trabajos**
  (/gestion/mis-trabajos) · **Órdenes** (si flag) · Mapa · Perfil.
- Menú '+' del gestor (`Layout.tsx:1316-1321`): hoy prioriza 3 slots de tesorería — hacerlo
  sensible a flags (con `ordenes_trabajo` activo, priorizar Órdenes/Tablero).

### T6. Huérfanas y zombies
- **[D8]** `MiRendimiento` y `MiHistorial`: rutas registradas (`routes.tsx:234,236`), cero
  links en toda la app, y dan 403 al empleado porque los endpoints exigen supervisor/admin
  (`/reclamos/mis-estadisticas` `reclamos.py:792`, `/mi-historial` `:916`). Si D8=habilitar:
  abrir los endpoints a rol empleado filtrando por su `empleado_id` + items 'Rendimiento' e
  'Historial' en el sidebar del empleado. Si no: quitar las rutas.
- `/gestion/categorias` legacy (`routes.tsx:276-279`, cero links): reemplazar por
  `<Navigate to='/gestion/categorias-reclamo' replace />` y borrar `Categorias.tsx` si nada
  más la importa.
- `Exportar` (CSV de reclamos/SLA) enterrado en el tab Catálogos de Configuración
  (`Configuracion.tsx:646`): mover a headerAction de la pantalla Reclamos o item propio.
- **[D10]** Dependencias (jefes de área): hoy la categoría Mi Área no tiene
  Tablero/Planificación/OT (`navigation.ts:89` los excluye). Confirmar con el user si las
  secretarías operan campo; si sí, agregar items de Mi Área gateados por los mismos flags.

## No alcance

- No tocar colores/estilos (F3), no tocar el canvas ni la asignación (F4), no crear
  pantallas nuevas de detalle (la convergencia de las 3 UIs de detalle es F3).

## Checklist de cierre

1. `cd frontend && npm run build` + `npx eslint src/ --ext .ts,.tsx` (regla dura 16).
2. pyflakes si se tocó backend (T4, T6).
3. Probar con los 4 roles del muni demo (admin, supervisor, empleado, vecino) + un muni SIN
   flags de OT/inventario (el gating no debe romper munis chicos). SPN (muni 80, productivo)
   no debe ver items nuevos que no le correspondan.
4. Commit + push origin master. Actualizar §7 del funcional.
