# Arquitectura · Munify

Visión técnica del sistema **a hoy**. Para reglas de cómo construir (componentes, patrones de UI, do/don't) ver [`BUILD_GUIDE.md`](../BUILD_GUIDE.md) en root.

## Qué es Munify

SaaS de gestión municipal **multi-tenant**: una sola instancia atiende a N municipios, cada uno aislado por `municipio_id`. Tres audiencias en una misma plataforma:

| Audiencia | Qué hace |
|---|---|
| **Vecino** | Crea reclamos, inicia trámites, paga tasas, califica resoluciones |
| **Empleado / cuadrilla** | Resuelve reclamos asignados, gestiona trámites |
| **Supervisor / admin / intendente** | Asigna trabajo, ve métricas, controla gastos del municipio |

URLs de producción:
- App: `https://app.munify.com.ar`
- Landing: `https://munify.com.ar` (repo separado en [`landing/`](../landing/))

## Stack

**Backend** (`backend/`, Heroku):
- FastAPI + SQLAlchemy 2.0 async + aiomysql
- MySQL en Aiven (cloud)
- JWT auth, OAuth2 password flow
- Gemini API (clasificación IA de reclamos)
- WhatsApp Cloud API (notificaciones)
- Cloudinary (storage de imágenes)
- Brevo SMTP (transactional email)
- Validación biométrica con RENAPER (identidad oficial de trámites)

**Frontend** (`frontend/`, Netlify):
- React 18 + Vite + TypeScript
- Tailwind CSS + variables CSS para theming (light/dark)
- React Router v6
- Axios para HTTP
- Leaflet + OpenStreetMap (sin Google Maps)
- sonner (toasts), lucide-react (iconos)

**Componentes core agnósticos:** versionados en `d:/Code/APP_GUIDE/components/` — referencia el `CLAUDE.md` global.

## Módulos del producto

### 1. Reclamos vecinales
Vecino reporta problema en vía pública (bache, luminaria, basura, etc.). Wizard de 5 pasos. La IA sugiere categoría a partir de la descripción. El supervisor asigna a empleado/cuadrilla. Estados: `nuevo → asignado → en_proceso → resuelto | rechazado`. Calificación post-resolución, notificaciones por WhatsApp/push.

### 2. Trámites municipales
Habilitaciones, licencias, libre deuda, etc. Wizard guiado. Validación biométrica RENAPER en trámites que requieren identidad oficial. Categorías de trámite son **per-municipio** (ver [`REFACTOR_TRAMITES_PER_MUNICIPIO.md`](REFACTOR_TRAMITES_PER_MUNICIPIO.md)).

### 3. Tesorería (NUEVO)
Reemplaza el Excel del intendente. Cada gasto se imputa a una caja (FOFINDE, FODEMEP, Coparticipación, etc.), un proyecto y una dependencia. Soporta cuotas, recurrencia, financiación, imputación múltiple por proyecto. Importador de Excel histórico.

### 4. Mostrador
Atención presencial: el operador municipal crea solicitudes a nombre del vecino, genera cupón de pago `wa.me` y lo manda por WhatsApp Web del muni.

### 5. Cobros / Tasas
Vecino paga tasas y derechos. Integración con proveedores de pago. Gestión de cuotas y vencimientos.

### 6. Gestión interna
Empleados, cuadrillas, dependencias, ausencias, horarios, planificación semanal de tareas.

## Multi-tenant

Todo dato pertenece a un `municipio_id`. Las queries del backend filtran SIEMPRE por `current_user.municipio_id`. Olvidarse de ese filtro = **leak entre tenants**, regla dura del repo.

Los municipios tienen configuración propia: branding (logo, color primario), módulos activos, categorías de reclamo/trámite, dependencias, plantillas WhatsApp, cuadrillas. El sistema arranca por `/bienvenido` donde el vecino elige su municipio antes de loguearse o seguir como anónimo.

## Roles

Definidos en `backend/models/enums.py` como `RolUsuario`:

| Rol | Permisos |
|---|---|
| `vecino` | Crear reclamos/trámites, ver los propios, calificar, pagar |
| `empleado` / `cuadrilla` | Ver tablero personal, resolver trabajos asignados |
| `supervisor` | + asignar reclamos/trámites, ver métricas |
| `admin` | + gestión de usuarios, categorías, zonas, módulos, config |

## Modelo de datos (entidades core)

Solo las principales — ver `database_schema_ai.json` para el detalle completo.

- **`municipio`** — tenant raíz; tiene branding, módulos activos, dependencias.
- **`usuario`** — pertenece a un municipio, tiene un rol.
- **`reclamo`** — del vecino, con estado, ubicación, fotos, categoría, asignado a cuadrilla.
- **`solicitud_tramite`** — equivalente para trámites administrativos.
- **`gasto`** — gasto del municipio con imputación a caja/proyecto/dependencia.
- **`caja` / `proyecto` / `dependencia`** — taxonomía de Tesorería.
- **`empleado`** — del municipio; pertenece a una o varias cuadrillas.
- **`cuadrilla`** — agrupa empleados; tiene especialidades (categorías de reclamo).
- **`contacto`** — proveedores, empresas, personas físicas para Tesorería.
- **`pago` / `cobro`** — flujos de dinero entrante (cobros del vecino) y saliente (pagos del muni).
- **`historial`** — log inmutable de cambios de estado.
- **`notificacion`** — para feed de notificaciones in-app + push/WhatsApp.

## Endpoints (alto nivel)

Cada módulo es un router en `backend/api/<modulo>.py`. Los principales:

- `auth.py` — login, register, refresh
- `reclamos.py`, `tramites.py`, `gastos.py`, `pagos.py`, `cobros.py`
- `categorias_reclamo.py`, `categorias_tramite.py`, `dependencias.py`, `proyectos.py`, `cajas.py`
- `empleados.py`, `cuadrillas.py`, `contactos.py`
- `dashboard.py`, `analytics.py`, `reportes.py`, `exportar.py`
- `chat.py` — chat IA para landing y para asistente de reclamo
- `whatsapp.py`, `push.py`, `emails.py` — notificaciones
- `portal_publico.py` — endpoints sin auth (stats públicas, clasificación IA pre-login)
- `mock_padron.py`, `nosis_provider.py` — validación de identidad

## Flujo de un reclamo (golden path)

1. Vecino abre app → elige municipio → "Nuevo reclamo".
2. Wizard: describe en lenguaje natural → IA (Gemini) sugiere categoría → elige ubicación en mapa → sube fotos.
3. Backend crea reclamo con `estado=nuevo`, dispara notificación al supervisor.
4. Supervisor en `/gestion/reclamos` asigna a cuadrilla (manual o sugerencia por scoring de especialidad/zona/carga).
5. Estado pasa a `asignado`. Cuadrilla recibe notif.
6. Cuadrilla abre su tablero, marca `en_proceso`, va al lugar, sube foto del trabajo.
7. Marca `resuelto` con descripción. Vecino recibe push/WhatsApp.
8. Vecino califica 1-5 estrellas. Cierre.

## Deploy

Ver [`DEPLOY.md`](DEPLOY.md) — pipeline canónico (`git push` → Netlify/Heroku auto-rebuild, **nunca** `netlify deploy --prod` directo).
