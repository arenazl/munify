"""
Endpoints de WebSocket para notificaciones en tiempo real.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import jwt, JWTError

from core.config import settings
from core.websocket import manager, WSEvents

router = APIRouter()


async def get_user_from_token(token: str) -> dict | None:
    """Validar token JWT y extraer datos del usuario."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = int(payload.get("sub"))
        return {"id": user_id}
    except (JWTError, ValueError):
        return None


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...)
):
    """
    Endpoint WebSocket principal.

    Conexión: ws://host/api/ws?token=JWT_TOKEN

    Mensajes recibidos:
    - {"type": "subscribe", "rooms": ["supervisores", "empleado_1"]}
    - {"type": "ping"}

    Mensajes enviados:
    - {"type": "reclamo_creado", "data": {...}}
    - {"type": "reclamo_asignado", "data": {...}}
    - {"type": "notificacion", "data": {...}}
    """
    # Validar token
    user = await get_user_from_token(token)
    if not user:
        await websocket.close(code=4001, reason="Token invalido")
        return

    user_id = user["id"]

    # Conectar
    await manager.connect(websocket, user_id)

    try:
        # Enviar confirmación de conexión
        await websocket.send_json({
            "type": "connected",
            "user_id": user_id
        })

        # Escuchar mensajes
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "subscribe":
                rooms = data.get("rooms", [])
                for room in rooms:
                    if room not in manager.room_connections:
                        manager.room_connections[room] = set()
                    manager.room_connections[room].add(websocket)
                await websocket.send_json({
                    "type": "subscribed",
                    "rooms": rooms
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)


# Funciones helper para enviar notificaciones desde otros módulos

async def notify_reclamo_creado(reclamo_data: dict):
    """Notificar a supervisores cuando se crea un reclamo."""
    await manager.send_to_room("supervisores", {
        "type": WSEvents.RECLAMO_CREADO,
        "data": reclamo_data
    })


async def notify_reclamo_asignado(reclamo_data: dict, empleado_id: int):
    """Notificar al empleado cuando se le asigna un reclamo."""
    await manager.send_to_room(f"empleado_{empleado_id}", {
        "type": WSEvents.RECLAMO_ASIGNADO,
        "data": reclamo_data
    })


async def notify_reclamo_actualizado(reclamo_data: dict, creador_id: int):
    """Notificar al creador cuando su reclamo se actualiza."""
    await manager.send_to_user(creador_id, {
        "type": WSEvents.RECLAMO_ACTUALIZADO,
        "data": reclamo_data
    })


async def notify_reclamo_resuelto(reclamo_data: dict, creador_id: int):
    """Notificar al creador cuando su reclamo se resuelve."""
    await manager.send_to_user(creador_id, {
        "type": WSEvents.RECLAMO_RESUELTO,
        "data": reclamo_data
    })
