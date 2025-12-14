# DOCUMENTO DE ANÁLISIS

## ⚠️ ANTES DE EMPEZAR: Análisis del README.md

> **OBLIGATORIO:** Este documento se completa DESPUÉS de haber leído y analizado completamente el README.md del proyecto.

### Proceso de Extracción de Entidades del README

1. **Leer el README completo** - No saltear secciones
2. **Identificar TODAS las entidades** mencionadas:
   - Buscar sustantivos que representen "cosas" del sistema
   - Buscar tablas en el README (suelen estar en formato markdown)
   - Buscar secciones "Datos Requeridos", "Entidades", "Modelo de Datos"
   - Buscar listas de campos para cada entidad

3. **Para cada entidad, determinar:**
   - ¿Es una tabla independiente o un enum?
   - **REGLA:** Si tiene más de 2 campos descriptivos → TABLA
   - **REGLA:** Si tiene configuración asociada (tiempos, límites) → TABLA
   - **REGLA:** Si solo es una lista de valores fijos → ENUM

4. **Ejemplo de análisis correcto:**
   ```
   README dice: "Categorías: Alumbrado (5 días normal, 48hs urgente), Bacheo (10 días)..."

   ❌ INCORRECTO: Crear enum CategoriaReclamo
   ✅ CORRECTO: Crear tabla "categorias" con campos:
      - id, nombre, descripcion, ejemplos, tiempo_normal_dias, tiempo_urgente_horas
   ```

---

## 1. Transformación del Requerimiento

### 1.1 Requerimiento Original
```
[Se completa desde el Orquestador]
```

### 1.2 Entidades Identificadas del README

> **INSTRUCCIÓN:** Listar TODAS las entidades encontradas en el README, indicando si serán tabla o enum.

| Entidad | Tipo | Justificación |
|---------|------|---------------|
| Usuario | TABLA | Tiene múltiples campos, roles, relaciones |
| Reclamo | TABLA | Entidad principal con muchos campos |
| Cuadrilla | TABLA | Tiene zona, especialidad, miembros |
| Categoría | TABLA | Tiene tiempos de resolución configurables |
| Zona/Barrio | TABLA | Tiene coordenadas, descripción |
| Estado | ENUM | Lista fija de valores sin configuración |
| ... | ... | ... |

### 1.3 Requerimiento Expandido
```
[El requerimiento original + análisis de mejores prácticas + consideraciones técnicas]
```

---

## 2. Arquitectura del Sistema

### 2.1 Patrón Arquitectónico

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│                    React + TypeScript + Tailwind                        │
│                         (SPA - Netlify)                                 │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ HTTPS/REST
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                     │
│                    FastAPI + SQLAlchemy Async                           │
│                           (Heroku)                                      │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ MySQL Protocol
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             DATABASE                                     │
│                         MySQL (Aiven)                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SERVICIOS EXTERNOS                              │
│              Cloudinary (Media) | AI APIs | Email Service               │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Principios de Diseño

| Principio | Aplicación |
|-----------|------------|
| **Separación de Concerns** | Frontend/Backend/DB completamente separados |
| **API-First** | Backend expone REST API, frontend consume |
| **Multi-tenant** | Aislamiento por `company_id` en todas las entidades |
| **Async by Default** | Backend usa async/await para I/O |
| **Mobile-First** | UI responsiva, diseñada primero para móvil |

---

## 3. Estructura de Carpetas

### 3.1 Backend (FastAPI)

```
backend/
├── api/                    # Endpoints de la API
│   ├── __init__.py
│   ├── auth.py            # Login, registro, refresh token
│   ├── users.py           # CRUD de usuarios
│   ├── projects.py        # CRUD principal del dominio
│   ├── documents.py       # Upload/download de archivos
│   ├── providers.py       # ABM de proveedores/entidades relacionadas
│   └── ai.py              # Integraciones con IA
│
├── core/                   # Configuración central
│   ├── __init__.py
│   ├── config.py          # Settings con Pydantic
│   ├── database.py        # Conexión async a DB
│   ├── security.py        # JWT, hashing, auth
│   └── ai_service.py      # Cliente de APIs de IA
│
├── models/                 # Modelos SQLAlchemy
│   ├── __init__.py
│   ├── base.py            # Base model con campos comunes
│   ├── user.py
│   ├── company.py
│   ├── project.py         # Entidad principal del dominio
│   └── [entidades].py     # Otras entidades del negocio
│
├── schemas/                # Schemas Pydantic
│   ├── __init__.py
│   ├── user.py
│   ├── project.py
│   └── [entidades].py
│
├── services/               # Lógica de negocio (opcional)
│   └── __init__.py
│
├── main.py                 # Entry point de la aplicación
├── requirements.txt        # Dependencias Python
├── Procfile               # Configuración Heroku
└── runtime.txt            # Versión de Python
```

### 3.2 Frontend (React + TypeScript)

```
frontend/
├── public/
│   └── index.html
│
├── src/
│   ├── components/         # Componentes reutilizables
│   │   ├── Layout.tsx     # Layout principal con sidebar
│   │   ├── Navbar.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Modal.tsx
│   │   ├── DataTable.tsx
│   │   ├── FormFields/
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   └── Autocomplete.tsx
│   │   └── [componentes].tsx
│   │
│   ├── pages/              # Páginas/Vistas
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Projects.tsx    # Listado principal
│   │   ├── ProjectDetail.tsx
│   │   ├── [Entidad].tsx   # ABMs
│   │   └── Settings.tsx
│   │
│   ├── services/           # Llamadas a API
│   │   └── api.ts         # Axios instance + endpoints
│   │
│   ├── contexts/           # React Context
│   │   ├── AuthContext.tsx
│   │   └── ThemeContext.tsx
│   │
│   ├── hooks/              # Custom hooks
│   │   ├── useAuth.ts
│   │   └── useApi.ts
│   │
│   ├── types/              # TypeScript types
│   │   └── index.ts
│   │
│   ├── utils/              # Utilidades
│   │   └── helpers.ts
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css          # Tailwind imports
│
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── netlify.toml           # Configuración Netlify
```

---

## 4. Modelo de Base de Datos

### ⚠️ IMPORTANTE: Extraer TODAS las tablas del README

> **INSTRUCCIÓN CRÍTICA:** El diagrama de abajo es solo un EJEMPLO genérico.
> Debes reemplazarlo con las tablas REALES identificadas del README.md del proyecto.

**Proceso obligatorio:**
1. Revisar la sección "1.2 Entidades Identificadas del README" de este documento
2. Crear una tabla por cada entidad marcada como "TABLA"
3. Incluir TODOS los campos mencionados en el README para cada entidad
4. NO simplificar usando enums cuando el README indica campos configurables

### 4.1 Diagrama Entidad-Relación

> **REEMPLAZAR** este diagrama genérico con el específico del proyecto basado en el README.

```
[COMPLETAR: Diagrama con TODAS las entidades del README]

Ejemplo para Sistema de Reclamos (basado en README):

┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    users    │       │  cuadrillas │       │  reclamos   │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id (PK)     │       │ id (PK)     │       │ id (PK)     │
│ email       │       │ nombre      │◄──────│ cuadrilla_id│
│ nombre      │       │ zona        │       │ categoria_id│───┐
│ apellido    │       │ especialidad│       │ creador_id  │   │
│ dni         │       │ telefono    │       │ estado      │   │
│ telefono    │       │ is_active   │       │ descripcion │   │
│ direccion   │       └─────────────┘       │ latitud     │   │
│ role        │                             │ longitud    │   │
│ cuadrilla_id│─────────────────────────────│ fotos (JSON)│   │
└─────────────┘                             └─────────────┘   │
                                                              │
┌─────────────┐       ┌─────────────┐       ┌─────────────┐   │
│ categorias  │       │   zonas     │       │  historial  │   │
├─────────────┤       ├─────────────┤       ├─────────────┤   │
│ id (PK)     │◄──────┤ id (PK)     │       │ id (PK)     │   │
│ nombre      │       │ nombre      │       │ reclamo_id  │───┘
│ descripcion │       │ lat_centro  │       │ usuario_id  │
│ tiempo_norm │       │ lng_centro  │       │ estado_ant  │
│ tiempo_urg  │       │ limites     │       │ estado_nuevo│
│ icono       │       └─────────────┘       │ notas       │
│ color       │                             │ created_at  │
└─────────────┘                             └─────────────┘

┌─────────────┐       ┌─────────────┐
│ documentos  │       │  config     │
├─────────────┤       ├─────────────┤
│ id (PK)     │       │ id (PK)     │
│ entidad_tipo│       │ clave       │
│ entidad_id  │       │ valor       │
│ url         │       │ tipo        │
│ public_id   │       │ grupo       │
└─────────────┘       └─────────────┘
```

### 4.2 Campos Comunes (Base Model)

```python
class BaseModel:
    id: int (PK, auto-increment)
    company_id: int (FK → companies.id)  # Multi-tenancy
    created_at: datetime (default=now)
    updated_at: datetime (on_update=now)
    is_active: bool (default=True)       # Soft delete
```

### 4.3 Convenciones de Naming

| Elemento | Convención | Ejemplo |
|----------|------------|---------|
| Tablas | snake_case, plural | `users`, `projects` |
| Columnas | snake_case | `created_at`, `company_id` |
| PKs | `id` | `id` |
| FKs | `{tabla_singular}_id` | `user_id`, `project_id` |
| Índices | `idx_{tabla}_{columna}` | `idx_users_email` |
| JSON cols | Nombres descriptivos | `settings`, `metadata`, `stages_data` |

---

## 5. API REST

### 5.1 Estructura de Endpoints

```
/api
├── /auth
│   ├── POST /login          # Login con email/password
│   ├── POST /register       # Registro de usuario
│   ├── POST /refresh        # Refresh token
│   └── GET  /me             # Usuario actual
│
├── /users
│   ├── GET    /             # Listar usuarios (admin)
│   ├── GET    /{id}         # Obtener usuario
│   ├── POST   /             # Crear usuario
│   ├── PUT    /{id}         # Actualizar usuario
│   └── DELETE /{id}         # Eliminar usuario
│
├── /projects                 # [Entidad principal]
│   ├── GET    /             # Listar con filtros/paginación
│   ├── GET    /{id}         # Obtener detalle
│   ├── POST   /             # Crear
│   ├── PUT    /{id}         # Actualizar
│   ├── DELETE /{id}         # Eliminar
│   ├── GET    /{id}/timeline # Datos específicos
│   └── GET    /stats        # Estadísticas
│
├── /providers               # [ABM secundario]
│   ├── GET    /             # Listar con search/type
│   ├── GET    /types        # Tipos disponibles
│   ├── POST   /             # Crear
│   ├── PUT    /{id}         # Actualizar
│   └── DELETE /{id}         # Eliminar
│
├── /documents
│   ├── GET    /             # Listar por entidad
│   ├── POST   /upload       # Subir archivo
│   └── DELETE /{id}         # Eliminar archivo
│
└── /ai
    └── POST /analyze        # Análisis con IA
```

### 5.2 Formato de Respuestas

```json
// Éxito - Item único
{
  "id": 1,
  "name": "...",
  "created_at": "2024-01-01T00:00:00Z"
}

// Éxito - Lista
[
  { "id": 1, "name": "..." },
  { "id": 2, "name": "..." }
]

// Error
{
  "detail": "Mensaje de error descriptivo"
}
```

### 5.3 Autenticación

```
Headers:
  Authorization: Bearer <jwt_token>

JWT Payload:
{
  "sub": "user_id",
  "company_id": 1,
  "role": "admin",
  "exp": 1234567890
}
```

---

## 6. Componentes de UI

### 6.1 Layout Principal

```
┌────────────────────────────────────────────────────────────────┐
│  Logo    │  Breadcrumb                    │  User  │  Theme   │
├──────────┼─────────────────────────────────────────────────────┤
│          │                                                     │
│  Nav     │                    Content                          │
│  Item 1  │                                                     │
│  Item 2  │    ┌─────────────────────────────────────────┐     │
│  Item 3  │    │  Cards / Tables / Forms                 │     │
│          │    │                                         │     │
│  ──────  │    │                                         │     │
│          │    │                                         │     │
│  Config  │    └─────────────────────────────────────────┘     │
│          │                                                     │
└──────────┴─────────────────────────────────────────────────────┘
```

### 6.2 Componentes Clave

| Componente | Uso |
|------------|-----|
| `Layout` | Wrapper con sidebar y navbar |
| `DataTable` | Tablas con sort, filter, pagination |
| `Modal` | Diálogos para formularios |
| `Autocomplete` | Búsqueda con sugerencias |
| `FileUpload` | Carga de documentos |
| `StatsCard` | Métricas del dashboard |
| `Timeline` | Visualización de historia/etapas |
| `Toast` | Notificaciones |

### 6.3 Theming

```css
:root {
  --color-primary: #4F46E5;      /* Indigo */
  --color-background: #F9FAFB;   /* Gray 50 */
  --color-card: #FFFFFF;
  --color-text: #111827;         /* Gray 900 */
  --color-text-secondary: #6B7280;
  --color-border: #E5E7EB;
  --color-sidebar: #1F2937;      /* Gray 800 */
}

[data-theme="dark"] {
  --color-background: #111827;
  --color-card: #1F2937;
  --color-text: #F9FAFB;
  --color-text-secondary: #9CA3AF;
  --color-border: #374151;
}
```

---

## 7. Flujos de Usuario

### 7.1 Autenticación

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Login  │────►│  API    │────►│  JWT    │────►│Dashboard│
│  Form   │     │ /login  │     │ Storage │     │  View   │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
```

### 7.2 CRUD Típico

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Listado │────►│  Modal  │────►│  API    │────►│ Refresh │
│  Click  │     │  Form   │     │ POST/PUT│     │ Listado │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
```

---

## 8. Consideraciones de Seguridad

### 8.1 Backend
- [ ] JWT con expiración corta (24h)
- [ ] Validación de company_id en cada query
- [ ] Rate limiting en endpoints sensibles
- [ ] Sanitización de inputs
- [ ] CORS restringido a dominios conocidos
- [ ] Passwords hasheados con bcrypt

### 8.2 Frontend
- [ ] Token en memoria/localStorage seguro
- [ ] No exponer datos sensibles en console
- [ ] Validación de formularios client-side
- [ ] Manejo de sesión expirada

### 8.3 Infraestructura
- [ ] HTTPS everywhere
- [ ] Variables de entorno para secrets
- [ ] DB con SSL habilitado
- [ ] Backups automáticos

---

## 9. Checklist de Análisis Completado

- [ ] Requerimiento transformado y expandido
- [ ] Arquitectura definida
- [ ] Estructura de carpetas documentada
- [ ] Modelo de datos diseñado
- [ ] Endpoints de API listados
- [ ] Componentes UI identificados
- [ ] Flujos de usuario mapeados
- [ ] Seguridad considerada

---

**Siguiente paso:** Continuar con `02_STACK.md` para definir el stack tecnológico exacto.
