# Munify

**SaaS de gestión municipal multi-tenant para Argentina.** Una sola instancia atiende a N municipios, cada uno aislado. Vecino crea reclamos y trámites desde el celular; el municipio gestiona, asigna cuadrillas y controla sus gastos desde un panel único.

- **App:** https://app.munify.com.ar
- **Landing:** https://munify.com.ar (repo separado en [`landing/`](landing/))

## Módulos

| Módulo | Para quién | Qué hace |
|---|---|---|
| **Reclamos vecinales** | Vecino → Cuadrilla | Wizard de reclamo con IA que clasifica (baches, alumbrado, etc.), asignación con scoring, tablero Kanban, calificación post-resolución |
| **Trámites municipales** | Vecino → Mesa de entradas | Habilitaciones, licencias, libre deuda. Validación biométrica RENAPER para los que requieren identidad oficial |
| **Tesorería** | Intendente / Contador | Reemplaza el Excel del muni: gastos imputados a caja/proyecto/dependencia, cuotas, recurrencia, importador de Excel histórico |
| **Mostrador** | Operador municipal | Atención presencial: genera cupón `wa.me` y lo manda por WhatsApp Web del muni |
| **Cobros / Tasas** | Vecino | Paga tasas con cualquiera de los proveedores configurados |
| **Gestión interna** | Supervisor / Admin | Empleados, cuadrillas, dependencias, ausencias, horarios, planificación semanal |

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind + Leaflet (mapas) |
| Backend | FastAPI + SQLAlchemy 2.0 async + aiomysql + JWT |
| BD | MySQL en Aiven (cloud-managed) |
| IA | Google Gemini (clasificación de reclamos, asistente conversacional) |
| Notificaciones | WhatsApp Cloud API (Meta) + Brevo SMTP + Push (FCM) |
| Storage | Cloudinary (imágenes) |
| Identidad | RENAPER (validación biométrica oficial) |
| Deploy | Netlify (front + landing) + Heroku (backend) |

## Arrancar local

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate   # venv\Scripts\activate en Windows
pip install -r requirements.txt
cp .env.example .env                              # completar con credenciales (DB, JWT, etc.)
uvicorn main:app --reload --port 8002

# Frontend (en otra terminal)
cd frontend
npm install
cp .env.example .env                              # VITE_API_PORT=8002
npm run dev -- --host
```

**Usuarios demo:** `{rol}@{codigo}.demo.com` con password `demo123` (ej: `vecino@merlo.demo.com`, `supervisor@merlo.demo.com`). El frontend arranca en `http://localhost:5173`.

Si quedaron procesos zombies de uvicorn/vite, correr `cleanup.bat` antes.

## Documentación

Toda la doc viva del proyecto está en [`docs/`](docs/). Empezar por:

- **[`docs/README.md`](docs/README.md)** — índice maestro con punteros a todo lo demás.
- **[`BUILD_GUIDE.md`](BUILD_GUIDE.md)** *(en root)* — fuente de verdad de **cómo se construyen las cosas** (componentes, patrones de UI, reglas de ABMs). Lectura obligatoria antes de tocar código.
- **[`CLAUDE.md`](CLAUDE.md)** *(en root)* — reglas duras del proyecto.
- **[`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)** — visión técnica, módulos, multi-tenant, modelo de datos.
- **[`docs/DEPLOY.md`](docs/DEPLOY.md)** — pipeline canónico de deploy.
- **[`docs/TESTING.md`](docs/TESTING.md)** — qué chequear por módulo antes de pushear.

Material histórico (planes ejecutados, refactors en pausa, logs de sesión, ideas sin implementar) vive en [`docs/legacy/`](docs/legacy/) — no es para consulta diaria.

## Licencia

Proyecto privado · Todos los derechos reservados.
