# Cierre del día 2026-07-02 — turnero, módulos, migración y semilla demo

> Reemplaza como "estado actual" al informe PDF de la mañana
> (`2026-07-03_informe-fallas-mejoras-proximos-pasos.pdf`) y al handoff de la
> reorg de menú. Este es el documento vivo de **qué quedó hecho y qué falta**.

## HECHO hoy (todo en producción y verificado live)

### Turnero consolidado (fase C completa)
- Trámite → turno → agenda como una unidad: `modo_atencion` por trámite
  (con turno / orden de llegada / online), reserva directa del vecino con
  gating biométrico (403 `kyc_insuficiente`), agenda por dependencia con
  check-in (busca por nombre/DNI/TRN) y apertura de expediente actuando por
  el vecino, estadísticas de ausentismo.
- Recordatorios de turnos: endpoint + cron de Cloud Scheduler cada hora
  (infra lo montó y validó end-to-end; secret `CRON_SECRET` en Secret Manager).
- Verificado con smoke integral contra producción (reserva TRN real, ocupación
  por solapamiento, gating negativo con vecino sin verificar, cancelación).
- Detalle completo: `docs/turnos/02-turnero-consolidado.md`.

### Reorganización de menú y módulos (commit 6d9a8ae)
- Categoría **Trámites** en el sidebar (Trámites + Agenda + Horarios); murió
  "Programación". Tesorería: "Pagos"→"Gastos", Tarjetas se mudó ahí.
- Flags nuevos `sueldos` y `contaduria` separados del cluster `tesoreria`,
  sembrados por uso real: SPN con sueldos ON (241 pagos programados vivos),
  contaduría oculta para todos (5 OPs de prueba de mayo, abandonadas).
- Detalle: `docs/handoffs/2026-07-02_reorganizacion-menu-y-modulos.md`.

### Migración a us-east4 (infra) — validada de nuestro lado
- Backend junto a la BD Aiven de NYC: mismo endpoint pasó de ~1.2s a ~0.39s
  directo (−65%); camino usuario por proxy ~0.73s estable. OOM muerto (1Gi
  fijado en el trigger del CD). El cron quedó re-apuntado. Mediciones en
  `D:/Code/base-compartida/CANAL_AGENTES.md` (MSG-20260702-2235-10).

### Semilla demo completa (commit 602f88d) — LA PIEZA DE LA DEMO DE MAÑANA
- Toda demo nueva nace con: 14 reclamos con títulos concretos, estados y
  canales variados (omnicanalidad visible), 10 órdenes de trabajo en los 5
  estados vinculadas a reclamos, trámites con modos de atención y KYC
  (licencia = biometría 45 min), oficinas mapeadas, 9 turnos (futuros +
  pasados para stats), tasas, tesorería completa (5 cajas, 20 contactos,
  50 gastos) y los 4 flags de módulos ON.
- Probada en vivo por el endpoint real: se crea en ~10 segundos.
- El borrado de demos (`DELETE /municipios/demo/{codigo}`) ahora conoce
  TODAS las tablas nuevas — verificado cero huérfanos.
- `san-martin` y `san-martin-2` fueron borrados: **el código está libre**
  para crear la demo "San Martín" fresca sin sufijo.
- La cuenta personal de Lucas (arenazl@gmail.com / DNI 30217134, vecino de
  La Matanza demo) fue borrada para poder re-validar biometría en la demo.

### Incidente del día (resuelto)
- 503 de ~30 min por un `import Request` faltante (hotfix `6d53b67`) apilado
  con OOM de 512Mi (resuelto por la migración). Lección incorporada:
  **pyflakes sobre todo archivo backend antes de pushear**.

## PENDIENTES (en orden de prioridad)

1. **Reprogramación de turnos** — hoy el vecino solo cancela y vuelve a
   sacar; falta "mover turno" + reprogramación en lote si cierra una oficina.
   Primera recomendación post-demo.
2. **Política de ausentismo** — se mide el no-show pero no hay límite de
   ausencias (ej. 3 ausencias = solo presencial por un tiempo).
3. **Análisis de cohesión de Tesorería** — revisar las partes que Bartolo no
   usa (conciliación, proyección, ubicación, OP): si están sanas, cohesivas
   o a medio hacer. Barrido multi-agente propuesto, esperando OK de Lucas.
   Ítem conocido: gating backend laxo (los endpoints de OP/sueldos no
   validan flag por endpoint, solo el sidebar).
4. **Autocomplete de municipios en el alta demo** — tabla local de 5 columnas
   (id georef, nombre, provincia, lat, lng) cargada una vez desde la API
   georef de datos.gob.ar; mata el "Pepito Pepito" y los homónimos.
5. **SPN: 778 gastos dudosos** — esperan pistas de Bartolo
   (`docs/clientes/spn/02-curacion-gastos-historicos.md`).
6. **Flexibilización contaduría por configuración** — diseño propuesto en el
   informe, sin arrancar.
7. Menor: dos items "Órdenes" en el menú (Campo=OT vs Contaduría=OP)
   comparten label; decidir naming si molesta.
8. Post-demo San Martín: candidatos según feedback — vista móvil de
   cuadrilla, notificaciones de OT, email entrante, QR comprobante.

## Cómo retomar
Leer este doc + `docs/turnos/02-turnero-consolidado.md`. Bot/SalesBot sigue
en standby. WhatsApp: NO hay integración implementada — el "canal whatsapp"
de los reclamos es una etiqueta de origen, no una conexión real.
