# SMOKE TEST INTEGRAL — Munify / SugerenciasMun

> Plan de validación manual end-to-end antes de cada release. El objetivo
> NO es cubrir todos los casos, sino que **ningún circuito crítico esté
> roto en prod**. Si algún paso falla, el release se frena.

**Dueño:** arenazl
**Duración estimada:** 45–60 min full / 15 min smoke rápido
**Frecuencia sugerida:** antes de cada push a prod + semanal en Heroku prod
**Criterio de éxito global:** todos los items marcados **P0** pasan. Los P1/P2 se loguean como issues pero no bloquean.

---

## 0. SETUP

### 0.1 Entornos

| Entorno | URL Frontend | URL API | Base de datos |
|---------|--------------|---------|---------------|
| Local   | http://localhost:5173 | http://localhost:8002 | Aiven (compartida) |
| Prod    | https://munify.netlify.app | https://reclamos-mun-api-aedc8e147cbe.herokuapp.com | Aiven |

### 0.2 Credenciales demo

Formato: `{rol}@{codigo_municipio}.demo.com` / `demo123`

| Rol | Email (La Matanza) | Email (Chacabuco) |
|-----|--------------------|-------------------|
| admin       | `admin@la-matanza.demo.com` | `admin@chacabuco.demo.com` |
| supervisor  | `supervisor@la-matanza.demo.com` | `supervisor@chacabuco.demo.com` |
| vecino      | `vecino@la-matanza.demo.com` | `vecino@chacabuco.demo.com` |
| superadmin  | `super@munify.demo.com` | (cross-tenant) |
| dependencia | `obras@la-matanza.demo.com` | (opcional) |

> **Pendiente de confirmar:** los emails exactos se validan contra la tabla
> `usuarios` via `/api/auth/login` — durante el smoke del día hay que
> actualizar este apartado si alguno falla.

### 0.3 Dispositivos

- **Desktop:** Chrome 1920×1080, modo claro y oscuro
- **Mobile:** Chrome DevTools → iPhone 14 Pro (390×844) + Galaxy S20 (360×800)
- **PWA:** Instalar en mobile al menos una vez (Add to Home Screen)

### 0.4 Antes de empezar

- [ ] Backend en v319+ (ver `heroku releases -a reclamos-mun-api | head -3`)
- [ ] Frontend en el deploy más reciente de Netlify (`netlify deploys:list`)
- [ ] Cache del navegador limpia (Ctrl+Shift+R) o sesión incógnito
- [ ] Service Worker desinstalado si viene de sesión anterior con bugs

---

## 1. CIRCUITOS POR ROL

Cada circuito tiene:
- **Prioridad** (P0 = bloqueante, P1 = importante, P2 = nice-to-have)
- **Pasos** en orden
- **Esperado** (qué tiene que pasar)
- **Riesgo** (qué se rompe más seguido en esa zona)

---

### CIRCUITO A — VECINO (mobile-first)

> **P0 completo.** Es la experiencia del ciudadano, la que más se mira.
> Se ejecuta **en mobile** (la app real es PWA). Si algún paso falla en
> mobile pero anda en desktop, **es bug bloqueante**.

#### A.1 Registro + Onboarding [P0]
- [ ] Desde `/home` → "Crear cuenta" → completar nombre, DNI, email, pass
- [ ] Redirige a `/onboarding` (wizard post-registro: municipio, barrio, dirección)
- [ ] Al terminar, cae en `/gestion/mi-panel` con badge de bienvenida
- **Riesgo:** el wizard tiene validación de DNI + verificación Didit (puede fallar en offline)

#### A.2 Login [P0]
- [ ] Ir a `/login`, email+pass
- [ ] Si rol=vecino → `/gestion/mi-panel`
- [ ] Sidebar mobile (bottom tabs) muestra: Panel, Mis Reclamos, (+), Mis Trámites, Mis Tasas
- **Riesgo:** redirect buggy cuando hay municipio_id=null

#### A.3 Crear reclamo con flujo "sumarse" [P0]
- [ ] Tap botón (+) central del footer mobile → `/app/nuevo`
- [ ] Wizard paso 1: elegir categoría (ej. "Alumbrado")
- [ ] Paso 2: escribir descripción
- [ ] Paso 3: elegir dirección con autocomplete (Nominatim)
- [ ] Paso 4: tomar/subir foto (Cloudinary)
- [ ] **Antes del submit final**, si hay reclamos similares cerca, se muestran → botón "Sumarme"
- [ ] Click "Sumarme" → POST `/reclamos/{id}/sumarse` → 200 → redirige a `ReclamoDetalle`
- [ ] Si NO hay similares o elijo crear igual → POST `/reclamos` → 201 → redirige a detalle
- **Riesgo:** autocomplete de dirección (3 fallbacks), upload de Cloudinary, cálculo de similares (radio geo)

#### A.4 Mis Reclamos — listado + pull-to-refresh [P0]
- [ ] `/gestion/mis-reclamos` → lista todos los reclamos propios
- [ ] Pull down → refetch → spinner 1.5s + actualización
- [ ] Tap card → abre `Sheet` con detalle
- [ ] Sheet tiene: estado, timeline, fotos, comentar, calificar (si finalizado)
- **Riesgo:** pull-to-refresh no anda si el scroll está en medio

#### A.5 Feedback post-finalización: confirmar o rechazar resolución [P0]
> Pre-requisito: el supervisor debe haber marcado un reclamo del vecino como `finalizado`.

- [ ] Abrir reclamo en estado `finalizado` → banner "¿Se solucionó el problema?"
- [ ] Opción A — "Sí, gracias": POST `/reclamos/{id}/confirmar-vecino {confirmado: true}` → el reclamo queda cerrado + aparece estrella de calificación
- [ ] Opción B — "No se solucionó": abre textarea → comentario obligatorio → POST `/reclamos/{id}/confirmar-vecino {confirmado: false, comentario}` → banner rojo visible en el detalle + supervisor recibe notificación
- **Riesgo:** el endpoint 400 si ya había respondido lo mismo (ahora permite cambiar de opinión)

#### A.6 Calificar reclamo [P1]
- [ ] Tras confirmar OK, tap "Calificar" → 1 a 5 estrellas + comentario opcional
- [ ] POST `/calificaciones` → 201 → toast "Gracias"
- [ ] Link directo `/calificar/:id` desde WhatsApp también funciona sin login

#### A.7 Crear trámite + adjuntar documentos [P0] ⭐ core
> Estados: `recibido → pendiente_pago → en_curso → finalizado / pospuesto / rechazado`

- [ ] Footer mobile → Mis Trámites → "+ Nuevo Trámite" → `/app/nuevo-tramite`
- [ ] Wizard paso 1: elegir **categoría de trámite** (ej. "Licencias")
- [ ] Paso 2: elegir **trámite específico** (ej. "Licencia de Conducir Clase B")
- [ ] Paso 3: ver **documentos requeridos** (lista con íconos) — cada uno marca obligatorio u opcional
- [ ] Paso 4: subir/adjuntar cada documento (foto, PDF o galería)
- [ ] Paso 5: datos del solicitante (pre-cargados del usuario)
- [ ] Paso 6 (si `tipo_pago = inicio`): paso de pago antes de enviar (ver módulo P)
- [ ] Submit → POST `/tramites/solicitudes` → 201 con `numero_tramite` único
- [ ] Redirige a `Mis Trámites` con el nuevo trámite en estado inicial
- **Riesgo:** documentos requeridos con tipo MIME distinto, trámites sin config de tipo_pago

#### A.8 Mis Trámites — seguimiento y estado [P0] ⭐ core
- [ ] `/gestion/mis-tramites` → lista con filtros por estado (todos / recibido / en_curso / finalizado / rechazado / pendiente_pago)
- [ ] Card muestra: número_tramite, nombre, estado con color, fecha, progreso (# docs verificados / total)
- [ ] Tap card → abre detalle con timeline, documentos y acciones
- [ ] **Consulta sin login**: ir a `/tramites/solicitudes/consultar/{numero}` con el número devuelto al crear → muestra estado sin estar logueado

#### A.9 Vecino responde a "requiere documentación" [P0] ⭐ core
> Caso: un supervisor rechazó un documento (DNI borroso) y pide re-subirlo.

- [ ] Trámite con al menos un documento marcado como `rechazado` por supervisor
- [ ] En detalle, banner amarillo: "Faltan documentos por corregir"
- [ ] Listado de docs rechazados con motivo del supervisor
- [ ] Botón "Re-subir" por cada uno → reemplaza el archivo
- [ ] Submit final → POST `/tramites/solicitudes/{id}/enviar-documentos` → vuelve a `en_curso`
- **Riesgo:** el bucket del doc viejo no se borra (Cloudinary). Verificar que el nuevo reemplaza la referencia

#### A.10 Trámite finalizado — descargar resolución [P1]
- [ ] Trámite en estado `finalizado` con al menos un documento de etapa = "resolucion"
- [ ] Botón "Descargar resolución" → abre PDF/imagen en nueva pestaña
- [ ] Timeline muestra fecha de aprobación + responsable

#### A.11 Mis Tasas — consultar deudas y pagar [P0] ⭐ core
> Estados de deuda: `pendiente → pagada` o `vencida` o `en_plan_pago` o `anulada`

- [ ] `/gestion/mis-tasas` → resumen por tipo (ABL, patente, multas, comercio)
- [ ] Badge con total adeudado, cantidad de boletas vencidas en rojo
- [ ] Tap tipo (ej. ABL) → lista de partidas del vecino
- [ ] Tap partida → Sheet con detalle (dirección, zona, titular) + lista de deudas por período
- [ ] Cada deuda muestra: período, vencimiento, monto, estado con badge (pendiente/vencida/pagada)
- [ ] Click "Pagar" sobre deuda pendiente → abre módulo P (pago)
- [ ] Post-pago: estado pasa a `pagada`, aparece botón "Descargar comprobante"
- **Riesgo:** deudas vencidas deben aparecer aunque el CRON de marcado no haya corrido (comparar fecha vencimiento vs hoy en el front)

#### A.12 Asociar partida al padrón (reclamar) [P1]
- [ ] Primera vez que el vecino entra a Mis Tasas sin partidas asociadas
- [ ] Botón "Asociar partida" → form con identificador (ej. nro cuenta ABL) + DNI
- [ ] POST `/tasas/partidas/reclamar` → valida contra padrón → vincula `titular_user_id`
- [ ] La partida aparece en el listado
- **Riesgo:** si el DNI del vecino no coincide con el titular del padrón, debe rechazar con mensaje claro

#### A.13 Mapa público [P2]
- [ ] `/gestion/mapa` → tiles cargan (Leaflet + OSM)
- [ ] Pins de reclamos aparecen con color por estado
- [ ] Click pin → popup con título + link al detalle

#### A.14 Gamificación / Logros [P2]
- [ ] `/gestion/logros` → muestra puntos, medallas desbloqueadas
- [ ] Al crear un reclamo se otorgan puntos (verificar)

#### A.15 Dashboard Vecino [P1]
- [ ] `/gestion/mi-panel` → stats grid (reclamos abiertos, trámites en curso, tasas pendientes)
- [ ] Secciones configurables (si admin cambió `config_dashboard`, acá se refleja)

---

### CIRCUITO B — SUPERVISOR / ADMIN MUNICIPIO

> **Es el panel operativo real.** La mayoría de bugs visibles pasan acá.
> Se prueba en **desktop**.

#### B.1 Login + Dashboard [P0]
- [ ] Login supervisor → cae en `/gestion`
- [ ] Dashboard muestra: stats por estado, gráfico temporal, top categorías
- [ ] Botón **LIVE** (animado, solo admin/supervisor) → activa refresh cada N seg
- **Riesgo:** el botón LIVE se agregó en el commit `5ccb75c`, validar animación

#### B.2 Reclamos — listado + filtros + Sheet [P0]
- [ ] `/gestion/reclamos` → listado paginado con infinite scroll
- [ ] Filtros: estado, categoría, dependencia, búsqueda libre
- [ ] Cambio vista grid ↔ tabla sin perder filtros
- [ ] Badges de estado con colores correctos (ver `estadoColors` en `ReclamoCard.tsx`)
- [ ] Si reclamo tiene `confirmado_vecino === false` → **ícono comentario rojo + animate-pulse + dot rojo**
- [ ] Click card → abre Sheet con detalle
- **Riesgo:** colores de estado duplicados, pull del badge rojo del vecino

#### B.3 Reclamo — asignar a dependencia [P0]
- [ ] Desde Sheet, click "Asignar dependencia" → dropdown con las dependencias habilitadas
- [ ] Se pre-selecciona la dependencia sugerida (por categoría)
- [ ] Confirmar → estado pasa de `recibido` a `en_curso`
- [ ] Entry en historial con `cambio_estado`

#### B.4 Reclamo — cambiar estado (drag & drop en Tablero) [P0]
- [ ] `/gestion/tablero` → Kanban con columnas Recibido, En Curso, Finalizado, Pospuesto, Rechazado
- [ ] Arrastrar card de columna a otra → PATCH `/reclamos/{id}?nuevo_estado=...` → 200
- [ ] Si transición inválida → toast error "No se puede cambiar de X a Y"
- **Riesgo:** transiciones válidas recién ampliadas (FINALIZADO → EN_CURSO para reabrir). Ver `backend/api/reclamos.py:499-509`

#### B.5 Reclamo — rechazar con motivo [P0]
- [ ] Desde cualquier estado, click "Rechazar" → modal con dropdown motivo (MotivoRechazo enum) + descripción
- [ ] Confirmar → estado = `rechazado` + `motivo_rechazo` + `descripcion_rechazo` guardados
- [ ] Aparece banner de rechazo en el detalle

#### B.6 Reclamo — reabrir por feedback negativo del vecino [P0] ⭐ reciente
- [ ] Reclamo con `confirmado_vecino=false` abre su Sheet
- [ ] En timeline/footer hay banner **"El vecino indica que el problema NO fue solucionado"**
- [ ] Botón "Reabrir caso" → `ConfirmModal` variant=danger → "Reabrir caso" → PATCH `?nuevo_estado=en_curso` → 200 → toast "Reclamo reabierto"
- [ ] Botón "Descartar comentario" → `ConfirmModal` variant=info → POST `/reclamos/{id}/descartar-feedback-vecino` → 200 → reclamo sigue finalizado pero `feedback_descartado=true`
- **Riesgo:** este flujo se acaba de estabilizar (commit `0ac3df7`). Es el más frágil. **Probar SÍ o SÍ.**

#### B.7 Reclamo — reasignar dependencia con motivo [P1]
- [ ] Desde Sheet → "Reasignar" → `ConfirmModal` con `promptLabel="Motivo de la reasignación"` → textarea obligatorio
- [ ] PATCH con nueva dependencia_id → estado se mantiene, historial registra cambio

#### B.8 Planificación semanal [P1]
- [ ] `/gestion/planificacion` → calendario semanal con asignaciones
- [ ] Drag reclamo a día/empleado específico
- [ ] Colores coherentes (planning board)

#### B.9 Gestión de Trámites — listado + filtros [P0] ⭐ core
- [ ] `/gestion/tramites` → listado paginado con filtros (estado, categoría, trámite, búsqueda por número, dependencia)
- [ ] Infinite scroll
- [ ] Contador por estado en pills arriba
- [ ] `/gestion/tramites-area` (dependencia) → solo los de su municipio_dependencia_id

#### B.10 Trámite — asignar responsable + auto-asignar [P0] ⭐ core
- [ ] Abrir Sheet de un trámite nuevo (`recibido`)
- [ ] Click "Auto-asignar" → POST `/tramites/solicitudes/{id}/auto-asignar` → el sistema elige dependencia por categoría + responsable por carga de trabajo
- [ ] Alternativamente: click "Asignar" → dropdown dependencia → POST `/tramites/solicitudes/{id}/asignar`
- [ ] Asignar responsable específico → POST `/tramites/solicitudes/{id}/asignar-responsable`
- [ ] Verificar que historial registra la asignación

#### B.11 Trámite — verificar documentación [P0] ⭐ core
> Endpoints clave: `/documentos/{id}/verificar`, `/documentos/{id}/rechazar`, `/requeridos/{id}/verificar-visual`

- [ ] Abrir Sheet de trámite en `recibido` con documentos subidos
- [ ] Checklist de documentos requeridos (`GET /checklist-documentos`) muestra cada uno con estado (pendiente/verificado/rechazado)
- [ ] Click "Ver documento" → preview inline (imagen o PDF)
- [ ] Click **"Verificar"** → POST `/documentos/{id}/verificar` → badge verde
- [ ] Click **"Rechazar"** → modal con motivo (ConfirmModal variant=warning con promptLabel) → POST `/documentos/{id}/rechazar { motivo }`
- [ ] Click "Desverificar" (revertir) → POST `/documentos/{id}/desverificar`
- [ ] Si algún doc requerido no fue cargado pero el supervisor lo verificó presencialmente → "Verificar visual" → POST `/requeridos/{id}/verificar-visual`
- **Riesgo:** este es el flujo más denso del módulo. Los íconos de estado de cada doc deben reflejar la acción inmediatamente (sin refresh)

#### B.12 Trámite — transiciones de estado [P0] ⭐ core
> Transiciones válidas: `recibido → en_curso → finalizado/pospuesto/rechazado`, y `pendiente_pago` cuando hay costo.

- [ ] Con todos los docs verificados, botón "Poner En Curso" → PUT `/solicitudes/detalle/{id} { estado: en_curso }`
- [ ] Subir documentos de etapa = "resolucion" (firma digital, acta, certificado) desde el Sheet admin
- [ ] Click "Finalizar" → ConfirmModal variant=success → PUT con `estado: finalizado` → fecha_resolucion se registra
- [ ] Notificación push/email al vecino con el comprobante
- [ ] Verificar que aparece en `/gestion/tramites` con badge verde "Finalizado"

#### B.13 Trámite — rechazar con motivo [P0] ⭐ core
- [ ] Desde cualquier estado activo, botón "Rechazar"
- [ ] ConfirmModal variant=danger con `promptLabel="Motivo del rechazo"` obligatorio
- [ ] PUT con `estado: rechazado` + motivo → timeline registra
- [ ] El vecino ve banner rojo en Mis Trámites

#### B.14 Trámite — requerir documentación adicional [P0] ⭐ core
> Ver A.9 (lado vecino)

- [ ] Rechazar un documento específico (no el trámite completo)
- [ ] El trámite queda en estado activo pero con flag "espera docs del vecino"
- [ ] El vecino recibe notificación y debe re-subir (ver A.9)
- [ ] Cuando el vecino re-envía → el supervisor ve los docs nuevos y vuelve a B.11

#### B.15 Trámite — pospuesto y reactivar [P1]
- [ ] Desde `en_curso`, click "Posponer" → motivo → estado `pospuesto`
- [ ] Luego "Reactivar" → vuelve a `en_curso`

#### B.16 Gestión de Tasas — partidas del padrón [P1] ⭐ core
- [ ] `/gestion/tasas` → listado de partidas con filtros (tipo, estado, búsqueda por identificador o titular)
- [ ] Tap partida → detalle con todas las deudas del histórico
- [ ] Ver deuda individual: período, vencimiento, monto, estado, pago asociado (si pagó)
- [ ] Resumen card arriba: total partidas, total deuda vigente, total cobrado mes
- **Pendiente verificar:** ¿el admin puede marcar deuda como `anulada` manualmente? ¿hay botón en UI?

#### B.17 Importar padrón masivo [P1]
> `C.7` duplicado — es la misma operación

- [ ] `/gestion/ajustes/importar-padron` → subir CSV de partidas
- [ ] Preview muestra: nuevas, actualizadas, errores
- [ ] Confirmar → POST `/tasas/importar-padron/confirmar` → N partidas creadas
- [ ] Ver en `/gestion/tasas` las nuevas partidas

#### B.18 Gestión de Pagos (contaduría) [P0] ⭐ core
- [ ] `/gestion/pagos` → tabla transaccional con todas las sesiones APPROVED
- [ ] Columnas: fecha, concepto, monto, medio_pago, provider, external_id, comprobante_url
- [ ] Filtros: rango fechas, provider (gire/mp/modo), medio, estado, tipo (tasa/trámite), búsqueda libre
- [ ] Card de resumen arriba: total cobrado, cantidad operaciones, promedio, distribución por medio
- [ ] Exportar CSV → incluye todos los filtros aplicados
- **Riesgo:** performance del listado con muchos pagos — validar paginación

#### B.12 Empleados + Cuadrillas + Ausencias [P1]
- [ ] `/gestion/empleados` → ABM con Sheet
- [ ] `/gestion/cuadrillas` → ABM con asignación de empleados
- [ ] `/gestion/ausencias` → calendar de ausencias

#### B.13 Exportar [P2]
- [ ] `/gestion/exportar` → elegir entidad (reclamos/trámites/tasas) + rango fechas → descargar CSV

#### B.14 SLA [P2]
- [ ] `/gestion/sla` → config de SLA por categoría con tiempos
- [ ] Ver reclamos fuera de SLA marcados en rojo

#### B.15 Panel BI [P2]
- [ ] `/gestion/panel-bi` → consulta en lenguaje natural (ej. "reclamos de alumbrado de los últimos 30 días")
- [ ] Respuesta con gráfico + tabla
- **Riesgo:** depende de Groq/Gemini, a veces timeouts

---

### MÓDULO P — PAGOS (transversal, core del sistema) [P0]

> **Es el puente entre Tasas/Trámites y el dinero real.** Lo usan vecinos al
> pagar, admins al conciliar y contaduría al exportar. Si se rompe acá, la
> confianza en el sistema se rompe. Se prueba con **provider mock** (GIRE
> simulado vía PayBridge).

**Estados de sesión** (`EstadoSesionPago`): `PENDING → APPROVED / REJECTED / EXPIRED / CANCELLED`
**Estados de deuda** (`EstadoDeuda`): `pendiente → pagada / vencida / en_plan_pago / anulada`
**Medios gateway**: tarjeta, qr, efectivo_cupon, transferencia, debito_automatico
**Providers**: gire, mercadopago, modo (solo mock en demo)

#### P.1 Crear sesión de pago para deuda de tasa [P0]
- [ ] Vecino logueado entra a Mis Tasas → tap deuda pendiente
- [ ] Click "Pagar" → POST `/pagos/crear-sesion { deuda_id }` → 200 con `{ session_id, checkout_url, expires_at }`
- [ ] `expires_at` debe ser ~15 minutos después de `now()`
- [ ] Frontend redirige a `/pago/checkout/:sessionId`
- **Riesgo:** si `deuda_id` ya tiene sesión APPROVED, debe rechazar con 400 "Esta deuda ya fue pagada"

#### P.2 Crear sesión de pago para trámite [P0]
- [ ] Durante el wizard del trámite con costo, antes de submit → POST `/pagos/sesion-tramite { solicitud_id }` → 200 con checkout_url
- [ ] Si el trámite tiene `tipo_pago=inicio` → se crea antes de confirmar la solicitud
- [ ] Si `tipo_pago=final` → se crea cuando el supervisor marca como `finalizado`

#### P.3 Checkout público (PayBridge) [P0] ⭐ core
- [ ] Abrir `/pago/checkout/:sessionId` SIN login (es una URL pública, el sessionId es secreto)
- [ ] GET `/pagos/sesiones/{session_id}` devuelve datos para renderizar: concepto, monto, vecino_nombre, municipio_nombre, medios_soportados, provider
- [ ] Pantalla visualmente parece "otra plataforma" (branding GIRE/PayBridge), no Munify
- [ ] Vecino elige medio (tarjeta/qr/efectivo/transferencia/débito)
- [ ] Completa datos simulados (tarjeta mock)
- [ ] Submit → POST `/pagos/sesiones/{session_id}/confirmar { medio_pago, metadatos }` → 200
- [ ] Response trae comprobante con: concepto, monto, medio, fecha, numero_operacion, provider
- [ ] Frontend redirige a `return_url` con flag `?success=1`
- **Riesgo:** sesión expirada debe mostrar pantalla de error + botón volver

#### P.4 Cancelar sesión desde el checkout [P1]
- [ ] Durante el checkout, click "Cancelar" → POST `/pagos/sesiones/{session_id}/cancelar` → 200
- [ ] Estado de sesión pasa a `CANCELLED`
- [ ] El vecino vuelve al detalle de la deuda/trámite
- [ ] La deuda sigue `pendiente`, puede intentar pagar de nuevo (crear sesión nueva)
- [ ] Si era trámite: historial registra "✗ Pago cancelado"

#### P.5 Sesión expirada [P1]
- [ ] Sesión creada hace > `expires_at` (ej. modificar DB con `UPDATE pago_sesiones SET expires_at = NOW() - INTERVAL 1 HOUR`)
- [ ] Intentar confirmar → 400 "Sesion EXPIRED"
- [ ] Intentar ver la sesión → estado ya debería estar `EXPIRED` (si hay cron) o seguir `PENDING` (si no)
- **Gap conocido:** ver P-Gaps #3 abajo — no hay cron de expiración automática

#### P.6 Post-pago: estado de deuda/trámite actualizado [P0]
- [ ] Al confirmar P.3, la deuda pasa automáticamente a `pagada`
- [ ] Se crea registro en tabla `pagos` con: medio, monto, external_id, usuario_id, estado=confirmado
- [ ] En `/gestion/mis-tasas` la deuda ahora aparece en verde "Pagada" con link al comprobante
- [ ] Si era trámite: aparece entry en historial con icono 💳 "Pago aprobado"
- [ ] El trámite queda con `pagado=true` accesible desde `GET /pagos/estado-solicitud/{id}`

#### P.7 Consultar estado de pago de un trámite (admin) [P0]
- [ ] Desde Sheet de trámite → tab "Pagos" → llama `GET /pagos/estado-solicitud/{solicitud_id}`
- [ ] Muestra: requiere_pago, costo, pagado (bool), monto_pagado, fecha_pago, medio_pago, intentos_total, intentos_fallidos
- [ ] Lista de todas las sesiones (aprobadas + fallidas + canceladas)
- [ ] Útil para debug cuando el vecino dice "yo pagué"

#### P.8 Intentos múltiples de pago [P1]
- [ ] Vecino crea sesión, cancela
- [ ] Vecino crea OTRA sesión para la misma deuda → debe funcionar (deuda sigue pendiente)
- [ ] Aprueba la segunda → primera queda CANCELLED, segunda APPROVED
- [ ] `intentos_total=2, intentos_fallidos=1` en estado-solicitud

#### P.9 Reintento con otro medio tras fallo [P1]
- [ ] Crear sesión, confirmar con medio que el mock rechace (si existe path de rechazo)
- [ ] Estado pasa a REJECTED
- [ ] Vecino puede crear nueva sesión y reintentar
- **Gap conocido:** ver P-Gaps #5 — el confirm actual no simula rechazo, siempre aprueba

#### P.10 Contaduría — listar y exportar [P0] ⭐ core
- [ ] Login admin → `/gestion/pagos`
- [ ] GET `/pagos-contaduria/listar` → paginado, filtrable
- [ ] GET `/pagos-contaduria/resumen` → totales por período, por medio, por provider
- [ ] Exportar CSV con filtros → GET `/pagos-contaduria/exportar`
- [ ] Validar que los totales cuadran con suma manual de registros

#### P.11 ABM de proveedores de pago [P1]
- [ ] `/gestion/proveedores-pago` → GET `/proveedores-pago` devuelve 3 providers (gire, mp, modo)
- [ ] Toggle activo/inactivo por provider → PUT `/proveedores-pago/{proveedor}`
- [ ] Config de credenciales (client_id, secret) por provider
- [ ] Al crear un trámite con costo, el checkout usa el primer provider activo del muni

#### P.12 Descargar comprobante de pago [P1]
- [ ] Deuda pagada o trámite pagado → botón "Descargar comprobante"
- [ ] Abre PDF generado con: municipio, vecino, concepto, monto, fecha, numero_operacion, medio, firma
- **Pendiente verificar:** ¿hay endpoint explícito o se regenera del response de confirmar?

---

### P-GAPS — ⚠️ FALTANTES DE IMPLEMENTACIÓN (auditoría)

> Revisión del código de `backend/api/pagos.py` + `backend/models/pago_sesion.py`. Cosas que deberían existir para un flujo productivo pero hoy están mock, comentadas o directamente ausentes.

| # | Gap | Severidad | Impacto |
|---|-----|-----------|---------|
| 1 | **Webhook real del provider** — `POST /pagos/webhook/{provider}` mencionado en el docstring pero no implementado. Hoy el `/confirmar` simula todo del lado Munify, no hay validación con el provider real. | 🔴 Bloqueante en prod real | Sin webhook, en prod podríamos marcar pagado algo que el provider rechazó (o al revés). Necesita firma HMAC del provider. |
| 2 | **Reembolso / reversión** — enum `EstadoSesionPago` tiene `REFUNDED` y `EstadoPago` tiene `REEMBOLSADO`, pero no hay endpoint ni UI. | 🟡 Medio | Si el vecino pagó mal, admin necesita devolverlo. Hoy no hay forma digital. |
| 3 | **Expiración automática de sesiones** — `expires_at` se guarda pero ningún job cambia el estado a `EXPIRED`. Las sesiones vencidas siguen como `PENDING`. | 🟡 Medio | Lista de sesiones pendientes crece indefinidamente. Debería haber un cron horario. |
| 4 | **Pago de múltiples deudas en una sesión** — `CrearSesionRequest` acepta un solo `deuda_id`. | 🟢 Nice-to-have | Vecino quiere pagar ABL de 6 meses juntos → tiene que hacer 6 sesiones. |
| 5 | **Simulación de rechazo** — `/confirmar` siempre aprueba. No hay forma de testear el camino de rechazo desde QA. | 🟡 Medio | No se puede probar UI de fallo sin hacer hack en DB. |
| 6 | **Planes de pago** — `EstadoDeuda.EN_PLAN_PAGO` existe pero no hay endpoint para crear/gestionar planes (cuotas, intereses). | 🔴 Bloqueante para el uso real | Municipios chicos necesitan dar planes para cobrar. Sin esto, el módulo es solo cobro directo. |
| 7 | **Envío de comprobante por email** — al confirmar no se dispara envío de email al vecino con el PDF del comprobante. | 🟡 Medio | Vecino tiene que descargar manualmente. Si pierde la pestaña, no tiene el PDF. |
| 8 | **Conciliación contra provider** — no hay endpoint que compare sesiones APPROVED en Munify vs lo que efectivamente llegó a la cuenta bancaria del muni. | 🟡 Medio (cuando haya webhook) | Sin conciliación, discrepancias invisibles. |
| 9 | **Firma/validación del sessionId en el checkout** — cualquiera con el `sessionId` puede marcar como pagado via `/confirmar`. No hay token de seguridad adicional. | 🟡 Medio | Riesgo bajo hoy porque es mock, pero en prod necesita JWT firmado o doble validación con provider. |
| 10 | **Descarga de comprobante post-hoc** — no hay `GET /pagos/comprobante/{session_id}` para regenerar el PDF después. El comprobante solo se devuelve en el response de confirmar. | 🟢 Nice-to-have | Si el vecino cerró la pestaña, pierde el PDF. |
| 11 | **Marcar deuda como anulada manualmente** — `EstadoDeuda.ANULADA` existe pero no hay UI para que admin anule una deuda (ej. error de carga). | 🟡 Medio | Única forma actual: modificar DB manualmente. |
| 12 | **Idempotencia** — si el front dispara `/confirmar` dos veces por retry de red, ¿crea dos registros `Pago`? Validar en código. | 🔴 Alto | Doble cobro silencioso. El endpoint actual tiene chequeo (`if sesion.estado == APPROVED → 400`) pero hay que confirmar que funciona con concurrencia. |

> **Prioridad sugerida para implementar:** #12 (idempotencia — validar que ya está cubierto) → #1 (webhook) → #6 (planes de pago) → #2 (reembolso) → #7 (email comprobante) → resto.

---

### CIRCUITO C — ABMs de configuración (admin) [P1]

> Se rompen menos, pero son los que configuran el sistema.

#### C.1 Categorías de reclamo per-municipio
- [ ] `/gestion/categorias-reclamo` → grid de categorías habilitadas + catálogo global
- [ ] Toggle activar/desactivar → PATCH `municipio_categorias`

#### C.2 Categorías y Tipos de trámite
- [ ] `/gestion/categorias-tramite` + `/gestion/tramites-config`
- [ ] Habilitar un trámite del catálogo → aparece disponible en el wizard del vecino

#### C.3 Dependencias + Asignación [P0]
- [ ] `/gestion/dependencias` → ABM de dependencias del municipio
- [ ] `/gestion/asignacion-dependencias` → acordeón por dependencia
  - Reclamos: toggle categorías
  - Trámites: toggle tipos + expandir para ver trámites específicos
- **Riesgo:** la pantalla de asignación es la más compleja del sistema (commit `25/01/25`)

#### C.4 Proveedores de Pago
- [ ] `/gestion/proveedores-pago` → toggle GIRE / MercadoPago / MODO
- [ ] Config de credenciales del provider
- [ ] Al crear un trámite con costo → el wizard usa el provider habilitado

#### C.5 Zonas + Barrios
- [ ] `/gestion/zonas` → ABM con polígonos en mapa

#### C.6 Configuración del Dashboard
- [ ] `/gestion/config-dashboard` → admin elige qué secciones ven vecinos y empleados
- [ ] Cambio inmediato visible al volver a `/gestion/mi-panel` como vecino

#### C.7 Importar Padrón
- [ ] `/gestion/ajustes/importar-padron` → subir CSV de partidas
- [ ] Preview + confirmación → N partidas creadas

---

### CIRCUITO D — DEPENDENCIA (supervisor con `municipio_dependencia_id`) [P1]

- [ ] Login supervisor con dependencia → cae en `/gestion/mi-area`
- [ ] Sidebar muestra solo: Mi Área, Reclamos (del área), Trámites (del área), Mapa, Estadísticas
- [ ] `/gestion/reclamos-area` solo muestra reclamos asignados a su dependencia_id
- [ ] No puede modificar reclamos de otras dependencias (403)

---

### CIRCUITO E — SUPERADMIN [P1]

- [ ] Login admin SIN `municipio_id` → cae en `/gestion/consola`
- [ ] Consola global muestra métricas cross-tenant (todos los munis)
- [ ] `/gestion/municipios` → ABM de municipios + botón "Crear demo" → genera muni con seed completo (categorías, dependencias, zonas, empleados, SLA, 4 reclamos demo)
- [ ] `/gestion/admin/audit-logs` → logs de auditoría filtrable por muni/usuario/acción

---

## 2. CIRCUITOS TRANSVERSALES

### T.1 Theming [P2]
- [ ] Ir a ajustes → cambiar paleta (Onyx/Pearl/Espresso/Steel/Sage/Bordeaux + las default)
- [ ] Verificar que todos los componentes tomen `theme.primary`, `theme.card`, `theme.border` (no hardcoded)
- [ ] Toggle modo oscuro/claro → persiste en refresh

### T.2 Notificaciones push [P2]
- [ ] Como vecino, aceptar permiso de push
- [ ] Crear reclamo → el device_token queda en `push_subscriptions`
- [ ] Supervisor cambia estado → vecino recibe push real
- [ ] Tap notificación → abre `/gestion/mis-reclamos/:id`

### T.3 WhatsApp [P2]
- [ ] `/gestion/whatsapp` → config de WhatsApp Business
- [ ] Simular notificación (si hay endpoint mock)
- [ ] Click en link WhatsApp `/calificar/:id` → pantalla de calificación sin login

### T.4 PWA [P2]
- [ ] En mobile Chrome → "Add to Home Screen"
- [ ] Abrir desde home → splash screen del municipio + manifest correcto
- [ ] Offline: abrir la app sin red → service worker muestra shell

### T.5 Chat IA [P2]
- [ ] Abrir widget de chat (botón flotante — si está habilitado, ver commit reciente que lo removió y verificar el estado actual)
- [ ] Preguntar "cómo hago un reclamo" → respuesta coherente
- **Nota:** El user pidió remover el botón flotante errático. Verificar que SIGUE removido.

### T.6 ConfirmModal — alerts modernos [P0] ⭐ reciente
- [ ] Todas las acciones destructivas/con input usan `ConfirmModal`, NO `window.confirm`/`prompt`
- [ ] Grep rápido en `frontend/src/` para confirmar: no debe haber llamadas a `window.confirm(` / `window.prompt(` / `window.alert(`
- [ ] Los 4 variants se renderizan con colores correctos (danger/warning/info/success)

---

## 3. SMOKE TEST BACKEND (curl)

> Rápido, 5 min. Valida que la API está viva y los endpoints críticos
> responden. Ejecutar en cada deploy a Heroku.

```bash
BASE=https://reclamos-mun-api-aedc8e147cbe.herokuapp.com

# 1. Health
curl -s $BASE/api/health → { "status": "ok" }

# 2. Municipios públicos
curl -s $BASE/api/municipios/public | jq length → > 0

# 3. Login demo vecino
TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=vecino@la-matanza.demo.com&password=demo123" \
  | jq -r .access_token)
[ ${#TOKEN} -gt 20 ] → OK

# 4. Mis reclamos
curl -s -H "Authorization: Bearer $TOKEN" $BASE/api/reclamos/mis-reclamos → array

# 5. Categorías del municipio
curl -s -H "Authorization: Bearer $TOKEN" $BASE/api/categorias → array

# 6. Crear reclamo de prueba
curl -s -X POST $BASE/api/reclamos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Smoke test","descripcion":"Test","direccion":"Av. Test 123","categoria_id":1}' \
  → 201 con id del reclamo

# 7. Transición válida
curl -s -X PATCH "$BASE/api/reclamos/{id}?nuevo_estado=en_curso&comentario=smoke" \
  -H "Authorization: Bearer $TOKEN_SUPERVISOR" → 200

# 8. Transición inválida (esperar 400)
curl -s -X PATCH "$BASE/api/reclamos/{id}?nuevo_estado=resuelto" \
  -H "Authorization: Bearer $TOKEN_SUPERVISOR" → 400 con detail

# 9. Cleanup: rechazar el reclamo de prueba para no ensuciar data
curl -s -X POST "$BASE/api/reclamos/{id}/rechazar" ... → 200
```

---

## 4. MATRIZ DE COBERTURA

| Módulo | Vecino | Supervisor | Admin | Dep | SuperAdmin | Prioridad |
|--------|:-:|:-:|:-:|:-:|:-:|:-:|
| Auth (login/register/logout) | ✔ | ✔ | ✔ | ✔ | ✔ | P0 |
| Reclamos — crear | ✔ | — | — | — | — | P0 |
| Reclamos — gestionar | — | ✔ | ✔ | ✔ | — | P0 |
| Reclamos — reabrir por feedback | — | ✔ | ✔ | ✔ | — | P0 |
| Trámites — crear | ✔ | — | — | — | — | P0 |
| Trámites — gestionar | — | ✔ | ✔ | ✔ | — | P0 |
| Tasas — pagar | ✔ | — | — | — | — | P0 |
| Tasas — gestión | — | ✔ | ✔ | — | — | P1 |
| Pagos (contaduría) | — | ✔ | ✔ | — | — | P1 |
| ABMs config | — | — | ✔ | — | — | P1 |
| Tablero Kanban | — | ✔ | ✔ | — | — | P0 |
| Planificación | — | ✔ | ✔ | — | — | P1 |
| Panel BI | — | ✔ | ✔ | — | — | P2 |
| Consola global | — | — | — | — | ✔ | P1 |
| Crear demo | — | — | — | — | ✔ | P1 |

---

## 5. ZONAS DE ALTO RIESGO (mirar con lupa)

1. **Transiciones de estado de reclamos** — validación en `backend/api/reclamos.py:499-509`. Cualquier cambio acá rompe el Kanban.
2. **Pydantic ReclamoResponse** — campos nuevos deben declararse explícitamente o Pydantic los dropea silenciosamente. Último caso: `confirmado_vecino`.
3. **tsc -b vs tsc --noEmit** — `npm run build` es más estricto. Siempre correr build antes de push.
4. **Similares / sumarse** — depende de geo (lat/lng) y radio. Un reclamo sin coords no aparece como similar.
5. **Checkout PayBridge** — `CrearSesionTramiteRequest` necesita `expires_at`. Si se rompe el schema, el pago falla con 500.
6. **Theming** — componentes que usan colores hardcoded (`bg-blue-500` en vez de `theme.primary`) no respetan la paleta activa.
7. **Sheet compact** — el override `.sheet-compact` escala fuentes al 85%. Si alguien agrega tamaños nuevos (text-4xl), no los cubre.
8. **Badges absolute-positioned** — se escapan del contenedor del StickyPageHeader. Preferir inline circles.

---

## 6. DEFINICIÓN DE DONE

El smoke test se considera **pasado** si:
- [ ] Todos los items **P0** están marcados ✔
- [ ] Los **P1** que no pasaron tienen un issue abierto con repro + screenshot
- [ ] Los **P2** se loguean pero no bloquean el release
- [ ] Se corrió el smoke backend (curl) en el ambiente de prod
- [ ] No hay errores en la consola del navegador durante los flows P0 (pestaña Console limpia)
- [ ] No hay 4xx/5xx en Network en los flows P0 (excepto los esperados tipo 400 de transición inválida)

---

## 7. ANEXO — COMANDOS ÚTILES

```bash
# Ver último release de Heroku
heroku releases -a reclamos-mun-api | head -3

# Ver logs en vivo
heroku logs -a reclamos-mun-api --tail

# Ver último deploy de Netlify
netlify deploys:list --filter=munify | head -3

# Build local estricto (mismo que Netlify)
cd frontend && npm run build

# Smoke test backend automatizado
cd backend && python scripts/smoke_test_demo.py
```

---

**Última actualización:** 2026-04-22
**Próxima revisión:** tras cualquier cambio en roles, estados de reclamo o endpoints críticos.
