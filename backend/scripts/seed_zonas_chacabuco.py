"""
Script para cargar zonas/localidades del partido de Chacabuco.
Ejecutar: python -m scripts.seed_zonas_chacabuco
"""
import asyncio
import sys
sys.path.insert(0, '.')

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from core.config import settings

# Zonas/localidades del partido de Chacabuco
# Coordenadas aproximadas de cada localidad
ZONAS_CHACABUCO = [
    # Ciudad de Chacabuco - barrios
    {"nombre": "Chacabuco Centro", "codigo": "CHB-CENTRO", "lat": -34.6411, "lon": -60.4711},
    {"nombre": "Chacabuco Norte", "codigo": "CHB-NORTE", "lat": -34.6300, "lon": -60.4711},
    {"nombre": "Chacabuco Sur", "codigo": "CHB-SUR", "lat": -34.6520, "lon": -60.4711},
    {"nombre": "Chacabuco Este", "codigo": "CHB-ESTE", "lat": -34.6411, "lon": -60.4550},
    {"nombre": "Chacabuco Oeste", "codigo": "CHB-OESTE", "lat": -34.6411, "lon": -60.4900},

    # Localidades del partido
    {"nombre": "Rawson", "codigo": "CHB-RAWSON", "lat": -34.7333, "lon": -60.3167},
    {"nombre": "O'Higgins", "codigo": "CHB-OHIGGINS", "lat": -34.5667, "lon": -60.5833},
    {"nombre": "Castilla", "codigo": "CHB-CASTILLA", "lat": -34.5500, "lon": -60.4167},
    {"nombre": "San Cayetano", "codigo": "CHB-SCAYETANO", "lat": -34.6200, "lon": -60.4400},

    # Zonas rurales
    {"nombre": "Zona Rural", "codigo": "CHB-RURAL", "lat": -34.6500, "lon": -60.5000},
]

MUNICIPIO_ID = 7  # Chacabuco


async def main():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print("=" * 60)
        print("CARGANDO ZONAS PARA CHACABUCO (municipio_id=7)")
        print("=" * 60)

        # Verificar que existe el municipio
        result = await db.execute(text("SELECT id, nombre FROM municipios WHERE id = :id"), {"id": MUNICIPIO_ID})
        municipio = result.fetchone()
        if not municipio:
            print(f"\n[ERROR] No existe el municipio con id={MUNICIPIO_ID}")
            return

        print(f"\n[OK] Municipio encontrado: {municipio.nombre}")

        # Verificar zonas existentes
        result = await db.execute(
            text("SELECT COUNT(*) FROM zonas WHERE municipio_id = :mid"),
            {"mid": MUNICIPIO_ID}
        )
        count = result.scalar()
        if count > 0:
            print(f"\n[INFO] Ya existen {count} zonas para este municipio")
            respuesta = input("¿Desea eliminarlas y cargar las nuevas? (s/n): ")
            if respuesta.lower() != 's':
                print("[CANCELADO]")
                return

            await db.execute(text("DELETE FROM zonas WHERE municipio_id = :mid"), {"mid": MUNICIPIO_ID})
            await db.commit()
            print(f"[DELETE] Eliminadas {count} zonas existentes")

        # Insertar zonas
        print("\n[INSERT] Insertando zonas...")
        for zona in ZONAS_CHACABUCO:
            await db.execute(
                text("""
                    INSERT INTO zonas (municipio_id, nombre, codigo, latitud_centro, longitud_centro, activo)
                    VALUES (:mid, :nombre, :codigo, :lat, :lon, true)
                """),
                {
                    "mid": MUNICIPIO_ID,
                    "nombre": zona["nombre"],
                    "codigo": zona["codigo"],
                    "lat": zona.get("lat"),
                    "lon": zona.get("lon"),
                }
            )
            print(f"   + {zona['nombre']} ({zona['codigo']})")

        await db.commit()

        # Mostrar resultado
        print("\n" + "=" * 60)
        print("ZONAS CARGADAS")
        print("=" * 60)
        result = await db.execute(
            text("SELECT id, nombre, codigo FROM zonas WHERE municipio_id = :mid ORDER BY nombre"),
            {"mid": MUNICIPIO_ID}
        )
        for row in result.fetchall():
            print(f"  [{row.id:2}] {row.nombre:<30} {row.codigo}")

    await engine.dispose()
    print(f"\n[DONE] {len(ZONAS_CHACABUCO)} zonas cargadas para Chacabuco")


if __name__ == "__main__":
    asyncio.run(main())
