import sys, os, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings
from core.security import get_password_hash

SPN_ID = 80
ADMIN_EMAIL = "munisanpedronorte@gmail.com"
# La password JAMÁS va hardcodeada (estuvo en texto plano acá — saneado
# 2026-07-02). Este script ya corrió y es histórico; si hiciera falta
# re-ejecutarlo, pasar la password por variable de entorno:
ADMIN_PASS = os.environ.get("SPN_ADMIN_PASS") or sys.exit(
    "Falta la variable de entorno SPN_ADMIN_PASS (no se hardcodea)."
)
ADMIN_NOMBRE = "Bartolo"

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        # 1. Columna es_demo (idempotente)
        existing = (await conn.execute(text("SHOW COLUMNS FROM municipios LIKE 'es_demo'"))).fetchall()
        if not existing:
            await conn.execute(text(
                "ALTER TABLE municipios ADD COLUMN es_demo TINYINT(1) NOT NULL DEFAULT 1"
            ))
            print("[OK] Columna es_demo creada (default 1)")
        else:
            print("[skip] Columna es_demo ya existe")

        # 2. SPN -> productivo (cerrojo)
        await conn.execute(text("UPDATE municipios SET es_demo = 0 WHERE id = :id"), {"id": SPN_ID})
        row = (await conn.execute(text(
            "SELECT id, nombre, codigo, activo, es_demo FROM municipios WHERE id = :id"
        ), {"id": SPN_ID})).fetchone()
        print(f"[OK] SPN: {dict(row._mapping)}")

        # 3. Admin Bartolo (idempotente por email)
        ex = (await conn.execute(text(
            "SELECT id, email, rol, municipio_id, activo, nombre FROM usuarios "
            "WHERE LOWER(email) = :em"
        ), {"em": ADMIN_EMAIL})).fetchone()
        if ex:
            print(f"[skip] Admin ya existe: {dict(ex._mapping)}")
        else:
            ph = get_password_hash(ADMIN_PASS)
            await conn.execute(text(
                "INSERT INTO usuarios "
                "(municipio_id, email, password_hash, nombre, apellido, rol, activo, "
                " es_anonimo, cuenta_verificada, nivel_verificacion, created_at) "
                "VALUES (:mid, :em, :ph, :nom, '', 'admin', 1, 0, 1, 1, NOW())"
            ), {"mid": SPN_ID, "em": ADMIN_EMAIL, "ph": ph, "nom": ADMIN_NOMBRE})
            new = (await conn.execute(text(
                "SELECT id, email, rol, municipio_id, activo, nombre FROM usuarios "
                "WHERE LOWER(email) = :em"
            ), {"em": ADMIN_EMAIL})).fetchone()
            print(f"[OK] Admin Bartolo creado: {dict(new._mapping)}")

        # 4. Verificacion: el login matchearia con el hash?
        from core.security import verify_password
        chk = (await conn.execute(text(
            "SELECT password_hash FROM usuarios WHERE LOWER(email) = :em"
        ), {"em": ADMIN_EMAIL})).fetchone()
        print(f"[verify] password '{ADMIN_PASS}' valida: {verify_password(ADMIN_PASS, chk._mapping['password_hash'])}")

    await engine.dispose()

asyncio.run(main())
