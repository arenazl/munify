# -*- coding: utf-8 -*-
"""Pagar con tarjeta OBLIGA a elegir la tarjeta. Prueba la regla por HTTP.

Por que existe: la pantalla ya filtraba las cajas segun la forma de pago, pero
el endpoint aceptaba cualquier combinacion. Por ese agujero paso lo de San Pedro
Norte —los pagos del resumen entraron como gastos comunes contra Coparticipacion
y la caja de la tarjeta nunca se entero, cuatro meses— y por eso la regla ahora
vive en el backend. Una regla que solo esta en la pantalla no la ve el pago
programado, ni la API, ni una importacion.

Lo que verifica, en las dos direcciones:

  1. forma_pago = tarjeta contra una CAJA COMUN         -> 422, se rechaza
  2. forma_pago = transferencia contra la CAJA TARJETA  -> 422, se rechaza
  3. forma_pago = tarjeta contra la CAJA TARJETA        -> se crea
  4. forma_pago = transferencia contra una caja comun   -> se crea
  5. un PAGO PROGRAMADO a un contacto, con forma de pago tarjeta y una caja
     comun -> 422. Este es el caso exacto de San Pedro: el programado creaba
     todos los meses un gasto que decia "tarjeta" y no descontaba ninguna.
  6. una CARGA DE COMBUSTIBLE contra la tarjeta -> el gasto sale diciendo
     "tarjeta". Esa pantalla pide la caja pero no la forma de pago, asi que si
     la regla no dedujera, la nafta cargada con la tarjeta corporativa quedaria
     como "transferencia" sumandole deuda a la tarjeta en silencio.

Corre contra QA. Limpia lo que crea, y lo que no puede limpiar lo dice.

    python scripts/test_gasto_tarjeta_obligatoria.py
    python scripts/test_gasto_tarjeta_obligatoria.py --base http://localhost:8000
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

MARCA = "[TEST-REGLA-TARJETA]"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36"


class Api:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.token: str | None = None

    def login(self, email: str, password: str):
        datos = urllib.parse.urlencode({"username": email, "password": password}).encode()
        req = urllib.request.Request(f"{self.base}/api/auth/login", data=datos, method="POST")
        req.add_header("User-Agent", UA)
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, json.loads(r.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()[:300]

    def __call__(self, metodo: str, ruta: str, cuerpo=None):
        url = f"{self.base}/api{ruta}"
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
        req = urllib.request.Request(url, data=datos, method=metodo)
        req.add_header("User-Agent", UA)
        req.add_header("Accept", "application/json")
        if datos:
            req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                cuerpo_txt = r.read().decode()
                return r.status, (json.loads(cuerpo_txt) if cuerpo_txt else None)
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()[:400]


def lista_de(resp):
    if isinstance(resp, list):
        return resp
    if isinstance(resp, dict):
        for k in ("items", "results", "data", "contactos"):
            if isinstance(resp.get(k), list):
                return resp[k]
    return []


def _borrar_caja_de_verdad(caja_id: int) -> bool:
    """El DELETE de cajas es baja logica: para la basura de una prueba no alcanza."""
    url = os.environ.get("DATABASE_URL_QA") or os.environ.get("DATABASE_URL")
    if not url:
        return False
    try:
        from sqlalchemy import create_engine, text
    except ImportError:
        return False
    url = url.replace("mysql+aiomysql://", "mysql+pymysql://", 1)
    if url.startswith("mysql://"):
        url = url.replace("mysql://", "mysql+pymysql://", 1)
    try:
        eng = create_engine(url)
        with eng.begin() as cn:
            if "qa" not in (cn.execute(text("SELECT DATABASE()")).scalar() or "").lower():
                return False
            cn.execute(text("DELETE FROM tesoreria_movimientos_caja WHERE caja_id = :c"), {"c": caja_id})
            cn.execute(text("DELETE FROM tesoreria_cajas WHERE id = :c"), {"c": caja_id})
        eng.dispose()
        return True
    except Exception as e:
        print(f"   (no se pudo borrar la caja por SQL: {e})")
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://qa.munify.com.ar")
    ap.add_argument("--email", default="admin@merlo.demo.com")
    ap.add_argument("--password", default="demo123")
    a = ap.parse_args()

    api = Api(a.base)
    print(f"contra: {a.base}  ·  como: {a.email}\n")
    fallas = []

    def check(nombre, ok, detalle=""):
        print(f"   {'OK  ' if ok else 'FALLA'} {nombre}" + (f"  -> {detalle}" if detalle else ""))
        if not ok:
            fallas.append(nombre)

    st, r = api.login(a.email, a.password)
    if st != 200 or not isinstance(r, dict):
        print(f"   No se pudo entrar ({st}): {r}")
        sys.exit(2)
    api.token = r.get("access_token") or r.get("token")

    tarjeta_id = programado_id = None
    creados: list[int] = []
    try:
        st, cajas = api("GET", "/tesoreria/cajas")
        if st != 200:
            print(f"   no lista cajas: HTTP {st}")
            sys.exit(2)
        comun = next((c for c in lista_de(cajas) if not c.get("es_tarjeta")), None)
        check("hay una caja comun", comun is not None)
        if not comun:
            sys.exit(2)

        st, tar = api("POST", "/tesoreria/cajas", {
            "nombre": f"{MARCA} Visa de prueba", "codigo": "TARJETA",
            "saldo_inicial": 0, "activo": True,
        })
        check("crea la tarjeta", st in (200, 201), f"HTTP {st}")
        if st not in (200, 201):
            sys.exit(2)
        tarjeta_id = tar["id"]

        prov = None
        for ruta in ("/tesoreria/contactos?tipo=proveedor&page_size=1",
                     "/contactos?tipo=proveedor&page_size=1"):
            st, contactos = api("GET", ruta)
            lista = lista_de(contactos)
            if lista:
                prov = lista[0].get("id")
                break
        check("hay un proveedor", prov is not None)
        if prov is None:
            sys.exit(2)

        def gasto(nombre, forma, caja_id):
            st, g = api("POST", "/tesoreria/gastos", {
                "concepto": f"{MARCA} {nombre}",
                "monto_pesos": "1000.00",
                "fecha": str(date.today()),
                "destino_tipo": "contacto",
                "destino_contacto_id": prov,
                "forma_pago": forma,
                "estado_pago": "concretado",
                "tipo_financiacion": "contado",
                "caja_id": caja_id,
            })
            if st in (200, 201) and isinstance(g, dict):
                creados.append(g["id"])
            return st, g

        # ---- 1 y 2: las dos combinaciones que NO pueden entrar
        st, g = gasto("tarjeta contra caja comun", "tarjeta", comun["id"])
        check("RECHAZA pagar con tarjeta eligiendo una caja comun", st == 422,
              f"HTTP {st}: {str(g)[:120]}")

        st, g = gasto("transferencia contra la tarjeta", "transferencia", tarjeta_id)
        check("RECHAZA cargar a la tarjeta con otra forma de pago", st == 422,
              f"HTTP {st}: {str(g)[:120]}")

        # ---- 3 y 4: las que si
        st, g = gasto("tarjeta contra la tarjeta", "tarjeta", tarjeta_id)
        check("ACEPTA pagar con tarjeta eligiendo la tarjeta", st in (200, 201), f"HTTP {st}")

        st, g = gasto("transferencia contra caja comun", "transferencia", comun["id"])
        check("ACEPTA una transferencia desde una caja comun", st in (200, 201), f"HTTP {st}")

        # ---- 5: el caso de San Pedro, en el pago programado
        st, pp = api("POST", "/tesoreria/agenda", {
            "concepto": f"{MARCA} resumen",
            "contacto_id": prov,
            "caja_id": comun["id"],
            "monto_pesos": "1000.00",
            "forma_pago": "tarjeta",
            "frecuencia": "mensual",
            "dia_del_mes": 10,
            "fecha_inicio": str(date.today()),
        })
        if st in (200, 201) and isinstance(pp, dict):
            programado_id = pp.get("id")
        check("RECHAZA un programado 'con tarjeta' que apunta a una caja comun", st == 422,
              f"HTTP {st}: {str(pp)[:120]}")

        # ---- 6: la flota. Cargar nafta CON LA TARJETA es lo normal, y esa
        # pantalla pide la caja pero NO la forma de pago: el gasto tiene que
        # salir diciendo "tarjeta", no con el default del modelo.
        st, items = api("GET", "/flota/vehiculos")
        vehiculo = next((i for i in lista_de(items) if i.get("id")), None)
        if not vehiculo:
            print("   ----  no hay vehiculos en este muni: no se prueba la flota")
        else:
            st, carga = api("POST", "/flota/cargas", {
                "item_id": vehiculo["id"],
                "fecha": str(date.today()),
                "litros": 10,
                "importe": "1000.00",
                "caja_id": tarjeta_id,
                "contacto_id": prov,
            })
            ok = st in (200, 201)
            check("la flota acepta cargar combustible con la tarjeta", ok, f"HTTP {st}: {str(carga)[:120]}")
            if ok:
                gid = (carga or {}).get("gasto_id")
                if gid:
                    creados.append(gid)
                st, g = api("GET", f"/tesoreria/gastos/{gid}") if gid else (0, None)
                forma = (g or {}).get("forma_pago") if isinstance(g, dict) else None
                check("y el gasto que genera dice 'tarjeta', no el default",
                      forma == "tarjeta", f"forma_pago={forma!r}")
                cid = (carga or {}).get("id")
                if cid:
                    api("DELETE", f"/flota/cargas/{cid}")

    finally:
        print()
        pendiente = []
        for gid in creados:
            stg, _ = api("DELETE", f"/tesoreria/gastos/{gid}")
            if stg not in (200, 204, 404):
                pendiente.append(f"gasto {gid} (HTTP {stg})")
        if programado_id:
            api("DELETE", f"/tesoreria/agenda/{programado_id}")
        if tarjeta_id:
            api("DELETE", f"/tesoreria/cajas/{tarjeta_id}")
            if not _borrar_caja_de_verdad(tarjeta_id):
                pendiente.append(f"la caja {tarjeta_id} quedo INACTIVA, no borrada "
                                 f"(DELETE FROM tesoreria_cajas WHERE id = {tarjeta_id})")
        if pendiente:
            print("   OJO, quedo sin limpiar:")
            for x in pendiente:
                print(f"      - {x}")
        else:
            print("   limpieza: no quedo nada de la prueba")

    print("\n" + "=" * 62)
    print("  LA TARJETA ES OBLIGATORIA: " + ("TODO BIEN" if not fallas else f"FALLA -> {fallas}"))
    print("=" * 62)
    sys.exit(0 if not fallas else 1)


if __name__ == "__main__":
    main()
