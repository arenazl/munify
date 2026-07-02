import sys, os, asyncio, re, urllib.request
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import cloudinary, cloudinary.uploader
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
)

def public_id_from_url(url):
    after = url.split("/upload/", 1)[1]
    after = re.sub(r"^v\d+/", "", after)
    return after

def verify(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url), timeout=25) as r:
            return r.status, r.headers.get("Content-Type"), r.headers.get("Content-Disposition")
    except Exception as e:
        return None, repr(e), None

async def migrate(mode):
    engine = create_async_engine(settings.DATABASE_URL)
    targets = []
    async with engine.connect() as conn:
        for tabla in ["gastos", "ordenes_pago"]:
            rows = (await conn.execute(text(
                f"SELECT id, factura_url FROM {tabla} "
                f"WHERE factura_url LIKE '%/raw/upload/%' AND factura_url NOT LIKE '%.pdf'"
            ))).fetchall()
            for r in rows:
                targets.append((tabla, r._mapping['id'], r._mapping['factura_url']))
    print(f"Candidatos a migrar: {len(targets)}")
    if mode == "test":
        targets = targets[:1]
    ok = fail = 0
    for tabla, id_, url in targets:
        pid = public_id_from_url(url)
        new_pid = pid + ".pdf"
        new_url = url + ".pdf"
        try:
            cloudinary.uploader.rename(pid, new_pid, resource_type="raw", overwrite=False, invalidate=True)
        except Exception as e:
            print(f"  RENAME FAIL {tabla}#{id_}: {e}")
            fail += 1
            continue
        eng2 = create_async_engine(settings.DATABASE_URL)
        async with eng2.begin() as c:
            await c.execute(text(f"UPDATE {tabla} SET factura_url=:u WHERE id=:i"), {"u": new_url, "i": id_})
        await eng2.dispose()
        ok += 1
        if mode == "test":
            st, ct, cd = verify(new_url)
            print(f"  {tabla}#{id_}")
            print(f"     nueva url: {new_url}")
            print(f"     verify:    HTTP {st} | Content-Type: {ct} | {cd}")
    print(f"\nResultado: OK={ok} FAIL={fail}")
    await engine.dispose()

asyncio.run(migrate(sys.argv[1] if len(sys.argv) > 1 else "test"))
