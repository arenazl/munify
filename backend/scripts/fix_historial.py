"""
Script para agregar historial a reclamos existentes que no lo tienen.
Genera entradas de historial basadas en el estado actual del reclamo.
"""
import asyncio
from datetime import timedelta
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
import sys
import os

# Agregar el path del backend para imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import settings
from models.reclamo import Reclamo
from models.historial import HistorialReclamo
from models.enums import EstadoReclamo


async def main():
    print(">> Iniciando creación de historial para reclamos...")

    # Crear engine
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # 1. Obtener todos los reclamos
        print("\n>> Obteniendo reclamos...")
        result = await session.execute(select(Reclamo))
        reclamos = result.scalars().all()
        print(f"[OK] {len(reclamos)} reclamos encontrados")

        # 2. Obtener todos los IDs de reclamos que ya tienen historial
        print("\n>> Verificando historial existente...")
        result = await session.execute(
            select(HistorialReclamo.reclamo_id).distinct()
        )
        reclamos_con_historial = set(result.scalars().all())
        print(f"[INFO] {len(reclamos_con_historial)} reclamos con historial")

        # 3. Filtrar reclamos sin historial
        reclamos_sin_historial = [r for r in reclamos if r.id not in reclamos_con_historial]
        print(f"[INFO] {len(reclamos_sin_historial)} reclamos sin historial")

        if len(reclamos_sin_historial) == 0:
            print("\n[OK] ¡Todos los reclamos ya tienen historial!")
            return

        # 4. Crear historial para cada reclamo
        print(f"\n>> Creando historial para {len(reclamos_sin_historial)} reclamos...")
        print("   (esto puede tardar un momento...)")
        historial_creado = 0

        # Orden de estados para progresar
        estados_orden = {
            EstadoReclamo.NUEVO: 0,
            EstadoReclamo.ASIGNADO: 1,
            EstadoReclamo.EN_PROCESO: 2,
            EstadoReclamo.RESUELTO: 3,
            EstadoReclamo.RECHAZADO: 3,
        }

        for idx, reclamo in enumerate(reclamos_sin_historial, 1):
            # Siempre crear la entrada de "creado"
            historial_creacion = HistorialReclamo(
                reclamo_id=reclamo.id,
                usuario_id=reclamo.creador_id,
                estado_nuevo=EstadoReclamo.NUEVO,
                accion="creado",
                comentario="Reclamo creado",
                created_at=reclamo.created_at
            )
            session.add(historial_creacion)
            historial_creado += 1

            # Si el estado actual no es NUEVO, crear entradas intermedias
            if reclamo.estado != EstadoReclamo.NUEVO:
                estado_actual_orden = estados_orden.get(reclamo.estado, 0)

                # Crear entradas para estados intermedios
                fecha_actual = reclamo.created_at

                # ASIGNADO (si llegó a este punto o más)
                if estado_actual_orden >= 1:
                    fecha_actual += timedelta(hours=2)
                    historial_asignado = HistorialReclamo(
                        reclamo_id=reclamo.id,
                        usuario_id=reclamo.creador_id,
                        estado_anterior=EstadoReclamo.NUEVO,
                        estado_nuevo=EstadoReclamo.ASIGNADO,
                        accion="asignado",
                        comentario=f"Reclamo asignado" + (f" a empleado #{reclamo.empleado_id}" if reclamo.empleado_id else ""),
                        created_at=fecha_actual
                    )
                    session.add(historial_asignado)
                    historial_creado += 1

                # EN_PROCESO (si llegó a este punto o más)
                if estado_actual_orden >= 2:
                    fecha_actual += timedelta(hours=12)
                    historial_proceso = HistorialReclamo(
                        reclamo_id=reclamo.id,
                        usuario_id=reclamo.creador_id,
                        estado_anterior=EstadoReclamo.ASIGNADO,
                        estado_nuevo=EstadoReclamo.EN_PROCESO,
                        accion="inicio_trabajo",
                        comentario="Se inició el trabajo en el reclamo",
                        created_at=fecha_actual
                    )
                    session.add(historial_proceso)
                    historial_creado += 1

                # RESUELTO o RECHAZADO (estado final)
                if reclamo.estado in [EstadoReclamo.RESUELTO, EstadoReclamo.RECHAZADO]:
                    # Usar fecha_resolucion si existe, sino calcular
                    fecha_final = reclamo.fecha_resolucion or (fecha_actual + timedelta(days=2))
                    estado_anterior = EstadoReclamo.EN_PROCESO if estado_actual_orden >= 2 else EstadoReclamo.ASIGNADO

                    historial_final = HistorialReclamo(
                        reclamo_id=reclamo.id,
                        usuario_id=reclamo.creador_id,
                        estado_anterior=estado_anterior,
                        estado_nuevo=reclamo.estado,
                        accion=reclamo.estado.value,
                        comentario=reclamo.resolucion or f"Reclamo {reclamo.estado.value}",
                        created_at=fecha_final
                    )
                    session.add(historial_final)
                    historial_creado += 1

            # Commit cada 100 reclamos y mostrar progreso
            if idx % 100 == 0:
                await session.commit()
                porcentaje = (idx / len(reclamos_sin_historial)) * 100
                print(f"   [{porcentaje:5.1f}%] Procesados {idx}/{len(reclamos_sin_historial)} reclamos ({historial_creado} entradas)", flush=True)

        # Commit final
        await session.commit()
        print(f"\n[OK] {historial_creado} entradas de historial creadas para {len(reclamos_sin_historial)} reclamos!")

        print("\n" + "="*60)
        print("> RESUMEN")
        print("="*60)
        print(f"Reclamos procesados: {len(reclamos_sin_historial)}")
        print(f"Entradas de historial creadas: {historial_creado}")
        print(f"Promedio de entradas por reclamo: {historial_creado / len(reclamos_sin_historial):.1f}")
        print("="*60)
        print("\n[OK] ¡Script completado con éxito!")


if __name__ == "__main__":
    asyncio.run(main())
