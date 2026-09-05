# -*- coding: utf-8 -*-
"""
Carga reclamos de demo en Villa Carlos Paz (QA) para poder JUZGAR el mapa.

Por que existe
--------------
El municipio tenia 50 reclamos repartidos en 45 barrios: uno por barrio. Con ese
volumen no se puede evaluar nada del mapa --ni el mapa de calor, ni los hotspots,
ni "donde no llegamos"-- porque no hay concentracion que mostrar. El dueno lo
dijo asi (2026-09-05): "con tan pocos reclamos no se entiende si es util o no".

Que carga
---------
- 200 reclamos repartidos por TODO el municipio (no solo donde hay contorno).
- Fechas de enero a hoy, con mas volumen hacia el presente.
- TODOS los estados del enum, coherentes con la antiguedad: lo viejo mayormente
  cerrado, lo nuevo abierto. Un reclamo de enero en estado "nuevo" seria una
  demo que se delata sola.
- Distribucion DESPAREJA a proposito: unos pocos barrios concentran (el centro,
  la costanera, las zonas comerciales) y la cola larga tiene uno o dos. Es como
  se comporta un municipio de verdad, y es la unica forma de que el mapa de
  calor tenga algo que decir. Repartir 200 en partes iguales daria una mancha
  uniforme, que no es un dato sino un promedio.
- Coordenadas DENTRO del poligono del barrio cuando lo tiene (por rechazo); si
  no lo tiene, alrededor de su centro. Nunca una coordenada al azar sobre el
  municipio: el punto tiene que caer donde dice que cae.

Determinista: misma semilla, mismos datos. Correrlo dos veces no duplica nada
si primero se borra con --limpiar.

Uso:
    python scripts/seed_reclamos_carlos_paz.py --env qa --aplicar
    python scripts/seed_reclamos_carlos_paz.py --env qa --aplicar --limpiar
"""
import argparse
import asyncio
import json
import math
import os
import random
import sys
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding="utf-8")

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

MUNI = 1000196          # Villa Carlos Paz
ZONA = 1000849          # su Zona unica
SEMILLA = 20260905
TOTAL = 200
DESDE = datetime(2026, 1, 1)
HASTA = datetime(2026, 9, 5, 20, 0)

# Los barrios que concentran. Salen de como funciona una ciudad turistica
# serrana: el centro y la costanera reciben mucho mas que un barrio residencial
# de las afueras.
PESOS_ALTOS = {
    "Centro": 26, "Costa Azul": 20, "Santa Rita del Lago": 16, "Villa del Lago": 14,
    "Playas de Oro": 12, "Sol y Lago": 11, "Colinas": 10, "Miguel Muñoz B": 9,
    "Carlos Paz Sierras": 8, "La Quinta": 8,
}

# titulo, descripcion, prioridad. El texto tiene que sonar a vecino, no a
# formulario: es lo que se lee en el tooltip del pin y en el detalle.
GUION = {
    "Alumbrado público": [
        ("Cuadra entera a oscuras", "Se cortó la luz de toda la cuadra y a la noche no se ve nada para caminar.", 3),
        ("Luminaria que prende y apaga", "El foco de la esquina titila toda la noche, prende un rato y se apaga.", 2),
        ("Reflectores de la plaza quemados", "Los reflectores no encienden y los chicos no pueden usar la plaza de noche.", 3),
        ("Poste de luz inclinado", "El poste quedó torcido después de la tormenta y da miedo pasar por abajo.", 4),
        ("Sin luz en la parada del colectivo", "La parada quedó a oscuras y se junta gente esperando sin ver nada.", 3),
    ],
    "Bacheo y calles": [
        ("Bache profundo en plena calzada", "El pozo tiene casi medio metro y ya reventó la goma de dos autos esta semana.", 4),
        ("Badén roto que hace saltar a los autos", "El badén se partió al medio y los autos lo cruzan a los saltos.", 3),
        ("Calle de tierra intransitable", "Con la lluvia se hizo un barrial y no pasa ni el auto ni la ambulancia.", 3),
        ("Cordón cuneta destruido", "El cordón está partido en varios tramos y el agua se mete a los terrenos.", 2),
        ("Se hundió el asfalto sobre la boca de tormenta", "El asfalto cedió justo arriba del desagüe y el pozo crece cada día.", 4),
    ],
    "Recolección de residuos": [
        ("El camión no pasa hace tres días", "Hace tres días que no pasa el recolector y la basura se acumula en la vereda.", 3),
        ("Microbasural en el baldío", "Están tirando escombros y bolsas en el terreno de la esquina.", 3),
        ("Contenedor roto y desbordado", "El contenedor perdió la tapa y la basura se vuela por toda la cuadra.", 2),
        ("Restos de poda sin levantar", "Quedaron las ramas de la poda hace dos semanas juntando bichos.", 2),
    ],
    "Espacios verdes y arbolado": [
        ("Poda urgente: ramas contra los cables", "Las ramas rozan los cables de luz y hacen chispas con el viento.", 4),
        ("Árbol caído corta la vereda", "El árbol se vino abajo con la tormenta y hay que caminar por la calle.", 4),
        ("Pasto alto en la plaza", "El pasto está a la altura de la rodilla y no se puede usar la plaza.", 2),
        ("Juegos de la plaza rotos", "Dos hamacas están cortadas y el tobogán tiene una chapa levantada.", 3),
    ],
    "Agua y cloacas": [
        ("Pérdida de agua en la vereda", "Hace días que sale agua de abajo del asfalto y se está haciendo un pozo.", 3),
        ("Olor a cloaca en la esquina", "Sale olor fuerte de la boca de registro, sobre todo a la tarde.", 3),
        ("Boca de tormenta tapada", "El desagüe está tapado con hojas y tierra, se inunda con cualquier lluvia.", 3),
    ],
    "Tránsito y señalización": [
        ("Semáforo intermitente todo el día", "El semáforo quedó en amarillo titilando y es un cruce peligroso.", 4),
        ("Falta el cartel de PARE", "Alguien se llevó el cartel de la esquina y los autos cruzan de largo.", 3),
        ("Senda peatonal borrada", "La pintura de la senda desapareció justo frente a la escuela.", 3),
        ("Autos estacionados sobre la rampa", "Tapan la rampa de la esquina y no se puede cruzar con el cochecito.", 2),
    ],
    "Animales y zoonosis": [
        ("Perros sueltos en la plaza", "Hay una jauría que asusta a los chicos en la plaza a la tarde.", 3),
        ("Caballo suelto en la calle", "Un caballo anda suelto entre los autos desde ayer.", 3),
        ("Nido de ratas en el baldío", "Con la basura acumulada aparecieron ratas y ya entran a las casas.", 4),
    ],
    "Seguridad": [
        ("Graffiti en el frente del edificio municipal", "Aparecieron pintadas en el frente durante el fin de semana.", 2),
        ("Cámara de seguridad rota", "La cámara de la esquina está colgando y no debe estar filmando.", 3),
    ],
}

# POR QUE queda frenado un trabajo: el motivo tipificado y como se cuenta en el
# comentario. Los dos juntos, porque en la vida real van juntos --el que
# pospone elige de la lista Y escribe que paso-- y porque un motivo sin su
# frase no se puede leer en el detalle del reclamo.
PAUSAS = [
    ("materiales",  "Falta el material: se pidió a compras y todavía no llegó.", 26),
    ("presupuesto", "Se difiere hasta la próxima licitación de materiales.", 14),
    ("tercero",     "Depende de una obra de la empresa de agua que todavía no tiene fecha.", 14),
    ("otra_obra",   "Se pospone hasta terminar el bacheo del corredor, para no romper dos veces.", 12),
    ("personal",    "No hay cuadrilla disponible: la dotación está afectada a otra zona.", 12),
    ("clima",       "Frenado por el temporal: la cuadrilla no puede intervenir con esta lluvia.", 10),
    ("sin_acceso",  "No se pudo entrar al lugar: el portón estaba cerrado y no atendió nadie.", 8),
    ("otro",        "Diferido por disposición de la Secretaría.", 4),
]
# Se repite cada motivo segun su peso: en un municipio los materiales frenan
# mucho mas seguido que un porton cerrado, y un reparto parejo diria lo
# contrario de lo que pasa.
PAUSAS_POOL = [p for p in PAUSAS for _ in range(p[2])]

CANALES = ["app", "app", "app", "whatsapp", "whatsapp", "ventanilla_asistida", "telefono"]


def punto_en_poligono(lat, lng, anillo):
    dentro = False
    j = len(anillo) - 1
    for i in range(len(anillo)):
        lat_i, lng_i = anillo[i]
        lat_j, lng_j = anillo[j]
        if (lng_i > lng) != (lng_j > lng):
            if lat < (lat_j - lat_i) * (lng - lng_i) / (lng_j - lng_i) + lat_i:
                dentro = not dentro
        j = i
    return dentro


def punto_en_barrio(rnd, anillo, centro):
    """Un punto que cae DE VERDAD en el barrio.

    Con contorno: se sortea dentro de su caja y se descarta lo que cae afuera
    (30 intentos; un barrio con forma de L necesita varios). Sin contorno: se
    dispersa alrededor del centro con desvio de ~200 m, que es el tamano tipico
    de un par de manzanas --no se finge una precision que no se tiene.
    """
    if anillo:
        lats = [p[0] for p in anillo]
        lngs = [p[1] for p in anillo]
        for _ in range(30):
            lat = rnd.uniform(min(lats), max(lats))
            lng = rnd.uniform(min(lngs), max(lngs))
            if punto_en_poligono(lat, lng, anillo):
                return round(lat, 6), round(lng, 6)
        return round(sum(lats) / len(lats), 6), round(sum(lngs) / len(lngs), 6)
    clat, clng = centro
    d = 0.0018  # ~200 m
    return (round(clat + rnd.gauss(0, d), 6),
            round(clng + rnd.gauss(0, d / max(math.cos(math.radians(clat)), 0.1)), 6))


def estado_para(dias_atras, rnd):
    """El estado que le corresponde a un reclamo de esa edad.

    Un reclamo de hace ocho meses en "nuevo" no existe en un municipio que
    funciona; uno de ayer "finalizado" tampoco. La edad manda, con una minoria
    de casos que se salen de la norma --los pospuestos y rechazados viejos son
    justamente los que hacen interesante el tablero.
    """
    r = rnd.random()
    if dias_atras > 150:
        if r < 0.68: return "finalizado"
        if r < 0.80: return "resuelto"
        if r < 0.88: return "pospuesto"
        if r < 0.95: return "rechazado"
        return "en_curso"
    if dias_atras > 60:
        if r < 0.45: return "finalizado"
        if r < 0.58: return "resuelto"
        if r < 0.72: return "en_curso"
        if r < 0.80: return "en_proceso"
        if r < 0.88: return "pospuesto"
        if r < 0.94: return "asignado"
        return "rechazado"
    if dias_atras > 20:
        if r < 0.20: return "finalizado"
        if r < 0.30: return "resuelto"
        if r < 0.48: return "en_curso"
        if r < 0.60: return "en_proceso"
        if r < 0.72: return "pendiente_confirmacion"
        if r < 0.85: return "asignado"
        return "recibido"
    if r < 0.32: return "recibido"
    if r < 0.55: return "nuevo"
    if r < 0.75: return "asignado"
    if r < 0.90: return "en_proceso"
    return "en_curso"


CERRADOS = {"finalizado", "resuelto", "rechazado"}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", required=True, choices=["qa", "prod"])
    ap.add_argument("--aplicar", action="store_true")
    ap.add_argument("--limpiar", action="store_true",
                    help="borra los reclamos de demo cargados antes por este script")
    args = ap.parse_args()

    if args.env == "prod":
        print("ABORTA: este script es de DEMO y no se corre contra produccion.")
        return

    load_dotenv(".env")
    url = os.environ["DATABASE_URL"]
    if not url.rstrip("/").endswith("-qa"):
        print("ABORTA: --env qa pero DATABASE_URL no apunta a una base -qa.")
        return

    rnd = random.Random(SEMILLA)
    eng = create_async_engine(url)

    async with eng.begin() as c:
        # ---- catalogos reales del municipio ----
        cats = (await c.execute(text("""
            SELECT c.id, c.nombre, mdc.municipio_dependencia_id
            FROM categorias_reclamo c
            LEFT JOIN municipio_dependencia_categorias mdc
                   ON mdc.categoria_id = c.id AND mdc.municipio_id = :m
            WHERE c.municipio_id = :m AND c.activo = 1
        """), {"m": MUNI})).mappings().all()
        if not cats:
            print("ABORTA: el municipio no tiene categorias de reclamo.")
            return

        vecinos = [r[0] for r in (await c.execute(text(
            "SELECT id FROM usuarios WHERE municipio_id=:m AND rol='vecino' AND activo=1"), {"m": MUNI})).all()]
        # OJO: reclamos.empleado_id apunta a la tabla `empleados`, NO al usuario
        # con rol empleado. Son dos ids distintos y la FK lo hace notar.
        empleados = [r[0] for r in (await c.execute(text(
            "SELECT id FROM empleados WHERE municipio_id=:m"), {"m": MUNI})).all()]
        if not vecinos:
            print("ABORTA: el municipio no tiene vecinos que puedan crear reclamos.")
            return

        barrios = (await c.execute(text(
            "SELECT id, nombre, poligono, latitud, longitud FROM barrios WHERE municipio_id=:m"),
            {"m": MUNI})).mappings().all()

        if args.limpiar:
            n = (await c.execute(text(
                "SELECT COUNT(*) FROM reclamos WHERE municipio_id=:m AND referencia='seed-demo-cbapaz'"),
                {"m": MUNI})).scalar()
            print("reclamos de demo previos: %d" % n)
            if args.aplicar and n:
                # El historial primero: cuelga del reclamo y quedaria huerfano.
                await c.execute(text(
                    """DELETE h FROM historial_reclamos h JOIN reclamos r ON r.id=h.reclamo_id
                       WHERE r.municipio_id=:m AND r.referencia='seed-demo-cbapaz'"""), {"m": MUNI})
                await c.execute(text(
                    "DELETE FROM reclamos WHERE municipio_id=:m AND referencia='seed-demo-cbapaz'"), {"m": MUNI})
                print("  borrados (con su historial).")

        # ---- reparto de los 200 entre los barrios ----
        pool = []
        for b in barrios:
            peso = PESOS_ALTOS.get(b["nombre"], 3)
            pool += [b] * peso
        elegidos = [pool[rnd.randrange(len(pool))] for _ in range(TOTAL)]

        # ---- armado ----
        filas = []
        span = (HASTA - DESDE).total_seconds()
        for i, b in enumerate(elegidos):
            anillo = None
            if b["poligono"]:
                try:
                    pts = json.loads(b["poligono"])
                    anillo = [[p[1], p[0]] for p in pts]
                except (TypeError, ValueError):
                    anillo = None
            centro = (b["latitud"], b["longitud"])
            if anillo is None and (centro[0] is None or centro[1] is None):
                continue
            lat, lng = punto_en_barrio(rnd, anillo, centro)

            # la fecha se sesga hacia el presente: el municipio recibe cada vez
            # mas reclamos a medida que la app se usa mas.
            t = rnd.random() ** 0.72
            creado = DESDE + timedelta(seconds=span * t)
            dias = (HASTA - creado).days
            estado = estado_para(dias, rnd)

            cat = cats[rnd.randrange(len(cats))]
            guion = GUION.get(cat["nombre"])
            if not guion:
                guion = GUION[list(GUION)[rnd.randrange(len(GUION))]]
            titulo, desc, prio = guion[rnd.randrange(len(guion))]

            recibido = creado + timedelta(minutes=rnd.randint(2, 90))
            resol = None
            if estado in CERRADOS:
                horas = rnd.randint(6, 24 * 25)
                resol = creado + timedelta(hours=horas)
                if resol > HASTA:
                    resol = HASTA - timedelta(hours=rnd.randint(1, 40))

            # Si quedo diferido, POR QUE. `pausado_desde` no es la fecha de alta:
            # es cuando se freno, en algun punto entre que entro y hoy --por eso
            # se sortea dentro de esa ventana y no se copia `creado`--.
            motivo = coment_pausa = None
            pausado = None
            if estado == "pospuesto":
                motivo, coment_pausa, _ = PAUSAS_POOL[rnd.randrange(len(PAUSAS_POOL))]
                margen = (HASTA - creado).days
                pausado = creado + timedelta(days=rnd.randint(1, max(margen - 1, 1)))

            filas.append({
                "m": MUNI, "tit": titulo, "desc": desc, "estado": estado, "prio": prio,
                "motivo_pausa": motivo, "pausado": pausado, "coment_pausa": coment_pausa,
                "dir": "%s %d" % (b["nombre"], rnd.randrange(100, 3000, 10)),
                "lat": lat, "lng": lng, "ref": "seed-demo-cbapaz",
                "cat": cat["id"], "zona": ZONA, "barrio": b["id"],
                "creador": vecinos[rnd.randrange(len(vecinos))],
                "empleado": (empleados[rnd.randrange(len(empleados))]
                             if empleados and estado not in ("nuevo", "recibido") else None),
                "md": cat["municipio_dependencia_id"],
                "canal": CANALES[rnd.randrange(len(CANALES))],
                "creado": creado, "recibido": recibido, "resol": resol,
            })

        print("\npreparados %d reclamos" % len(filas))
        por_estado = {}
        for f in filas:
            por_estado[f["estado"]] = por_estado.get(f["estado"], 0) + 1
        print("  por estado: " + ", ".join("%s=%d" % kv for kv in sorted(por_estado.items())))
        por_mes = {}
        for f in filas:
            k = f["creado"].strftime("%Y-%m")
            por_mes[k] = por_mes.get(k, 0) + 1
        print("  por mes   : " + ", ".join("%s=%d" % kv for kv in sorted(por_mes.items())))
        top = {}
        for f in filas:
            top[f["dir"].rsplit(" ", 1)[0]] = top.get(f["dir"].rsplit(" ", 1)[0], 0) + 1
        print("  barrios con mas: " + ", ".join(
            "%s(%d)" % kv for kv in sorted(top.items(), key=lambda kv: -kv[1])[:8]))
        print("  barrios alcanzados: %d de %d" % (len(top), len(barrios)))

        if not args.aplicar:
            print("\nCORRIDA EN SECO. Para escribir: agregar --aplicar")
            return

        await c.execute(text("""
            INSERT INTO reclamos
                (municipio_id, titulo, descripcion, estado, prioridad, direccion, latitud, longitud,
                 referencia, categoria_id, zona_id, barrio_id, creador_id, empleado_id,
                 municipio_dependencia_id, canal, created_at, updated_at, fecha_recibido, fecha_resolucion,
                 motivo_pausa, pausado_desde)
            VALUES
                (:m, :tit, :desc, :estado, :prio, :dir, :lat, :lng,
                 :ref, :cat, :zona, :barrio, :creador, :empleado,
                 :md, :canal, :creado, :creado, :recibido, :resol,
                 :motivo_pausa, :pausado)
        """), filas)
        print("\nINSERTADOS %d reclamos en Villa Carlos Paz (QA)." % len(filas))

        # ---- EL HISTORIAL ----
        # Sin esto los reclamos entran mudos: consultar "cuantos atrasados no
        # tuvo nadie encima" contaba los 200 del seed y daba un numero falso.
        # Un reclamo sin recorrido no es un reclamo, es una fila.
        ids = (await c.execute(text(
            """SELECT id, estado, created_at, fecha_recibido, fecha_resolucion, pausado_desde,
                      motivo_pausa, empleado_id
               FROM reclamos WHERE municipio_id=:m AND referencia='seed-demo-cbapaz'"""),
            {"m": MUNI})).mappings().all()
        coment_por_motivo = {p[0]: p[1] for p in PAUSAS}
        eventos = []
        admin = vecinos[0]
        for r in ids:
            eventos.append({"rid": r["id"], "uid": admin, "ant": None, "nue": "recibido",
                            "acc": "Reclamo creado", "com": "Ingresado por el vecino.",
                            "cuando": r["created_at"]})
            if r["empleado_id"] is not None and r["fecha_recibido"]:
                eventos.append({"rid": r["id"], "uid": admin, "ant": "recibido", "nue": "asignado",
                                "acc": "Asignado a la dependencia",
                                "com": "Derivado al area que corresponde.",
                                "cuando": r["fecha_recibido"]})
            if r["estado"] == "pospuesto" and r["pausado_desde"]:
                eventos.append({"rid": r["id"], "uid": admin, "ant": "asignado", "nue": "pospuesto",
                                "acc": "Trabajo diferido",
                                "com": coment_por_motivo.get(r["motivo_pausa"], "Diferido."),
                                "cuando": r["pausado_desde"]})
            if r["fecha_resolucion"]:
                eventos.append({"rid": r["id"], "uid": admin, "ant": "en_curso", "nue": r["estado"],
                                "acc": "Reclamo finalizado", "com": "Trabajo completado.",
                                "cuando": r["fecha_resolucion"]})
        await c.execute(text("""
            INSERT INTO historial_reclamos
                (reclamo_id, usuario_id, estado_anterior, estado_nuevo, accion, comentario, created_at)
            VALUES (:rid, :uid, :ant, :nue, :acc, :com, :cuando)
        """), eventos)
        print("INSERTADOS %d movimientos de historial." % len(eventos))

    async with eng.connect() as c:
        tot = (await c.execute(text(
            "SELECT COUNT(*) FROM reclamos WHERE municipio_id=:m"), {"m": MUNI})).scalar()
        geo = (await c.execute(text(
            "SELECT COUNT(*) FROM reclamos WHERE municipio_id=:m AND latitud IS NOT NULL"), {"m": MUNI})).scalar()
        print("total del municipio ahora: %d reclamos (%d con coordenada)" % (tot, geo))
    await eng.dispose()


asyncio.run(main())
