# Handoff — modernización UX de Horarios/Agenda + vínculo con Trámites (2026-07-03)

> Continúa a `2026-07-03_handoff-demo-presentaciones-autocomplete.md` (mismo día,
> sesión posterior). Pedido del dueño: "Horarios y Agenda no tienen ni el header
> estándar ni una vista de calendario, y las 3 pantallas del turnero están poco
> conectadas — modernizalas con los componentes base y sumale más casos al seed."

## Qué se hizo (todo en producción, verificado contra el ambiente vivo)

### Horarios (`ConfiguracionAgenda.tsx`)
Antes: div armado a mano, sin `StickyPageHeader`, feriados como lista de texto
plano, sin buscador. Ahora:
- `StickyPageHeader` (icono, título, buscador que filtra feriados por motivo/fecha,
  botón "Agregar feriado").
- Grilla semanal con `ToggleSwitch` (en vez de checkbox nativo) + botón
  "Copiar Lunes a días hábiles" (un click en vez de editar 4 días a mano).
- Feriados como cards con date-chip (día/mes) + badge Cierre/Apertura especial,
  empty state con ícono en vez de texto plano.
- Deep-link "Ver agenda de esta oficina" → `/gestion/agenda-turnos?dependencia_id=X`.
- Lee `?dependencia_id=` de la URL para preseleccionar (llegada desde Trámites o Agenda).

### Agenda (`AgendaTurnos.tsx`)
Antes: solo vista de un día (cards), sin panorama de carga futura pese a que
`CalendarView` ya existe en el kit (se usa en `TesoreriaAgenda.tsx`). Ahora:
- Nueva vista **calendario** (`guidedView` de `ABMPage` + `CalendarView<TurnoAgenda>`),
  toggle junto a la vista de tarjetas. Carga lazy (solo pide el rango cuando el
  operador abre esa vista, vía `onViewModeChange`) para no bajar 3 meses de turnos
  si nunca sale de la vista del día.
- Deep-link "Horarios de esta oficina" → `/gestion/configuracion-agenda?dependencia_id=X`.
- Lee `?dependencia_id=` de la URL igual que Horarios.

### Trámites (`TramitesConfig.tsx`, catálogo bajo Configuración)
- Badge de **modo de atención** (Con turno / Sin turno / Online, con ícono y color)
  en cada card del listado — antes el modo de atención (pieza central de la fase C)
  no se veía en ningún lado del listado.
- En el Sheet de edición, cuando el trámite tiene oficina asignada: links
  "Ver horarios" / "Ver agenda" directo a esa dependencia.
- De paso (regla dura del repo — controles nativos prohibidos, estaba tocando el
  archivo): los `<select>` nativos que quedaban (categoría, tipo de pago, momento
  de pago, nivel KYC) pasaron a `ModernSelect`. Se sacaron también los emojis que
  tenía el combo de tipo de pago (regla dura anti-emoji).

### Backend
- `GET /turnos-tramite/agenda` acepta `desde`/`hasta` (rango, hasta 90 días) además
  de `fecha` (día único) — aditivo, retrocompatible, valida `hasta > desde`. Es lo
  que alimenta la vista calendario nueva.
- `seed_demo.py::seed_turnero_demo`: antes NO sembraba `AgendaExcepcion` (Horarios
  nacía siempre en "Sin feriados cargados"). Ahora siembra 1 cierre (~9 días) + 1
  apertura especial (~16 días) por demo. Turnos de ejemplo: de 12 pasaron a 24,
  repartidos en ±12 días hábiles (antes ±6) para que la vista calendario tenga algo
  que mostrar en gran parte del mes, no solo un cluster de una semana.

## Verificación en producción (no es local — el user no testea local)

Se creó una demo descartable (`qa-turnero-final`), se verificó por API real
(login + JWT) y se borró al terminar:
- `agenda-config`: 10 filas para la 1ª dependencia (horario partido 08-12/14-17,
  cupo 3/2) — como antes, no se tocó esa lógica.
- `agenda-excepciones`: 1 cierre + 1 apertura especial — **antes esto daba 0**.
- `turnos-tramite/agenda?desde=&hasta=`: 24 turnos repartidos en las 5
  dependencias en un rango de ±20 días — antes el endpoint no aceptaba rango.
- `tramites`: `modo_atencion` viaja en la respuesta del listado (necesario para
  el badge nuevo).
- El bundle JS servido por `app.munify.com.ar` contiene los strings nuevos
  ("Copiar Lunes", "Ver horarios", "Ver agenda", el empty state de feriados) —
  confirma que el frontend con los cambios está realmente live, no solo el commit.

## Gotcha operativo encontrado (no directamente mío, pero bloqueó la primera
verificación — dejarlo documentado para el próximo agente)

**Hay DOS Cloud Run `munify-api` vivos**, uno en `southamerica-east1` (URL vieja,
`...1060106389361.southamerica-east1.run.app`, la que está en `CLAUDE.md`) y otro
en `us-east4` (URL real que usa `app.munify.com.ar` desde la migración de región,
ver `[[reference]]` `d:\Code\structure\docs\02-region-useast4\`). El trigger de
Cloud Build (`deploy-munify-api`) **solo** deploya a `us-east4`; el servicio de
`southamerica-east1` quedó congelado en la revisión `munify-api-00090-n6n`
(2026-07-03 00:30 UTC) y no se movió pese a 8+ builds exitosos después. Probé
contra la URL vieja al principio, vi datos vacíos, y por un momento pareció una
regresión mía — no lo era, era el servicio zombie. **Acción sugerida (no
ejecutada, es de Infra):** dar de baja el servicio `southamerica-east1` para que
nadie más pise este mismo palito, y actualizar la URL en `CLAUDE.md` §15 a la de
`us-east4`.

Nota aparte (falsa alarma, documentada por si se repite): al diagnosticar contra
la base real con un script Python local en Windows, un `print()` a la consola
mostró nombres con acentos rotos (`Secretar�a`). Verificado con los bytes crudos:
la data en la base está perfectamente en UTF-8 — es sólo la consola de Windows
(cp1252) la que no puede mostrar tildes al hacer `print()`. Verificar siempre con
bytes crudos antes de asumir corrupción de datos.

## Pendiente / no bloqueante

- El listado de `TramitesConfig.tsx` sigue con algunos `as any` viejos (línea de
  `abrirEdit`/catches) — no se tocaron, son preexistentes y no forman parte de
  este pedido; sumar `modo_atencion` al tipo `Tramite` ya permite sacarlos cuando
  se retome ese archivo.
- Warning de lint preexistente (`react-hooks/exhaustive-deps` en `AgendaTurnos.tsx`,
  el efecto original de `fetchTurnos`) — no introducido en esta sesión, no tocado.

## Cómo retomar
Leer este doc + `docs/turnos/02-turnero-consolidado.md` (diseño fase C). El
turnero sigue con las mismas 3 patas (catálogo / instancias / agenda); esta
sesión fue puramente de UX/conexión visual entre las 3 pantallas, sin cambios de
modelo de datos. Bot/SalesBot sigue en standby.
