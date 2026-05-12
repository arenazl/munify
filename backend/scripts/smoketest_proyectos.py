"""Smoke test del feature Proyectos del modulo Tesoreria.

Cubre:
  1. CRUD de proyectos
  2. POST gasto con imputaciones a proyectos (N:M)
  3. Validacion: SUM > monto -> 422
  4. Validacion: proyecto inexistente -> 422
  5. Validacion: mismo proyecto duplicado -> 422
  6. PUT gasto reemplaza imputaciones
  7. GET gasto devuelve proyectos[]
  8. GET listado proyectos devuelve resumen agregado
"""
import asyncio
import sys
from pathlib import Path
import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))

API = "http://localhost:8002/api"


async def login(email: str, password: str) -> str:
    async with httpx.AsyncClient(timeout=30) as c:
        # OAuth2PasswordRequestForm exige application/x-www-form-urlencoded
        r = await c.post(f"{API}/auth/login", data={"username": email, "password": password})
        r.raise_for_status()
        return r.json()["access_token"]


async def smoketest():
    print("[*] Login admin")
    token = await login("admin@san-pedro-norte.demo.com", "demo123")
    H = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(base_url=API, headers=H, timeout=30) as c:
        # Limpieza: marcar inactivos los proyectos viejos del test
        r = await c.get("/tesoreria/proyectos", params={"search": "[TEST]", "activo": True})
        for p in r.json():
            await c.delete(f"/tesoreria/proyectos/{p['id']}")

        # ---------- 1. CREATE proyecto ----------
        print("[1] POST proyecto")
        r = await c.post("/tesoreria/proyectos", json={
            "nombre": "[TEST] Departamento vecindario",
            "descripcion": "Obra del depto del barrio",
            "presupuesto": 1000000,
            "estado": "activo",
        })
        assert r.status_code == 201, r.text
        p1 = r.json()
        print(f"    proyecto creado id={p1['id']} nombre={p1['nombre']}")

        r = await c.post("/tesoreria/proyectos", json={
            "nombre": "[TEST] Pavimentacion Av X",
            "presupuesto": 500000,
            "estado": "activo",
        })
        assert r.status_code == 201
        p2 = r.json()
        print(f"    proyecto 2 creado id={p2['id']}")

        # ---------- 2. LIST proyectos con resumen ----------
        print("[2] GET proyectos con include_resumen")
        r = await c.get("/tesoreria/proyectos", params={"include_resumen": True})
        assert r.status_code == 200
        proyectos = r.json()
        p1_data = next(p for p in proyectos if p["id"] == p1["id"])
        assert p1_data["resumen"]["total_imputado"] == "0.00" or float(p1_data["resumen"]["total_imputado"]) == 0
        assert p1_data["resumen"]["cantidad_gastos"] == 0
        print(f"    resumen inicial p1: total=$0 gastos=0")

        # ---------- 3. CREATE gasto con imputacion 60/40 ----------
        print("[3] POST gasto con imputaciones a 2 proyectos (60/40)")
        # Buscar un contacto existente
        r = await c.get("/tesoreria/contactos", params={"limit": 1, "activo": True})
        contactos = r.json()
        assert contactos, "No hay contactos para asignar al gasto"
        contacto_id = contactos[0]["id"]

        r = await c.post("/tesoreria/gastos", json={
            "destino_tipo": "contacto",
            "destino_contacto_id": contacto_id,
            "concepto": "[TEST] Cemento",
            "monto_pesos": 100000,
            "fecha": "2026-05-12",
            "tipo_financiacion": "contado",
            "forma_pago": "transferencia",
            "proyectos": [
                {"proyecto_id": p1["id"], "monto_asignado": 60000},
                {"proyecto_id": p2["id"], "monto_asignado": 40000},
            ],
        })
        assert r.status_code == 201, r.text
        gasto = r.json()
        assert len(gasto["proyectos"]) == 2
        print(f"    gasto id={gasto['id']} con {len(gasto['proyectos'])} imputaciones")
        for pr in gasto["proyectos"]:
            print(f"      - {pr['proyecto_nombre']}: ${pr['monto_asignado']}")

        # ---------- 4. Validacion SUM > monto -> 422 ----------
        print("[4] POST gasto con SUM imputaciones > monto debe fallar")
        r = await c.post("/tesoreria/gastos", json={
            "destino_tipo": "contacto",
            "destino_contacto_id": contacto_id,
            "concepto": "[TEST] Fallido",
            "monto_pesos": 100,
            "fecha": "2026-05-12",
            "tipo_financiacion": "contado",
            "proyectos": [{"proyecto_id": p1["id"], "monto_asignado": 200}],
        })
        assert r.status_code == 422, f"esperaba 422 got {r.status_code} {r.text}"
        print(f"    OK 422: {r.json().get('detail')}")

        # ---------- 5. Validacion proyecto inexistente -> 422 ----------
        print("[5] POST gasto con proyecto_id inexistente debe fallar")
        r = await c.post("/tesoreria/gastos", json={
            "destino_tipo": "contacto",
            "destino_contacto_id": contacto_id,
            "concepto": "[TEST] Fallido 2",
            "monto_pesos": 100,
            "fecha": "2026-05-12",
            "tipo_financiacion": "contado",
            "proyectos": [{"proyecto_id": 999999, "monto_asignado": 50}],
        })
        assert r.status_code == 422, f"esperaba 422 got {r.status_code}"
        print(f"    OK 422: {r.json().get('detail')}")

        # ---------- 6. Validacion proyecto duplicado -> 422 ----------
        print("[6] POST gasto con mismo proyecto dos veces debe fallar")
        r = await c.post("/tesoreria/gastos", json={
            "destino_tipo": "contacto",
            "destino_contacto_id": contacto_id,
            "concepto": "[TEST] Fallido 3",
            "monto_pesos": 100,
            "fecha": "2026-05-12",
            "tipo_financiacion": "contado",
            "proyectos": [
                {"proyecto_id": p1["id"], "monto_asignado": 30},
                {"proyecto_id": p1["id"], "monto_asignado": 20},
            ],
        })
        assert r.status_code == 422
        print(f"    OK 422: {r.json().get('detail')}")

        # ---------- 7. PUT gasto reemplaza imputaciones ----------
        print("[7] PUT gasto con nuevas proyecciones reemplaza las viejas")
        r = await c.put(f"/tesoreria/gastos/{gasto['id']}", json={
            "proyectos": [{"proyecto_id": p1["id"], "monto_asignado": 80000}],
        })
        assert r.status_code == 200, r.text
        updated = r.json()
        assert len(updated["proyectos"]) == 1
        assert updated["proyectos"][0]["proyecto_id"] == p1["id"]
        assert float(updated["proyectos"][0]["monto_asignado"]) == 80000
        print(f"    OK: ahora tiene 1 imputacion de $80.000 a {updated['proyectos'][0]['proyecto_nombre']}")

        # ---------- 8. Listado proyectos refleja el resumen ----------
        print("[8] GET proyectos: resumen actualizado")
        r = await c.get("/tesoreria/proyectos", params={"include_resumen": True})
        proyectos = r.json()
        p1_after = next(p for p in proyectos if p["id"] == p1["id"])
        p2_after = next(p for p in proyectos if p["id"] == p2["id"])
        assert float(p1_after["resumen"]["total_imputado"]) == 80000
        assert p1_after["resumen"]["cantidad_gastos"] == 1
        # p2 quedo sin imputacion porque el PUT la elimino
        assert float(p2_after["resumen"]["total_imputado"]) == 0
        assert p2_after["resumen"]["cantidad_gastos"] == 0
        print(f"    OK p1: ${p1_after['resumen']['total_imputado']} en {p1_after['resumen']['cantidad_gastos']} gasto(s)")
        print(f"    OK p2: ${p2_after['resumen']['total_imputado']} en {p2_after['resumen']['cantidad_gastos']} gasto(s)")
        print(f"    p1 porcentaje presupuesto: {p1_after['resumen']['porcentaje_presupuesto']:.2f}%")

        # ---------- 9. GET gasto individual devuelve proyectos[] ----------
        print("[9] GET /tesoreria/gastos/{id} devuelve proyectos[]")
        r = await c.get(f"/tesoreria/gastos/{gasto['id']}")
        assert r.status_code == 200
        g = r.json()
        assert "proyectos" in g
        assert len(g["proyectos"]) == 1
        print(f"    OK: proyectos[] presente con {len(g['proyectos'])} imputacion")

        # ---------- 10. DELETE proyecto (soft) ----------
        print("[10] DELETE proyecto (soft)")
        r = await c.delete(f"/tesoreria/proyectos/{p1['id']}")
        assert r.status_code == 200
        r = await c.delete(f"/tesoreria/proyectos/{p2['id']}")
        assert r.status_code == 200

        # ---------- Limpieza: borrar el gasto de test ----------
        await c.delete(f"/tesoreria/gastos/{gasto['id']}")
        print("    OK limpieza")

    print("\n[*] OK Smoke test pasa: 10/10")


if __name__ == "__main__":
    asyncio.run(smoketest())
