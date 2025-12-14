# DOCUMENTO DE STACK TECNOLÓGICO

## 1. Resumen del Stack

| Capa | Tecnología | Versión |
|------|------------|---------|
| **Frontend** | React + TypeScript | 18.x |
| **Styling** | Tailwind CSS | 3.4.x |
| **Build Tool** | Vite | 5.x |
| **Backend** | FastAPI | 0.104.x |
| **ORM** | SQLAlchemy (Async) | 2.0.x |
| **Database** | MySQL | 8.0 |
| **Auth** | JWT (python-jose) | 3.3.x |
| **File Storage** | Cloudinary | 1.36.x |
| **Hosting Frontend** | Netlify | - |
| **Hosting Backend** | Heroku | - |
| **Hosting Database** | Aiven | - |

---

## 2. Backend - Python/FastAPI

### 2.1 Dependencias Principales

```txt
# requirements.txt

# Framework Web
fastapi==0.104.1
uvicorn[standard]==0.24.0

# Base de Datos
sqlalchemy==2.0.23
aiomysql==0.2.0
pymysql==1.1.0

# Seguridad
cryptography==41.0.7
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
bcrypt==4.0.1

# Validación y Configuración
pydantic==2.5.2
pydantic-settings==2.1.0
python-dotenv==1.0.0
python-multipart==0.0.6
email-validator==2.1.0

# Migraciones
alembic==1.13.0

# HTTP Client
httpx==0.25.2

# File Storage
cloudinary==1.36.0
```

### 2.2 Configuración de FastAPI

```python
# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="API Name",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://tu-app.netlify.app", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir routers
from api import auth, users, projects, documents, providers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(providers.router, prefix="/api/providers", tags=["Providers"])
```

### 2.3 Configuración de Base de Datos

```python
# core/database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = f"mysql+aiomysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # True para debug
    pool_pre_ping=True,
    pool_recycle=300,
)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
```

### 2.4 Configuración de Seguridad

```python
# core/security.py
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext

SECRET_KEY = "tu-secret-key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 horas

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
```

### 2.5 Modelo Base

```python
# models/base.py
from sqlalchemy import Column, Integer, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from core.database import Base

class BaseModel(Base):
    __abstract__ = True

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_active = Column(Boolean, default=True)
```

### 2.6 Archivos de Heroku

```procfile
# Procfile
web: uvicorn main:app --host=0.0.0.0 --port=${PORT:-5000}
```

```txt
# runtime.txt
python-3.11.7
```

---

## 3. Frontend - React/TypeScript

### 3.1 Dependencias Principales

```json
// package.json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "@headlessui/react": "^2.2.0",
    "@heroicons/react": "^2.1.5",
    "axios": "^1.7.7",
    "recharts": "^2.12.7",
    "sonner": "^1.5.0",
    "leaflet": "^1.9.4",
    "react-leaflet": "^4.2.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.45",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.4",
    "vite": "^5.4.3",
    "@types/leaflet": "^1.9.8"
  }
}
```

### 3.2 Configuración de Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
```

### 3.3 Configuración de Tailwind

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        }
      }
    },
  },
  plugins: [],
}
```

### 3.4 Configuración de TypeScript

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### 3.5 Cliente API (Axios)

```typescript
// src/services/api.ts
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para manejar errores
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API Methods
export const authAPI = {
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

export const projectsAPI = {
  list: (params?: object) => api.get('/projects', { params }),
  get: (id: number) => api.get(`/projects/${id}`),
  create: (data: object) => api.post('/projects', data),
  update: (id: number, data: object) => api.put(`/projects/${id}`, data),
  delete: (id: number) => api.delete(`/projects/${id}`),
};

export default api;
```

### 3.6 Configuración Netlify

```toml
# netlify.toml
[build]
  publish = "dist"
  command = "npm run build"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## 4. Base de Datos - MySQL

### 4.1 Configuración de Conexión

```python
# Variables de entorno requeridas
DB_HOST = "mysql-xxxxx.aivencloud.com"
DB_PORT = 23108
DB_NAME = "nombre_db"
DB_USER = "avnadmin"
DB_PASSWORD = "password_seguro"
```

### 4.2 Opciones de Pool

```python
# Configuración recomendada para producción
engine = create_async_engine(
    DATABASE_URL,
    pool_size=5,           # Conexiones en pool
    max_overflow=10,       # Conexiones extra permitidas
    pool_timeout=30,       # Timeout para obtener conexión
    pool_recycle=1800,     # Reciclar conexiones cada 30 min
    pool_pre_ping=True,    # Verificar conexión antes de usar
)
```

### 4.3 Tipos de Datos Comunes

| Python | MySQL | Uso |
|--------|-------|-----|
| `Integer` | `INT` | IDs, contadores |
| `String(255)` | `VARCHAR(255)` | Textos cortos |
| `Text` | `TEXT` | Textos largos |
| `Boolean` | `TINYINT(1)` | Flags |
| `DateTime` | `DATETIME` | Fechas |
| `JSON` | `JSON` | Datos flexibles |
| `Numeric(10,2)` | `DECIMAL(10,2)` | Montos |

---

## 5. Servicios Externos

### 5.1 Cloudinary (File Storage)

```python
# Configuración
import cloudinary
import cloudinary.uploader

cloudinary.config(
    cloud_name="tu_cloud_name",
    api_key="tu_api_key",
    api_secret="tu_api_secret"
)

# Upload
async def upload_file(file: UploadFile) -> str:
    result = cloudinary.uploader.upload(
        file.file,
        folder="uploads",
        resource_type="auto"
    )
    return result["secure_url"]

# Delete
async def delete_file(public_id: str):
    cloudinary.uploader.destroy(public_id)
```

### 5.2 APIs de IA (Opcional)

```python
# core/ai_service.py
import httpx

GROK_API_URL = "https://api.x.ai/v1/chat/completions"
GROK_API_KEY = "tu_api_key"

async def analyze_with_ai(prompt: str) -> str:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            GROK_API_URL,
            headers={
                "Authorization": f"Bearer {GROK_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "grok-beta",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7
            },
            timeout=30.0
        )
        return response.json()["choices"][0]["message"]["content"]
```

### 5.3 Leaflet (Mapas - Gratuito)

> **REGLA:** Cuando cualquier página o componente necesite mostrar un mapa, usar **Leaflet + react-leaflet**. Es gratuito, no requiere API key, y ya está configurado en el proyecto.

Mapas interactivos sin API key usando OpenStreetMap.

```bash
npm install leaflet react-leaflet @types/leaflet
```

```typescript
// components/ui/MapPicker.tsx
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix para iconos en Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface MapPickerProps {
  value?: { lat: number; lng: number } | null;
  onChange?: (coords: { lat: number; lng: number }) => void;
  height?: string;
  readOnly?: boolean;
}

function MapClickHandler({ onSelect }: { onSelect: (c: {lat: number; lng: number}) => void }) {
  useMapEvents({
    click: (e) => onSelect({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

export function MapPicker({ value, onChange, height = '300px', readOnly = false }: MapPickerProps) {
  const [position, setPosition] = useState(value || null);
  const center = position || { lat: -34.6037, lng: -58.3816 }; // Buenos Aires

  const handleSelect = (coords: { lat: number; lng: number }) => {
    if (readOnly) return;
    setPosition(coords);
    onChange?.(coords);
  };

  return (
    <div style={{ height }}>
      <MapContainer center={[center.lat, center.lng]} zoom={13} style={{ height: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
        />
        {!readOnly && <MapClickHandler onSelect={handleSelect} />}
        {position && <Marker position={[position.lat, position.lng]} />}
      </MapContainer>
    </div>
  );
}
```

**Componentes disponibles:**

| Componente | Ubicación | Uso |
|------------|-----------|-----|
| `MapPicker` | `components/ui/MapPicker.tsx` | Selector de ubicación (click para elegir punto) |
| `MapView` | `components/ui/MapPicker.tsx` | Vista de múltiples marcadores |
| Página Mapa | `pages/Mapa.tsx` | Mapa completo de reclamos con marcadores de colores |

**Uso:**
```tsx
// Selector de ubicación (formularios)
<MapPicker
  value={coords}
  onChange={(c) => setCoords(c)}
  height="300px"
/>

// Solo lectura (detalle de reclamo)
<MapPicker value={reclamo.coordenadas} readOnly />

// Vista de múltiples marcadores
<MapView
  markers={[
    { id: 1, lat: -34.6, lng: -58.4, title: "Reclamo 1", color: "#ef4444" },
    { id: 2, lat: -34.61, lng: -58.41, title: "Reclamo 2", color: "#10b981" },
  ]}
  onMarkerClick={(id) => navigate(`/reclamos/${id}`)}
/>
```

**Marcadores de colores por estado:**
```tsx
const STATUS_COLORS: Record<string, string> = {
  pendiente: '#f59e0b',    // Amarillo
  asignado: '#3b82f6',     // Azul
  en_progreso: '#8b5cf6',  // Violeta
  resuelto: '#10b981',     // Verde
  rechazado: '#ef4444',    // Rojo
};

// Crear icono de color
const createColoredIcon = (color: string) => L.divIcon({
  className: 'custom-marker',
  html: `<div style="background-color: ${color}; width: 24px; height: 24px;
    border-radius: 50%; border: 3px solid white;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});
```

---

## 6. Variables de Entorno

### 6.1 Backend (.env)

```env
# App
APP_NAME=MiApp
APP_VERSION=1.0.0
APP_DEBUG=False

# Database
DB_HOST=mysql-xxxxx.aivencloud.com
DB_PORT=23108
DB_NAME=mi_database
DB_USER=avnadmin
DB_PASSWORD=password_seguro

# Security
SECRET_KEY=una-clave-secreta-muy-larga-y-segura
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# CORS
CORS_ORIGINS=["https://mi-app.netlify.app","http://localhost:5173"]

# Cloudinary
CLOUDINARY_CLOUD_NAME=xxxxx
CLOUDINARY_API_KEY=xxxxx
CLOUDINARY_API_SECRET=xxxxx

# AI (opcional)
GROK_API_KEY=xxxxx
```

### 6.2 Frontend (.env)

```env
VITE_API_URL=https://mi-api.herokuapp.com
VITE_APP_NAME=MiApp
```

---

## 7. Herramientas de Desarrollo

### 7.1 Recomendadas

| Herramienta | Uso |
|-------------|-----|
| **VS Code** | IDE principal |
| **Postman/Insomnia** | Testing de API |
| **TablePlus/DBeaver** | Cliente MySQL |
| **Git** | Control de versiones |

### 7.2 Extensiones VS Code

```json
{
  "recommendations": [
    "ms-python.python",
    "ms-python.vscode-pylance",
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint"
  ]
}
```

---

## 8. Scripts de Desarrollo

### 8.1 Backend

```bash
# Instalar dependencias
pip install -r requirements.txt

# Crear base de datos en Aiven (primera vez)
python scripts/create_database.py

# Inicializar tablas y usuario admin
python scripts/init_db.py

# Ejecutar en desarrollo
uvicorn main:app --reload --port 8000

# Ejecutar tests
pytest

# Crear migración
alembic revision --autogenerate -m "descripcion"

# Aplicar migraciones
alembic upgrade head
```

### 8.2 Frontend

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# Build para producción
npm run build

# Preview del build
npm run preview
```

---

## 9. Checklist de Stack

### Backend
- [ ] FastAPI configurado con CORS
- [ ] SQLAlchemy async funcionando
- [ ] JWT auth implementado
- [ ] Endpoints documentados en /docs
- [ ] Cloudinary integrado

### Frontend
- [ ] Vite + React + TypeScript configurado
- [ ] Tailwind funcionando
- [ ] Axios con interceptors
- [ ] Rutas protegidas
- [ ] Tema dark/light

### Database
- [ ] MySQL conectado via Aiven
- [ ] Modelos creados
- [ ] Índices optimizados

---

## 10. Troubleshooting Común

### 10.1 Problema: Enum serialization en SQLAlchemy

**Síntoma:** Login retorna 200 OK pero las llamadas subsiguientes retornan 401. El frontend espera `role: "admin"` pero recibe `role: "ADMIN"`.

**Causa:** SQLAlchemy almacena el **nombre** del enum (ADMIN, VECINO), pero el frontend espera el **valor** del enum (admin, vecino).

**Solución:** Modificar el schema Pydantic para convertir el enum a su valor string:

```python
# schemas/user.py
class UserResponse(UserBase):
    id: int
    role: str  # Cambiar de RolUsuario a str
    is_active: bool
    cuadrilla_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True

    @classmethod
    def model_validate(cls, obj, **kwargs):
        # Convertir el enum a su valor string
        if hasattr(obj, 'role') and hasattr(obj.role, 'value'):
            obj_dict = {
                'id': obj.id,
                'email': obj.email,
                'nombre': obj.nombre,
                'apellido': obj.apellido,
                'telefono': obj.telefono,
                'dni': obj.dni,
                'direccion': obj.direccion,
                'role': obj.role.value,  # Convertir enum a valor
                'is_active': obj.is_active,
                'cuadrilla_id': obj.cuadrilla_id,
                'created_at': obj.created_at,
            }
            return super().model_validate(obj_dict, **kwargs)
        return super().model_validate(obj, **kwargs)
```

### 10.2 Problema: MySQL command not found en Windows

**Síntoma:** MySQL está instalado pero `mysql` no se encuentra en el PATH.

**Solución:** Usar un script Python con pymysql para crear la base de datos:

```python
# scripts/create_database.py
import pymysql

HOST = "mysql-xxxxx.aivencloud.com"
PORT = 23108
USER = "avnadmin"
PASSWORD = "tu_password"
DB_NAME = "nombre_app"

connection = pymysql.connect(
    host=HOST,
    port=PORT,
    user=USER,
    password=PASSWORD,
    ssl={"ssl": True}
)

cursor = connection.cursor()
cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
cursor.close()
connection.close()
```

### 10.3 Problema: JWT subject must be a string

**Síntoma:** `JWTError: Subject must be a string` al decodificar el token.

**Causa:** La librería `python-jose` requiere que el claim `sub` sea una cadena, no un entero.

**Solución:** Convertir el user.id a string al crear el token:

```python
# api/auth.py - INCORRECTO
access_token = create_access_token(data={"sub": user.id})

# api/auth.py - CORRECTO
access_token = create_access_token(data={"sub": str(user.id)})
```

### 10.4 Problema: 401 después de login exitoso

**Pasos de debug:**
1. Verificar que el token se guarda en localStorage
2. Revisar que el interceptor de Axios agrega el header `Authorization: Bearer {token}`
3. Verificar que el backend decodifica correctamente el JWT (ver 10.3)
4. Revisar la serialización de enums (ver 10.1)

### 10.5 Base de datos - Importante

**NUNCA** usar `defaultdb` como nombre de base de datos. **SIEMPRE** crear una base de datos nueva con el nombre de la aplicación:

```bash
# Incorrecto
DB_NAME=defaultdb

# Correcto
DB_NAME=sugerenciasmun
DB_NAME=nombre_de_tu_app
```

### 10.6 Layout con Sidebar - Viewport overflow

**Síntoma:** El sidebar y contenido se ven fuera del viewport, el layout no respeta los límites de la pantalla.

**Causa:** El contenedor principal no usa flexbox correctamente.

**Solución:** Ver **03_LAYOUT.md** para el patrón de Layout completo con flexbox.

### 10.7 CORS - Puerto de desarrollo

**Síntoma:** `Access-Control-Allow-Origin` error cuando el frontend está en puerto diferente (ej: 5174 en vez de 5173).

**Causa:** Vite usa el siguiente puerto disponible si 5173 está ocupado.

**Solución:** Agregar múltiples puertos en CORS_ORIGINS:

```env
CORS_ORIGINS='["http://localhost:5173","http://localhost:5174","http://localhost:3000"]'
```

---

## 11. Sistema de Logging con Rich (Paneles y Colores)

### 11.1 Descripción

Sistema de logging profesional usando la librería **Rich** para logs coloridos con paneles, tablas y formateo profesional. Mejora dramáticamente la legibilidad de los logs del backend.

**Características:**
- Paneles con bordes y colores
- Iconos visuales por nivel (✓, ⚠, ✗, 💀)
- Formateo especial para requests HTTP (colores por método y status)
- Banner de inicio con tabla de URLs
- Tracebacks bonitos con sintaxis resaltada
- Tema personalizable

### 11.2 Dependencia

```txt
# requirements.txt
rich==13.7.0
```

```bash
pip install rich==13.7.0
```

### 11.3 Archivo core/logger.py

```python
# core/logger.py
"""
Sistema de logging con Rich para logs bonitos y coloridos.
Paneles, tablas y formato profesional.
"""
import logging
import sys
from datetime import datetime
from typing import Optional, Any

from rich.console import Console
from rich.logging import RichHandler
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.theme import Theme
from rich.traceback import install as install_rich_traceback
from rich import box

# Instalar traceback bonito de Rich
install_rich_traceback(show_locals=False, width=120)

# Tema personalizado
custom_theme = Theme({
    "info": "cyan",
    "warning": "yellow",
    "error": "bold red",
    "success": "bold green",
    "debug": "dim white",
    "request.get": "bold cyan",
    "request.post": "bold green",
    "request.put": "bold yellow",
    "request.patch": "bold magenta",
    "request.delete": "bold red",
    "status.2xx": "green",
    "status.3xx": "cyan",
    "status.4xx": "yellow",
    "status.5xx": "bold red",
    "db": "bold yellow",
    "auth": "bold cyan",
    "module": "dim cyan",
    "time": "dim white",
})

console = Console(theme=custom_theme, force_terminal=True, color_system="auto")


class RichFormatter(logging.Formatter):
    """Formatter personalizado con Rich."""

    LEVEL_STYLES = {
        logging.DEBUG: ("○", "debug"),
        logging.INFO: ("✓", "success"),
        logging.WARNING: ("⚠", "warning"),
        logging.ERROR: ("✗", "error"),
        logging.CRITICAL: ("💀", "error"),
    }

    def format(self, record):
        icon, style = self.LEVEL_STYLES.get(record.levelno, ("•", "info"))
        timestamp = datetime.now().strftime("%H:%M:%S")
        module = record.name[:15].ljust(15)
        level_name = record.levelname.ljust(8)
        message = record.getMessage()

        return f"[time]{timestamp}[/time] [{style}]{icon}[/{style}] [{style}]{level_name}[/{style}] [module]{module}[/module] {message}"


class RequestLogFilter(logging.Filter):
    """Filtro para formatear logs de requests HTTP de manera bonita."""

    METHOD_STYLES = {
        "GET": "request.get",
        "POST": "request.post",
        "PUT": "request.put",
        "PATCH": "request.patch",
        "DELETE": "request.delete",
    }

    def filter(self, record):
        message = record.getMessage()
        if '"' in message and "HTTP" in message:
            record.msg = self._format_request(message)
            record.args = ()
        return True

    def _format_request(self, message: str) -> str:
        """Formatear línea de request HTTP con colores."""
        try:
            parts = message.split('"')
            if len(parts) >= 2:
                client = parts[0].strip().rstrip(" -")
                request_line = parts[1]
                rest = parts[2].strip() if len(parts) > 2 else ""

                req_parts = request_line.split()
                method = req_parts[0] if req_parts else "?"
                path = req_parts[1] if len(req_parts) > 1 else "?"
                status = rest.split()[0] if rest else "?"

                # Acortar path largo
                if len(path) > 50:
                    path = path[:47] + "..."

                # Estilo según status
                status_style, icon = "status.2xx", "✓"
                if status.startswith("3"):
                    status_style, icon = "status.3xx", "→"
                elif status.startswith("4"):
                    status_style, icon = "status.4xx", "⚠"
                elif status.startswith("5"):
                    status_style, icon = "status.5xx", "✗"

                method_style = self.METHOD_STYLES.get(method, "info")
                timestamp = datetime.now().strftime("%H:%M:%S")

                return (
                    f"[time]{timestamp}[/time] "
                    f"[{status_style}]{icon}[/{status_style}] "
                    f"[{method_style}]{method:7}[/{method_style}] "
                    f"[{status_style}]{status:3}[/{status_style}] "
                    f"{path:52} "
                    f"[dim]{client}[/dim]"
                )
        except Exception:
            pass
        return message


def setup_logging(level: str = "INFO"):
    """Configurar logging con Rich para toda la aplicación."""
    log_level = getattr(logging, level.upper(), logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.handlers.clear()

    # Handler con Rich
    rich_handler = RichHandler(
        console=console,
        show_time=False,
        show_level=False,
        show_path=False,
        markup=True,
        rich_tracebacks=True,
        tracebacks_show_locals=False,
    )
    rich_handler.setLevel(log_level)
    rich_handler.setFormatter(RichFormatter())
    root_logger.addHandler(rich_handler)

    # Configurar uvicorn.access para requests bonitos
    access_logger = logging.getLogger("uvicorn.access")
    access_logger.handlers.clear()
    access_logger.addFilter(RequestLogFilter())
    access_handler = RichHandler(
        console=console,
        show_time=False,
        show_level=False,
        show_path=False,
        markup=True,
    )
    access_logger.addHandler(access_handler)
    access_logger.propagate = False

    # Silenciar loggers ruidosos
    noisy_loggers = [
        "httpx", "httpcore", "sqlalchemy", "sqlalchemy.engine",
        "aiomysql", "asyncio", "uvicorn.error", "watchfiles",
    ]
    for name in noisy_loggers:
        logger = logging.getLogger(name)
        logger.setLevel(logging.CRITICAL)
        logger.handlers = []
        logger.propagate = False

    return root_logger


def get_logger(name: str) -> logging.Logger:
    """Obtener logger para un módulo."""
    return logging.getLogger(name)


def print_startup_banner(app_name: str = "App", version: str = "1.0.0", port: int = 8000):
    """Imprimir banner de inicio bonito con Rich."""
    console.print()

    # Banner principal
    banner_content = Text()
    banner_content.append("🏛️  ", style="bold")
    banner_content.append(app_name, style="bold cyan")
    banner_content.append(f"\n   v{version}", style="dim")

    console.print(Panel(
        banner_content,
        border_style="cyan",
        box=box.DOUBLE,
        padding=(0, 2),
    ))

    console.print()

    # Info de servidor
    info_table = Table(show_header=False, box=None, padding=(0, 2))
    info_table.add_column(style="green")
    info_table.add_column()

    info_table.add_row("✓", f"Server:  [link=http://localhost:{port}]http://localhost:{port}[/link]")
    info_table.add_row("✓", f"API Docs: [link=http://localhost:{port}/docs]http://localhost:{port}/docs[/link]")
    info_table.add_row("✓", f"ReDoc:   [link=http://localhost:{port}/redoc]http://localhost:{port}/redoc[/link]")

    console.print(info_table)
    console.print()
    console.print("[dim]  Press CTRL+C to stop[/dim]")
    console.print()
    console.rule(style="dim")
    console.print()


def print_panel(title: str, content: str, style: str = "cyan"):
    """Mostrar panel con información."""
    console.print(Panel(content, title=f"[bold]{title}[/bold]", border_style=style, padding=(0, 1)))


def print_error_panel(title: str, error: str, details: Optional[str] = None):
    """Mostrar panel de error."""
    content = f"[bold red]{error}[/bold red]"
    if details:
        content += f"\n[dim]{details}[/dim]"
    console.print(Panel(content, title=f"[bold red]✗ {title}[/bold red]", border_style="red", padding=(0, 1)))


def print_success_panel(title: str, message: str):
    """Mostrar panel de éxito."""
    console.print(Panel(f"[green]{message}[/green]", title=f"[bold green]✓ {title}[/bold green]", border_style="green", padding=(0, 1)))
```

### 11.4 Integración en main.py

```python
# main.py
from fastapi import FastAPI
from contextlib import asynccontextmanager

from core.database import init_db
from core.logger import setup_logging, print_startup_banner, get_logger

# Configurar logging con Rich
setup_logging("INFO")
logger = get_logger("main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print_startup_banner("Sistema de Reclamos Municipales", "1.0.0", 8000)
    logger.info("Inicializando base de datos...")
    await init_db()
    logger.info("Base de datos inicializada correctamente")
    yield
    # Shutdown
    logger.info("Cerrando aplicación...")

app = FastAPI(
    title="Sistema de Reclamos Municipales",
    version="1.0.0",
    lifespan=lifespan
)
```

### 11.5 Uso en módulos

```python
# En cualquier archivo del backend
from core.logger import get_logger, print_panel, print_error_panel, print_success_panel

logger = get_logger("api.auth")

# Logs normales con iconos y colores
logger.debug("Verificando token...")           # ○ DEBUG    (gris)
logger.info("Usuario autenticado: admin")      # ✓ INFO     (verde)
logger.warning("Intento de login fallido")     # ⚠ WARNING  (amarillo)
logger.error("Error de conexión a BD")         # ✗ ERROR    (rojo)
logger.critical("Fallo crítico del sistema")   # 💀 CRITICAL (rojo bold)

# Paneles para información importante
print_panel("Configuración", "Puerto: 8000\nHost: localhost", style="blue")
print_success_panel("Base de Datos", "Conexión establecida correctamente")
print_error_panel("Error", "No se pudo conectar", details="Timeout después de 30s")
```

### 11.6 Output de ejemplo

```
╔══════════════════════════════════════════════════════╗
║ 🏛️  Sistema de Reclamos Municipales                  ║
║    v1.0.0                                            ║
╚══════════════════════════════════════════════════════╝

  ✓ Server:   http://localhost:8000
  ✓ API Docs: http://localhost:8000/docs
  ✓ ReDoc:    http://localhost:8000/redoc

  Press CTRL+C to stop

────────────────────────────────────────────────────────

12:30:45 ✓ INFO     main            Inicializando base de datos...
12:30:46 ✓ INFO     main            Base de datos inicializada correctamente

12:30:47 ✓ GET     200 /api/auth/me                                    127.0.0.1
12:30:48 ✓ GET     200 /api/reclamos                                   127.0.0.1
12:30:49 ✓ POST    201 /api/reclamos                                   127.0.0.1
12:30:50 ⚠ PATCH   404 /api/reclamos/999/estado                        127.0.0.1
12:30:51 ✗ GET     500 /api/error                                      127.0.0.1

╭─────────────────── ✗ Error ───────────────────╮
│ No se pudo conectar con el servicio           │
│ Timeout después de 30 segundos                │
╰───────────────────────────────────────────────╯
```

### 11.7 Colores por método HTTP

| Método | Color | Estilo |
|--------|-------|--------|
| GET | Cyan | `request.get` |
| POST | Verde | `request.post` |
| PUT | Amarillo | `request.put` |
| PATCH | Magenta | `request.patch` |
| DELETE | Rojo | `request.delete` |

### 11.8 Colores por status code

| Status | Color | Icono |
|--------|-------|-------|
| 2xx | Verde | ✓ |
| 3xx | Cyan | → |
| 4xx | Amarillo | ⚠ |
| 5xx | Rojo | ✗ |

---

**Siguiente paso:** Continuar con `04_LAYOUT.md` para UI/UX, luego `05_CREDENCIALES.md` para credenciales, y finalmente `06_DEPLOY.md` para el despliegue.
