"""
Desactiva todos los modulos del muni `san-pedro-norte` excepto:
  - dashboard
  - tesoreria

(Ajustes/Configuracion NO es un modulo activable — siempre se muestra).

El frontend lee `municipio_modulos` con la regla:
  - fila explicita activo=False -> ocultar item.
  - sin fila o activo=True -> mostrar (default).

Por eso este script INSERTA con activo=0 las claves a desactivar.
Es idempotente (UPSERT via INSERT ... ON DUPLICATE KEY UPDATE).
"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings  # noqa: E402

# Claves que el frontend chequea via moduloOn() en navigation.ts
MODULOS_A_DESACTIVAR = [
    'reclamos',
    'tramites',
    'tasas',
    'pagos',
    'mostrador',
    'mapa',
    'tablero',
    'planificacion',
    'sla',
    'panel-bi',
]


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        # Find muni
        muni = (await conn.execute(text("""
            SELECT id, nombre FROM municipios WHERE codigo = 'san-pedro-norte' LIMIT 1
        """))).fetchone()
        if not muni:
            print("[!] No existe el muni san-pedro-norte")
            return
        mid, nombre = muni
        print(f"Muni: {mid} ({nombre})")

        for modulo in MODULOS_A_DESACTIVAR:
            # UPSERT: si ya existe la fila la actualiza, sino la crea con activo=0
            await conn.execute(text("""
                INSERT INTO municipio_modulos (municipio_id, modulo, activo, created_at, updated_at)
                VALUES (:mid, :modulo, 0, NOW(), NOW())
                ON DUPLICATE KEY UPDATE activo = 0, updated_at = NOW()
            """), {"mid": mid, "modulo": modulo})
            print(f"  OK desactivado: {modulo}")

        # Asegurar que dashboard y tesoreria queden activos (idempotente)
        for modulo in ['dashboard', 'tesoreria']:
            await conn.execute(text("""
                INSERT INTO municipio_modulos (municipio_id, modulo, activo, created_at, updated_at)
                VALUES (:mid, :modulo, 1, NOW(), NOW())
                ON DUPLICATE KEY UPDATE activo = 1, updated_at = NOW()
            """), {"mid": mid, "modulo": modulo})
            print(f"  OK activado:    {modulo}")

    await engine.dispose()
    print("\n[DONE]")


if __name__ == "__main__":
    asyncio.run(main())
