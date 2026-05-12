"""Seed de proyectos DEMO para San Pedro Norte.

REGLA #11 - Estos proyectos son INVENTADOS, pensados para que la demo
muestre la feature de imputacion N:M de gastos. Los marco en descripcion
con prefijo [DEMO] para que se puedan limpiar despues.

5 proyectos plausibles para muni agrario:
  - Repavimentacion Av. San Martin (en curso)
  - Departamento para el vecindario (en curso, foco de la demo)
  - Ampliacion sala primeros auxilios (planificacion)
  - Compra camion atmosferico (activo)
  - Plaza del Bicentenario (finalizado, para mostrar estado)

Idempotente: skip si existe (nombre + muni).
"""
import asyncio
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from models import Municipio, Proyecto, EstadoProyecto
from core.config import settings

SPN_CODIGO = 'san-pedro-norte'

PROYECTOS = [
    {
        'nombre': 'Repavimentación Av. San Martín',
        'descripcion': '[DEMO] Repavimentación de 8 cuadras de la avenida principal. Incluye demarcación y badenes.',
        'presupuesto': Decimal('12000000'),
        'fecha_inicio': date(2026, 3, 1),
        'fecha_fin': date(2026, 7, 31),
        'estado': EstadoProyecto.ACTIVO,
    },
    {
        'nombre': 'Departamento para el vecindario',
        'descripcion': '[DEMO] Construcción de unidad habitacional para asignar a familia en situación de vulnerabilidad. Materiales, contratista y servicios.',
        'presupuesto': Decimal('8500000'),
        'fecha_inicio': date(2026, 4, 1),
        'fecha_fin': date(2026, 12, 31),
        'estado': EstadoProyecto.ACTIVO,
    },
    {
        'nombre': 'Ampliación Sala de Primeros Auxilios',
        'descripcion': '[DEMO] Construcción de 2 consultorios adicionales y sala de espera. Coordinado con Min. Salud Pcia.',
        'presupuesto': Decimal('5200000'),
        'fecha_inicio': date(2026, 6, 1),
        'fecha_fin': None,
        'estado': EstadoProyecto.PAUSADO,
    },
    {
        'nombre': 'Compra de camión atmosférico',
        'descripcion': '[DEMO] Unidad nueva para reemplazar el camión vencido. Servicio de limpieza de pozos a vecinos.',
        'presupuesto': Decimal('15000000'),
        'fecha_inicio': date(2026, 2, 15),
        'fecha_fin': date(2026, 8, 30),
        'estado': EstadoProyecto.ACTIVO,
    },
    {
        'nombre': 'Plaza del Bicentenario',
        'descripcion': '[DEMO] Remodelación de la plaza central: juegos, luminaria, bancos. Inaugurada en 2025.',
        'presupuesto': Decimal('3800000'),
        'fecha_inicio': date(2025, 6, 1),
        'fecha_fin': date(2025, 12, 15),
        'estado': EstadoProyecto.FINALIZADO,
    },
]


async def seed():
    engine = create_async_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as db:
        r = await db.execute(select(Municipio).where(Municipio.codigo == SPN_CODIGO))
        muni = r.scalar_one_or_none()
        if not muni:
            print(f"[!] No existe municipio con codigo '{SPN_CODIGO}'")
            return
        muni_id = muni.id
        print(f"[*] Municipio SPN id={muni_id}")

        creados = 0
        salteados = 0

        for p in PROYECTOS:
            q = await db.execute(
                select(Proyecto).where(
                    Proyecto.municipio_id == muni_id,
                    Proyecto.nombre == p['nombre'],
                    Proyecto.activo == True,  # noqa: E712
                )
            )
            if q.scalar_one_or_none():
                salteados += 1
                print(f"  [SKIP] {p['nombre']} ya existe")
                continue

            proyecto = Proyecto(
                municipio_id=muni_id,
                nombre=p['nombre'],
                descripcion=p['descripcion'],
                presupuesto=p['presupuesto'],
                fecha_inicio=p['fecha_inicio'],
                fecha_fin=p['fecha_fin'],
                estado=p['estado'],
                activo=True,
            )
            db.add(proyecto)
            creados += 1
            pct_label = p['estado'].value if hasattr(p['estado'], 'value') else p['estado']
            print(f"  [OK] {pct_label:12s}  {p['nombre']:50s} ${p['presupuesto']:,.0f}")

        await db.commit()

    await engine.dispose()
    print(f"\n[*] Resultado: {creados} creados, {salteados} ya existian")


if __name__ == '__main__':
    asyncio.run(seed())
