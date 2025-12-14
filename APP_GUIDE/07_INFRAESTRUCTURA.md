# 08 - INFRAESTRUCTURA AVANZADA

Este documento cubre las mejoras de infraestructura implementadas para llevar el proyecto a producción.

---

## 1. Testing con Pytest

### 1.1 Configuración

```txt
# requirements.txt - Agregar
pytest==7.4.0
pytest-asyncio==0.21.0
httpx==0.25.2
```

```ini
# backend/pytest.ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_functions = test_*
filterwarnings =
    ignore::DeprecationWarning
```

### 1.2 Estructura de Tests

```
backend/
├── tests/
│   ├── __init__.py
│   ├── conftest.py       # Fixtures compartidos
│   ├── test_auth.py      # Tests de autenticación
│   ├── test_reclamos.py  # Tests de reclamos
│   └── test_permisos.py  # Tests de permisos por rol
└── pytest.ini
```

### 1.3 Fixtures Base (conftest.py)

```python
# backend/tests/conftest.py
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from main import app
from core.database import Base, get_db
from core.security import get_password_hash

# Base de datos en memoria para tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(scope="function")
async def db_session():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    TestSession = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with TestSession() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest.fixture(scope="function")
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
```

### 1.4 Tests de Autenticación

```python
# backend/tests/test_auth.py
import pytest

@pytest.mark.asyncio
async def test_register(client):
    response = await client.post("/api/auth/register", json={
        "email": "test@example.com",
        "password": "Test123!",
        "nombre": "Test",
        "apellido": "User"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"

@pytest.mark.asyncio
async def test_login(client, db_session):
    # Crear usuario
    await client.post("/api/auth/register", json={
        "email": "login@test.com",
        "password": "Test123!",
        "nombre": "Test",
        "apellido": "User"
    })

    # Login
    response = await client.post("/api/auth/login", data={
        "username": "login@test.com",
        "password": "Test123!"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()
```

### 1.5 Ejecutar Tests

```bash
# Todos los tests
cd backend && pytest

# Con verbose
pytest -v

# Solo un archivo
pytest tests/test_auth.py

# Con coverage
pytest --cov=. --cov-report=html
```

---

## 2. CI/CD con GitHub Actions

### 2.1 Workflow de CI

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install pytest pytest-asyncio httpx aiosqlite

      - name: Run tests
        run: pytest -v
        env:
          DATABASE_URL: sqlite+aiosqlite:///:memory:
          SECRET_KEY: test-secret-key

  test-frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install & Build
        run: |
          npm ci
          npm run build
```

### 2.2 Workflow de CD (Deploy)

```yaml
# .github/workflows/cd.yml
name: CD

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Heroku
        uses: akhileshns/heroku-deploy@v3.12.14
        with:
          heroku_api_key: ${{ secrets.HEROKU_API_KEY }}
          heroku_app_name: ${{ secrets.HEROKU_APP_NAME }}
          heroku_email: ${{ secrets.HEROKU_EMAIL }}
          appdir: backend

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Build
        working-directory: frontend
        run: |
          npm ci
          npm run build
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}

      - name: Deploy to Netlify
        uses: nwtgck/actions-netlify@v2.0
        with:
          publish-dir: frontend/dist
          production-deploy: true
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

### 2.3 Secrets Necesarios

Configurar en GitHub → Settings → Secrets:

| Secret | Descripción |
|--------|-------------|
| `HEROKU_API_KEY` | API Key de Heroku |
| `HEROKU_APP_NAME` | Nombre de la app |
| `HEROKU_EMAIL` | Email de Heroku |
| `NETLIFY_AUTH_TOKEN` | Token de Netlify CLI |
| `NETLIFY_SITE_ID` | ID del sitio |
| `VITE_API_URL` | URL del backend |

---

## 3. Migraciones con Alembic

### 3.1 Configuración

```txt
# requirements.txt - Agregar
alembic==1.13.0
```

```bash
# Inicializar
cd backend
alembic init alembic
```

### 3.2 Configuración Async

```python
# backend/alembic/env.py
import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine
from alembic import context

from core.config import settings
from core.database import Base
from models import *  # Importar todos los modelos

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def get_url():
    return settings.DATABASE_URL

def run_migrations_offline():
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()

async def run_migrations_online():
    connectable = create_async_engine(get_url(), poolclass=pool.NullPool)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

### 3.3 Comandos

```bash
# Crear migración
alembic revision --autogenerate -m "descripcion"

# Aplicar migraciones
alembic upgrade head

# Revertir última
alembic downgrade -1

# Ver historial
alembic history
```

---

## 4. WebSockets para Notificaciones

### 4.1 Connection Manager

```python
# backend/core/websocket.py
from fastapi import WebSocket
from typing import Dict, List
import json

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_personal(self, user_id: int, message: dict):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except:
                    pass

    async def broadcast(self, message: dict, exclude_user: int = None):
        for user_id, connections in self.active_connections.items():
            if user_id != exclude_user:
                for connection in connections:
                    try:
                        await connection.send_json(message)
                    except:
                        pass

manager = ConnectionManager()
```

### 4.2 Endpoint WebSocket

```python
# backend/api/ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from core.websocket import manager
from core.security import get_current_user_ws

router = APIRouter()

@router.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    user = await get_current_user_ws(token)
    if not user:
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, user.id)
    try:
        while True:
            data = await websocket.receive_text()
            # Manejar mensajes entrantes
    except WebSocketDisconnect:
        manager.disconnect(websocket, user.id)
```

### 4.3 Enviar Notificaciones

```python
# En cualquier parte del backend
from core.websocket import manager

# Notificar a usuario específico
await manager.send_personal(user_id, {
    "type": "reclamo_actualizado",
    "data": {"id": 123, "estado": "resuelto"}
})

# Broadcast a todos
await manager.broadcast({
    "type": "nuevo_reclamo",
    "data": {"id": 124, "titulo": "Nuevo reclamo"}
})
```

### 4.4 Cliente Frontend

```typescript
// frontend/src/hooks/useWebSocket.ts
export function useWebSocket() {
  const { token } = useAuth();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;

    const ws = new WebSocket(`ws://localhost:8000/ws/${token}`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Manejar notificaciones
      if (data.type === 'reclamo_actualizado') {
        toast.info(`Reclamo #${data.data.id} actualizado`);
      }
    };

    return () => ws.close();
  }, [token]);

  return { connected };
}
```

---

## 5. Celery + Redis (Tareas Asíncronas)

### 5.1 Configuración

```txt
# requirements.txt - Agregar
celery==5.3.0
redis==5.0.0
aiosmtplib==3.0.0
```

```python
# backend/core/celery_app.py
from celery import Celery
from core.config import settings

celery_app = Celery(
    "reclamos",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["tasks.email_tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Argentina/Buenos_Aires",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,
    task_default_retry_delay=60,
    task_max_retries=3,
)
```

### 5.2 Tareas de Email

```python
# backend/tasks/email_tasks.py
from core.celery_app import celery_app
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import asyncio

def run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()

@celery_app.task(bind=True, max_retries=3)
def send_email_task(self, to: str, subject: str, body: str, html: str = None):
    try:
        result = run_async(_send_email(to, subject, body, html))
        return {"success": True, "to": to}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)

@celery_app.task
def send_reclamo_creado_email(email: str, numero: str, titulo: str):
    subject = f"Reclamo #{numero} creado exitosamente"
    body = f"Tu reclamo '{titulo}' ha sido registrado con el número {numero}."
    return send_email_task.delay(email, subject, body)
```

### 5.3 Ejecutar Celery

```bash
# Worker
celery -A core.celery_app worker --loglevel=info

# Con Beat (tareas programadas)
celery -A core.celery_app beat --loglevel=info

# Worker + Beat juntos (desarrollo)
celery -A core.celery_app worker --beat --loglevel=info
```

---

## 6. Docker

### 6.1 Backend Dockerfile

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 6.2 Frontend Dockerfile

```dockerfile
# frontend/Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### 6.3 Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  db:
    image: mysql:8.0
    container_name: reclamos_db
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: reclamos
      MYSQL_USER: reclamos_user
      MYSQL_PASSWORD: reclamos_pass
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: reclamos_redis
    restart: unless-stopped
    ports:
      - "6379:6379"

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: reclamos_backend
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=mysql+aiomysql://reclamos_user:reclamos_pass@db:3306/reclamos
      - SECRET_KEY=dev-secret-key
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    volumes:
      - ./backend:/app
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

  celery:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: reclamos_celery
    restart: unless-stopped
    environment:
      - DATABASE_URL=mysql+aiomysql://reclamos_user:reclamos_pass@db:3306/reclamos
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - redis
      - db
    volumes:
      - ./backend:/app
    command: celery -A core.celery_app worker --loglevel=info

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        VITE_API_URL: http://localhost:8000/api
    container_name: reclamos_frontend
    restart: unless-stopped
    ports:
      - "3000:80"
    depends_on:
      - backend

volumes:
  mysql_data:
```

### 6.4 Comandos Docker

```bash
# Levantar todo
docker-compose up -d

# Ver logs
docker-compose logs -f backend

# Reconstruir
docker-compose build --no-cache

# Bajar todo
docker-compose down

# Con volúmenes
docker-compose down -v
```

---

## 7. Rate Limiting

### 7.1 Configuración

```txt
# requirements.txt - Agregar
slowapi==0.1.9
```

```python
# backend/core/rate_limit.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
```

### 7.2 Integración en main.py

```python
# backend/main.py
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from core.rate_limit import limiter

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

### 7.3 Uso en Endpoints

```python
# backend/api/auth.py
from core.rate_limit import limiter

@router.post("/login")
@limiter.limit("10/minute")  # 10 intentos por minuto
async def login(request: Request, ...):
    ...

@router.post("/register")
@limiter.limit("5/minute")  # 5 registros por minuto
async def register(request: Request, ...):
    ...
```

---

## 8. Sentry (Error Tracking)

### 8.1 Configuración

```txt
# requirements.txt - Agregar
sentry-sdk[fastapi]==1.38.0
```

```python
# backend/core/config.py
class Settings(BaseSettings):
    ...
    SENTRY_DSN: str = ""
```

### 8.2 Integración

```python
# backend/main.py
import sentry_sdk
from core.config import settings

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
        environment=settings.ENVIRONMENT,
    )
```

### 8.3 Obtener DSN

1. Crear cuenta en [sentry.io](https://sentry.io)
2. Crear proyecto Python/FastAPI
3. Copiar DSN a `.env`

```env
SENTRY_DSN=https://xxxxx@oxxxxxx.ingest.sentry.io/xxxxx
```

---

## 9. Variables de Entorno Adicionales

```env
# backend/.env - Agregar

# Redis / Celery
REDIS_URL=redis://localhost:6379/0

# Email SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_email@gmail.com
SMTP_PASSWORD=app_password
SMTP_FROM=noreply@tuapp.com
SMTP_FROM_NAME=Sistema de Reclamos

# Sentry
SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx

# Rate Limiting (opcional)
RATE_LIMIT_DEFAULT=100/minute
RATE_LIMIT_AUTH=10/minute
```

---

## 10. Checklist de Infraestructura

### Testing
- [ ] pytest configurado
- [ ] Tests de auth funcionando
- [ ] Tests de permisos funcionando
- [ ] Coverage > 70%

### CI/CD
- [ ] Workflow CI creado
- [ ] Workflow CD creado
- [ ] Secrets configurados en GitHub
- [ ] Deploy automático funcionando

### Migraciones
- [ ] Alembic configurado
- [ ] Migración inicial creada
- [ ] Scripts de migración en CI

### WebSockets
- [ ] ConnectionManager implementado
- [ ] Endpoint WS funcionando
- [ ] Hook de cliente creado

### Celery
- [ ] celery_app configurado
- [ ] Tareas de email creadas
- [ ] Worker funcionando
- [ ] Redis conectado

### Docker
- [ ] Dockerfile backend
- [ ] Dockerfile frontend
- [ ] docker-compose.yml
- [ ] docker-compose.prod.yml

### Monitoreo
- [ ] Sentry configurado
- [ ] Rate limiting activo
- [ ] Logs estructurados

---

**Siguiente paso:** Con esta infraestructura, el proyecto está listo para producción.
