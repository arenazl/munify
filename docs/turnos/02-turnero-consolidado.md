# Turnero consolidado — trámites + instancias + agenda como UNA unidad

**PROPUESTA de diseño (fase C) — 2026-07-02 · pendiente de validación final.**
Nace del requerimiento del dueño: *"la mayoría de los trámites se hacen por
ventanilla; esto va a funcionar más como un turnero que como seguimiento de
expedientes; que la creación del trámite, las altas de instancias y el turnero
por departamento funcionen como una unidad, para el vecino y para el municipio"*.

## Lo que dijo el análisis (resumen, datos verificados 2026-07-02)

- **Uso real = CERO**: 618 solicitudes casi todas de munis demo (las 8 del
  cliente real son un seed), **1 solo turno en toda la BD**, `requiere_turno=0`
  en los 644 trámites del catálogo, **0 agendas configuradas** (todo corre en el
  fallback hardcodeado lun-vie 08:30-13:00). ⇒ Rediseño libre, sin migración.
- **El flujo está invertido**: reservar turno EXIGE crear un expediente antes
  (12-14 clicks cruzando 2 módulos que no se conectan). El bot de WhatsApp ya
  tiene el flujo correcto (turno directo sin expediente).
- **Motor de agenda sólido** (se reusa entero): slots on-the-fly, cupos por
  franja, horario partido, feriados/excepciones, lock anti-race.
- **5 capacidades de turnero NO existen**: recordatorios (no hay scheduler),
  comprobante/notificación del turno, reportes (demanda, ausentismo), gestión
  de no-show, elección de sede.
- **Bugs a corregir sí o sí** (previos a todo): un vecino puede cancelar turnos
  AJENOS (PATCH/DELETE sin ownership); la agenda del staff no devuelve ni nombre
  ni trámite (el operador ve "Vecino" genérico); solapamiento entre trámites de
  duración distinta (ocupación por igualdad exacta de fecha_hora → sobreventa);
  botón "Trámites" del portal público en redirect-loop muerto.

## El modelo: 3 patas, 1 unidad

### Pata 1 — Catálogo de trámites (responsabilidad del MUNICIPIO)
Ya existe la base: template master global sin tenant (`tramites_sugeridos`,
autocomplete al crear) → el muni instancia su trámite custom con prerrequisitos
(`tramite_documentos_requeridos`) y config propia. Lo que FALTA acá:
- **Modo de atención por trámite** (hoy `requiere_turno` es un bool que nadie
  setea ni lee). Propuesta: enum de 3 modos —
  `presencial_con_turno` (el caso mayoritario: requisitos + turno, el trámite
  se hace on-site) / `presencial_sin_turno` (orden de llegada, solo informa
  requisitos) / `online` (expediente digital completo, el flujo actual).
- Exponer en el ABM (`TramitesConfig`): modo, duración del turno, y el mapeo
  **trámite → dependencia(s)** que hoy está sin curar (~65% sin asignar; sin
  esto el turnero no sabe a qué agenda mandar).

### Pata 2 — Instancias (el VECINO o un FUNCIONARIO por él)
La instancia deja de ser "Solicitud obligatoria". La unidad de entrada es la
**atención**: según el modo del trámite, el alta crea un TURNO (con
`tramite_id` FK real, hoy no existe) o un expediente. Dos vías de alta:
1. **Vecino**: app / web pública / WhatsApp (bot ya lo hace). Flujo:
   elegir trámite → ver requisitos POR ADELANTADO → sede (si hay más de una) →
   slot → confirmar con código TRN persistido + comprobante.
2. **Funcionario (kiosco/mostrador)**: mismo flujo con `actuando_como`
   (ya existe para reclamos/trámites; falta conectarlo al turnero).
El expediente (`Solicitud`) se crea DERIVADO: en ventanilla al atender el
turno (el operador lo abre con un click, pre-cargado con los datos del turno),
o directo si el trámite es modo online. Trazabilidad: `turno.solicitud_id`
al revés de hoy — primero turno, después expediente.

### Pata 3 — Turnero por departamento (el MUNICIPIO gestiona)
"Turnero de tránsito, turnero de vialidad": la agenda YA es por dependencia
(alineado). Cada departamento: su agenda semanal, cupos (N ventanillas
paralelas), feriados. Lo que FALTA:
- **Panel de ventanilla útil**: agenda del día con nombre + DNI + trámite +
  requisitos del que viene (hoy imposible: el endpoint no serializa nada de
  eso); buscar por DNI/código TRN; check-in → atendido/ausente.
- **Ciclo de vida**: recordatorio 24h antes (push/WhatsApp — necesita
  scheduler: propuesta Cloud Scheduler → endpoint interno, cero infra nueva),
  confirmación previa, reprogramar.
- **Reportes**: demanda por franja/día, ausentismo por trámite/dependencia,
  turnos vs expedientes abiertos (dimensionar ventanillas con datos).

## Los dos QRs (definido por el dueño, 2026-07-02)

1. **QR dinámico del mostrador** (ya existía): por vecino/sesión, para la
   validación biométrica asistida (`captura_movil`).
2. **QR fijo de cartelería** — **HECHO** (commit `3ae5b1e`): estático,
   imprimible (PNG 1024), se genera desde Configuración→General y apunta a
   `/{codigo}` = acceso directo del municipio (ruta `MunicipioAcceso`,
   validada — `app.munify.com.ar/san-pedro-norte` existe tal como el dueño
   creía). El vecino escanea el cartel y cae en el login/registro de SU
   municipio: reclamo anónimo, registro biométrico, trámites.

## Etapas de implementación propuestas

- **C.0 — HECHO (commit `3ae5b1e`)**: ownership del vecino en PATCH/DELETE,
  tenant en /disponibilidad y /agenda (staff-only), agenda con nombre+DNI+
  trámite (el mostrador ya no ve "Vecino" genérico), solapamiento de
  duraciones por intervalos + lock por dependencia, fix del AttributeError
  de supervisores en /agenda, y fix del redirect-loop del portal.
- **C.1 — HECHO en su núcleo (commit `2f503c6`)**: modo de atención en catálogo
  + ABM (ModernSelect 3 modos + duración); `Turno.tramite_id` y `Turno.usuario_id`
  (migración ejecutada); `POST /reservar-directo` con gating KYC (403
  kyc_insuficiente) y `actuando_como`; `/disponibilidad?tramite_id`;
  ReservarTurnoSheet turno-first con "qué tenés que llevar" por adelantado;
  card "Tomar turno" en el Hub del mostrador (atajo U); gancho de onboarding
  post-validación en CapturaMovil.
  **Restos de C.1 — HECHOS (commits `2f19495` + `62b6a87`)**: catálogo público
  `/app/tramites` (requisitos + modo de atención sin login, el botón Trámites
  del home entra por acá); el wizard ofrece "Sacar turno" al crear una
  solicitud de trámite presencial (deep-link al Sheet); y el mapeo
  trámite→oficina se asigna desde el propio ABM del trámite
  (GET/PUT /tramites/{id}/dependencia) — el curado de datos de cada muni
  sigue siendo tarea del admin, pero ahora tiene la herramienta natural.
- **C.1 CERRADO.**
- **C.2 — núcleo HECHO (commit `1f7656c`)**: confirmación al reservar (in-app +
  push con código TRN), TRN visible en Mis Turnos, y recordatorios de las
  próximas 24hs vía `POST /turnos-tramite/enviar-recordatorios` (idempotente
  por `recordatorio_enviado_at`; auth `X-Cron-Key` vs `CRON_SECRET`).
  **Pendiente de INFRA**: crear el job de Cloud Scheduler (comando documentado
  en el docstring del endpoint) + setear `CRON_SECRET` en Secret Manager.
  **Pendiente de C.2**: reprogramación, comprobante con QR, recordatorio por
  WhatsApp (bot en standby).
- **C.3 — HECHO (commit `d5201f0`)**: check-in en la agenda por nombre/DNI/
  código TRN; "Abrir expediente" desde el turno (levanta el wizard pre-cargado
  actuando por el vecino — cierra turno→atención→expediente); KPIs de 30 días
  (cumplidos, ausentes, % ausentismo) y `GET /turnos-tramite/stats` (demanda
  por trámite/franja/día para dimensionar ventanillas).
  Diferidos hasta que un muni los pida: sobreturnos / lista de espera.

**CRONOGRAMA C.0→C.3: COMPLETO (2026-07-03).** Queda: job de Cloud Scheduler
(pedido a infra con OK explícito del dueño, ver CANAL_AGENTES MSG-20260703-0030-01)
y el curado de datos por muni (mapeos + modo_atencion de cada trámite real).

## Identidad del turno (DEFINIDO por el dueño, 2026-07-02)

Regla de negocio argentina: **los trámites exigen validación biométrica
obligatoria** (Didit: DNI + selfie, ya integrado) — sin eso cualquiera saca
turnos para molestar (ej. licencia de conducir) y quema slots del funcionario;
un email no alcanza. **Reclamos siguen con fricción mínima** ("hay unos pibes
jodiendo en la esquina" tiene que entrar sin barreras).

Diseño resultante — "sin cuenta" NO significa "sin identidad", significa
**sin registro tradicional**:
- La identidad requerida es un **atributo del trámite en el catálogo** (pata 1).
  Ya existe en el modelo (`requiere_kyc` + `nivel_kyc_minimo`) pero hoy gatea
  solo la creación de Solicitud → hay que APLICARLO A LA RESERVA DEL TURNO.
- Flujo vecino: elegir trámite → requisitos → slot → **"validá tu identidad
  para confirmar"** → Didit (30-60 seg) → turno confirmado a nombre verificado.
  La cuenta se crea/toma sola detrás (el registro-por-Didit ya existe, con
  ghost accounts reclamables por DNI). Una sola fricción, no dos.
  Si ya está verificado (nivel 2), confirma directo sin repetir biometría.
- Beneficio para el funcionario: cada turno llega con identidad verificada →
  check-in por DNI real, y los no-shows quedan registrados contra una persona
  (reincidencia penalizable por DNI — anti-abuso de segundo nivel).
- **Bot de WhatsApp — EN STANDBY (definido por el dueño, 2026-07-02)**: todo
  el enganche del bot/tools queda fuera del alcance de la fase C hasta que
  tenga una utilidad clara y esté refinado. Foco: armar bien la aplicación.
  Los endpoints del bot existentes quedan como están (no se rompen ni se
  extienden). Cuando se retome, el diseño previsto es: reservar directo solo
  trámites sin exigencia biométrica; para los demás, pre-reserva con hold del
  slot + link de Didit (se confirma al validar o se libera).
- **Mostrador/kiosco (DEFINIDO por el dueño) — "modo híbrido para gente no
  informatizada"**: SIN webcam en el puesto. El vecino valida la biometría en
  SU celular (su elemento de confianza) vía QR que le muestra el funcionario;
  al completar, el control se TRANSFIERE a la ventanilla por WebSocket y la
  funcionaria le levanta el trámite / le toma el turno actuando por él.
  VERIFICADO que ya existe completo: `captura_movil.py` (QR + WebSocket con
  fallback polling 3s, estados esperando→en_curso→completada) → `Mostrador.tsx`
  toma control con `actuando_como={vecino}` y `kyc_modo='assisted'`, y abre
  reclamo/trámite/tasas desde el Hub.

  **Dos modalidades del kiosco (definidas por el dueño):**
  1. *Ventanilla pura (gente grande / no informatizada)* — **YA IMPLEMENTADA**:
     el QR lleva a la página PÚBLICA `/m/captura/{token}` (sin login, sin app,
     puro navegador): el vecino toca "Comenzar verificación", se saca la foto
     (Didit: selfie + DNI + RENAPER), y el control pasa a la funcionaria, que
     le hace el trámite/turno. El vecino no instala ni registra nada.
  2. *Gancho de onboarding (opcional)* — **NO EXISTE, gap para C.1**: hoy la
     página del celular simplemente se cierra al completar. Falta la pantalla
     post-éxito: "Tu identidad ya quedó validada — ¿querés seguir tus trámites
     desde el celular?" con acceso directo a la PWA (la cuenta verificada YA
     queda creada del lado del sistema; es un magic link / establecer clave,
     no un registro).

  GAPS del mostrador para C.1: botón "Tomar turno" en el Hub + pantalla de
  gancho post-validación (modalidad 2).

## Decisiones abiertas (del dueño)

1. Confirmar el **enum de 3 modos** de atención por trámite (¿o alcanza con turno sí/no?).
2. **¿Multi-sede real?** (una dependencia con más de una dirección de atención) — hoy no existe; si ningún muni lo pide, se difiere.

Diferidas por standby del bot: hold de pre-reserva y verificación biométrica
vía WhatsApp.
