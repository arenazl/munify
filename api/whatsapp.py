"""
API para integración con WhatsApp Business API.
Permite recibir reclamos vía WhatsApp y enviar notificaciones.
"""
from fastapi import APIRouter, Request, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
import json
import httpx
import re

from core.database import get_db
from models import User, Reclamo, Categoria, Zona, Notificacion
from models.enums import EstadoReclamo, RolUsuario

router = APIRouter()

# Configuración (en producción usar variables de entorno)
WHATSAPP_TOKEN = ""  # Token de WhatsApp Business API
WHATSAPP_PHONE_ID = ""  # ID del número de WhatsApp
VERIFY_TOKEN = "reclamos_municipales_2024"  # Token de verificación para webhook


# Estado de conversación por usuario
conversation_states = {}


class ConversationState:
    """Estado de una conversación en curso"""
    def __init__(self, phone: str):
        self.phone = phone
        self.step = "inicio"
        self.data = {
            "titulo": None,
            "descripcion": None,
            "categoria_id": None,
            "direccion": None,
            "latitud": None,
            "longitud": None,
        }


@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge")
):
    """
    Verificación del webhook de WhatsApp.
    Meta envía una solicitud GET para verificar el endpoint.
    """
    if hub_mode == "subscribe" and hub_verify_token == VERIFY_TOKEN:
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Token de verificación inválido")


@router.post("/webhook")
async def receive_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Recibe mensajes de WhatsApp y los procesa.
    """
    try:
        body = await request.json()

        # Verificar estructura del mensaje
        if "entry" not in body:
            return {"status": "ok"}

        for entry in body.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                messages = value.get("messages", [])

                for message in messages:
                    await process_message(message, db)

        return {"status": "ok"}

    except Exception as e:
        print(f"Error procesando webhook: {e}")
        return {"status": "error", "message": str(e)}


async def process_message(message: dict, db: AsyncSession):
    """Procesa un mensaje individual de WhatsApp"""
    msg_type = message.get("type")
    phone = message.get("from")

    if not phone:
        return

    # Obtener o crear estado de conversación
    if phone not in conversation_states:
        conversation_states[phone] = ConversationState(phone)

    state = conversation_states[phone]

    # Procesar según tipo de mensaje
    if msg_type == "text":
        text = message.get("text", {}).get("body", "").strip()
        await handle_text_message(phone, text, state, db)

    elif msg_type == "location":
        location = message.get("location", {})
        await handle_location_message(phone, location, state, db)

    elif msg_type == "image":
        # Por ahora solo confirmamos recepción
        await send_whatsapp_message(
            phone,
            "Recibimos tu imagen. Por ahora solo procesamos texto y ubicación."
        )


async def handle_text_message(phone: str, text: str, state: ConversationState, db: AsyncSession):
    """Maneja mensajes de texto según el paso de la conversación"""

    text_lower = text.lower()

    # Comandos especiales
    if text_lower in ["hola", "inicio", "empezar", "menu", "menú"]:
        state.step = "inicio"
        state.data = {k: None for k in state.data}
        await send_welcome_message(phone)
        return

    if text_lower in ["cancelar", "salir"]:
        state.step = "inicio"
        state.data = {k: None for k in state.data}
        await send_whatsapp_message(phone, "Operación cancelada. Escribe 'hola' para comenzar de nuevo.")
        return

    if text_lower in ["estado", "mis reclamos", "consultar"]:
        await send_user_reclamos(phone, db)
        return

    # Flujo de creación de reclamo
    if state.step == "inicio":
        if text_lower in ["1", "nuevo", "nuevo reclamo", "crear"]:
            state.step = "titulo"
            await send_whatsapp_message(
                phone,
                "📝 *Nuevo Reclamo*\n\n"
                "Por favor, escribe un *título breve* para tu reclamo.\n"
                "Ejemplo: 'Bache en la calle principal'"
            )
        elif text_lower in ["2", "consultar", "ver"]:
            await send_user_reclamos(phone, db)
        else:
            await send_welcome_message(phone)

    elif state.step == "titulo":
        if len(text) < 5:
            await send_whatsapp_message(phone, "El título debe tener al menos 5 caracteres. Intenta de nuevo:")
            return
        state.data["titulo"] = text
        state.step = "descripcion"
        await send_whatsapp_message(
            phone,
            "✅ Título guardado.\n\n"
            "Ahora escribe una *descripción detallada* del problema:"
        )

    elif state.step == "descripcion":
        if len(text) < 10:
            await send_whatsapp_message(phone, "La descripción debe ser más detallada. Intenta de nuevo:")
            return
        state.data["descripcion"] = text
        state.step = "categoria"
        await send_categorias(phone, db)

    elif state.step == "categoria":
        # Buscar categoría por número o nombre
        categoria = await find_categoria(text, db)
        if categoria:
            state.data["categoria_id"] = categoria.id
            state.step = "direccion"
            await send_whatsapp_message(
                phone,
                f"✅ Categoría: *{categoria.nombre}*\n\n"
                "Ahora escribe la *dirección* donde está el problema:\n"
                "Ejemplo: 'Av. San Martín 1234, entre Belgrano y Moreno'"
            )
        else:
            await send_whatsapp_message(phone, "No encontré esa categoría. Por favor elige un número de la lista:")
            await send_categorias(phone, db)

    elif state.step == "direccion":
        state.data["direccion"] = text
        state.step = "ubicacion"
        await send_whatsapp_message(
            phone,
            "✅ Dirección guardada.\n\n"
            "📍 *Opcional:* Comparte tu ubicación actual para mayor precisión.\n\n"
            "• Toca el clip 📎 → Ubicación → Enviar ubicación actual\n"
            "• O escribe *omitir* para continuar sin ubicación"
        )

    elif state.step == "ubicacion":
        if text_lower in ["omitir", "no", "siguiente", "continuar"]:
            state.step = "confirmar"
            await send_confirmation(phone, state, db)
        else:
            await send_whatsapp_message(
                phone,
                "Por favor comparte tu ubicación o escribe *omitir* para continuar."
            )

    elif state.step == "confirmar":
        if text_lower in ["si", "sí", "confirmar", "enviar", "1"]:
            await create_reclamo_from_whatsapp(phone, state, db)
        elif text_lower in ["no", "cancelar", "2"]:
            state.step = "inicio"
            state.data = {k: None for k in state.data}
            await send_whatsapp_message(phone, "Reclamo cancelado. Escribe 'hola' para comenzar de nuevo.")
        else:
            await send_whatsapp_message(phone, "Por favor responde *sí* para confirmar o *no* para cancelar.")


async def handle_location_message(phone: str, location: dict, state: ConversationState, db: AsyncSession):
    """Maneja mensajes de ubicación"""
    if state.step == "ubicacion":
        state.data["latitud"] = location.get("latitude")
        state.data["longitud"] = location.get("longitude")
        state.step = "confirmar"
        await send_whatsapp_message(phone, "✅ Ubicación recibida.")
        await send_confirmation(phone, state, db)
    else:
        await send_whatsapp_message(
            phone,
            "Gracias por la ubicación, pero no estamos en ese paso del proceso.\n"
            "Escribe 'hola' para comenzar."
        )


async def send_welcome_message(phone: str):
    """Envía mensaje de bienvenida"""
    await send_whatsapp_message(
        phone,
        "🏛️ *Sistema de Reclamos Municipales*\n\n"
        "¡Hola! Soy el asistente virtual para reclamos.\n\n"
        "¿Qué deseas hacer?\n\n"
        "*1.* 📝 Crear nuevo reclamo\n"
        "*2.* 🔍 Consultar mis reclamos\n\n"
        "Escribe el número de la opción o el nombre."
    )


async def send_categorias(phone: str, db: AsyncSession):
    """Envía lista de categorías disponibles"""
    result = await db.execute(
        select(Categoria).where(Categoria.activo == True).order_by(Categoria.nombre)
    )
    categorias = result.scalars().all()

    if not categorias:
        await send_whatsapp_message(phone, "No hay categorías disponibles. Contacta al municipio.")
        return

    msg = "📋 *Selecciona una categoría:*\n\n"
    for i, cat in enumerate(categorias, 1):
        emoji = get_categoria_emoji(cat.nombre)
        msg += f"*{i}.* {emoji} {cat.nombre}\n"

    msg += "\nEscribe el *número* de la categoría:"
    await send_whatsapp_message(phone, msg)


def get_categoria_emoji(nombre: str) -> str:
    """Retorna emoji según categoría"""
    nombre_lower = nombre.lower()
    emojis = {
        "bache": "🕳️",
        "alumbrado": "💡",
        "basura": "🗑️",
        "agua": "💧",
        "arbol": "🌳",
        "árbol": "🌳",
        "transito": "🚦",
        "tránsito": "🚦",
        "vereda": "🚶",
        "cloacas": "🚽",
        "electricidad": "⚡",
    }
    for key, emoji in emojis.items():
        if key in nombre_lower:
            return emoji
    return "📌"


async def find_categoria(text: str, db: AsyncSession) -> Optional[Categoria]:
    """Busca categoría por número o nombre"""
    result = await db.execute(
        select(Categoria).where(Categoria.activo == True).order_by(Categoria.nombre)
    )
    categorias = result.scalars().all()

    # Buscar por número
    if text.isdigit():
        idx = int(text) - 1
        if 0 <= idx < len(categorias):
            return categorias[idx]

    # Buscar por nombre
    text_lower = text.lower()
    for cat in categorias:
        if text_lower in cat.nombre.lower():
            return cat

    return None


async def send_confirmation(phone: str, state: ConversationState, db: AsyncSession):
    """Envía mensaje de confirmación antes de crear el reclamo"""
    # Obtener nombre de categoría
    cat_name = "No especificada"
    if state.data["categoria_id"]:
        result = await db.execute(
            select(Categoria).where(Categoria.id == state.data["categoria_id"])
        )
        cat = result.scalar_one_or_none()
        if cat:
            cat_name = cat.nombre

    ubicacion = "No proporcionada"
    if state.data["latitud"] and state.data["longitud"]:
        ubicacion = f"📍 {state.data['latitud']}, {state.data['longitud']}"

    msg = (
        "📋 *Resumen de tu reclamo:*\n\n"
        f"*Título:* {state.data['titulo']}\n"
        f"*Descripción:* {state.data['descripcion']}\n"
        f"*Categoría:* {cat_name}\n"
        f"*Dirección:* {state.data['direccion']}\n"
        f"*Ubicación:* {ubicacion}\n\n"
        "¿Confirmas el envío?\n"
        "*1.* ✅ Sí, enviar\n"
        "*2.* ❌ No, cancelar"
    )
    await send_whatsapp_message(phone, msg)


async def create_reclamo_from_whatsapp(phone: str, state: ConversationState, db: AsyncSession):
    """Crea el reclamo en la base de datos"""
    try:
        # Buscar o crear usuario por teléfono
        user = await get_or_create_user(phone, db)

        # Crear reclamo
        reclamo = Reclamo(
            titulo=state.data["titulo"],
            descripcion=state.data["descripcion"],
            categoria_id=state.data["categoria_id"],
            direccion=state.data["direccion"],
            latitud=state.data["latitud"],
            longitud=state.data["longitud"],
            estado=EstadoReclamo.nuevo,
            prioridad=2,  # Prioridad media por defecto
            creador_id=user.id,
        )

        db.add(reclamo)
        await db.commit()
        await db.refresh(reclamo)

        # Limpiar estado
        state.step = "inicio"
        state.data = {k: None for k in state.data}

        await send_whatsapp_message(
            phone,
            f"✅ *¡Reclamo creado exitosamente!*\n\n"
            f"*Número de reclamo:* #{reclamo.id}\n\n"
            f"Puedes consultar el estado escribiendo *estado* o *mis reclamos*.\n\n"
            f"Te notificaremos cuando haya novedades. ¡Gracias por reportar!"
        )

    except Exception as e:
        print(f"Error creando reclamo: {e}")
        await send_whatsapp_message(
            phone,
            "❌ Hubo un error al crear el reclamo. Por favor intenta de nuevo más tarde."
        )


async def get_or_create_user(phone: str, db: AsyncSession) -> User:
    """Obtiene o crea un usuario por número de teléfono"""
    # Normalizar teléfono
    phone_clean = re.sub(r'\D', '', phone)

    # Buscar usuario existente
    result = await db.execute(
        select(User).where(User.telefono == phone_clean)
    )
    user = result.scalar_one_or_none()

    if user:
        return user

    # Crear nuevo usuario
    user = User(
        email=f"whatsapp_{phone_clean}@temporal.local",
        nombre="Usuario",
        apellido="WhatsApp",
        telefono=phone_clean,
        rol=RolUsuario.vecino,
        activo=True,
        password_hash="whatsapp_user_no_login",  # No puede hacer login
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user


async def send_user_reclamos(phone: str, db: AsyncSession):
    """Envía lista de reclamos del usuario"""
    phone_clean = re.sub(r'\D', '', phone)

    # Buscar usuario
    result = await db.execute(
        select(User).where(User.telefono == phone_clean)
    )
    user = result.scalar_one_or_none()

    if not user:
        await send_whatsapp_message(
            phone,
            "No encontré reclamos asociados a este número.\n"
            "Escribe *hola* para crear un nuevo reclamo."
        )
        return

    # Buscar reclamos
    result = await db.execute(
        select(Reclamo)
        .where(Reclamo.creador_id == user.id)
        .order_by(Reclamo.created_at.desc())
        .limit(5)
    )
    reclamos = result.scalars().all()

    if not reclamos:
        await send_whatsapp_message(
            phone,
            "No tienes reclamos registrados.\n"
            "Escribe *hola* para crear uno nuevo."
        )
        return

    msg = "📋 *Tus últimos reclamos:*\n\n"
    for r in reclamos:
        estado_emoji = {
            "nuevo": "🆕",
            "asignado": "👤",
            "en_proceso": "🔧",
            "resuelto": "✅",
            "rechazado": "❌",
        }.get(r.estado.value, "❓")

        msg += f"*#{r.id}* - {estado_emoji} {r.estado.value.replace('_', ' ').title()}\n"
        msg += f"📝 {r.titulo[:30]}...\n\n"

    msg += "Escribe *hola* para crear un nuevo reclamo."
    await send_whatsapp_message(phone, msg)


async def send_whatsapp_message(to: str, message: str):
    """Envía un mensaje de WhatsApp usando la API de Meta"""
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID:
        print(f"[WhatsApp Mock] To: {to}\nMessage: {message}\n")
        return

    url = f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_ID}/messages"

    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }

    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": message}
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code != 200:
                print(f"Error enviando WhatsApp: {response.text}")
    except Exception as e:
        print(f"Error enviando WhatsApp: {e}")


# Endpoint para enviar notificación manual
@router.post("/send-notification/{reclamo_id}")
async def send_notification(
    reclamo_id: int,
    message: str,
    db: AsyncSession = Depends(get_db)
):
    """Envía notificación de WhatsApp al creador de un reclamo"""
    result = await db.execute(
        select(Reclamo).where(Reclamo.id == reclamo_id)
    )
    reclamo = result.scalar_one_or_none()

    if not reclamo:
        raise HTTPException(status_code=404, detail="Reclamo no encontrado")

    # Obtener teléfono del creador
    result = await db.execute(
        select(User).where(User.id == reclamo.creador_id)
    )
    user = result.scalar_one_or_none()

    if not user or not user.telefono:
        raise HTTPException(status_code=400, detail="Usuario sin teléfono registrado")

    await send_whatsapp_message(user.telefono, message)

    return {"status": "sent", "to": user.telefono}
