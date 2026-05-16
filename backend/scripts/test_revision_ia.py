"""Llama a analizar_reclamos() directo con muni real, ve si la IA responde."""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, selectinload
from sqlalchemy import select
from core.config import settings
from models.reclamo import Reclamo
from models.municipio_dependencia import MunicipioDependencia
from services.revision_ia import analizar_reclamos, cache_invalidate


async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    # Tomamos el primer muni con reclamos
    async with Session() as db:
        from sqlalchemy import text
        muni = (await db.execute(text("SELECT id, nombre FROM municipios LIMIT 1"))).fetchone()
        if not muni:
            print("No hay munis")
            return
        mid, nombre = muni
        print(f"Muni: {mid} {nombre}")
        cache_invalidate(mid, "reclamos")
        result = await db.execute(
            select(Reclamo)
            .options(selectinload(Reclamo.categoria))
            .where(Reclamo.municipio_id == mid)
            .order_by(Reclamo.created_at.desc())
            .limit(80)
        )
        reclamos = result.scalars().all()
        payload = [
            {
                "id": r.id,
                "titulo": r.titulo,
                "descripcion": r.descripcion,
                "estado": r.estado.value if r.estado else None,
                "direccion": r.direccion,
                "fecha_iso": r.created_at.isoformat() if r.created_at else None,
                "categoria": r.categoria.nombre if r.categoria else None,
                "dependencia": None,
            }
            for r in reclamos
        ]
        print(f"Mandando {len(payload)} reclamos a Gemini...")
        items = await analizar_reclamos(municipio_id=mid, reclamos=payload, force=True)
        print(f"\nRESPUESTA: {len(items)} items")
        for it in items[:5]:
            print(f"  - reclamo_id={it.get('reclamo_id')} tipo={it.get('tipo')} confianza={it.get('confianza')} hint={it.get('hint')[:80]}")
        if items and items[0].get("es_demo"):
            print("\n[!] ES DEMO — la IA no respondio bien")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
