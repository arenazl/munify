"""
Servicio de sesiones de chat.
Provee una interfaz abstracta para storage de sesiones con dos implementaciones:
- MemorySessionStorage: para visitantes anónimos (landing)
- DBSessionStorage: para usuarios autenticados (app) - TODO
"""
from abc import ABC, abstractmethod
from typing import Optional
from uuid import uuid4
import time


class SessionStorage(ABC):
    """Interfaz abstracta para storage de sesiones de chat"""

    @abstractmethod
    async def get_session(self, session_id: str) -> Optional[dict]:
        """
        Obtiene una sesión existente.
        Retorna None si no existe o expiró.
        """
        pass

    @abstractmethod
    async def create_session(self, system_prompt: str, context: dict) -> str:
        """
        Crea una nueva sesión.
        Retorna el session_id generado.
        """
        pass

    @abstractmethod
    async def add_message(self, session_id: str, role: str, content: str) -> None:
        """Agrega un mensaje al historial de la sesión"""
        pass

    @abstractmethod
    async def get_messages(self, session_id: str, limit: int = 20) -> list[dict]:
        """Obtiene los últimos N mensajes de la sesión"""
        pass

    @abstractmethod
    async def get_system_prompt(self, session_id: str) -> Optional[str]:
        """Obtiene el system prompt de la sesión"""
        pass


class MemorySessionStorage(SessionStorage):
    """
    Storage en memoria con TTL.
    Ideal para visitantes anónimos (landing page).
    Las sesiones expiran automáticamente.
    """

    _sessions: dict[str, dict] = {}
    TTL = 30 * 60  # 30 minutos

    def _cleanup_expired(self):
        """Elimina sesiones expiradas"""
        now = time.time()
        expired = [
            sid for sid, data in self._sessions.items()
            if now - data.get("last_access", 0) > self.TTL
        ]
        for sid in expired:
            del self._sessions[sid]

    async def get_session(self, session_id: str) -> Optional[dict]:
        self._cleanup_expired()

        if session_id not in self._sessions:
            return None

        session = self._sessions[session_id]
        session["last_access"] = time.time()
        return session

    async def create_session(self, system_prompt: str, context: dict) -> str:
        self._cleanup_expired()

        session_id = str(uuid4())
        self._sessions[session_id] = {
            "system_prompt": system_prompt,
            "messages": [],
            "context": context,  # municipio_id, etc.
            "last_access": time.time(),
            "created_at": time.time()
        }
        return session_id

    async def add_message(self, session_id: str, role: str, content: str) -> None:
        if session_id not in self._sessions:
            return

        session = self._sessions[session_id]
        session["messages"].append({"role": role, "content": content})
        session["last_access"] = time.time()

        # Limitar historial para no consumir mucha memoria
        if len(session["messages"]) > 40:
            session["messages"] = session["messages"][-40:]

    async def get_messages(self, session_id: str, limit: int = 20) -> list[dict]:
        session = await self.get_session(session_id)
        if not session:
            return []
        return session["messages"][-limit:]

    async def get_system_prompt(self, session_id: str) -> Optional[str]:
        session = await self.get_session(session_id)
        if not session:
            return None
        return session.get("system_prompt")


class UserSessionStorage(SessionStorage):
    """
    Storage basado en user_id para usuarios autenticados.
    Usa memoria pero con user_id como clave.
    Preparado para migrar a DB en el futuro.
    """

    _sessions: dict[str, dict] = {}
    TTL = 60 * 60  # 1 hora (más largo porque son usuarios autenticados)

    def _cleanup_expired(self):
        """Elimina sesiones expiradas"""
        now = time.time()
        expired = [
            sid for sid, data in self._sessions.items()
            if now - data.get("last_access", 0) > self.TTL
        ]
        for sid in expired:
            del self._sessions[sid]

    def _make_session_id(self, user_id: int, session_type: str = "chat") -> str:
        """Genera session_id basado en user_id"""
        return f"user_{user_id}_{session_type}"

    async def get_or_create_for_user(
        self,
        user_id: int,
        system_prompt: str,
        context: dict,
        session_type: str = "chat"
    ) -> tuple[str, bool]:
        """
        Obtiene o crea sesión para un usuario.
        Retorna (session_id, is_new)
        """
        session_id = self._make_session_id(user_id, session_type)
        session = await self.get_session(session_id)

        if session:
            return session_id, False

        # Crear nueva sesión con el session_id predefinido
        self._sessions[session_id] = {
            "system_prompt": system_prompt,
            "messages": [],
            "context": {**context, "user_id": user_id},
            "last_access": time.time(),
            "created_at": time.time()
        }
        return session_id, True

    async def get_session(self, session_id: str) -> Optional[dict]:
        self._cleanup_expired()

        if session_id not in self._sessions:
            return None

        session = self._sessions[session_id]
        session["last_access"] = time.time()
        return session

    async def create_session(self, system_prompt: str, context: dict) -> str:
        """No usar directamente, usar get_or_create_for_user"""
        raise NotImplementedError("Usar get_or_create_for_user para usuarios autenticados")

    async def add_message(self, session_id: str, role: str, content: str) -> None:
        if session_id not in self._sessions:
            return

        session = self._sessions[session_id]
        session["messages"].append({"role": role, "content": content})
        session["last_access"] = time.time()

        # Limitar historial
        if len(session["messages"]) > 40:
            session["messages"] = session["messages"][-40:]

    async def get_messages(self, session_id: str, limit: int = 20) -> list[dict]:
        session = await self.get_session(session_id)
        if not session:
            return []
        return session["messages"][-limit:]

    async def get_system_prompt(self, session_id: str) -> Optional[str]:
        session = await self.get_session(session_id)
        if not session:
            return None
        return session.get("system_prompt")

    async def clear_session(self, user_id: int, session_type: str = "chat") -> None:
        """Limpia la sesión de un usuario (para reiniciar conversación)"""
        session_id = self._make_session_id(user_id, session_type)
        if session_id in self._sessions:
            del self._sessions[session_id]


# Instancias singleton
_landing_storage: Optional[MemorySessionStorage] = None
_user_storage: Optional[UserSessionStorage] = None


def get_landing_storage() -> MemorySessionStorage:
    """Obtiene storage para landing (visitantes anónimos)"""
    global _landing_storage
    if _landing_storage is None:
        _landing_storage = MemorySessionStorage()
    return _landing_storage


def get_user_storage() -> UserSessionStorage:
    """Obtiene storage para usuarios autenticados"""
    global _user_storage
    if _user_storage is None:
        _user_storage = UserSessionStorage()
    return _user_storage
