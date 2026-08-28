# -*- coding: utf-8 -*-
"""
Corrección RETROACTIVA de los gastos con tarjeta — por la API, sin tocar la DB.

Hermano de `fix_gastos_tarjeta_prod.py`, que hace lo mismo por SQL. Este existe
porque la `DATABASE_URL` de producción es de Infra y no sale de su lado: acá
alcanza con un token de admin del municipio, que el dueño ya tiene en su sesión.

Y hay una ventaja real, no sólo de permisos: al reasignar por `PUT /gastos/{id}`
el backend ejecuta SU lógica de cambio de caja (mueve el movimiento, recalcula
saldos). El SQL directo tendría que replicar eso a mano.

QUÉ HACE
    Busca los gastos con forma_pago='tarjeta' que quedaron colgados de una caja
    REAL (Coparticipación, Tesoro…) y los reapunta a la caja-tarjeta. La caja
    recupera su plata y la deuda queda donde corresponde.

SEGURIDAD
    · Modo PLAN por defecto: lista y suma, no toca nada.
    · Para escribir: --apply --si-estoy-seguro.
    · Backup JSON del estado previo antes de escribir (con --revertir).
    · Idempotente: lo ya reapuntado se saltea.
    · El token se pasa por ENV (MUNIFY_TOKEN), nunca por parámetro visible.

USO
    MUNIFY_TOKEN="<jwt>" python -m scripts.fix_gastos_tarjeta_api --plan
    MUNIFY_TOKEN="<jwt>" python -m scripts.fix_gastos_tarjeta_api --apply --si-estoy-seguro
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import httpx

PROD = "https://app.munify.com.ar/api"
CODIGO_TARJETA = "TARJETA"


def _cli(base: str, token: str) -> httpx.Client:
    return httpx.Client(base_url=base, timeout=60.0,
                        headers={"Authorization": f"Bearer {token}"})


def _plata(v) -> str:
    return f"${float(v or 0):,.2f}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base", default=PROD, help="base de la API (default: producción)")
    ap.add_argument("--apply", action="store_true", help="ejecuta (sin esto: sólo plan)")
    ap.add_argument("--si-estoy-seguro", dest="seguro", action="store_true")
    ap.add_argument("--revertir", metavar="BACKUP.json")
    args = ap.parse_args()

    token = os.environ.get("MUNIFY_TOKEN", "").strip()
    if not token:
        raise SystemExit("ERROR: falta MUNIFY_TOKEN en el entorno (token de admin del muni).")

    with _cli(args.base, token) as cli:
        if args.revertir:
            datos = json.loads(Path(args.revertir).read_text(encoding="utf-8"))
            print(f"REVERTIR {len(datos['gastos'])} gastos desde {args.revertir}")
            if not (args.apply and args.seguro):
                print(">>> PLAN: nada tocado. Para ejecutar: --apply --si-estoy-seguro")
                return
            for g in datos["gastos"]:
                cli.put(f"/tesoreria/gastos/{g['id']}", json={"caja_id": g["caja_id"]})
            print("OK: estado previo restaurado.")
            return

        # --- quién soy y qué cajas hay ---
        me = cli.get("/auth/me")
        if me.status_code != 200:
            raise SystemExit(f"ERROR: el token no sirve ({me.status_code}). ¿Expiró?")
        yo = me.json()
        print(f"Municipio: {yo.get('municipio_id')}  ·  usuario: {yo.get('email')}")

        cajas = cli.get("/tesoreria/cajas", params={"include_saldos": True}).json()
        tarjetas = [c for c in cajas if c.get("es_tarjeta")]
        reales = {c["id"]: c for c in cajas if not c.get("es_tarjeta")}
        if not tarjetas:
            raise SystemExit("ERROR: el municipio no tiene ninguna caja-tarjeta. "
                             "Abrí Tesorería → Tarjetas una vez (se crea sola) y volvé a correr.")
        if len(tarjetas) > 1:
            print("Hay más de una tarjeta:")
            for t in tarjetas:
                print(f"   #{t['id']}  {t['nombre']}")
            raise SystemExit("ERROR: elegí a mano cuál usar (agregá --tarjeta <id> al script).")
        destino = tarjetas[0]
        print(f"Tarjeta destino: #{destino['id']} {destino['nombre']}  "
              f"(deuda hoy: {_plata(destino.get('deuda_actual'))})")

        # --- los gastos con tarjeta colgados de una caja real ---
        afectados, page, limit = [], 0, 200
        while True:
            r = cli.get("/tesoreria/gastos", params={"limit": limit, "offset": page * limit})
            if r.status_code != 200:
                raise SystemExit(f"ERROR listando gastos: {r.status_code} {r.text[:200]}")
            datos = r.json()
            items = datos if isinstance(datos, list) else datos.get("items", [])
            if not items:
                break
            for g in items:
                if g.get("forma_pago") == "tarjeta" and g.get("caja_id") in reales:
                    afectados.append(g)
            if len(items) < limit:
                break
            page += 1

        print("=" * 68)
        print(f"Gastos con tarjeta imputados a una caja real: {len(afectados)}")
        if not afectados:
            print("Nada para corregir (o ya se corrigió: es idempotente).")
            return

        por_caja: dict[str, list] = {}
        for g in afectados:
            por_caja.setdefault(reales[g["caja_id"]]["nombre"], []).append(g)
        print("\nPor caja afectada:")
        for nombre, lista in por_caja.items():
            total = sum(float(g.get("monto_pesos") or 0) for g in lista)
            print(f"  - {nombre}: {len(lista)} gastos, {_plata(total)} descontados de más")
        print(f"\nTOTAL a devolver a las cajas: "
              f"{_plata(sum(float(g.get('monto_pesos') or 0) for g in afectados))}")

        print("\nÚltimos 10:")
        for g in sorted(afectados, key=lambda x: x.get("fecha") or "")[-10:]:
            print(f"  #{g['id']}  {g.get('fecha')}  {_plata(g.get('monto_pesos')):>15}  "
                  f"{(g.get('concepto') or '')[:34]:<34} {reales[g['caja_id']]['nombre']}")

        if not (args.apply and args.seguro):
            print("\n>>> MODO PLAN: no se tocó nada.")
            print(">>> Para ejecutar: --apply --si-estoy-seguro")
            return

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        ruta = Path(__file__).parent / f"_backup_api_gastos_tarjeta_{stamp}.json"
        ruta.write_text(json.dumps({"base": args.base, "tarjeta": destino["id"],
                                    "gastos": [{"id": g["id"], "caja_id": g["caja_id"]}
                                               for g in afectados]},
                                   ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\nBACKUP: {ruta}")

        ok = fallo = 0
        for g in afectados:
            r = cli.put(f"/tesoreria/gastos/{g['id']}", json={"caja_id": destino["id"]})
            if r.status_code in (200, 201):
                ok += 1
            else:
                fallo += 1
                print(f"  ! gasto #{g['id']}: {r.status_code} {r.text[:120]}")
        print(f"\nOK: {ok} gastos reapuntados a la tarjeta. Fallaron: {fallo}.")

        cajas2 = cli.get("/tesoreria/cajas", params={"include_saldos": True}).json()
        print("\nSaldos después:")
        for c in cajas2:
            if c.get("es_tarjeta"):
                print(f"  {c['nombre']}: deuda {_plata(c.get('deuda_actual'))}")
            elif c["id"] in por_caja or c["nombre"] in por_caja:
                print(f"  {c['nombre']}: {_plata(c.get('saldo_actual'))}")


if __name__ == "__main__":
    sys.exit(main())
