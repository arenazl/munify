# PAYMENTS BUNDLE — Plan de Implementación (v2)

> Documento derivado de la charla completa en `PAYMENTS-BUNDLE.md` + relevamiento del estado real del repo.
> Rama: `master-bundle-payments`. Fecha: 2026-04-22.
> **v2**: incorpora la segunda mitad de la charla (CUT, conciliación batch, Operador de Ventanilla, asistencia adultos mayores, puente WhatsApp, Marketplace/Split Payment y arquitectura B2G).

---

## 1. Contexto — los 4 bloques de la charla

La charla tiene cuatro movimientos encadenados:

### Bloque A — Validación del MVP "Pago Registrado"
- DIGIT/SID-RENAPER es válido legalmente: devuelve match real contra RENAPER.
- Munify genera el checkout (MP/MODO con CUIT del muni), registra el pago como "Pagado — Pendiente de Imputación" y nunca custodia fondos.
- La imputación manual se vende como **"Etapa de Transición Digital"**.
- Licencias de conducir tienen dos componentes: tasa municipal (Munify) + **CENAT** (ANSV, pago aparte, se adjunta como documento).

### Bloque B — Refinamiento del MVP
- **CUT (Código Único de Trámite)**: QR/ID que Munify genera al confirmar pago. El operador lo escanea y su consola muestra "Pago $8.000 confirmado vía MP — ID XXXXX". Evita capturas de WhatsApp editadas.
- **Conciliación Batch**: en vez de imputar 1 a 1, Munify genera CSV/XLS al final del día con el formato exacto que pide el sistema contable del muni. Tesorería hace una importación masiva en 5 min.
- **Catálogo de trámites con montos editables**: el admin del muni actualiza tasas por ordenanza fiscal sin tocar código. (Ya existe en el repo como `Tramite.costo`.)

### Bloque C — Omnicanalidad: Operador de Ventanilla (núcleo nuevo)
Este bloque no estaba en la v1 del plan. Cubre al vecino que **no usa la app** (adultos mayores, brecha digital):
- **Modo Kiosco / Validación Presencial**: la consola web del operador integra el SDK DIGIT contra la webcam de la PC. El operador carga DNI, el vecino mira la cámara, RENAPER valida.
- **Pago híbrido**:
  - **QR por WhatsApp**: el sistema dispara un mensaje al vecino (o a un familiar acompañante) con link MP/MODO. El monitor del operador o un "Display QR" en el mostrador también funcionan.
  - **Pago en efectivo**: Munify emite boleta con código de barras. El vecino paga en la caja del palacio municipal o Rapipago. El operador marca "Pago recibido en efectivo - Comprobante N° XXX" y sube foto del ticket.
- **Usuario Representante**: declaración jurada ("Se realiza validación presencial de identidad frente a funcionario público") + firma en tableta o checkbox con trazabilidad del operador.
- **Rol específico "Operador de Ventanilla"** en el dashboard, distinto de supervisor/admin. Cada acción queda firmada con su ID.
- **Puente WhatsApp**: reutilizar el módulo `whatsapp` existente para que Munify mande automáticamente el link de pago al vecino cuando el operador inicia un trámite asistido.

### Bloque D — Resumen B2G y arquitectura técnica
- Munify pasa de B2C a **B2G** (Business-to-Government): plataforma de gestión integral para el muni.
- Arquitectura en 4 módulos:
  - **Identity Provider** — DIGIT/SID en app + dashboard, flag `self_service` vs `assisted`.
  - **Fintech Bridge** — Checkout Pro con Access Token del muni (modelo Marketplace/Split Payment — la plata NUNCA pasa por cuenta de Munify). Webhook listener IPN.
  - **Backoffice** — consola del operador con scan de docs, validación visual de pagos adjuntos (CENAT), webcam local para biometría.
  - **Data Export** — motor de plantillas batch configurable por muni (CSV/TXT/JSON/XLS-RAFAM).
- **Dashboard omnicanal**: "Hoy 100 licencias: 60 App, 40 Ventanilla" → insumo político para el intendente.
- **Hardware**: considerar que las PC del muni pueden ser viejas, monitores de baja resolución. SDK DIGIT tiene que ser responsive.

---

## 2. Estado actual del repo

### Backend — lo que ya existe
| Componente | Archivo | Qué hace |
|---|---|---|
| Modelo `PagoSesion` | [backend/models/pago_sesion.py](backend/models/pago_sesion.py) | Sesión genérica (deuda o solicitud) con estados `pending → in_checkout → approved/rejected/expired/cancelled` |
| Endpoints checkout | [backend/api/pagos.py](backend/api/pagos.py) | crear-sesion (tasa y trámite), obtener, confirmar, cancelar, estado-solicitud |
| Endpoints contaduría | [backend/api/pagos_contaduria.py](backend/api/pagos_contaduria.py) | listar / resumen / exportar CSV con filtros |
| Proveedores por muni | [backend/models/municipio_proveedor_pago.py](backend/models/municipio_proveedor_pago.py) | GIRE/MP/MODO + productos (boton_pago, rapipago, adhesion_debito, qr) |
| Modelo `Tramite.costo` | [backend/models/tramite.py:69](backend/models/tramite.py#L69) | Catálogo editable — admin muni actualiza monto sin tocar código ✅ |
| Número de trámite | [backend/models/tramite.py:108](backend/models/tramite.py#L108) | `numero_tramite` formato `SOL-2025-00001` — candidato a CUT |
| KYC Didit | [backend/services/didit.py](backend/services/didit.py) | Cliente v2 sesiones + consulta |
| WhatsApp por muni | [backend/api/whatsapp.py](backend/api/whatsapp.py) + `whatsapp_config.py` | Config + envío con fallback — reutilizable para puente de pagos |
| Roles existentes | [backend/models/enums.py](backend/models/enums.py) | VECINO / EMPLEADO(legacy) / SUPERVISOR / ADMIN |
| Documentos de solicitud | `DocumentoSolicitud` | Adjuntar archivos a una solicitud — reutilizable para CENAT y foto ticket |

### Frontend — lo que ya existe
| Componente | Archivo |
|---|---|
| Checkout ciudadano | [frontend/src/pages/PayBridgeCheckout.tsx](frontend/src/pages/PayBridgeCheckout.tsx) |
| Contaduría | [frontend/src/pages/GestionPagos.tsx](frontend/src/pages/GestionPagos.tsx) |
| Config proveedores | [frontend/src/pages/ProveedoresPago.tsx](frontend/src/pages/ProveedoresPago.tsx) |
| Callback Didit | [frontend/src/pages/RegisterDiditCallback.tsx](frontend/src/pages/RegisterDiditCallback.tsx) |
| Config WhatsApp | [frontend/src/pages/WhatsAppConfig.tsx](frontend/src/pages/WhatsAppConfig.tsx) |

### El delta contra la charla completa
Lo que HOY falta (cubierto por las fases de abajo):

1. Estado de **imputación** en `PagoSesion` y cola del funcionario — F1.
2. **CUT visible** (QR + número corto) que el operador escanea — F1.
3. Providers reales con **Access Token por muni** y webhook firmado (Marketplace) — F2.
4. **CENAT** como documento con validación gating — F3.
5. **Motor de plantillas batch** configurable por muni (no solo CSV genérico) — F4.
6. Flag **self-service vs assisted** en KYC + rol `OPERADOR_VENTANILLA` — F5/F6.
7. **Consola Operador de Ventanilla** con modo kiosco (webcam DIGIT + DJ firmada) — F6.
8. **Puente WhatsApp para pagos asistidos** (link MP + display QR + notificaciones de confirmación) — F7.
9. **Pago en efectivo con registro** (boleta con código de barras + foto del ticket) — F8.
10. **Dashboard omnicanal** (métricas por canal app/ventanilla) — F9.

---

## 3. Plan por fases

Nueve fases. Se mantiene el principio de "cada fase es demoable sola".

---

### FASE 1 — Pendiente de Imputación + CUT + Panel del Funcionario

**Objetivo:** cerrar el círculo contable del MVP y darle al operador un token de validación único por trámite pagado.

#### Datos
Agregar a `PagoSesion`:
- `imputacion_estado: Enum("no_aplica", "pendiente", "imputado", "rechazado_imputacion")` — default `"pendiente"` cuando pasa a APPROVED.
- `imputado_at: DateTime nullable`
- `imputado_por_usuario_id: FK usuarios nullable`
- `imputacion_observacion: Text nullable`
- `imputacion_referencia_externa: String(100) nullable` (nº de asiento RAFAM)

El **CUT** reutiliza `Solicitud.numero_tramite` existente; agregar un `codigo_cut_qr` generado al aprobar el pago (hash corto tipo `CUT-A3F2B1-CHAC` para que sea humanamente dictable por teléfono).

Índice `(municipio_id, imputacion_estado, completed_at)`.

Backfill: sesiones `APPROVED` existentes → `imputacion_estado = pendiente`.

#### Backend (nuevos endpoints bajo `/pagos/contaduria`)
- `GET /pagos/contaduria/imputacion/pendientes` — cola paginada filtrable.
- `POST /pagos/contaduria/imputacion/{session_id}/marcar` — body `{ referencia_externa, observacion }`.
- `POST /pagos/contaduria/imputacion/{session_id}/rechazar` — body `{ motivo }`.
- `POST /pagos/contaduria/imputacion/bulk-marcar` — lista de `session_id` + referencias.
- `GET /pagos/cut/{codigo_cut_qr}` — **endpoint público** (no JWT) que devuelve `{concepto, monto, estado, fecha, external_id, vecino_nombre}` para que el operador lo escanee. Si la sesión no fue pagada, devuelve 404 (evita que alguien arme un QR falso).

Permisos: solo `admin` o `supervisor` con flag contaduría del muni.

#### Frontend
- Nueva pestaña en `GestionPagos.tsx`: **"Cola de imputación"**.
- Grilla columnas: fecha, concepto, vecino, monto, medio, canal (app/ventanilla — ver F6/F9), CUT, botones "Imputar" / "Rechazar".
- Modal "Imputar pago" con ref externa + observación + auto-copy al portapapeles del bloque tipo-RAFAM.
- Bulk actions con textarea para pegar la salida del sistema contable y parsear nº de asiento por línea.
- Badges: `pendiente` ámbar / `imputado` verde / `rechazado_imputacion` rojo.
- **Scanner CUT** (nuevo componente): input con autofocus + botón "Escanear QR" (usa `html5-qrcode`). Al escanear/pegar el CUT, abre modal con los datos del pago + botón "Confirmar trámite" o "Imputar ahora".

---

### FASE 2 — Providers reales con modelo Marketplace / Split Payment

**Objetivo:** reemplazar el mock PayBridge por MP/MODO donde **cada muni tiene su propio Access Token** y la plata va directo a su cuenta. Munify nunca toca fondos.

#### Datos — agregar a `MunicipioProveedorPago`
- `access_token_encriptado: Text nullable` — Fernet con key en env.
- `public_key: String(200) nullable`
- `webhook_secret: String(100) nullable`
- `cuit_cobranza: String(11) nullable` — visible en comprobante.
- `test_mode: Boolean default true` — con warning grande en UI cuando está en producción.

Nueva tabla `PagoWebhookEvento`:
- `id`, `provider`, `external_id`, `evento`, `payload JSON`, `firma_ok Bool`, `session_id FK`, `procesado_at`, `created_at`.
- Unique constraint `(provider, external_id, evento)` para idempotencia.

#### Backend
- Clases `MercadoPagoProvider` y `ModoProvider` que hereden del contrato actual.
- `crear_sesion` llama API real con el access token del muni (split payment cuando aplique).
- **Webhook endpoint**: `POST /pagos/webhook/{provider}/{municipio_id}`:
  - Valida firma HMAC con `webhook_secret` del muni.
  - Registra `PagoWebhookEvento` SIEMPRE (aun con firma inválida — para debug).
  - Si firma OK y evento es pago aprobado → marca Deuda/Solicitud + crea `Pago` + dispara notif WhatsApp al vecino (ver F7).
  - Responde 200 < 1s; procesa asíncrono si hace falta.
- `get_provider(municipio_id)` pasa a ser por muni (lee `MunicipioProveedorPago` activo).
- **Jobs cron**:
  - Expirar sesiones `pending/in_checkout` con `expires_at < now` cada 5 min.
  - Reconciliación: sesiones `approved` sin webhook confirmado (o al revés) — consultar provider con `external_id`.

#### Frontend
- En `ProveedoresPago.tsx`:
  - Modal "Conectar con Mercado Pago" con campos access_token, public_key, cuit.
  - Botón "Probar credenciales" que hace llamada de prueba.
  - Toggle `test_mode` con warning cuando está en producción.
  - Mostrar CUIT receptor en cada proveedor activo.
- En `PayBridgeCheckout.tsx`:
  - Si `provider != "mock"`, redirigir al `init_point` real.
  - Página "Procesando pago" con polling de `GET /pagos/sesiones/{id}` cada 2s (timeout 60s).

#### Riesgos
- **Idempotencia webhook** vía unique constraint.
- **Custodia de fondos**: confirmar con cada muni que el CUIT receptor es suyo directo. Munify nunca como intermediario (problema fiscal).
- **Timeouts**: crear sesión local en PENDING primero; llamar a MP en background.

---

### FASE 3 — CENAT adjunto para licencias de conducir

**Objetivo:** cubrir el caso licencia completo. El legajo llega con tasa municipal pagada + CENAT adjunto antes de que el vecino se presente.

#### Datos
- Agregar a `Tramite`:
  - `requiere_cenat: Boolean default false`
  - `monto_cenat_referencia: Numeric(10,2) nullable` — informativo, no se cobra.
- Nuevo tipo de `DocumentoSolicitud`: `COMPROBANTE_CENAT`.

#### Backend
- Endpoint crear/confirmar solicitud: si `tramite.requiere_cenat` y no hay doc CENAT, rechazar con mensaje claro.
- `POST /tramites/solicitudes/{id}/cenat` — sube archivo post-creación (caso común: tasa municipal ya pagada, CENAT se paga después).
- OCR opcional (Fase 3.5): leer nº comprobante CENAT y guardarlo en `DocumentoSolicitud.metadatos`.

#### Frontend
- Wizard `NuevoTramite` con trámites `requiere_cenat`:
  - Banner info con explicación + link al sitio oficial ANSV.
  - Botón "Adjuntar CENAT" drag&drop (PDF/JPG/PNG).
  - Panel IA con tip sobre qué es el CENAT y dónde pagarlo.
- Detalle de solicitud (vista supervisor/vecino): sección "Documentación" con ✅ Tasa / ✅ CENAT / ⚠️ Falta.
- `TramitesConfig.tsx`: toggle + monto referencia.

---

### FASE 4 — Motor de plantillas batch (Export RAFAM y otros)

**Objetivo:** hacer la conciliación de 5 minutos. Este es el argumento comercial duro.

#### Datos
- Nueva tabla `MunicipioFormatoExport`:
  - `municipio_id`, `formato` (`rafam_ba`, `csv_generico`, `xls_contaduria`, `txt_custom`), `config JSON` (mapeo rubros, columnas custom, ancho de fila, encoding).
- Nueva tabla `ExportacionImputacion`:
  - `id`, `municipio_id`, `fecha_desde`, `fecha_hasta`, `formato`, `session_ids JSON`, `archivo_path`, `generado_por_usuario_id`, `created_at`.

#### Backend
- `GET /pagos/contaduria/imputacion/export` — genera y devuelve stream.
- Servicio `backend/services/exports_contables.py`:
  - `generar_rafam_ba(sesiones) -> bytes` (TXT ancho fijo layout Prov. BA)
  - `generar_csv_generico(sesiones)` — reemplaza lo actual.
  - `generar_xls_contaduria(sesiones)` — xlsx con estilo y totales.
- Exportar NO marca como imputado automáticamente — queda el registro en `ExportacionImputacion` y el funcionario confirma con bulk-marcar (F1).
- **Proceso Conciliación Diaria automático**: cron que genera el archivo del día anterior y lo deja disponible en la sección de exports (opt-in por muni).
- `GET/PUT /pagos/contaduria/formato-export` — admin muni edita mapeo `tipo_tasa → código_rubro`.

#### Frontend
- En Cola de Imputación, botón "Exportar para RAFAM" con dropdown formato + rango + modal "¿Marcar N como imputados?".
- Pantalla config formato en Ajustes > Contaduría: tabla key-value editable.
- Pestaña "Exports" en Contaduría: historial de `ExportacionImputacion` con re-download.

#### Caveat
Layout RAFAM real tiene que pedirlo Chacabuco. Sin specs, cualquier esfuerzo es adivinanza — dejar F4 bloqueada hasta que llegue el muestra de archivo.

---

### FASE 5 — KYC Didit como credencial de confianza

**Objetivo:** que la biometría sea visible como badge y condicionante de trámites sensibles.

#### Datos
- Agregar a `User`:
  - `kyc_verificado_at: DateTime nullable`
  - `kyc_provider: String(40)` — "didit"
  - `kyc_session_id: String(100) nullable`
  - `kyc_nivel: Enum("basico", "completo") nullable`
  - **`kyc_modo: Enum("self_service", "assisted") nullable`** — clave para distinguir vecino app vs vecino en ventanilla.
  - `kyc_operador_id: FK usuarios nullable` — quién validó presencialmente (si modo = assisted).
- Agregar a `Tramite`:
  - `requiere_kyc: Boolean default false`
  - `nivel_kyc_minimo: Enum nullable`

#### Backend
- Callback Didit: al aprobar, setear campos `kyc_*` en User.
- Middleware para trámites con `requiere_kyc`: 403 + link a re-verificar si el user no cumple.
- `POST /users/me/kyc/iniciar` — subir nivel KYC de un user existente.
- `POST /users/{user_id}/kyc/presencial` — solo rol OPERADOR_VENTANILLA (ver F6). Dispara Didit desde la consola del operador y graba `kyc_modo = assisted` + `kyc_operador_id`.

#### Frontend
- Badge "✅ Verificado" + tooltip con modo (self-service/assisted) en perfil del vecino.
- En detalle trámite/reclamo (vista supervisor): badge KYC del solicitante.
- `TramitesConfig.tsx`: toggle + nivel.
- Wizard trámite: si `requiere_kyc` y user no cumple → banner con CTA.

---

### FASE 6 — Operador de Ventanilla (Modo Kiosco)

**Objetivo:** que el adulto mayor pueda hacer el trámite con la ayuda de una empleada municipal, manteniendo la integridad del sistema. **Este es el corazón de la venta omnicanal.**

#### Datos
- Agregar a `RolUsuario`:
  - `OPERADOR_VENTANILLA = "operador_ventanilla"` (también permite mantener EMPLEADO legacy).
- Nueva tabla `SolicitudCanal` (o agregar columnas a `Solicitud` / `PagoSesion`):
  - `canal: Enum("app", "ventanilla_asistida", "web_publica", "whatsapp")` — default `"app"`.
  - `operador_user_id: FK usuarios nullable` — solo si canal = ventanilla_asistida.
  - `validacion_presencial_at: DateTime nullable`.
  - `dj_validacion_presencial: Text nullable` — texto de la DJ firmada.
- Misma data en `PagoSesion` (así la contaduría puede filtrar por canal).
- Agregar a `Reclamo` el mismo set (por simetría, permite que el operador inicie reclamos en nombre del vecino).

#### Backend
- Nuevos endpoints bajo `/operador`:
  - `POST /operador/tramite-presencial/iniciar` — body `{ dni, nombre, telefono_whatsapp, tramite_id }`.
    - Busca/crea User con `kyc_modo = assisted (pendiente)`.
    - Crea Solicitud con `canal = ventanilla_asistida`, `operador_user_id = current_user.id`.
    - Devuelve `{ solicitud_id, user_id, sesion_biometrica_id }`.
  - `POST /operador/tramite-presencial/{id}/biometria-ok` — después de que la webcam-DIGIT aprobó.
  - `POST /operador/tramite-presencial/{id}/dj-firmada` — body `{ texto_dj, firma_base64?, firma_checkbox_bool }`.
  - `POST /operador/tramite-presencial/{id}/generar-link-pago` — crea `PagoSesion` (igual que el flujo normal) y devuelve `{ checkout_url, qr_base64, cut }` para que el operador muestre el QR/link.
  - `POST /operador/tramite-presencial/{id}/enviar-whatsapp` — dispara el puente (F7).
  - Permisos: todos bloqueados salvo `rol == OPERADOR_VENTANILLA` + muni del operador == muni del trámite.

#### Frontend — nueva sección "Mostrador" en el dashboard
Rutas nuevas bajo `/mostrador`:

1. **`/mostrador/inicio`** — home del operador con 3 botones grandes: "Nuevo trámite presencial", "Buscar trámite por CUT", "Cola del día".
2. **`/mostrador/nuevo-tramite`** — wizard de 5 pasos:
   - Paso 1 **Datos del vecino**: DNI + nombre (si ya existe, lo precarga) + teléfono para WhatsApp.
   - Paso 2 **Biometría**: modal con webcam local (`navigator.mediaDevices.getUserMedia`) → captura → llama al SDK DIGIT → vuelve con resultado. Estado visual "Validando..." → "✅ Validado contra RENAPER".
   - Paso 3 **Trámite**: selector del catálogo (solo los del muni) + precarga de monto desde `Tramite.costo`.
   - Paso 4 **Documentación**: drag&drop de PDFs/fotos. Si `requiere_cenat`, banner obligatorio. Permite sacar foto con la webcam de cada hoja (useful para papeles que el vecino trajo).
   - Paso 5 **Pago + DJ**:
     - Checkbox "Declaro que realicé la validación presencial frente al vecino" (DJ).
     - 3 opciones lado a lado:
       - **Mostrar QR en pantalla**: renderiza QR grande + CUT, para que el vecino lo escanee desde su celu.
       - **Enviar por WhatsApp**: input con teléfono, botón "Enviar link" (F7).
       - **Pago en efectivo**: botón que genera boleta con código de barras (F8) + luego permite subir foto del ticket de pago.
   - Panel lateral: resumen del trámite en tiempo real + dependencia encargada + CUT una vez aprobado.
3. **`/mostrador/buscar-cut`** — input grande con autofocus para tipear/escanear CUT → trae todos los datos del pago para verificar.
4. **`/mostrador/cola`** — trámites del día iniciados por este operador, filtro por estado.

#### UX — consideraciones de hardware
- Targets de click grandes (operador con prisa).
- Webcam preview a tamaño confortable (no mini).
- Fuentes legibles sin zoom en monitores 1280x1024.
- El SDK DIGIT tiene que tener fallback: si la webcam no funciona, permitir subir foto de DNI + selfie.

#### Testing
- Un operador crea trámite para un vecino nuevo → se crea User + Solicitud + kyc pendiente.
- Biometría aprueba → user queda `kyc_modo = assisted`.
- Genera QR → el vecino paga desde otro device → webhook marca approved → operador ve "Pago recibido ✅" en tiempo real (polling / SSE).
- El mismo trámite aparece en la Cola de Imputación (F1) con `canal = ventanilla_asistida` y `operador_user_id` rastreable.

---

### FASE 7 — Puente WhatsApp para pagos asistidos

**Objetivo:** que el operador mande el link de pago al vecino (o a un familiar acompañante) desde el mismo dashboard, sin cambiar de herramienta.

#### Reutilización
`whatsapp.py` + `whatsapp_config.py` ya existen. Solo hay que agregar templates y endpoints nuevos.

#### Backend
- Nuevos templates WhatsApp:
  - `pago_link_tramite` — "Hola {nombre}, la Municipalidad de {muni} inició tu trámite de {tramite}. Pagá acá: {checkout_url}. Tu código: {cut}".
  - `pago_confirmado` — "✅ Recibimos tu pago de ${monto} por {tramite}. Comprobante: {cut}".
  - `pago_pendiente_ventanilla` — "Hola {nombre}, tu trámite {cut} está iniciado. Cuando pagues te avisamos."
- Endpoints:
  - `POST /operador/tramite-presencial/{id}/enviar-whatsapp` — manda `pago_link_tramite`.
  - Hook en el flujo de webhook de pago (F2): al aprobar, si la solicitud tiene `canal = ventanilla_asistida` O `telefono_whatsapp` registrado, manda `pago_confirmado`.
- Logs en `WhatsAppLog` ya existente.

#### Frontend
- En el paso 5 del wizard mostrador: al tocar "Enviar por WhatsApp", toast + polling del estado de entrega (enviado/recibido/leído).
- En el historial de una Solicitud: ver qué mensajes WhatsApp se enviaron y cuándo.

#### Riesgo
- **Costos Meta WhatsApp**: cada template message cuesta. Confirmar con el muni quién paga (Munify absorbe o se factura).
- **Templates aprobados**: Meta exige aprobación previa de templates en producción. Arrancar con templates ya aprobados si hay, sino pedir approval con 2-3 días de margen.

---

### FASE 8 — Pago en efectivo / caja del municipio con comprobante

**Objetivo:** resolver el caso del vecino que solo tiene efectivo y quiere pagar en la caja del palacio municipal o en Rapipago.

#### Datos
Agregar `MedioPagoGateway`:
- `EFECTIVO_VENTANILLA = "efectivo_ventanilla"` — caja física del muni.
- Ya existe `EFECTIVO_CUPON` para Rapipago/Pago Fácil.

Agregar a `Pago`:
- `foto_comprobante_url: String nullable` — S3/disco del ticket.
- `registrado_por_operador_id: FK usuarios nullable`.

#### Backend
- `POST /operador/pagos/efectivo/registrar` — body `{ solicitud_id, monto, numero_comprobante, foto_base64 }`.
  - Crea `PagoSesion` con `estado = APPROVED` directo + `medio_pago = EFECTIVO_VENTANILLA` + `provider = "caja_muni"`.
  - Crea `Pago` con `foto_comprobante_url` + `registrado_por_operador_id`.
  - Entra al flujo normal de imputación (F1).
  - Permisos: solo OPERADOR_VENTANILLA.
- `POST /pagos/boleta-codigo-barras/{session_id}` — genera PDF de boleta con código de barras (formato OSIRIS / Pago Fácil / Rapipago) descargable para imprimir.

#### Frontend
- Paso 5 wizard mostrador, opción "Pago en efectivo":
  - Modal con dos subopciones:
    - **"Genero boleta para pagar en Rapipago/Pago Fácil"** → genera PDF, imprime, vecino va y paga. El muni espera el volcado del cobrador externo (no nos avisa el provider — el operador tiene que cerrar el trámite manualmente cuando el vecino vuelva con el ticket).
    - **"El vecino paga ahora en la caja municipal"** → input nº comprobante + upload foto del ticket + botón confirmar.
- En Cola de Imputación (F1): los pagos en efectivo aparecen con badge ⚠️ distinto para contaduría.

#### Nota
Este flujo tiene riesgo de "acepté efectivo fantasma" — auditoría muy importante: toda acción queda con `registrado_por_operador_id` y timestamp.

---

### FASE 9 — Dashboard omnicanal (métricas por canal)

**Objetivo:** pantalla que le vende al intendente. "60 por App, 40 por Ventanilla".

#### Backend
- `GET /pagos/contaduria/metricas-canal` — params `desde/hasta`, devuelve:
  ```json
  {
    "por_canal": [
      { "canal": "app", "cantidad": 60, "monto": "480000.00" },
      { "canal": "ventanilla_asistida", "cantidad": 40, "monto": "320000.00" },
      { "canal": "whatsapp", "cantidad": 12, "monto": "96000.00" }
    ],
    "serie_temporal": [ ... día a día ... ],
    "por_operador": [ { "operador": "María G.", "tramites": 40, "monto": "320000.00" } ]
  }
  ```

#### Frontend
- Nueva pestaña "Dashboard" en Contaduría / o bloque en Tablero principal:
  - Donut "Canal de cobro" (app vs ventanilla vs whatsapp).
  - Línea temporal pagos/día por canal.
  - Ranking operadores de ventanilla (top 5 por trámites gestionados).
  - Stat cards: total hoy / total mes / ticket promedio por canal.

---

## 4. Tabla consolidada de migraciones

| Tabla | Columnas / Cambio | Fase |
|---|---|---|
| `pago_sesiones` | `imputacion_estado`, `imputado_at`, `imputado_por_usuario_id`, `imputacion_observacion`, `imputacion_referencia_externa`, `codigo_cut_qr`, `canal`, `operador_user_id` | 1, 6 |
| `municipio_proveedores_pago` | `access_token_encriptado`, `public_key`, `webhook_secret`, `cuit_cobranza`, `test_mode` | 2 |
| `pago_webhook_eventos` | tabla nueva | 2 |
| `tramites` | `requiere_cenat`, `monto_cenat_referencia`, `requiere_kyc`, `nivel_kyc_minimo` | 3, 5 |
| `municipio_formato_export` | tabla nueva | 4 |
| `exportaciones_imputacion` | tabla nueva | 4 |
| `usuarios` | `kyc_verificado_at`, `kyc_provider`, `kyc_session_id`, `kyc_nivel`, `kyc_modo`, `kyc_operador_id` | 5 |
| `RolUsuario` enum | agregar `OPERADOR_VENTANILLA` | 6 |
| `solicitudes` | `canal`, `operador_user_id`, `validacion_presencial_at`, `dj_validacion_presencial` | 6 |
| `reclamos` | mismas columnas de canal (opcional) | 6 |
| `medio_pago_gateway` enum | agregar `EFECTIVO_VENTANILLA` | 8 |
| `pagos` | `foto_comprobante_url`, `registrado_por_operador_id` | 8 |

Todas con SQLAlchemy async según `CLAUDE.md` (sin preguntar).

---

## 5. Orden de trabajo recomendado

Priorizo por valor de venta × bajo riesgo técnico:

| Semana | Fases | Por qué |
|---|---|---|
| **1-2** | F1 (imputación + CUT) + F5 (KYC visible) | Mejoras puras sobre lo existente, cero integración externa, demoables ya. |
| **2-3** | F6 (Operador Ventanilla) + F3 (CENAT) | Son los diferenciales comerciales. F6 es el gancho para vender al muni chico. F3 completa licencias. |
| **3-4** | F7 (WhatsApp) + F9 (Dashboard omnicanal) | Reutilizan módulos existentes, dan el "wow factor" al intendente. |
| **4-5** | F8 (efectivo) + F4 (export RAFAM) | F8 es simple pero necesita auditoría cuidadosa. F4 está bloqueada hasta tener el layout real. |
| **5-7** | F2 (providers reales Marketplace) | La más delicada por custodia de fondos, firma webhook, test exhaustivo sandbox y producción. Arrancar con MP (doc pública accesible), MODO después. |

F2 queda al final no porque sea menos importante, sino porque **puede demoarse con el mock** mientras se firman convenios con los munis. La plata real puede esperar 4 semanas sin bloquear el pitch.

---

## 6. Criterios de "listo para vender"

- [ ] Un vecino paga una tasa con MP real y la plata cae en la cuenta del muni (F2).
- [ ] El webhook de MP actualiza el estado en Munify en < 5s (F2).
- [ ] El funcionario de contaduría ve la cola de pendientes de imputar (F1).
- [ ] El funcionario exporta un TXT RAFAM que carga en su sistema sin editarlo (F4).
- [ ] El funcionario bulk-imputa y queda registrado con audit trail (F1).
- [ ] Vecino saca licencia: paga tasa municipal + adjunta CENAT (F3).
- [ ] Vecino verificado biométricamente con badge visible (F5).
- [ ] **Adulta mayor va a ventanilla, la empleada hace todo desde el dashboard, manda link WhatsApp al hijo, el hijo paga desde otro lado y el trámite queda cerrado (F6 + F7).**
- [ ] **El vecino paga en efectivo en la caja del muni y queda en el sistema con foto del ticket (F8).**
- [ ] El intendente ve el dashboard "60 App / 40 Ventanilla" (F9).
- [ ] Si MP falla, UX clara para reintento (F2).
- [ ] Si webhook se pierde, reconciliación lo levanta (F2).
- [ ] Audit trail completo: quién pagó, cuándo, medio, canal, operador (si aplica), quién imputó, referencia externa.

---

## 7. Open questions — confirmar con el negocio

- **Comisión provider**: ¿muni absorbe ~6% MP o se la pasa al vecino como recargo? Afecta `monto`.
- **Layout RAFAM exacto**: Chacabuco tiene que pasar archivo muestra. Bloquea F4.
- **WhatsApp Business costos**: ¿quién paga los template messages? ¿Munify los absorbe hasta X/mes?
- **Plan de pagos / cuotas**: `EstadoDeuda.EN_PLAN_PAGO` existe pero sin UI. ¿Entra al scope o queda para después?
- **Refunds / contracargos**: MP puede revertir hasta 180 días. ¿Qué pasa con un pago ya imputado en RAFAM que después se revierte? Mínimo: alerta fuerte al funcionario.
- **SDK DIGIT en webcam de la consola**: confirmar que el SDK soporta modo web no-mobile. Alternativa: seguir usando Didit hosted (funciona en el browser del operador igual, solo cambia el UX).
- **"Usuario Representante" — validez legal**: consultar con abogado del muni. La DJ + audit trail del operador ¿alcanza o hace falta firma digital tipo AFIRMA?
- **Pago en caja física del muni (F8)**: ¿la caja tiene posnet de MP/MODO para que se registre solo, o sigue siendo carga manual del operador?
- **KYC obligatorio para trámites sensibles**: criterio editable por muni vs criterio único Munify.
- **Dashboard omnicanal (F9)**: ¿muestra reclamos también o solo pagos? (La charla se centra en pagos.)

---

## 8. Fuera de scope explícito

- No tocamos motor de reclamos (salvo agregar `canal` si se decide — ver F6).
- No refactoreamos navegación salvo agregar sección "Mostrador" para el operador.
- No integración directa RAFAM vía API — seguimos con export batch.
- No integración directa SID-RENAPER — seguimos con Didit como abstracción.
- No "Agente Local" que se pegue al SQL Server del muni para leer deuda en tiempo real — sigue el modelo de ingesta CSV/padrón que ya existe.
- No Mi Argentina / Autenticar como SSO — queda para una futura Fase 10 si algún muni lo pide.
- No billetera propia Munify — los fondos van directo al muni siempre.
- No facturación electrónica AFIP desde Munify — el muni lo hace en su sistema.

---

## 9. Riesgos cruzados

| Riesgo | Mitigación |
|---|---|
| Meta rechaza templates WhatsApp | Tener templates aprobados desde semana 1, sandbox numbers para dev. |
| Didit no soporta webcam del operador bien | Fallback: Didit hosted en nueva pestaña del browser del operador. |
| Layout RAFAM complicado más de lo previsto | F4 en paralelo con un muni piloto; empezar con XLS simple y migrar. |
| Fraude en pago efectivo (F8) | Obligatorio foto ticket + nº comprobante + auditoría. Revisión cruzada de contaduría con extracto banco. |
| Operador se va del muni con datos en la máquina | Todo queda en el servidor; la consola web no persiste nada local. Logs de sesión. |
| Vecino mayor desconfía de la webcam | UX con captura previa + botón "mostrar al vecino" antes de enviar a Didit. Consentimiento explícito. |
| Muni cambia el Access Token MP y olvida actualizarlo | Healthcheck cron de credenciales + alerta in-app. |
