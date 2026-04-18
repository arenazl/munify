"""Seed enfocado para La Matanza: 50 partidas + deudas + empleados + asignar reclamos."""
import asyncio
import json
import os
import random
import sys
from datetime import datetime, date, timedelta
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from core.database import AsyncSessionLocal

MUNI_ID = int(os.environ.get('MUNI_ID', '78'))

CALLES = ["Av. de Mayo","Av. Cristiania","Av. Crovara","Av. Hipolito Yrigoyen","Av. Luro",
    "Av. Peron","Av. Don Bosco","Av. Ricchieri","Av. del Trabajo","Almirante Brown",
    "Alsina","Belgrano","Mitre","Sarmiento","Rivadavia","9 de Julio","Pueyrredon","Lavalle",
    "Estrada","San Martin","Moreno","Dorrego","Necochea"]
LOCALIDADES = ["San Justo","Ramos Mejia","Gregorio de Laferrere","Gonzalez Catan",
    "Isidro Casanova","Villa Madero","La Tablada","Lomas del Mirador","Aldo Bonzi",
    "Tapiales","Ciudad Evita","Rafael Castillo"]
NOMBRES = ["Carlos","Maria","Jose","Lucia","Juan","Ana","Pedro","Laura","Diego","Sofia",
    "Pablo","Marta","Ricardo","Elena","Roberto","Patricia","Fernando","Monica","Sergio",
    "Cristina","Daniel","Veronica","Gustavo","Andrea","Alejandro","Valeria","Mariano"]
APELLIDOS = ["Gonzalez","Rodriguez","Perez","Fernandez","Lopez","Martinez","Sanchez",
    "Romero","Sosa","Alvarez","Torres","Ruiz","Ramirez","Flores","Acosta","Benitez",
    "Medina","Gutierrez","Suarez","Castro","Ortega","Vega","Iglesias","Molina"]
MARCAS = [("Volkswagen",["Gol","Polo","Suran","Amarok"]),("Toyota",["Corolla","Hilux","Etios"]),
    ("Ford",["Fiesta","Focus","Ranger","EcoSport"]),("Chevrolet",["Onix","Cruze","Spin"]),
    ("Renault",["Sandero","Logan","Duster"]),("Fiat",["Cronos","Argo","Toro"])]
RUBROS = ["Almacen","Carniceria","Verduleria","Panaderia","Kiosco","Heladeria","Pizzeria",
    "Restaurante","Bar","Farmacia","Libreria","Ferreteria","Indumentaria","Peluqueria",
    "Veterinaria","Lavadero","Inmobiliaria","Estudio Juridico","Taller Mecanico"]
INFRACCIONES = ["Estacionamiento prohibido","Exceso de velocidad","Cruce semaforo rojo",
    "Falta patente","Falta seguro","VTV vencida","Doble fila","Estacionar en vereda"]
TIPOS_OBRA = ["Vivienda unifamiliar","Ampliacion vivienda","Local comercial","Galpon",
    "Cochera","Pileta","Cerco","Refaccion fachada"]
ESPECIALIDADES = ["Bacheo","Iluminacion","Recoleccion","Poda","Arbolado","Limpieza urbana",
    "Plomeria","Electricista","Pintor","Operador maquina vial","Atencion al vecino",
    "Inspeccion comercial","Habilitaciones","Transito","Defensa civil"]

def gen_dni(): return str(random.randint(20_000_000, 50_000_000))
def gen_dom():
    if random.random() < 0.6:
        return ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ', k=3)) + str(random.randint(100,999))
    return (''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ', k=2)) + str(random.randint(100,999))
            + ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ', k=2)))
def gen_cuit(): return f"30-{random.randint(10000000,99999999)}-{random.randint(1,9)}"
def gen_dir(): return f"{random.choice(CALLES)} {random.randint(50,9999)}, {random.choice(LOCALIDADES)}"

DISTRIB = [("abl",18),("seguridad_higiene",8),("patente_automotor",8),
    ("habilitacion_comercial",5),("multa_transito",5),("cementerio",3),
    ("publicidad_propaganda",2),("construccion",1)]

def gen_obj(c):
    if c == "abl":
        return {"direccion": gen_dir(), "superficie_m2": random.randint(60,450),
                "zona": random.choice(["A","B","C"])}
    if c == "patente_automotor":
        m, mods = random.choice(MARCAS)
        return {"dominio": gen_dom(), "marca": m, "modelo": random.choice(mods),
                "anio": random.randint(2008,2024)}
    if c == "habilitacion_comercial":
        return {"razon_social": f"Comercial {random.choice(APELLIDOS)} S.R.L.",
                "cuit": gen_cuit(), "rubro": random.choice(RUBROS), "direccion": gen_dir()}
    if c == "seguridad_higiene":
        return {"razon_social": f"{random.choice(RUBROS)} {random.choice(APELLIDOS)}",
                "cuit": gen_cuit(), "direccion": gen_dir()}
    if c == "multa_transito":
        return {"infraccion": random.choice(INFRACCIONES), "lugar": gen_dir(),
                "dominio": gen_dom()}
    if c == "cementerio":
        return {"sector": random.choice(["A","B","C"]), "fila": random.randint(1,50),
                "tipo": random.choice(["Boveda","Nicho"])}
    if c == "publicidad_propaganda":
        return {"tipo_anuncio": random.choice(["Cartel luminoso","Marquesina","Banner"]),
                "ubicacion": gen_dir(), "superficie_m2": round(random.uniform(2,30),1)}
    if c == "construccion":
        return {"tipo_obra": random.choice(TIPOS_OBRA), "direccion": gen_dir(),
                "superficie_m2": random.randint(40,350)}
    return {}

def gen_id(c):
    if c == "abl": return f"ABL-{random.randint(100000,999999)}/{random.randint(0,9)}"
    if c == "patente_automotor": return gen_dom()
    if c == "habilitacion_comercial": return f"HC-{random.randint(10000,99999)}"
    if c == "seguridad_higiene": return f"SH-{random.randint(10000,99999)}"
    if c == "multa_transito": return f"ACTA-{random.randint(100000,999999)}"
    if c == "cementerio": return f"CEM-S{random.randint(1,4)}-N{random.randint(1,200)}"
    if c == "publicidad_propaganda": return f"PUB-{random.randint(1000,9999)}"
    if c == "construccion": return f"OBRA-{random.randint(10000,99999)}"
    return f"P-{random.randint(1000,9999)}"

def importe(c, off):
    base = {"abl":18000,"seguridad_higiene":22000,"patente_automotor":35000,
            "habilitacion_comercial":12000,"multa_transito":28000,"cementerio":8000,
            "publicidad_propaganda":15000,"construccion":95000}.get(c,10000)
    return Decimal(str(round(base * (1 + random.uniform(-0.2,0.2) + off*0.03), 2)))


async def main():
    async with AsyncSessionLocal() as db:
        print(f"=== muni {MUNI_ID} ===", flush=True)

        r = await db.execute(text("SELECT codigo, id FROM tipos_tasa"))
        tipos = {row[0]: row[1] for row in r.fetchall()}
        r = await db.execute(text("SELECT id, dni FROM usuarios WHERE municipio_id=:m AND rol='vecino' LIMIT 30"), {"m": MUNI_ID})
        vecinos = r.fetchall()
        print(f"  vecinos disponibles: {len(vecinos)}", flush=True)

        # Partidas
        print("[1] Partidas...", flush=True)
        partidas = []
        for cod, cant in DISTRIB:
            tid = tipos.get(cod)
            if not tid: continue
            for _ in range(cant):
                titular_uid = None; tdni = gen_dni()
                if vecinos and random.random() < 0.5:
                    v = random.choice(vecinos); titular_uid = v[0]
                    if v[1]: tdni = v[1]
                tnom = f"{random.choice(NOMBRES)} {random.choice(APELLIDOS)}"
                ident = gen_id(cod); obj = gen_obj(cod)
                await db.execute(text("""INSERT INTO tasas_partidas
                    (municipio_id, tipo_tasa_id, identificador, titular_user_id, titular_dni,
                     titular_nombre, objeto, estado, created_at)
                    VALUES (:m,:t,:i,:u,:dn,:no,:ob,'activa',NOW())"""),
                    {"m":MUNI_ID,"t":tid,"i":ident,"u":titular_uid,"dn":tdni,"no":tnom,
                     "ob":json.dumps(obj)})
                r2 = await db.execute(text("SELECT LAST_INSERT_ID()"))
                partidas.append((r2.scalar(), cod))
        await db.commit()
        print(f"  OK {len(partidas)}", flush=True)

        # Deudas
        print("[2] Deudas...", flush=True)
        ahora = datetime.now(); total = 0
        for pid, cod in partidas:
            cant = {"abl":6,"seguridad_higiene":12,"patente_automotor":3,
                    "habilitacion_comercial":1,"multa_transito":1,"cementerio":1,
                    "publicidad_propaganda":1,"construccion":1}.get(cod,3)
            for i in range(cant):
                ma = i * (12 // max(cant,1))
                fe = ahora - timedelta(days=ma*30 + random.randint(0,10))
                fv = fe + timedelta(days=random.randint(15,30))
                imp = importe(cod, i)
                if i == 0:
                    est = random.choice(['pendiente']*3 + ['vencida'])
                elif fv < ahora and random.random() < 0.85:
                    est = 'pagada'
                else:
                    est = random.choice(['pendiente','vencida','pagada'])
                fp = (fv - timedelta(days=random.randint(0,14))) if est == 'pagada' else None
                rec = imp * Decimal("0.15") if est == 'vencida' else Decimal("0")
                await db.execute(text("""INSERT INTO tasas_deudas
                    (partida_id, periodo, importe, importe_original, recargo, descuento,
                     fecha_emision, fecha_vencimiento, estado, fecha_pago, codigo_barras, created_at)
                    VALUES (:p,:pe,:i,:io,:r,0,:fe,:fv,:e,:fp,:cb,NOW())"""),
                    {"p":pid,"pe":fe.strftime("%Y-%m"),"i":float(imp+rec),"io":float(imp),
                     "r":float(rec),"fe":fe.date(),"fv":fv.date(),"e":est,"fp":fp,
                     "cb":''.join(random.choices('0123456789',k=24))})
                total += 1
        await db.commit()
        print(f"  OK {total}", flush=True)

        # Empleados
        print("[3] Empleados...", flush=True)
        r = await db.execute(text("SELECT id FROM categorias_reclamo WHERE municipio_id=:m AND activo=1"), {"m":MUNI_ID})
        cats = [row[0] for row in r.fetchall()]
        r = await db.execute(text("SELECT id FROM municipio_dependencias WHERE municipio_id=:m AND activo=1"), {"m":MUNI_ID})
        deps = [row[0] for row in r.fetchall()]
        empleados = []
        for i in range(12):
            tipo = 'operario' if i < 9 else 'administrativo'
            await db.execute(text("""INSERT INTO empleados
                (municipio_id, nombre, apellido, telefono, tipo, especialidad,
                 categoria_principal_id, municipio_dependencia_id, capacidad_maxima, activo, created_at)
                VALUES (:m,:n,:a,:t,:tp,:es,:c,:d,10,1,NOW())"""),
                {"m":MUNI_ID,"n":random.choice(NOMBRES),"a":random.choice(APELLIDOS),
                 "t":f"11{random.randint(40000000,69999999)}","tp":tipo,
                 "es":random.choice(ESPECIALIDADES),
                 "c":random.choice(cats) if cats else None,
                 "d":random.choice(deps) if deps else None})
            r2 = await db.execute(text("SELECT LAST_INSERT_ID()"))
            empleados.append(r2.scalar())
        await db.commit()
        print(f"  OK {len(empleados)}", flush=True)

        # Asignar reclamos
        print("[4] Asignando reclamos sin empleado...", flush=True)
        r = await db.execute(text("""SELECT id FROM reclamos
            WHERE municipio_id=:m AND empleado_id IS NULL
            AND estado IN ('en_curso','pospuesto','finalizado','recibido')"""), {"m":MUNI_ID})
        rids = [row[0] for row in r.fetchall()]
        for rid in rids:
            eid = random.choice(empleados)
            fp = (datetime.now() - timedelta(days=random.randint(0,365))).date()
            hi_h = random.randint(8,16)
            hi = f"{hi_h:02d}:{random.choice(['00','30'])}"
            hf = f"{hi_h + random.randint(1,3):02d}:{hi.split(':')[1]}"
            await db.execute(text("""UPDATE reclamos SET empleado_id=:e, fecha_programada=:fp,
                hora_inicio=:hi, hora_fin=:hf WHERE id=:r"""),
                {"e":eid,"fp":fp,"hi":hi,"hf":hf,"r":rid})
        await db.commit()
        print(f"  OK {len(rids)}", flush=True)

        # Resumen
        print("\n=== RESUMEN ===", flush=True)
        for lab, sql in [
            ("Partidas", "SELECT COUNT(*) FROM tasas_partidas WHERE municipio_id=:m"),
            ("Deudas", "SELECT COUNT(*) FROM tasas_deudas td JOIN tasas_partidas tp ON td.partida_id=tp.id WHERE tp.municipio_id=:m"),
            ("Pendientes", "SELECT COUNT(*) FROM tasas_deudas td JOIN tasas_partidas tp ON td.partida_id=tp.id WHERE tp.municipio_id=:m AND td.estado IN ('pendiente','vencida')"),
            ("Empleados", "SELECT COUNT(*) FROM empleados WHERE municipio_id=:m AND activo=1"),
            ("Reclamos asignados", "SELECT COUNT(*) FROM reclamos WHERE municipio_id=:m AND empleado_id IS NOT NULL"),
        ]:
            r = await db.execute(text(sql), {"m":MUNI_ID})
            print(f"  {lab:25}: {r.scalar()}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
