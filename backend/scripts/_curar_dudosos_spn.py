"""Curación automática de los gastos [BARTOLO-DUDOSO] de SPN (muni 80).

V2 — "un punto más que conservador" (pedido del user 2026-07-02: es histórico,
sin caja ni movimientos; confía en el criterio). Lo verdaderamente ambiguo
sigue sin tocarse.

REGLAS (en orden de prioridad):
  1. HERENCIA: el contacto tiene >=2 gastos NO dudosos específicos y >=60%
     en el mismo concepto -> hereda ese concepto.
  2. CONCEJAL: contacto tipo 'concejal' -> 'Legislativo' (dieta/gastos Concejo).
  3. EMPLEADO tipo "Prensa" -> 'Prensa' (los 4 de prensa cobran pauta periódica).
  4. EMPLEADO (no prensa) con >=6 pagos periódicos dudosos -> 'Pago de sueldos
     y jornales' (jornalizado recurrente).
  5. PROFESIONAL -> 'Pago de honorarios profesionales'.
  6. BENEFICIARIO con >=2 pagos -> 'Aporte a subsidios y ayudas sociales'.
  7. RUBRO/KEYWORD en descripción o nombre del comercio:
     radio/fm/tele/canal/imprenta/gráfica -> Publicidad; ferretería/corralón ->
     Compra de materiales de obra; combustible/nafta/gasoil/YPF/Shell ->
     Compra de combustible; carpa/sonido/escenario/animación -> Eventos;
     desmalezamiento/trabajo máquina -> Obra pública; electricidad ->
     Reparación de edificios; licencias de conducir -> Servicios profesionales;
     elecciones -> Legislativo.

QUÉ TOCA: SOLO gastos.concepto y gastos.observaciones (cambia el tag
[BARTOLO-DUDOSO] por [BARTOLO-AUTO] con trazabilidad). NO toca montos, fechas,
cajas ni movimientos (verificado: los 1110 tienen caja_id NULL y 0 movimientos).

USO:  python scripts/_curar_dudosos_spn.py            (dry-run: muestra el plan)
      python scripts/_curar_dudosos_spn.py --aplicar  (backup JSON + UPDATE)
"""
import asyncio
import io
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime


def _norm(s: str) -> str:
    """minúsculas y sin tildes, para matchear conceptos con/sin acento."""
    s = unicodedata.normalize("NFD", (s or "").strip().lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402

MUNI = 80
GENERICOS = ("Compras varias", "Otros gastos", "Contrataciones varias",
             "Pagos varios", "Reparaciones varias", "Obras varias", "Aportes varios")
# Conceptos heredados que no están en el catálogo activo -> equivalente activo
ALIAS_CONCEPTO = {"Sueldo": "Pago de sueldos y jornales"}
BACKUP = os.path.join(os.path.dirname(__file__), f"_backup_curacion_spn_{datetime.now():%Y%m%d_%H%M%S}.json")


async def main(aplicar: bool):
    async with AsyncSessionLocal() as db:
        # normalizado -> nombre canónico del catálogo (resuelve variantes con/sin tilde)
        catalogo = {
            _norm(n): n
            for n in (await db.execute(text(
                "SELECT nombre FROM tesoreria_conceptos WHERE municipio_id = :m AND activo = 1"
            ), {"m": MUNI})).scalars().all()
        }

        dudosos = (await db.execute(text("""
            SELECT g.id, g.concepto, g.descripcion, g.observaciones,
                   g.destino_contacto_id AS cid,
                   CONCAT(c.nombre, ' ', COALESCE(c.apellido,'')) AS contacto,
                   c.tipo AS contacto_tipo,
                   te.nombre AS tipo_empleado
            FROM gastos g
            LEFT JOIN contactos c ON c.id = g.destino_contacto_id
            LEFT JOIN tesoreria_tipos_empleado te ON te.id = c.tipo_empleado_id
            WHERE g.municipio_id = :m AND g.activo = 1
              AND g.observaciones LIKE '%[BARTOLO-DUDOSO]%'
        """), {"m": MUNI})).mappings().all()

        # Cuántos pagos dudosos tiene cada contacto (para la regla de recurrencia)
        recurrencia = defaultdict(int)
        for g in dudosos:
            if g["cid"]:
                recurrencia[g["cid"]] += 1

        # Regla 1: herencia por contacto
        hist = (await db.execute(text("""
            SELECT g.destino_contacto_id AS cid, g.concepto, COUNT(*) AS n
            FROM gastos g
            WHERE g.municipio_id = :m AND g.activo = 1
              AND (g.observaciones IS NULL OR g.observaciones NOT LIKE '%[BARTOLO-DUDOSO]%')
              AND g.concepto NOT IN :genericos
              AND g.destino_contacto_id IS NOT NULL
            GROUP BY g.destino_contacto_id, g.concepto
        """), {"m": MUNI, "genericos": GENERICOS})).mappings().all()
        por_contacto = defaultdict(list)
        for r in hist:
            por_contacto[r["cid"]].append((r["concepto"], int(r["n"])))
        herencia = {}
        for cid, lst in por_contacto.items():
            lst.sort(key=lambda x: -x[1])
            total = sum(n for _, n in lst)
            top_c, top_n = lst[0]
            if total >= 2 and top_n / total >= 0.6:
                herencia[cid] = (ALIAS_CONCEPTO.get(top_c, top_c), f"herencia {top_n}/{total}")

        KW = [
            (("estación fm", "estacion fm", "teleocho", "radio ", "canal ", " fm", "imprenta", "gráfica", "grafica", "impacto color", "señal"), "Publicidad", "regla medios/gráfica"),
            (("ferreter", "corralón", "corralon"), "Compra de materiales de obra", "regla rubro ferretería/corralón"),
            (("combustible", "nafta", "gasoil", "ypf", "shell "), "Compra de combustible", "regla combustible"),
            (("carpa", "sonido", "escenario", "animación", "animacion", "show "), "Contratacion de eventos y actividades culturales", "regla eventos"),
            (("desmalezamiento", "trabajo máquina", "trabajo maquina", "motoniveladora"), "Obra publica / construccion", "regla obra/viales"),
            (("electricidad", "electricista"), "Reparacion de edificios e instalaciones", "regla electricidad"),
            (("licencias de conducir",), "Contratacion de servicios profesionales", "regla licencias (proveedor sistema)"),
            (("elecciones",), "Legislativo", "regla elecciones"),
        ]

        plan = []
        for g in dudosos:
            desc = (g["descripcion"] or "").strip().lower()
            cont = (g["contacto"] or "").lower()
            texto = f"{desc} {cont}"
            nuevo = motivo = None
            if g["cid"] in herencia:
                nuevo, motivo = herencia[g["cid"]]
            elif g["contacto_tipo"] == "concejal":
                nuevo, motivo = "Legislativo", "regla concejal (dieta/gastos Concejo)"
            elif g["contacto_tipo"] == "empleado" and _norm(g["tipo_empleado"] or "") == "prensa":
                nuevo, motivo = "Prensa", "regla empleado tipo Prensa"
            elif g["contacto_tipo"] == "empleado" and recurrencia.get(g["cid"], 0) >= 6:
                nuevo, motivo = "Pago de sueldos y jornales", f"regla empleado recurrente ({recurrencia[g['cid']]} pagos)"
            elif g["contacto_tipo"] == "profesional":
                nuevo, motivo = "Pago de honorarios profesionales", "regla profesional"
            elif g["contacto_tipo"] == "beneficiario" and recurrencia.get(g["cid"], 0) >= 2:
                nuevo, motivo = "Aporte a subsidios y ayudas sociales", "regla beneficiario recurrente"
            else:
                for kws, concepto_kw, motivo_kw in KW:
                    if any(k in texto for k in kws):
                        nuevo, motivo = concepto_kw, motivo_kw
                        break
            if not nuevo:
                continue
            canonico = catalogo.get(_norm(nuevo))
            if not canonico:
                print(f"SKIP {g['id']}: '{nuevo}' no está en el catálogo activo")
                continue
            nuevo = canonico
            if nuevo == g["concepto"]:
                continue
            plan.append({"id": g["id"], "viejo": g["concepto"], "nuevo": nuevo,
                         "motivo": motivo, "contacto": g["contacto"],
                         "obs_vieja": g["observaciones"]})

        # ===== Resumen del plan =====
        print(f"dudosos: {len(dudosos)} | a curar: {len(plan)} | quedan para revisión manual: {len(dudosos) - len(plan)}")
        dist = defaultdict(int)
        for p in plan:
            dist[p["nuevo"]] += 1
        print("\nDistribución destino:")
        for c, n in sorted(dist.items(), key=lambda x: -x[1]):
            print(f"  {n:4d} -> {c}")
        print("\nMuestra (10):")
        for p in plan[:10]:
            print(f"  #{p['id']} {p['contacto'][:28]:28s} '{p['viejo']}' -> '{p['nuevo']}' [{p['motivo']}]")

        if not aplicar:
            print("\nDRY-RUN (nada aplicado). Correr con --aplicar para ejecutar.")
        else:
            with io.open(BACKUP, "w", encoding="utf-8") as f:
                json.dump(plan, f, ensure_ascii=False, indent=1)
            print(f"\nBackup: {BACKUP}")
            for p in plan:
                obs_nueva = re.sub(
                    r"\[BARTOLO-DUDOSO\]",
                    f"[BARTOLO-AUTO {p['motivo']}]",
                    p["obs_vieja"] or "",
                )
                await db.execute(text(
                    "UPDATE gastos SET concepto = :c, observaciones = :o WHERE id = :i AND municipio_id = :m"
                ), {"c": p["nuevo"], "o": obs_nueva, "i": p["id"], "m": MUNI})
            await db.commit()
            restantes = (await db.execute(text(
                "SELECT COUNT(*) FROM gastos WHERE municipio_id = :m AND activo = 1 "
                "AND observaciones LIKE '%[BARTOLO-DUDOSO]%'"
            ), {"m": MUNI})).scalar()
            print(f"APLICADO: {len(plan)} gastos curados. Dudosos restantes: {restantes}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main("--aplicar" in sys.argv))
