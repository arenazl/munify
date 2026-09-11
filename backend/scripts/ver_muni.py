# -*- coding: utf-8 -*-
"""UN MUNICIPIO ENTERO EN UNA PANTALLA, para que Claude lo lea rapido.

    python scripts/ver_muni.py 925
    python scripts/ver_muni.py arraga
    python scripts/ver_muni.py argentina-cazadores-correntinos
    python scripts/ver_muni.py 925 --crudo      tambien el texto de las corridas

Acepta el id numerico, el muni_key o un pedazo del nombre. Si el nombre es ambiguo
--"avellaneda" son tres municipios distintos-- los lista y no elige: la clave de un
municipio nunca es el nombre.

POR QUE EXISTE (dueno, 2026-09-10): cuando el dueno dice "mira el 925", lo que hace falta
es TODO lo de esa ficha de una sola vez y en formato denso -- no armar cuatro consultas,
no leer JSON indentado, no pedir contexto de a pedazos. Es una vista para trabajar, con
otro enfoque que la pantalla: ahi se muestra lo que sirve para vender, aca lo que sirve
para entender por que la ficha esta como esta.

Es SOLO LECTURA. Pega a la base de QA por el `.env` del backend.
"""
import asyncio
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text                                    # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine         # noqa: E402

from core.config import settings                               # noqa: E402


def corto(v, n=70):
    s = re.sub(r"\s+", " ", str(v or "")).strip()
    return (s[:n - 1] + "…") if len(s) > n else s


def jload(v, x):
    try:
        return json.loads(v) if v else x
    except (ValueError, TypeError):
        return x


async def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    clave = sys.argv[1]
    crudo = "--crudo" in sys.argv
    e = create_async_engine(settings.DATABASE_URL)
    async with e.begin() as c:
        if clave.isdigit():
            donde, param = "m.id = :v", {"v": int(clave)}
        elif "-" in clave:
            donde, param = "m.muni_key = :v", {"v": clave}
        else:
            donde, param = "m.municipio LIKE :v", {"v": "%" + clave + "%"}
        r = await c.execute(text(
            "SELECT m.id, m.muni_key, m.municipio, m.provincia, m.pais, m.tipo_gobierno, "
            "m.habitantes, m.intendente, m.cargo, m.partido, m.telefonos, m.telefonos_meta, "
            "m.mail, m.web, m.senal, m.ranking_score, m.etiquetas, m.economia, m.digital, "
            "m.curado_en, m.curado_por, m.oculto, m.motivo_oculto, m.codigo_indec, "
            "m.decision "
            "FROM calls_municipio m WHERE " + donde + " LIMIT 12"), param)
        filas = r.fetchall()
        if not filas:
            print("no encuentro nada con:", clave)
            await e.dispose(); return
        if len(filas) > 1:
            # la clave nunca es el nombre: "avellaneda" son tres municipios distintos
            print("hay %d que coinciden con '%s' -- elegi por id o muni_key:\n" % (len(filas), clave))
            for f in filas:
                print("   %-6s %-38s %-22s %s hab" % (f[0], f[1], f[3], f[6] or "?"))
            await e.dispose(); return

        f = filas[0]
        (mid, key, muni, prov, pais, tipo, hab, inten, cargo, partido, tels, tmeta,
         mail, web, senal, score, etiq, econ, digi, cur_en, cur_por, oculto,
         mot_oculto, indec, decision) = f

        print("=" * 86)
        print("%s  ·  %s  ·  %s" % (muni, prov, (pais or "argentina").title()))
        print("id %-6s  %-40s  INDEC %s" % (mid, key, indec or "—"))
        print("=" * 86)
        print("%-11s %s" % ("tipo", tipo or "—"))
        print("%-11s %s" % ("habitantes", hab or "—"))
        print("%-11s %s %s" % ("conduce", inten or "sin dato",
                               "(%s%s)" % (cargo or "", ", " + partido if partido else "") if cargo or partido else ""))
        print("%-11s %s" % ("web", web or "sin sitio"))
        print("%-11s %s" % ("mail", mail or "—"))
        print("%-11s %s   score %s" % ("señal", senal or "—", score))
        if oculto:
            print("%-11s OCULTA: %s" % ("estado", mot_oculto or "sin motivo"))
        if cur_en:
            print("%-11s %s por %s" % ("curada", cur_en, cur_por or "?"))

        # --- los telefonos, con lo que se sabe de cada uno --------------------
        lista, meta = jload(tels, []), jload(tmeta, {})
        print("\nTELEFONOS (%d)" % len(lista))
        if not lista:
            print("   ninguno")
        for i, t0 in enumerate(lista):
            m0 = meta.get(t0) or {}
            marca = m0.get("estado") or "sin marca"
            extra = " · ".join(x for x in (m0.get("caracteristica"), m0.get("fuente"),
                                           corto(m0.get("de"), 34)) if x)
            print("   %d. %-22s [%-11s] %s" % (i + 1, t0, marca, extra))
        r = await c.execute(text(
            "SELECT numero, de_donde, atiende FROM calls_telefonos WHERE muni_key = :k "
            "ORDER BY id"), {"k": key})
        normal = r.fetchall()
        if normal:
            print("   en calls_telefonos: " + " | ".join(
                "%s(%s%s)" % (n, d, "" if a is None else ", atiende=%s" % bool(a))
                for n, d, a in normal))

        # --- los hechos, que es lo que dibuja la pantalla ---------------------
        r = await c.execute(text(
            "SELECT tag, texto, peso, de_donde, universo, creado FROM calls_hechos "
            "WHERE muni_key = :k ORDER BY peso DESC, id LIMIT 40"), {"k": key})
        hechos = r.fetchall()
        print("\nHECHOS (%d)" % len(hechos))
        for tg, tx, pe, dd, uni, cr in hechos:
            print("   p%-2s %-26s %-9s %-9s %s" % (pe or 0, corto(tg, 26), uni or "—",
                                                   dd or "—", corto(tx, 44)))
        if not hechos:
            print("   ninguno — por eso la ficha puede estar puntuando bajo sin merecerlo")

        # --- que se trajo, cuando y con que -----------------------------------
        r = await c.execute(text(
            "SELECT id, variante, motor, modelo, creado, costo_usd, CHAR_LENGTH(texto), "
            "CHAR_LENGTH(COALESCE(prompt,'')) FROM calls_relatos WHERE muni_key = :k "
            "ORDER BY id DESC LIMIT 12"), {"k": key})
        relatos = r.fetchall()
        print("\nCORRIDAS (%d)" % len(relatos))
        for rid, var, mot, mod, cr, costo, largo, lp in relatos:
            print("   #%-4s %-18s %-8s %-19s %6s car  prompt %5s car  %s" % (
                rid, var or "—", mot or "—", str(cr)[:19], largo or 0, lp or 0,
                ("%.1f¢" % (100 * float(costo))) if costo else "gratis"))
        if not relatos:
            print("   ninguna — nunca se investigó este municipio")

        # --- la ponderacion, que es de donde sale el orden de la cola ----------
        r = await c.execute(text(
            "SELECT universo, fuerza, angulo, score_vecino, score_plata, score_operacion "
            "FROM calls_ponderacion WHERE muni_key = :k"), {"k": key})
        for uni, fue, ang, sv, sp, so in r.fetchall():
            print("\nPONDERACION  universo=%s  fuerza=%s  vecino=%s plata=%s operacion=%s"
                  % (uni, fue, sv, sp, so))
            print("   ángulo: %s" % corto(ang, 70))

        r = await c.execute(text(
            "SELECT capacidad, tiene, de_donde FROM calls_capacidades WHERE muni_key = :k"),
            {"k": key})
        caps = r.fetchall()
        if caps:
            print("\nCAPACIDADES  " + " | ".join(
                "%s=%s" % (cp, "sí" if ti else "no") for cp, ti, _ in caps))

        # --- EL LIBRETO: lo que la pantalla dice, seccion por seccion ---------
        # Es `decision`, el render ya cocinado: la botonera, el angulo con el que se
        # abre la llamada, los dolores y los rompehielos. Es lo que el dueno ve al
        # costado cuando dice "si arranco por reclamos" -- tenerlo aca evita abrir la
        # pantalla para saber de que esta hablando.
        dec = jload(decision, {})
        if dec:
            ang = dec.get("angulo") or {}
            uni = dec.get("universo") or {}
            print("\nLIBRETO")
            print("   score %-4s  universo %-10s fuerza %-8s margen %s" % (
                dec.get("score"), uni.get("universo") or "-", uni.get("fuerza") or "-",
                uni.get("margen")))
            if ang:
                print("   ANGULO   %s  [modulo %s]" % (corto(ang.get("nombre"), 44),
                                                       ang.get("modulo_app") or "-"))
                if ang.get("abrir_con"):
                    print("     abrir: %s" % corto(ang.get("abrir_con"), 72))
                if ang.get("por_que"):
                    print("     por:   %s" % corto(ang.get("por_que"), 72))
            if uni.get("hablar_con"):
                print("   HABLAR DE %s" % corto(uni.get("hablar_con"), 70))
            for sec, titulo in (("dolores", "DOLORES"), ("rompehielos", "ROMPEHIELOS"),
                                ("raros", "LO RARO")):
                xs = dec.get(sec) or []
                if xs:
                    print("   %-11s %s" % (titulo, " | ".join(
                        "%s(p%s)" % (x.get("nombre") or x.get("tag"), x.get("peso"))
                        for x in xs[:6])))
            bot = dec.get("botonera") or []
            if bot:
                print("   BOTONERA (%d)" % len(bot))
                for b in bot[:8]:
                    print("      %-22s %s" % (corto(b.get("titulo"), 22),
                                              corto(b.get("bajada"), 52)))
            porun = dec.get("botones_por_universo") or {}
            if porun:
                print("   POR UNIVERSO  " + " | ".join(
                    "%s:%d" % (k, len(v or [])) for k, v in porun.items()))
            fuera = dec.get("fuera_por_universo") or {}
            if any(fuera.values()):
                print("   QUEDO AFUERA  " + " | ".join(
                    "%s:%d" % (k, len(v or [])) for k, v in fuera.items() if v))
            caps = dec.get("capacidades") or {}
            if caps:
                print("   CAPACIDADES   " + " | ".join(
                    "%s=%s" % (k, "si" if v else "no") for k, v in caps.items()))
            pm = dec.get("preguntas_modulo") or {}
            if pm:
                print("   PREGUNTAS POR MODULO")
                for k, v in pm.items():
                    txt = v if isinstance(v, str) else " / ".join(str(x) for x in (v or []))
                    print("      %-5s %s" % (k, corto(txt, 68)))
            if dec.get("motivos"):
                print("   MOTIVOS DEL SCORE")
                for mo in (dec.get("motivos") or [])[:6]:
                    print("      . %s" % corto(mo, 74))

        if etiq:
            print("\nETIQUETAS  " + corto(jload(etiq, []), 76))
        if econ:
            print("\nECONOMIA   " + corto(econ, 76))
        if digi:
            print("DIGITAL    " + corto(digi, 76))

        if crudo and relatos:
            r = await c.execute(text(
                "SELECT id, variante, texto FROM calls_relatos WHERE muni_key = :k "
                "ORDER BY id DESC LIMIT 2"), {"k": key})
            for rid, var, tx in r.fetchall():
                print("\n" + "-" * 86)
                print("CRUDO #%s (%s)" % (rid, var))
                print("-" * 86)
                print(tx or "(vacío)")
    await e.dispose()


if __name__ == "__main__":
    asyncio.run(main())
