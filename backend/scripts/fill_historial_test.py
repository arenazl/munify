"""
Script para poblar historial de solicitudes con datos de prueba.
Crea un historial ficticio para la solicitud ID 1 con varios cambios de estado.

Ejecutar: python -m scripts.fill_historial_test
"""
import asyncio
from datetime import datetime, timedelta
from sqlalchemy import text
from core.database import AsyncSessionLocal


async def fill_historial():
    """Llena el historial de la solicitud 1 con datos de prueba"""

    async with AsyncSessionLocal() as db:
        # Primero verificar que existe la solicitud 1
        result = await db.execute(text("SELECT id, estado FROM solicitudes WHERE id = 1"))
        solicitud = result.fetchone()

        if not solicitud:
            print("No existe la solicitud con ID 1. Buscando otra...")
            result = await db.execute(text("SELECT id, estado FROM solicitudes ORDER BY id LIMIT 1"))
            solicitud = result.fetchone()
            if not solicitud:
                print("No hay solicitudes en la base de datos")
                return

        solicitud_id = solicitud[0]
        print(f"Usando solicitud ID: {solicitud_id}")

        # Limpiar historial existente de esta solicitud
        await db.execute(text(f"DELETE FROM historial_solicitudes WHERE solicitud_id = {solicitud_id}"))

        # Crear historial ficticio con fechas decrecientes
        base_date = datetime.now()

        historial_entries = [
            # Más reciente primero
            {
                "estado_anterior": "EN_PROCESO",
                "estado_nuevo": "APROBADO",
                "accion": "Solicitud aprobada",
                "comentario": "Documentación completa y verificada. Se procede a aprobar.",
                "usuario_id": 511,
                "created_at": base_date - timedelta(hours=2)
            },
            {
                "estado_anterior": "REQUIERE_DOCUMENTACION",
                "estado_nuevo": "EN_PROCESO",
                "accion": "Documentación recibida",
                "comentario": "El vecino presentó la documentación faltante.",
                "usuario_id": 511,
                "created_at": base_date - timedelta(days=1)
            },
            {
                "estado_anterior": "EN_REVISION",
                "estado_nuevo": "REQUIERE_DOCUMENTACION",
                "accion": "Se requiere documentación adicional",
                "comentario": "Falta copia del DNI y comprobante de domicilio.",
                "usuario_id": 511,
                "created_at": base_date - timedelta(days=3)
            },
            {
                "estado_anterior": "INICIADO",
                "estado_nuevo": "EN_REVISION",
                "accion": "Empleado asignado: Juan Perez",
                "comentario": None,
                "usuario_id": 511,
                "created_at": base_date - timedelta(days=4)
            },
            {
                "estado_anterior": None,
                "estado_nuevo": "INICIADO",
                "accion": "Solicitud creada",
                "comentario": "Trámite: Habilitación Comercial",
                "usuario_id": 512,
                "created_at": base_date - timedelta(days=5)
            },
        ]

        for entry in historial_entries:
            estado_ant = f"'{entry['estado_anterior']}'" if entry['estado_anterior'] else "NULL"
            estado_nuevo = f"'{entry['estado_nuevo']}'"
            comentario = f"'{entry['comentario']}'" if entry['comentario'] else "NULL"
            created = entry['created_at'].strftime('%Y-%m-%d %H:%M:%S')

            sql = f"""
                INSERT INTO historial_solicitudes
                (solicitud_id, usuario_id, estado_anterior, estado_nuevo, accion, comentario, created_at)
                VALUES
                ({solicitud_id}, {entry['usuario_id']}, {estado_ant}, {estado_nuevo}, '{entry['accion']}', {comentario}, '{created}')
            """
            await db.execute(text(sql))

        await db.commit()
        print(f"OK - Se crearon {len(historial_entries)} entradas de historial para la solicitud {solicitud_id}")

        # Mostrar el historial creado
        result = await db.execute(text(f"""
            SELECT estado_anterior, estado_nuevo, accion, comentario, created_at
            FROM historial_solicitudes
            WHERE solicitud_id = {solicitud_id}
            ORDER BY created_at DESC
        """))

        print("\nHistorial creado:")
        print("-" * 80)
        for row in result.fetchall():
            estado_ant, estado_nuevo, accion, comentario, created = row
            print(f"  {created} | {estado_ant or '(nuevo)'} → {estado_nuevo} | {accion}")
            if comentario:
                print(f"    └─ {comentario}")


if __name__ == "__main__":
    asyncio.run(fill_historial())
