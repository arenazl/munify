# Chat con IA - Arquitectura de Sesiones

## Resumen

El sistema tiene dos chats con IA que comparten la misma arquitectura base pero difieren en la persistencia:

| Aspecto | Landing (comercial) | App de gestión |
|---------|---------------------|----------------|
| **Endpoint** | `/api/chat/landing` | `/api/chat`, `/api/chat/asistente` |
| **Autenticación** | Público (anónimo) | JWT requerido |
| **Storage** | `MemorySessionStorage` | `UserSessionStorage` (memoria, preparado para DB) |
| **Session ID** | UUID auto-generado | `user_{id}_chat` o `user_{id}_asistente` |
| **TTL** | 30 minutos | 1 hora |
| **Contexto** | Categorías/trámites genéricos | Datos personalizados del usuario |

> **Nota**: Actualmente ambos usan memoria. La app está preparada para migrar a DB cuando se necesite persistencia real.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUJO DE CHAT                                      │
└─────────────────────────────────────────────────────────────────────────────┘

Frontend                          Backend                          LLM (Groq)
────────                          ───────                          ──────────
    │                                │                                  │
    │  POST /api/chat/landing        │                                  │
    │  {message, session_id?}        │                                  │
    │ ─────────────────────────────► │                                  │
    │                                │                                  │
    │                     ┌──────────┴──────────┐                       │
    │                     │  SessionStorage     │                       │
    │                     │  (interfaz)         │                       │
    │                     ├─────────────────────┤                       │
    │                     │ MemoryStorage       │ ← Landing             │
    │                     │ DBStorage           │ ← App                 │
    │                     └──────────┬──────────┘                       │
    │                                │                                  │
    │                     ┌──────────┴──────────┐                       │
    │                     │ Si session_id:      │                       │
    │                     │   → recuperar hilo  │                       │
    │                     │ Si no:              │                       │
    │                     │   → crear hilo      │                       │
    │                     │   → generar prompt  │                       │
    │                     └──────────┬──────────┘                       │
    │                                │                                  │
    │                                │  [system, ...history, user]      │
    │                                │ ────────────────────────────────►│
    │                                │                                  │
    │                                │◄──────────────────────────────── │
    │                                │  response                        │
    │                                │                                  │
    │                     ┌──────────┴──────────┐                       │
    │                     │ Guardar en sesión:  │                       │
    │                     │ - user message      │                       │
    │                     │ - assistant response│                       │
    │                     └──────────┬──────────┘                       │
    │                                │                                  │
    │ ◄───────────────────────────── │                                  │
    │  {response, session_id}        │                                  │
    │                                │                                  │
```

---

## Interfaz de Storage

```python
# backend/services/chat_session.py

from abc import ABC, abstractmethod
from typing import Optional

class SessionStorage(ABC):
    """Interfaz abstracta para storage de sesiones de chat"""

    @abstractmethod
    async def get_session(self, session_id: str) -> Optional[dict]:
        """Obtiene una sesión existente"""
        pass

    @abstractmethod
    async def create_session(self, session_id: str, system_prompt: str, context: dict) -> dict:
        """Crea una nueva sesión"""
        pass

    @abstractmethod
    async def add_message(self, session_id: str, role: str, content: str) -> None:
        """Agrega un mensaje al historial"""
        pass

    @abstractmethod
    async def get_messages(self, session_id: str, limit: int = 20) -> list[dict]:
        """Obtiene los últimos N mensajes"""
        pass
```

---

## Implementaciones

### 1. MemorySessionStorage (Landing)

```python
class MemorySessionStorage(SessionStorage):
    """Storage en memoria con TTL - para visitantes anónimos"""

    _sessions: dict[str, dict] = {}
    TTL = 30 * 60  # 30 minutos

    async def create_session(self, system_prompt: str, context: dict) -> str:
        """Crea sesión con UUID auto-generado"""
        session_id = str(uuid4())
        # ...
        return session_id
```

### 2. UserSessionStorage (App - actual)

```python
class UserSessionStorage(SessionStorage):
    """Storage en memoria basado en user_id"""

    _sessions: dict[str, dict] = {}
    TTL = 60 * 60  # 1 hora

    def _make_session_id(self, user_id: int, session_type: str) -> str:
        return f"user_{user_id}_{session_type}"

    async def get_or_create_for_user(
        self, user_id: int, system_prompt: str, context: dict, session_type: str = "chat"
    ) -> tuple[str, bool]:
        """Obtiene o crea sesión para un usuario. Retorna (session_id, is_new)"""
```

### 3. DBSessionStorage (App - futuro)

```python
# TODO: Implementar cuando se necesite persistencia real

# Tabla: chat_threads
# - id (PK)
# - user_id (FK)
# - municipio_id (FK)
# - session_type (chat/asistente)
# - system_prompt (TEXT)
# - created_at, updated_at

# Tabla: chat_messages
# - id (PK)
# - thread_id (FK)
# - role (user/assistant)
# - content (TEXT)
# - created_at
```

---

## System Prompt

El system prompt se genera UNA SOLA VEZ al crear la sesión e incluye:

### Común a ambos:
- Categorías de reclamos del municipio
- Tipos de trámites disponibles
- Reglas de comportamiento del asistente
- Formato de respuesta (HTML)

### Solo App de gestión (adicional):
- Nombre del usuario
- Rol del usuario
- Historial de reclamos del usuario
- Historial de trámites del usuario
- Estadísticas del municipio (si es gestor)

---

## Endpoints

### `/api/chat/landing` (público)

```python
Request:
{
    "message": "hola",
    "session_id": null | "uuid",  # null = crear sesión
    "municipio_id": null | 48     # opcional
}

Response:
{
    "response": "<p>¡Hola! ...</p>",
    "session_id": "abc-123-def",
    "municipio_id": 48,
    "municipio_nombre": "Merlo"
}
```

### `/api/chat` (autenticado)

```python
Request:
{
    "message": "cuantos reclamos tengo?"
}
# session_id se deriva del user_id del JWT

Response:
{
    "response": "Tenés 3 reclamos activos...",
    "session_id": "user_123"
}
```

### `/api/chat/asistente` (gestores)

```python
# Igual que /api/chat pero con contexto extendido:
# - Estadísticas del municipio
# - Reclamos recientes
# - Empleados activos
# - etc.
```

---

## Flujo de Detección de Municipio (Landing)

```
1. ¿Viene session_id?
   → SÍ: usar municipio de la sesión
   → NO: continuar

2. ¿Viene municipio_id en request?
   → SÍ: usar ese
   → NO: continuar

3. ¿El mensaje menciona un municipio?
   → Usar IA para detectar (detectar_municipio_con_ia)
   → SÍ: usar el detectado
   → NO: continuar

4. Fallback: usar municipio por defecto (Merlo = 48)
```

---

## Archivos Relevantes

| Archivo | Descripción |
|---------|-------------|
| `backend/api/chat.py` | Endpoints de chat |
| `backend/services/chat_service.py` | Servicio de IA (Groq) |
| `backend/services/chat_session.py` | Storage de sesiones (nuevo) |
| `frontend/src/components/ChatWidget.tsx` | Widget de chat en app |
| `landing/index.html` | Chat widget en landing |

---

## Migración Futura

Para cambiar de MemoryStorage a DBStorage:

1. Crear tablas `chat_threads` y `chat_messages`
2. Implementar `DBSessionStorage`
3. Cambiar la instancia en el endpoint:
   ```python
   # Antes
   storage = MemorySessionStorage()

   # Después
   storage = DBSessionStorage(db)
   ```

La interfaz es la misma, solo cambia la implementación.
