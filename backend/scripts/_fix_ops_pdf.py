import sys, os, asyncio, urllib.request
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

def exists(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=25) as r:
            return r.status == 200, r.headers.get("Content-Disposition")
    except Exception as e:
        return False, repr(e)

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as conn:
        rows = (await conn.execute(text(
            "SELECT id, factura_url FROM ordenes_pago "
            "WHERE factura_url LIKE '%/raw/upload/%' AND factura_url NOT LIKE '%.pdf'"
        ))).fetchall()
    print(f"OPs pendientes: {len(rows)}")
    for r in rows:
        id_, url = r._mapping['id'], r._mapping['factura_url']
        new_url = url + ".pdf"
        ok, cd = exists(new_url)
        if ok:
            eng2 = create_async_engine(settings.DATABASE_URL)
            async with eng2.begin() as c:
                await c.execute(text("UPDATE ordenes_pago SET factura_url=:u WHERE id=:i"), {"u": new_url, "i": id_})
            await eng2.dispose()
            print(f"  OP#{id_}: actualizada -> {new_url}  ({cd})")
        else:
            print(f"  OP#{id_}: el .pdf NO existe ({cd}) -> requiere resubir")
    # Re-auditoria final
    async with engine.connect() as conn:
        for tabla in ["gastos", "ordenes_pago"]:
            n = (await conn.execute(text(
                f"SELECT COUNT(*) FROM {tabla} WHERE factura_url LIKE '%/raw/upload/%' AND factura_url NOT LIKE '%.pdf'"
            ))).scalar()
            tot = (await conn.execute(text(
                f"SELECT COUNT(*) FROM {tabla} WHERE factura_url IS NOT NULL AND factura_url <> ''"
            ))).scalar()
            print(f"  [{tabla}] con archivo: {tot} | raw sin .pdf restantes: {n}")
    await engine.dispose()

asyncio.run(main())
