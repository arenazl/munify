# Rollout v2 canvas — Ola 1 (2026-08-02, madrugada)

Mandato del dueño: TODAS las pantallas con las mismas piezas del kit (PageHeader +
SemanticHero con KPIs ADENTRO + ListToolbar + FilterBar + DataTable con tabs v2.3;
sheets = Sheet `customHeader` plano + clases `rs-*`). **Cero KPIs sueltos, cero
pills viejas, cero Tip banners.** Fuente de verdad: canvas Claude Design
`46976e44-b6dc-4395-b1fe-15aa2a8f9584`; canónicos bajados a
`design/handoff-v2/references/*-canvas.dc.html`.

## Pusheado a qa (todo con eslint sin errores nuevos + tsc + build verdes)

| Pantalla | Commit | Notas clave |
|---|---|---|
| Reclamos lista+sheet | hasta `1fb8cbc` | referencia de implementación del estándar |
| Trámites sheet | `3e3b29f` | rs-* transpuesto |
| Trámites KPIs→hero | `3fd22d1` | mueren KpiCards |
| Mostrador | `f36d800` | sacó 4 datos INVENTADOS que se mostraban como reales |
| Trámites grilla | `28322fc` | muere ABMPage; select "Trámite" rescata filtro oculto |
| Agenda | `d91de26` | DataTable schedule por hora; sin CTA "Nuevo turno" (no hay alta desde gestión — confirmar) |
| Horarios | `82b3629` | 14 inputs nativos → kit; KPIs cupos/demanda omitidos (dato no viaja) |
| Planificación | `f71f972` | 7 omisiones documentadas; falta endpoint de reparto |
| Personal | `8723503` | columna CARGA omitida (backend carga_actual=0 TODO); `<select>` nativo y baja sin confirmar arreglados |
| Mapa | `ec7b576` | botonera kit Pins/Calor/Ambos; MURIERON las 4 preguntas (ver validaciones) |
| Tablero | `a555dd0` | 3 bugs reales: tope de 20 reclamos, matriz de transiciones vieja, validación por columna |

## Validar A OJO (nadie miró el render — regla 21, nivel 3 pendiente)

1. **Mapa**: las vistas "Lo atrasado / Qué resolvimos / Dónde no llegamos" YA NO
   EXISTEN (el canvas las reemplazó). Si se quieren de vuelta, hay que diseñarles
   un slot. `localStorage` de filtros se resetea a defaults del canvas (v4).
2. **Personal**: tab "Todos" ahora = solo ACTIVOS (bajas en tab Inactivos).
3. **Agenda**: sin CTA "Nuevo turno" (no existe alta desde gestión) y sin columna BOX.
4. **Horarios**: horas por grilla de 15 min (ya no se tipea minuto arbitrario);
   14 ModernSelect dentro de celdas de tabla (chequear dropdowns) y ToggleSwitch
   en columna angosta.
5. **Trámites grilla**: paginación pasó a ventana creciente (sin selector de tamaño);
   chip de `pendiente_pago` dice "Recibido" (quirk preexistente de estadoConfig).
6. **Tablero**: apilado vertical en mobile (antes píldoras de columna).
7. **Sheets** de Reclamos/Trámites: recorrer estados (recibido/en curso/finalizado/
   rechazado/pendiente_pago).

## Huecos de BACKEND que el canvas exige (nadie inventó datos)

1. Endpoint de reparto automático semanal (CTA "Repartir la semana", Planificación).
2. `carga_actual` hardcodeado en 0 — `backend/api/empleados.py:112` (columna CARGA
   y 3 KPIs de Personal).
3. Cupos/demanda no viajan en `/agenda-config` (2 KPIs de Horarios).
4. "Copiar horarios a otra dependencia" sin endpoint.
5. Devoluciones a cola no derivables del listado (sub "X devueltos hoy", Tablero).

## Pendientes de la campaña

- **Propuesta operacional vs catálogos** entregada al dueño (mover Tarjetas,
  Contactos, Horarios y Empleados-sueldos bajo Configuración→Catálogos) — espera
  su dale para tocar `navigation.ts`.
- Sin diseño en canvas todavía: SLA, Órdenes, Inventario, Cuadrillas (+ resto de
  Tesorería/Sueldos ya tienen Gastos/Gasto Detalle/Liquidaciones dibujados).
- Deuda eslint preexistente de GestionTramites (~21) — limpieza tipo Reclamos.
- Portar al APP_GUIDE las piezas nuevas estables (statusTabs del DataTable,
  rs-*, multi del AdaptiveFilter) cuando el dueño dé por cerrada la 2da vuelta.

Cómo retomar: memoria `project_rollout_v2_canvas` + este doc. Los reportes
completos de cada agente están en los mensajes de commit.
