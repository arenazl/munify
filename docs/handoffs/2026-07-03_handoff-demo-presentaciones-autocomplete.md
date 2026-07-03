# Handoff completo — demo San Martín, presentaciones y autocomplete (2026-07-03)

> Continúa a `2026-07-02_cierre-dia-turnero-modulos-semilla.md` (turnero, módulos,
> migración us-east4, semilla v1). Este doc consolida TODO lo posterior y es el
> punto de partida para retomar. **Hoy 11:00 ART: demo con Aylén (San Martín).**

## Kit para la demo de hoy (todo EN PRODUCCIÓN)

| Pieza | URL / acceso |
|---|---|
| Crear la demo | `app.munify.com.ar/demo` → tipear "San Mart" → elegir **General San Martín (Buenos Aires)** → Probar ahora (~15 seg) |
| Login admin | `admin@general-san-martin.demo.com` / `demo123` (el código sale limpio, sin sufijo — las viejas fueron borradas) |
| Presentación comercial | `app.munify.com.ar/presentacion?para=San Martín` (18 slides; sin `?para` es genérica). Espacio pausa, flechas navegan, Esc sale |
| Recorrido del producto | botón "Conocé Munify" en `/bienvenido` (16 slides con mockups por pantalla) |
| Momento wow del mostrador | login admin → Mostrador → validación por celular (QR → DNI + selfie del vecino en SU teléfono → control vuelve solo) — **probar 1 vez antes, requiere DNI real y buena luz** |
| QR de cartelería | Configuración → al final: QR a `/{codigo}` con descarga PNG |
| Borrar/recrear demos | X siempre visible en las cards de `/demo` (con confirmación; cascade completo verificado, cero huérfanos) |

## Qué se hizo en esta sesión (post cierre del 02/07)

**Semilla demo v2** (`602f88d`, `f80d58a`) — toda demo nace con:
- Trámites con modos de atención + KYC en licencia + oficinas mapeadas.
- 9-12 turnos: **3 de HOY** (cumplido + 2 reservados), futuros y pasados (stats).
- **agenda_configs por dependencia** (pantalla Horarios con datos: la 1ª oficina
  con horario partido mañana/tarde cupo 3, la última atiende sábados).
- 10 órdenes de trabajo en los 5 estados, vinculadas a reclamos (N:M).
- **Balanceo de reclamos: ninguna dependencia queda en "0 asignados"**
  (Habilitaciones no mapeaba categorías; ahora recibe 2 con título afín).
- 14-16 reclamos con títulos concretos, canales rotativos (omnicanalidad visible).
- Tasas + tesorería completa + 4 flags de módulos ON.
- Verificada creando una demo real por el endpoint y borrándola (script
  `backend/scripts/_test_semilla_demo_completa.py`).

**Presentaciones con MARCA** (`b462486`, `b26fc3d`, `6581de6`):
- `MunifyMark` (logo oficial, paths reales) extraído a `components/ui/` — fuente
  única; úsalo SIEMPRE, nunca un ícono genérico. Tipografía display **Fraunces**
  (se carga on-demand), paleta de `reelBrand.ts`: ink `#0E1830`, navy `#103070`,
  azure `#4070C0`, azul `#5B9BFF`, verde `#1FC591`, gold `#C8A24E`.
- `/presentacion` (`PresentacionMunify.tsx`): 18 slides — hero con logo, slide
  dedicado por `?para=<Municipio>`, problema, qué es, omnicanalidad, engagement
  (WhatsApp + seguimiento + gamificación, mockups de reels), reclamos x2 +
  circuito (timeline que se recorre solo), mapa de calor animado, OTs, identidad
  RENAPER (QR con línea de escaneo y checks en secuencia), turnos + circuito de
  trámites, panel de control, tesorería x2, modular ("10 segundos" count-up), cierre.
- Recorrido `/bienvenido` (`PresentacionLive.tsx`): logo A COLOR sobre navy (chau
  mono gris), acentos de marca (ya no usa el naranja del theme), Fraunces,
  cascadas de entrada en los 16 slides, mockup flotante.
- Landing: header con logo oficial y "Munify" (chau Building2 + "Reclamos Municipales").

**Autocomplete oficial de municipios** (`6581de6`, `8943d67`):
- Tabla local `municipios_argentina` (2.082 munis, dataset georef de
  datos.gob.ar, **carga única ya ejecutada** — script
  `backend/scripts/migrate_municipios_argentina.py`; cero API externa en runtime).
- `GET /municipios/argentina?q=` público (declarado ANTES de `/{municipio_id}`
  para que no lo capture la ruta genérica — gotcha real).
- `/demo`: selección OBLIGATORIA del catálogo (mata "Pepito Pepito"), provincia
  para homónimos (hay 6 "San Martín"), teclado completo (↑/↓/Enter/Esc), iconos,
  resaltado del match, lat/lng directo al crear (saltea Nominatim).
- `crear-demo` acepta `lat/lng/provincia` opcionales.

**Fixes de producción de esta sesión:**
1. `_redirects` seguía apuntando al Cloud Run VIEJO de San Pablo (pisa al
   netlify.toml que infra actualizó) → todo el tráfico iba a la región lenta y
   el autocomplete daba 401. Fix `70da162`. **Gotcha: el proxy real vive en
   `frontend/public/_redirects`, no en netlify.toml.**
2. Interceptor axios: `/demo`, `/presentacion` y `/m/` ahora son páginas
   públicas — un 401 de fondo ya no expulsa al login (`24d832d`).
3. Dropdown: overflow-hidden del card lo recortaba + stacking context del
   backdrop-blur lo dejaba abajo de otra sección (`681e7a4`, `753f360`).
4. X de eliminar demo siempre visible (antes hover-only) (`9cb46c7`).

## Pendientes (sin cambios de prioridad)

1. **Reprogramación de turnos** (mover sin cancelar+recrear) — 1º post-demo.
2. **Política de ausentismo** (límite de no-show).
3. **Análisis de cohesión de Tesorería** — esperando OK de Lucas al barrido
   multi-agente. Incluye: gating backend por flag, doble "Órdenes" en el menú.
4. SPN: 778 gastos dudosos esperan pistas de Bartolo.
5. Flexibilización contaduría por configuración (diseño propuesto).
6. Actualizar `APP_GUIDE/components/` con `MunifyMark`-pattern si se considera
   core (regla del repo: portar mejoras estables en versión agnóstica).

## Cómo retomar
Leer este doc + el del 02/07. La semilla es la fuente de verdad de qué trae una
demo (`backend/services/seed_demo.py` — `seed_demo_completo` + `seed_turnero_demo`
+ pipeline en `api/municipios.py::crear_municipio_demo`). Las demos se crean y
borran ilimitadamente desde `/demo`. Bot/SalesBot sigue en standby. WhatsApp:
sin integración real — el canal de los reclamos es una etiqueta.
