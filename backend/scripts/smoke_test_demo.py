"""Smoke test del seed demo completo + cleanup."""
import asyncio
import time
import httpx
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

BASE = "http://localhost:8002/api"


async def smoke():
    async with httpx.AsyncClient(timeout=60) as c:
        print("=" * 65)
        print("SMOKE TEST - Seed completo (zonas, empleados, cuadrillas, SLA)")
        print("=" * 65)

        # 1. Crear demo
        print()
        print("[1] POST /municipios/crear-demo")
        t0 = time.time()
        r = await c.post(f"{BASE}/municipios/crear-demo", json={"nombre": "Smoke Full v3"})
        t1 = time.time()
        print(f"    Status: {r.status_code} ({t1-t0:.1f}s)")
        if r.status_code != 200:
            print(f"    ERROR: {r.text[:500]}")
            return
        demo = r.json()
        codigo = demo["codigo"]
        muni_id = demo["id"]
        print(f"    OK: id={muni_id} codigo={codigo}")

        # 2. Verificación DB
        print()
        print("[2] Verificación DB")
        engine = create_async_engine(settings.DATABASE_URL)
        async with engine.connect() as conn:
            checks = [
                ("categorias_reclamo", 10),
                ("categorias_tramite", 10),
                ("municipio_dependencias", 5),
                ("municipio_dependencia_categorias", 10),
                ("tramites", 4),
                ("zonas", 6),
                ("barrios", 12),
                ("empleados", 7),
                ("cuadrillas", 3),
                ("sla_config", 5),
                ("reclamos", 4),
                ("solicitudes", 1),
                ("usuarios", 3),
            ]
            all_ok = True
            for tabla, expected in checks:
                try:
                    r2 = await conn.execute(
                        text(f"SELECT COUNT(*) FROM {tabla} WHERE municipio_id = :mid"),
                        {"mid": muni_id},
                    )
                    got = r2.scalar()
                    ok = "OK" if got == expected else "FAIL"
                    if got != expected:
                        all_ok = False
                    print(f"    [{ok}] {tabla}: {got} (esperado {expected})")
                except Exception as e:
                    print(f"    [ERR] {tabla}: {str(e)[:60]}")
                    all_ok = False

            # Intermedias
            for label, sql, expected in [
                (
                    "empleado_categorias",
                    f"SELECT COUNT(*) FROM empleado_categorias ec JOIN empleados e ON ec.empleado_id = e.id WHERE e.municipio_id = {muni_id}",
                    5,
                ),
                (
                    "empleado_cuadrillas",
                    f"SELECT COUNT(*) FROM empleado_cuadrillas ec JOIN empleados e ON ec.empleado_id = e.id WHERE e.municipio_id = {muni_id}",
                    6,
                ),
                (
                    "cuadrilla_categorias",
                    f"SELECT COUNT(*) FROM cuadrilla_categorias cc JOIN cuadrillas c ON cc.cuadrilla_id = c.id WHERE c.municipio_id = {muni_id}",
                    3,
                ),
                (
                    "historial_reclamos",
                    f"SELECT COUNT(*) FROM historial_reclamos hr JOIN reclamos r ON hr.reclamo_id = r.id WHERE r.municipio_id = {muni_id}",
                    7,
                ),
                (
                    "tramite_docs",
                    f"SELECT COUNT(*) FROM tramite_documentos_requeridos td JOIN tramites t ON td.tramite_id = t.id WHERE t.municipio_id = {muni_id}",
                    10,
                ),
            ]:
                try:
                    r2 = await conn.execute(text(sql))
                    got = r2.scalar()
                    ok = "OK" if got == expected else "FAIL"
                    print(f"    [{ok}] {label}: {got} (esperado {expected})")
                    if got != expected:
                        all_ok = False
                except Exception as e:
                    print(f"    [ERR] {label}: {str(e)[:60]}")

            # Coords en reclamos
            r2 = await conn.execute(
                text(
                    f"SELECT COUNT(*) FROM reclamos WHERE municipio_id = {muni_id} "
                    f"AND latitud IS NOT NULL AND longitud IS NOT NULL"
                )
            )
            got = r2.scalar()
            ok = "OK" if got == 4 else "FAIL"
            print(f"    [{ok}] reclamos con coords: {got} (esperado 4)")

        await engine.dispose()

        # 3. Login 3 roles
        print()
        print("[3] Login 3 roles")
        tokens = {}
        for role in ["admin", "supervisor", "vecino"]:
            r = await c.post(
                f"{BASE}/auth/login",
                data={"username": f"{role}@{codigo}.demo.com", "password": "demo123"},
            )
            status = "OK" if r.status_code == 200 else f"FAIL ({r.status_code})"
            print(f"    {role}: {status}")
            if r.status_code == 200:
                tokens[role] = r.json()["access_token"]

        admin_h = {"Authorization": f"Bearer {tokens['admin']}"}

        # 4. Endpoints
        print()
        print("[4] API endpoints (como admin)")
        endpoints = [
            ("/empleados", "Empleados"),
            ("/cuadrillas", "Cuadrillas"),
            ("/zonas", "Zonas"),
            ("/sla", "SLA configs"),
            (f"/reclamos?municipio_id={muni_id}", "Reclamos"),
            (f"/tramites?municipio_id={muni_id}", "Tramites"),
            ("/dependencias/municipio", "Dependencias"),
        ]
        for path, label in endpoints:
            try:
                r = await c.get(f"{BASE}{path}", headers=admin_h)
                data = r.json() if r.status_code == 200 else r.text[:80]
                count = len(data) if isinstance(data, list) else "?"
                print(f"    {label}: {r.status_code} -> {count}")
            except Exception as e:
                print(f"    {label}: ERROR {str(e)[:60]}")

        # 5. Demo-users
        print()
        print("[5] GET /municipios/public/{codigo}/demo-users (debería retornar 3)")
        r = await c.get(f"{BASE}/municipios/public/{codigo}/demo-users")
        users = r.json() if r.status_code == 200 else []
        print(f"    Status: {r.status_code}, users: {len(users)}")
        for u in users:
            print(f"      - {u['rol']}: {u['email']} (dep: {u.get('dependencia_nombre') or '-'})")

        # 6. Eliminar demo
        print()
        print("[6] DELETE /municipios/demo/{codigo}")
        r = await c.delete(f"{BASE}/municipios/demo/{codigo}")
        print(f"    Status: {r.status_code}")
        if r.status_code == 200:
            engine = create_async_engine(settings.DATABASE_URL)
            async with engine.connect() as conn:
                for t in [
                    "empleados",
                    "cuadrillas",
                    "zonas",
                    "barrios",
                    "sla_config",
                    "reclamos",
                    "solicitudes",
                    "categorias_reclamo",
                    "categorias_tramite",
                    "usuarios",
                ]:
                    try:
                        r2 = await conn.execute(
                            text(f"SELECT COUNT(*) FROM {t} WHERE municipio_id = :mid"),
                            {"mid": muni_id},
                        )
                        got = r2.scalar()
                        ok = "OK" if got == 0 else "FAIL"
                        print(f"    [{ok}] {t}: {got} huérfanos")
                    except Exception as e:
                        print(f"    [ERR] {t}: {str(e)[:50]}")
                # Municipio
                r2 = await conn.execute(
                    text(f"SELECT COUNT(*) FROM municipios WHERE id = {muni_id}")
                )
                got = r2.scalar()
                ok = "OK" if got == 0 else "FAIL"
                print(f"    [{ok}] municipios: {got}")
            await engine.dispose()

        print()
        print("=" * 65)
        print("SMOKE TEST COMPLETADO")
        print("=" * 65)


if __name__ == "__main__":
    asyncio.run(smoke())
