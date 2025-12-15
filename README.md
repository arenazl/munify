# Sistema de Reclamos Municipales

Sistema multi-tenant para la gestión de reclamos vecinales en municipios.

## Descripción

Plataforma web que permite a los vecinos crear reclamos sobre problemas en la vía pública (baches, luminarias, residuos, etc.) y a los municipios gestionarlos a través de cuadrillas de trabajo.

---

## Arquitectura

```
sugerenciasMun/
├── backend/                 # API REST (FastAPI + SQLAlchemy)
│   ├── api/                 # Endpoints
│   ├── core/                # Config, DB, Security
│   ├── models/              # Modelos SQLAlchemy
│   ├── schemas/             # Pydantic schemas
│   ├── services/            # Lógica de negocio
│   └── main.py              # Entry point
│
├── frontend/                # SPA (React + Vite + Tailwind)
│   ├── src/
│   │   ├── components/      # Componentes reutilizables
│   │   ├── contexts/        # AuthContext, etc.
│   │   ├── pages/           # Páginas/vistas
│   │   ├── lib/             # API client, utils
│   │   └── routes.tsx       # Rutas de la app
│   └── vite.config.ts
│
└── APP_GUIDE/               # Documentación técnica
```

---

## Stack Tecnológico

### Backend
- **FastAPI** - Framework web async
- **SQLAlchemy 2.0** - ORM async
- **MySQL** - Base de datos
- **Pydantic** - Validación de datos
- **JWT** - Autenticación
- **Cloudinary** - Storage de imágenes

### Frontend
- **React 18** - UI library
- **Vite** - Build tool
- **Tailwind CSS** - Estilos
- **shadcn/ui** - Componentes UI
- **Axios** - HTTP client
- **React Router v6** - Routing
- **Leaflet** - Mapas

---

## Modelo de Datos

### Entidades Principales

#### Municipio (multi-tenant)
```
- id, nombre, codigo
- latitud, longitud, radio_km
- logo_url, color_primario
- configuraciones varias
```

#### Usuario
```
- id, email, password_hash
- nombre, apellido, telefono, dni
- rol: vecino | cuadrilla | supervisor | admin
- municipio_id (FK)
- cuadrilla_id (FK, opcional)
```

#### Reclamo
```
- id, titulo, descripcion
- estado: nuevo | asignado | en_proceso | resuelto | rechazado
- prioridad: 1-5 (1=urgente)
- direccion, latitud, longitud
- categoria_id, zona_id, cuadrilla_id
- creador_id, municipio_id
- fecha_programada, hora_inicio, hora_fin
```

#### Categoría
```
- id, nombre, descripcion, icono, color
- tiempo_resolucion_estimado
- prioridad_default
- municipio_id (FK)
```

#### Zona
```
- id, nombre, descripcion
- limites_geojson
- municipio_id (FK)
```

#### Cuadrilla (Empleado)
```
- id, nombre, apellido
- especialidad, capacidad_maxima
- zona_id, municipio_id
- categorias (many-to-many)
```

### Otras Entidades
- **Documento** - Fotos/archivos adjuntos a reclamos
- **Historial** - Log de cambios de estado
- **Notificación** - Alertas para usuarios
- **Calificación** - Rating del vecino post-resolución
- **SLA** - Configuración de tiempos de respuesta
- **Configuración** - Settings por municipio

---

## Roles y Permisos

| Rol | Permisos |
|-----|----------|
| **vecino** | Crear reclamos, ver sus reclamos, calificar |
| **cuadrilla** | Ver tablero de trabajo, cambiar estado a en_proceso/resuelto |
| **supervisor** | Todo de cuadrilla + asignar reclamos, ver dashboard |
| **admin** | Todo + gestión de usuarios, categorías, zonas, config |

---

## Flujo de Estados

```
NUEVO → ASIGNADO → EN_PROCESO → RESUELTO
  │         │
  └─────────┴──────→ RECHAZADO
```

| Transición | Quién puede |
|------------|-------------|
| nuevo → asignado | supervisor, admin |
| asignado → en_proceso | cuadrilla (inicia trabajo) |
| en_proceso → resuelto | cuadrilla (completa trabajo) |
| cualquiera → rechazado | supervisor, admin |

---

## Páginas del Frontend

### Públicas (sin login)
| Ruta | Página | Descripción |
|------|--------|-------------|
| `/bienvenido` | Landing | Selección de municipio |
| `/publico` | DashboardPublico | Estadísticas públicas |
| `/login` | Login | Ingreso empleados |
| `/register` | Register | Registro vecinos |
| `/nuevo-reclamo` | NuevoReclamo | Crear reclamo anónimo |

### Protegidas (requieren login)
| Ruta | Página | Roles |
|------|--------|-------|
| `/` | Dashboard | admin, supervisor |
| `/mi-panel` | DashboardVecino | vecino |
| `/reclamos` | Reclamos | admin, supervisor |
| `/mis-reclamos` | MisReclamos | todos |
| `/mapa` | Mapa | todos |
| `/tablero` | Tablero | admin, supervisor, cuadrilla |
| `/empleados` | Empleados | admin, supervisor |
| `/usuarios` | Usuarios | admin |
| `/categorias` | Categorias | admin |
| `/zonas` | Zonas | admin |
| `/configuracion` | Configuracion | admin |
| `/exportar` | Exportar | admin, supervisor |
| `/sla` | SLA | admin, supervisor |

---

## API Endpoints

### Autenticación
- `POST /api/auth/login` - Login (OAuth2)
- `POST /api/auth/register` - Registro vecino
- `GET /api/auth/me` - Usuario actual

### Reclamos
- `GET /api/reclamos` - Listar (con filtros)
- `POST /api/reclamos` - Crear
- `GET /api/reclamos/{id}` - Detalle
- `PUT /api/reclamos/{id}` - Actualizar
- `POST /api/reclamos/{id}/asignar` - Asignar a cuadrilla
- `POST /api/reclamos/{id}/iniciar` - Marcar en proceso
- `POST /api/reclamos/{id}/resolver` - Marcar resuelto
- `POST /api/reclamos/{id}/rechazar` - Rechazar
- `POST /api/reclamos/{id}/upload` - Subir foto

### Catálogos
- `GET/POST/PUT/DELETE /api/categorias`
- `GET/POST/PUT/DELETE /api/zonas`
- `GET/POST/PUT/DELETE /api/cuadrillas`
- `GET/POST/PUT/DELETE /api/users`

### Dashboard
- `GET /api/dashboard/stats` - Estadísticas generales
- `GET /api/dashboard/por-categoria` - Por categoría
- `GET /api/dashboard/por-zona` - Por zona
- `GET /api/dashboard/tendencia` - Histórico

### Portal Público
- `GET /api/publico/estadisticas` - Stats sin auth
- `GET /api/publico/categorias` - Categorías públicas
- `POST /api/publico/clasificar` - Clasificación IA

### Otros
- `GET /api/municipios/public` - Lista de municipios
- `GET /api/configuracion/{clave}` - Config por clave
- `GET /api/sla/estado-reclamos` - Estado SLA
- `GET /api/exportar/reclamos/csv` - Exportar CSV

---

## Instalación

### Requisitos
- Python 3.10+
- Node.js 18+
- MySQL 8+

### Backend

```bash
cd backend

# Crear entorno virtual
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno
cp .env.example .env
# Editar .env con datos de DB, etc.

# Crear tablas
python -c "from core.database import Base, engine; import asyncio; asyncio.run(Base.metadata.create_all(engine))"

# Cargar datos iniciales
python scripts/init_data.py

# Iniciar servidor
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

### Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# VITE_API_URL=http://localhost:8001/api

# Iniciar servidor de desarrollo
npm run dev -- --host
```

---

## Variables de Entorno

### Backend (.env)
```env
DATABASE_URL=mysql+aiomysql://user:pass@localhost/reclamos_db
SECRET_KEY=tu-secret-key-muy-larga
ENVIRONMENT=development

# Cloudinary (opcional)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# OpenAI (opcional, para clasificación IA)
OPENAI_API_KEY=
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:8001/api
```

---

## Desarrollo en Red Local

Para acceder desde otros dispositivos (celular, otra PC):

1. Backend escuchando en todas las interfaces:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

2. Frontend escuchando en todas las interfaces:
```bash
npm run dev -- --host
```

3. Acceder usando la IP de la máquina:
   - Frontend: `http://192.168.1.X:5173`
   - La API se detecta automáticamente

El sistema detecta el host y configura CORS dinámicamente para IPs en el rango 192.168.x.x.

---

## Usuarios de Prueba

Creados por `init_data.py`:

| Email | Password | Rol |
|-------|----------|-----|
| admin@municipio.gob | 123456 | admin |
| supervisor@municipio.gob | 123456 | supervisor |
| cuadrilla@municipio.gob | 123456 | cuadrilla |
| vecino@test.com | 123456 | vecino |

---

## Características Principales

- **Multi-tenant**: Múltiples municipios en una instancia
- **Geolocalización**: Mapas con ubicación de reclamos
- **Clasificación IA**: Sugerencia automática de categoría (opcional)
- **SLA**: Configuración de tiempos de respuesta
- **Dashboard**: Métricas y estadísticas en tiempo real
- **Exportación**: CSV de reclamos y estadísticas
- **Notificaciones**: Alertas para usuarios
- **Historial**: Log completo de cambios
- **Fotos**: Upload de imágenes antes/después

---

## Licencia

Proyecto privado - Todos los derechos reservados.
