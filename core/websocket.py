"""
WebSocket manager para notificaciones en tiempo real.
Permite enviar actualizaciones a clientes conectados.
"""
from typing import Dict, Set
from fastapi import WebSocket
import json


class ConnectionManager:
    """Gestiona conexiones WebSocket por usuario y por sala."""

    def __init__(self):
        # Conexiones por usuario: {user_id: {websocket1, websocket2, ...}}
        self.user_connections: Dict[int, Set[WebSocket]] = {}
        # Conexiones por sala (ej: supervisores, cuadrilla_1, etc.)
        self.room_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int, rooms: list[str] = None):
        """Conectar un cliente."""
        await websocket.accept()

        # Agregar a conexiones del usuario
        if user_id not in self.user_connections:
            self.user_connections[user_id] = set()
        self.user_connections[user_id].add(websocket)

        # Agregar a salas
        if rooms:
            for room in rooms:
                if room not in self.room_connections:
                    self.room_connections[room] = set()
                self.room_connections[room].add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        """Desconectar un cliente."""
        # Remover de conexiones del usuario
        if user_id in self.user_connections:
            self.user_connections[user_id].discard(websocket)
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]

        # Remover de todas las salas
        for room in list(self.room_connections.keys()):
            self.room_connections[room].discard(websocket)
            if not self.room_connections[room]:
                del self.room_connections[room]

    async def send_to_user(self, user_id: int, message: dict):
        """Enviar mensaje a un usuario específico."""
        if user_id in self.user_connections:
            disconnected = set()
            for websocket in self.user_connections[user_id]:
                try:
                    await websocket.send_json(message)
                except Exception:
                    disconnected.add(websocket)

            # Limpiar conexiones muertas
            for ws in disconnected:
                self.user_connections[user_id].discard(ws)

    async def send_to_room(self, room: str, message: dict):
        """Enviar mensaje a todos en una sala."""
        if room in self.room_connections:
            disconnected = set()
            for websocket in self.room_connections[room]:
                try:
                    await websocket.send_json(message)
                except Exception:
                    disconnected.add(websocket)

            # Limpiar conexiones muertas
            for ws in disconnected:
                self.room_connections[room].discard(ws)

    async def broadcast(self, message: dict):
        """Enviar mensaje a todos los usuarios conectados."""
        all_websockets = set()
        for connections in self.user_connections.values():
            all_websockets.update(connections)

        disconnected = set()
        for websocket in all_websockets:
            try:
                await websocket.send_json(message)
            except Exception:
                disconnected.add(websocket)


# Instancia global del manager
manager = ConnectionManager()


# Tipos de eventos WebSocket
class WSEvents:
    """Constantes para tipos de eventos."""
    RECLAMO_CREADO = "reclamo_creado"
    RECLAMO_ASIGNADO = "reclamo_asignado"
    RECLAMO_ACTUALIZADO = "reclamo_actualizado"
    RECLAMO_RESUELTO = "reclamo_resuelto"
    NOTIFICACION = "notificacion"
    SLA_WARNING = "sla_warning"
