"""Test integral de la funcion `_sync_subtipo_empleado` contra el AMBIENTE VIVO.

Pega contra Cloud Run (prod). Verifica que al crear/editar un contacto empleado
con tipo_empleado_id, el backend deriva `subtipo` = nombre del tipo.

Crea un contacto [TEST] en muni 80, valida POST y PUT, y lo BORRA FISICO al
final (no soft-delete) para no dejar rastro en la base del cliente.
"""
import asyncio
import sys
import os
import requests

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

BASE = "https://munify-api-1060106389361.southamerica-east1.run.app"
EMAIL = "admin@san-pedro-norte.demo.com"
PWD = "demo123"
TIPO_CREATE = (1, "En blanco")    # (id, nombre esperado)
TIPO_UPDATE = (2, "Pasantes")


def login():
    r = requests.post(f"{BASE}/api/auth/login",
                      data={"username": EMAIL, "password": PWD}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def run_http():
    tok = login()
    H = {"Authorization": f"Bearer {tok}"}

    # POST: empleado con tipo_empleado_id, SIN subtipo
    payload = {"nombre": "[TEST] sync subtipo", "apellido": "BORRAR",
               "tipo": "empleado", "tipo_empleado_id": TIPO_CREATE[0]}
    r = requests.post(f"{BASE}/api/tesoreria/contactos", json=payload, headers=H, timeout=30)
    r.raise_for_status()
    c = r.json()
    cid = c["id"]
    got1 = c.get("subtipo")
    ok1 = got1 == TIPO_CREATE[1]
    print(f"POST id={cid}  subtipo={got1!r}  esperado={TIPO_CREATE[1]!r}  -> {'OK' if ok1 else 'FAIL'}")

    # PUT: cambio el tipo_empleado_id (NO mando subtipo) -> debe re-derivarse
    r = requests.put(f"{BASE}/api/tesoreria/contactos/{cid}",
                     json={"tipo_empleado_id": TIPO_UPDATE[0]}, headers=H, timeout=30)
    r.raise_for_status()
    c2 = r.json()
    got2 = c2.get("subtipo")
    ok2 = got2 == TIPO_UPDATE[1]
    print(f"PUT  id={cid}  subtipo={got2!r}  esperado={TIPO_UPDATE[1]!r}  -> {'OK' if ok2 else 'FAIL'}")

    # PUT mandando subtipo BASURA a mano -> el backend debe pisarlo con la FK
    r = requests.put(f"{BASE}/api/tesoreria/contactos/{cid}",
                     json={"subtipo": "valor-a-mano-basura"}, headers=H, timeout=30)
    r.raise_for_status()
    c3 = r.json()
    got3 = c3.get("subtipo")
    ok3 = got3 == TIPO_UPDATE[1]  # sigue siendo Pasantes (la FK no cambio)
    print(f"PUT  subtipo a mano -> backend devolvio {got3!r}  esperado={TIPO_UPDATE[1]!r}  -> {'OK' if ok3 else 'FAIL'}")

    return cid, (ok1 and ok2 and ok3)


async def cleanup(cid):
    from sqlalchemy import delete
    from core.database import AsyncSessionLocal, engine
    from models.contacto import Contacto
    async with AsyncSessionLocal() as db:
        await db.execute(delete(Contacto).where(Contacto.id == cid))
        await db.commit()
    await engine.dispose()
    print(f"cleanup: contacto {cid} borrado FISICO (no quedo rastro).")


if __name__ == "__main__":
    cid = None
    try:
        cid, passed = run_http()
        print(f"\nRESULT: {'PASS' if passed else 'FAIL'}")
    finally:
        if cid:
            asyncio.run(cleanup(cid))
