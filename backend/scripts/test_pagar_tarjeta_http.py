# -*- coding: utf-8 -*-
"""El circuito de tarjeta POR EL CAMINO REAL: HTTP contra el backend de QA.

Por que existe, ademas del otro test: `test_circuito_tarjeta.py` llama a la
funcion del servicio por debajo. Este entra por la misma puerta que el cliente
-login, endpoints, permisos- porque el dueño vio capturas de Bartolo usando el
boton "Pagar tarjeta" y eligiendo la tarjeta. Si el boton no hace lo que tiene
que hacer, el problema esta en el camino HTTP, no en el servicio.

    crear la tarjeta -> tres gastos con esa tarjeta -> POST pagar-tarjeta
      -> la tarjeta tiene que quedar en CERO y NO tiene que haber un gasto nuevo

Corre contra QA (default `https://qa.munify.com.ar`). Limpia lo que crea.

    python scripts/test_pagar_tarjeta_http.py
    python scripts/test_pagar_tarjeta_http.py --base https://qa.munify.com.ar
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

MARCA = "[TEST-HTTP-TARJETA]"
MONTOS = ["125000.50", "89000.00", "34500.25"]
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

    def __call__(self, metodo: str, ruta: str, cuerpo=None, esperar=(200, 201)):
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


def _borrar_caja_de_verdad(caja_id: int) -> bool:
    """Borra la caja y sus movimientos de la base de QA. Devuelve si pudo.

    Existe porque el endpoint DELETE hace baja logica, que para un dato de
    produccion esta bien y para la basura de una prueba no: la caja sigue ahi.
    Sin `DATABASE_URL_QA` en el entorno no hace nada, y lo dice.
    """
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
                return False        # no es QA: aca no se borra nada
            cn.execute(text("DELETE FROM tesoreria_movimientos_caja WHERE caja_id = :c"),
                       {"c": caja_id})
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

    # ---- login, igual que el cliente. El endpoint es OAuth2 estandar: espera
    # `username` y `password` como FORMULARIO, no un JSON con email.
    st, r = api.login(a.email, a.password)
    if st != 200 or not isinstance(r, dict):
        print(f"   No se pudo entrar ({st}): {r}")
        sys.exit(2)
    api.token = r.get("access_token") or r.get("token")
    check("entra al sistema", bool(api.token))

    def lista_de(resp):
        """Normaliza la respuesta: algunos endpoints devuelven lista, otros
        {items: [...]}, y si hubo error viene un string. Nunca revienta."""
        if isinstance(resp, list):
            return resp
        if isinstance(resp, dict):
            for k in ("items", "results", "data", "contactos"):
                if isinstance(resp.get(k), list):
                    return resp[k]
        return []

    def deuda_de(tid):
        """La deuda como la ve la pantalla: del listado de cajas, que es lo que
        consume el front. El GET individual no devuelve el saldo calculado."""
        st, cajas = api("GET", "/tesoreria/cajas")
        for c in lista_de(cajas):
            if c.get("id") == tid:
                for k in ("deuda", "saldo", "saldo_actual", "disponible"):
                    if c.get(k) is not None:
                        return float(c[k]), k
        return None, None

    tarjeta_id = origen_id = None
    try:
        # ---- la caja de origen (de donde sale la plata) y la tarjeta
        st, cajas = api("GET", "/tesoreria/cajas")
        check("lista las cajas", st == 200, f"HTTP {st}")
        if st != 200:
            sys.exit(2)
        origen = next((c for c in lista_de(cajas) if (c.get("codigo") or "").upper() != "TARJETA"), None)
        check("hay una caja comun de donde pagar", origen is not None)
        if not origen:
            sys.exit(2)
        origen_id = origen["id"]

        st, tar = api("POST", "/tesoreria/cajas", {
            "nombre": f"{MARCA} Visa de prueba", "codigo": "TARJETA",
            "saldo_inicial": 0, "activo": True,
        })
        check("crea la tarjeta (caja tipo TARJETA)", st in (200, 201), f"HTTP {st}")
        if st not in (200, 201):
            print("      respuesta:", tar)
            sys.exit(2)
        tarjeta_id = tar["id"]

        # ---- deuda inicial
        d0, campo = deuda_de(tarjeta_id)
        check("la tarjeta nace en cero", d0 is not None and abs(d0) < 0.01, f"{campo}={d0}")

        # ---- tres gastos con la tarjeta, como los carga el cliente
        prov = None
        for ruta in ("/tesoreria/contactos?tipo=proveedor&page_size=1",
                     "/contactos?tipo=proveedor&page_size=1",
                     "/personas?tipo=proveedor&page_size=1"):
            st, contactos = api("GET", ruta)
            lista = lista_de(contactos)
            if lista:
                prov = lista[0].get("id")
                break
        check("hay un proveedor a quien pagarle", prov is not None)

        creados = []
        for i, monto in enumerate(MONTOS, start=1):
            st, g = api("POST", "/tesoreria/gastos", {
                "concepto": f"{MARCA} compra {i}",
                "monto_pesos": monto,
                "fecha": str(date.today()),
                "destino_tipo": "contacto",
                "destino_contacto_id": prov,
                "forma_pago": "tarjeta",
                "estado_pago": "concretado",
                "tipo_financiacion": "contado",
                "caja_id": tarjeta_id,
            })
            if st in (200, 201) and isinstance(g, dict):
                creados.append(g.get("id"))
            else:
                check(f"carga el gasto {i}", False, f"HTTP {st}: {str(g)[:160]}")
        check("carga los tres gastos con la tarjeta", len(creados) == 3, f"{len(creados)} de 3")

        # ---- EL BOTON: pagar tarjeta, sin monto = pagar todo
        st, pago = api("POST", "/tesoreria/cajas/pagar-tarjeta", {
            "tarjeta_caja_id": tarjeta_id,
            "caja_origen_id": origen_id,
            "fecha": str(date.today()),
            "concepto": f"{MARCA} pago del resumen",
        })
        check("el boton 'Pagar tarjeta' responde bien", st in (200, 201), f"HTTP {st}: {str(pago)[:200]}")

        # ---- lo que el cliente tiene que ver
        d1, campo = deuda_de(tarjeta_id)
        check("DESPUES DE PAGAR la tarjeta queda en CERO",
              d1 is not None and abs(d1) < 0.01, f"{campo}={d1}")

        st, gastos = api("GET", f"/tesoreria/gastos?search={MARCA.strip('[]')}&page_size=50")
        propios = [g for g in lista_de(gastos) if MARCA in (g.get("concepto") or "")]
        check("pagar NO creo un gasto nuevo", len(propios) == 3, f"{len(propios)} gastos con la marca (tienen que ser 3)")

    finally:
        # ---- limpieza, y DICIENDO que quedo.
        # El DELETE de cajas es una BAJA LOGICA (`activo = False`): por HTTP la
        # caja no se va, se esconde. La primera version de esta prueba decia
        # "limpieza ok" y dejo cuatro cajas [TEST-HTTP-TARJETA] en Merlo. Asi
        # que: por HTTP se borra lo que se puede (los gastos, que se llevan sus
        # movimientos), el remate -borrar la caja de verdad- va por SQL si hay
        # DATABASE_URL_QA a mano, y lo que no se pudo limpiar se IMPRIME.
        print()
        pendiente = []

        st, gastos = api("GET", f"/tesoreria/gastos?search={MARCA.strip('[]')}&page_size=50")
        for g in [x for x in lista_de(gastos) if MARCA in (x.get("concepto") or "")]:
            stg, _ = api("DELETE", f"/tesoreria/gastos/{g['id']}")
            if stg not in (200, 204, 404):
                pendiente.append(f"gasto {g['id']} (HTTP {stg})")

        if tarjeta_id:
            api("DELETE", f"/tesoreria/cajas/{tarjeta_id}")   # baja logica
            if not _borrar_caja_de_verdad(tarjeta_id):
                pendiente.append(
                    f"la caja {tarjeta_id} quedo INACTIVA, no borrada. Sin "
                    f"DATABASE_URL_QA hay que rematarla a mano: "
                    f"DELETE FROM tesoreria_cajas WHERE id = {tarjeta_id}")

        if pendiente:
            print("   OJO, quedo sin limpiar:")
            for x in pendiente:
                print(f"      - {x}")
        else:
            print("   limpieza: no quedo nada de la prueba")

    print("\n" + "=" * 62)
    print("  PAGAR TARJETA POR HTTP: " + ("TODO BIEN" if not fallas else f"FALLA -> {fallas}"))
    print("=" * 62)
    sys.exit(0 if not fallas else 1)


if __name__ == "__main__":
    main()
