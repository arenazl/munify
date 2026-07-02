import sys, os, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        # Detectar tabla de ordenes de pago
        tabs = [r._mapping['Tables_in_'+settings.DATABASE_URL.rsplit('/',1)[-1].split('?')[0]] if False else list(r._mapping.values())[0]
                for r in (await conn.execute(text("SHOW TABLES LIKE '%orden%'"))).fetchall()]
        print("Tablas orden*:", tabs)
        print()

        for tabla, campo in [("gastos", "factura_url"), (tabs[0] if tabs else "ordenes_pago", "factura_url")]:
            print(f"== {tabla}.{campo} ==")
            try:
                tot = (await conn.execute(text(
                    f"SELECT COUNT(*) c FROM {tabla} WHERE {campo} IS NOT NULL AND {campo} <> ''"
                ))).scalar()
                raw = (await conn.execute(text(
                    f"SELECT COUNT(*) c FROM {tabla} WHERE {campo} LIKE '%/raw/upload/%'"
                ))).scalar()
                img = (await conn.execute(text(
                    f"SELECT COUNT(*) c FROM {tabla} WHERE {campo} LIKE '%/image/upload/%'"
                ))).scalar()
                # raw sin extension (no termina en .pdf)
                raw_noext = (await conn.execute(text(
                    f"SELECT COUNT(*) c FROM {tabla} WHERE {campo} LIKE '%/raw/upload/%' AND {campo} NOT LIKE '%.pdf'"
                ))).scalar()
                print(f"  total con archivo: {tot}  |  raw: {raw} (sin .pdf: {raw_noext})  |  image: {img}")
                # por municipio (solo los raw sin ext)
                rows = (await conn.execute(text(
                    f"SELECT municipio_id, COUNT(*) c FROM {tabla} "
                    f"WHERE {campo} LIKE '%/raw/upload/%' AND {campo} NOT LIKE '%.pdf' GROUP BY municipio_id"
                ))).fetchall()
                for r in rows:
                    print(f"     muni {r._mapping['municipio_id']}: {r._mapping['c']} a migrar")
            except Exception as e:
                print(f"  ERROR: {e}")
            print()

    await engine.dispose()
    # Cloudinary secret?
    has = bool(getattr(settings, 'CLOUDINARY_API_SECRET', '') or '')
    print(f"CLOUDINARY_API_SECRET presente: {has}  | cloud_name: {getattr(settings,'CLOUDINARY_CLOUD_NAME','?')}")

asyncio.run(main())
