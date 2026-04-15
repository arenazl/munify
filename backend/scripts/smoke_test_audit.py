"""Smoke test del módulo audit logs."""
import asyncio
import time
import httpx

BASE = "http://localhost:8002/api"


async def smoke():
    async with httpx.AsyncClient(timeout=90) as c:
        print("=" * 65)
        print("SMOKE TEST - Audit Logs")
        print("=" * 65)

        # 1. Login como vecino de chacabuco para tener token
        print("\n[1] Login admin chacabuco")
        r = await c.post(f"{BASE}/auth/login", data={
            "username": "admin@chacabuco.demo.com", "password": "demo123"
        })
        print(f"    Status: {r.status_code}")
        if r.status_code != 200:
            print(f"    ERROR: {r.text[:200]}")
            return
        admin_chacabuco_token = r.json()["access_token"]
        admin_chacabuco_h = {"Authorization": f"Bearer {admin_chacabuco_token}"}

        # 2. Verificar /auth/me devuelve is_super_admin=False (chacabuco tiene muni)
        print("\n[2] GET /auth/me como admin chacabuco -> is_super_admin?")
        r = await c.get(f"{BASE}/auth/me", headers=admin_chacabuco_h)
        me = r.json()
        print(f"    is_super_admin: {me.get('is_super_admin')} (esperado False)")

        # 3. Buscar super admin (sin municipio)
        print("\n[3] Buscar super admin en DB")
        from sqlalchemy.ext.asyncio import create_async_engine
        from sqlalchemy import text
        import sys, os
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from core.config import settings
        engine = create_async_engine(settings.DATABASE_URL)
        async with engine.connect() as conn:
            r2 = await conn.execute(text(
                "SELECT email FROM usuarios WHERE municipio_id IS NULL AND activo = 1 LIMIT 1"
            ))
            row = r2.fetchone()
            super_admin_email = row[0] if row else None
            print(f"    Super admin: {super_admin_email}")
        await engine.dispose()

        if not super_admin_email:
            print("    [WARN] no hay super admin en DB. Skipping super-admin tests.")
        else:
            # Login como super admin
            r = await c.post(f"{BASE}/auth/login", data={
                "username": super_admin_email, "password": "admin123"
            })
            if r.status_code != 200:
                print(f"    Falló login super admin con admin123, probando demo123...")
                r = await c.post(f"{BASE}/auth/login", data={
                    "username": super_admin_email, "password": "demo123"
                })
            if r.status_code == 200:
                super_h = {"Authorization": f"Bearer {r.json()['access_token']}"}
                me_r = await c.get(f"{BASE}/auth/me", headers=super_h)
                print(f"    super admin /me is_super_admin: {me_r.json().get('is_super_admin')} (esperado True)")
            else:
                super_h = None
                print(f"    [WARN] no pude loguear como super admin")

        # 4. Crear un demo (POST → debe loggearse)
        print("\n[4] POST /municipios/crear-demo (debe generar audit_log)")
        r = await c.post(f"{BASE}/municipios/crear-demo", json={"nombre": "Audit Test"})
        print(f"    Status: {r.status_code}")
        codigo = r.json().get("codigo") if r.status_code == 200 else None

        # Esperar que el background task escriba
        await asyncio.sleep(1.0)

        # 5. Verificar logs en DB
        print("\n[5] Verificar logs creados")
        engine = create_async_engine(settings.DATABASE_URL)
        async with engine.connect() as conn:
            r2 = await conn.execute(text(
                "SELECT method, path, status_code, duracion_ms, action, usuario_email, municipio_id "
                "FROM audit_logs ORDER BY created_at DESC LIMIT 5"
            ))
            for row in r2.fetchall():
                print(f"    {row[0]} {row[1]} {row[2]} {row[3]}ms action={row[4]} user={row[5]} muni={row[6]}")
        await engine.dispose()

        if super_h:
            # 6. Listar via endpoint admin
            print("\n[6] GET /admin/audit-logs como super admin")
            r = await c.get(f"{BASE}/admin/audit-logs?limit=5", headers=super_h)
            print(f"    Status: {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                print(f"    Total: {data['total']}, items en página: {len(data['items'])}")
                for item in data["items"][:3]:
                    print(f"      #{item['id']} {item['method']} {item['path']} {item['status_code']} ({item['duracion_ms']}ms) muni={item.get('municipio_nombre')}")

            # 7. Stats
            print("\n[7] GET /admin/audit-logs/stats")
            r = await c.get(f"{BASE}/admin/audit-logs/stats", headers=super_h)
            if r.status_code == 200:
                stats = r.json()
                print(f"    total_requests={stats['total_requests']} errors={stats['error_count']} p50={stats['p50_ms']}ms p95={stats['p95_ms']}ms")

            # 8. Acceso bloqueado para admin de muni
            print("\n[8] GET /admin/audit-logs como admin chacabuco (debe dar 403)")
            r = await c.get(f"{BASE}/admin/audit-logs?limit=5", headers=admin_chacabuco_h)
            print(f"    Status: {r.status_code} (esperado 403)")

            # 9. Toggle debug mode
            print("\n[9] Toggle debug_mode ON")
            r = await c.put(f"{BASE}/admin/settings/debug_mode", json={"enabled": True}, headers=super_h)
            print(f"    Status: {r.status_code} -> enabled={r.json().get('enabled')}")

            # Esperar invalidación de cache (TTL 30s sin tocar) — invalidamos en el handler ya
            await asyncio.sleep(0.5)

            # Hacer un GET ahora — debería loggearse en debug ON
            await c.get(f"{BASE}/municipios/public")
            await asyncio.sleep(1.0)

            # Apagar
            r = await c.put(f"{BASE}/admin/settings/debug_mode", json={"enabled": False}, headers=super_h)
            print(f"    OFF: enabled={r.json().get('enabled')}")

        # 10. Cleanup demo
        if codigo:
            print(f"\n[10] DELETE demo {codigo}")
            r = await c.delete(f"{BASE}/municipios/demo/{codigo}")
            print(f"    Status: {r.status_code}")

        print("\n" + "=" * 65)
        print("SMOKE TEST COMPLETADO")
        print("=" * 65)


if __name__ == "__main__":
    asyncio.run(smoke())
