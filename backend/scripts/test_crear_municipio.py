"""
Test manual: crea un municipio de prueba y verifica que el seed automático
de categorías (10 reclamo + 10 trámite) se haya ejecutado.

Uso:
    cd backend && python -m scripts.test_crear_municipio

Crea el municipio "Test City" (codigo: test-city). Si ya existía de un test
anterior, lo borra primero (cascade limpia las categorías sembradas).
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from core.config import settings
from models.municipio import Municipio
from models.categoria_reclamo import CategoriaReclamo
from models.categoria_tramite import CategoriaTramite
from services.categorias_default import crear_categorias_default


CODIGO_TEST = "test-city"
NOMBRE_TEST = "Test City"


async def run() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        # 1. Limpiar municipio de prueba previo si existe
        existing = await db.execute(
            select(Municipio).where(Municipio.codigo == CODIGO_TEST)
        )
        old = existing.scalar_one_or_none()
        if old:
            print(f"[CLEANUP] Borrando municipio previo #{old.id} ({old.nombre})")
            # Borrar manualmente categorías por si el cascade no actúa
            await db.execute(text(
                f"DELETE FROM categorias_reclamo WHERE municipio_id = {old.id}"
            ))
            await db.execute(text(
                f"DELETE FROM categorias_tramite WHERE municipio_id = {old.id}"
            ))
            await db.delete(old)
            await db.commit()

        # 2. Crear el municipio
        print(f"[CREATE] Creando municipio '{NOMBRE_TEST}'...")
        nuevo = Municipio(
            nombre=NOMBRE_TEST,
            codigo=CODIGO_TEST,
            descripcion="Municipio de prueba para validar el seed de categorias",
            latitud=-34.6037,
            longitud=-58.3816,
            radio_km=15.0,
            color_primario="#3B82F6",
            color_secundario="#1E40AF",
            activo=True,
        )
        db.add(nuevo)
        await db.flush()
        print(f"[CREATE] Municipio creado con id={nuevo.id}")

        # 3. Llamar al seed (lo mismo que hace POST /municipios)
        print("[SEED] Ejecutando crear_categorias_default...")
        cantidad = await crear_categorias_default(db, nuevo.id)
        print(f"[SEED] Sembradas {cantidad} categorias en total")

        await db.commit()

        # 4. Verificar
        cr = await db.execute(
            select(CategoriaReclamo)
            .where(CategoriaReclamo.municipio_id == nuevo.id)
            .order_by(CategoriaReclamo.orden)
        )
        cats_reclamo = cr.scalars().all()

        ct = await db.execute(
            select(CategoriaTramite)
            .where(CategoriaTramite.municipio_id == nuevo.id)
            .order_by(CategoriaTramite.orden)
        )
        cats_tramite = ct.scalars().all()

        print(f"\n[VERIFY] Municipio #{nuevo.id} ({nuevo.nombre}):")
        print(f"  Categorias de RECLAMO: {len(cats_reclamo)}")
        for c in cats_reclamo:
            print(f"    - [{c.orden:2}] {c.nombre:35s} (icono={c.icono}, color={c.color})")

        print(f"\n  Categorias de TRAMITE: {len(cats_tramite)}")
        for c in cats_tramite:
            print(f"    - [{c.orden:2}] {c.nombre:35s} (icono={c.icono}, color={c.color})")

        # 5. Resultado
        ok = len(cats_reclamo) == 10 and len(cats_tramite) == 10
        if ok:
            print(f"\n[OK] Test exitoso. Municipio '{NOMBRE_TEST}' (id={nuevo.id}) tiene 10+10 categorias.")
            print(f"\nPara probar via UI: login como superadmin, entrar al municipio,")
            print(f"y verificar las pantallas /gestion/categorias-reclamo y /gestion/categorias-tramite")
            print(f"\nPara borrar el municipio de prueba al terminar:")
            print(f"  cd backend && python -m scripts.test_crear_municipio --cleanup")
        else:
            print(f"\n[FAIL] Esperabamos 10+10 categorias y obtuvimos {len(cats_reclamo)}+{len(cats_tramite)}")

    await engine.dispose()


async def cleanup() -> None:
    """Borra el municipio de prueba y todas sus categorías."""
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        existing = await db.execute(
            select(Municipio).where(Municipio.codigo == CODIGO_TEST)
        )
        muni = existing.scalar_one_or_none()
        if not muni:
            print(f"[CLEANUP] No existe municipio con codigo '{CODIGO_TEST}'")
            return

        await db.execute(text(
            f"DELETE FROM categorias_reclamo WHERE municipio_id = {muni.id}"
        ))
        await db.execute(text(
            f"DELETE FROM categorias_tramite WHERE municipio_id = {muni.id}"
        ))
        await db.delete(muni)
        await db.commit()
        print(f"[CLEANUP] Borrado municipio #{muni.id} ({muni.nombre}) y sus categorias")

    await engine.dispose()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--cleanup":
        asyncio.run(cleanup())
    else:
        asyncio.run(run())
