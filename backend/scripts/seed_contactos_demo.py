"""Seed de contactos DEMO para San Pedro Norte (muni agrario).

REGLA #11 - Todos estos contactos son INVENTADOS, marcados como [DEMO]
en el campo `notas`. Sirven para mostrar las features (filtros por tipo,
imputacion a proyectos, etc.) en la demo de venta. No tienen DNI ni
coords reales (lat/lon = NULL). Las direcciones son genericas
("Calle X y Y, San Pedro Norte").

Cubre 5 contactos por cada tipo que faltaba poblar:
  - profesional (5)
  - proveedor (5)
  - contratista (5)
  - beneficiario (5)

Los empleados, concejales y turismo/cultura ya vienen del seed honesto
(seed_spn_honesto.py) con datos reales del Excel del intendente.

Idempotente: si encuentra un contacto con el mismo (nombre, apellido,
muni) lo saltea.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from models import Contacto, Municipio, TipoContacto
from core.config import settings

SPN_CODIGO = 'san-pedro-norte'
NOTA_DEMO = '[DEMO] Contacto de ejemplo generado para mostrar features. Borrar antes de uso real.'


def alias_pago(nombre: str, apellido: str | None) -> str:
    parts = [nombre.upper().replace(' ', '')]
    if apellido:
        parts.append(apellido.split()[0].upper())
    parts.append('SPN')
    return '.'.join(parts)


# ============================================================
# Datos por tipo (todos inventados, plausibles para muni agrario)
# ============================================================

PROFESIONALES = [
    {'nombre': 'Roberto', 'apellido': 'Méndez', 'subtipo': 'Abogado', 'direccion': 'Belgrano 234, San Pedro Norte'},
    {'nombre': 'Mariana', 'apellido': 'López', 'subtipo': 'Contadora', 'direccion': '25 de Mayo 512, San Pedro Norte'},
    {'nombre': 'Silvia', 'apellido': 'Romero', 'subtipo': 'Escribana', 'direccion': 'Av. San Martín 890, San Pedro Norte'},
    {'nombre': 'Pablo', 'apellido': 'Castro', 'subtipo': 'Médico clínico', 'direccion': 'Sarmiento 145, San Pedro Norte'},
    {'nombre': 'Jorge', 'apellido': 'Pereyra', 'subtipo': 'Veterinario', 'direccion': 'Ruta 1, km 3, San Pedro Norte'},
]

PROVEEDORES = [
    {'nombre': 'Ferretería', 'apellido': 'El Tornillo', 'subtipo': 'Ferretería', 'direccion': 'Av. San Martín 412, San Pedro Norte'},
    {'nombre': 'Corralón', 'apellido': 'San Cayetano', 'subtipo': 'Materiales construcción', 'direccion': 'Ruta 1, km 2, San Pedro Norte'},
    {'nombre': 'Atmosférica', 'apellido': 'El Túnel', 'subtipo': 'Limpieza pozos / cisternas', 'direccion': 'Belgrano 678, San Pedro Norte'},
    {'nombre': 'Distribuidora', 'apellido': 'El Surco', 'subtipo': 'Combustibles', 'direccion': 'Ruta 9, km 1, San Pedro Norte'},
    {'nombre': 'Agroinsumos', 'apellido': 'La Pampa', 'subtipo': 'Insumos agropecuarios', 'direccion': 'Ruta 1, km 4, San Pedro Norte'},
]

CONTRATISTAS = [
    {'nombre': 'Hernán', 'apellido': 'Olivero', 'subtipo': 'Arquitecto', 'direccion': 'Mitre 320, San Pedro Norte'},
    {'nombre': 'Carlos', 'apellido': 'Domínguez', 'subtipo': 'Maestro mayor de obras', 'direccion': 'Rivadavia 150, San Pedro Norte'},
    {'nombre': 'Tito', 'apellido': 'Suárez', 'subtipo': 'Albañil', 'direccion': 'Sarmiento 460, San Pedro Norte'},
    {'nombre': 'Mario', 'apellido': 'Acosta', 'subtipo': 'Electricista matriculado', 'direccion': 'Belgrano 89, San Pedro Norte'},
    {'nombre': 'Luis', 'apellido': 'Vega', 'subtipo': 'Plomero / gasista', 'direccion': '25 de Mayo 720, San Pedro Norte'},
]

BENEFICIARIOS = [
    {'nombre': 'Club Atlético', 'apellido': 'San Pedro Norte', 'subtipo': 'Club deportivo', 'direccion': 'Av. San Martín 1200, San Pedro Norte'},
    {'nombre': 'Cooperadora', 'apellido': 'Escuela Nº 73', 'subtipo': 'Cooperadora escolar', 'direccion': 'Belgrano 50, San Pedro Norte'},
    {'nombre': 'Centro de Jubilados', 'apellido': 'El Encuentro', 'subtipo': 'Centro de jubilados', 'direccion': 'Mitre 480, San Pedro Norte'},
    {'nombre': 'Bomberos Voluntarios', 'apellido': 'San Pedro Norte', 'subtipo': 'Bomberos voluntarios', 'direccion': 'Av. San Martín 30, San Pedro Norte'},
    {'nombre': 'Familia', 'apellido': 'Pereyra', 'subtipo': 'Ayuda social mensual', 'direccion': 'Calle interior 8, San Pedro Norte'},
]

DATOS_POR_TIPO: dict[TipoContacto, list[dict]] = {
    TipoContacto.PROFESIONAL: PROFESIONALES,
    TipoContacto.PROVEEDOR: PROVEEDORES,
    TipoContacto.CONTRATISTA: CONTRATISTAS,
    TipoContacto.BENEFICIARIO: BENEFICIARIOS,
}


async def seed():
    engine = create_async_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as db:
        # Obtener muni_id de SPN
        r = await db.execute(select(Municipio).where(Municipio.codigo == SPN_CODIGO))
        muni = r.scalar_one_or_none()
        if not muni:
            print(f"[!] No existe municipio con codigo '{SPN_CODIGO}'")
            return
        muni_id = muni.id
        print(f"[*] Municipio SPN id={muni_id}")

        creados = 0
        salteados = 0

        for tipo, items in DATOS_POR_TIPO.items():
            for item in items:
                # Idempotente: skip si ya existe (nombre + apellido + muni)
                q = await db.execute(
                    select(Contacto).where(
                        Contacto.municipio_id == muni_id,
                        Contacto.nombre == item['nombre'],
                        Contacto.apellido == item['apellido'],
                    )
                )
                if q.scalar_one_or_none():
                    salteados += 1
                    print(f"  [SKIP] {item['nombre']} {item['apellido']} ya existe")
                    continue

                ct = Contacto(
                    municipio_id=muni_id,
                    nombre=item['nombre'],
                    apellido=item['apellido'],
                    tipo=tipo,
                    subtipo=item['subtipo'],
                    direccion=item['direccion'],
                    latitud=None,
                    longitud=None,
                    alias_pago=alias_pago(item['nombre'], item['apellido']),
                    notas=NOTA_DEMO,
                    activo=True,
                )
                db.add(ct)
                creados += 1
                print(f"  [OK] {tipo.value:13s}  {item['nombre']} {item['apellido']} - {item['subtipo']}")

        await db.commit()

    await engine.dispose()
    print(f"\n[*] Resultado: {creados} creados, {salteados} ya existian")


if __name__ == '__main__':
    asyncio.run(seed())
