"""
Generador de partidas + deudas ficticias para la demo de pagos (GIRE Aura).

Crea datos de padrón realistas para un municipio:
  - ABL (bimestral) — 1-2 partidas por vecino con 12 deudas + 1 futura
  - Patente Automotor (cuatrimestral) — 40% de los vecinos con auto
  - Multas de Tránsito (one-shot) — 1-2 multas random por vecino
  - Habilitación Comercial + Seguridad e Higiene — 10% comerciantes
  - Cementerio (anual) — algunos vecinos con bóveda
  - Derechos de Construcción — obras en curso

Distribución de estados:
  - Períodos pasados: 70% pagada, 20% pendiente, 10% vencida
  - Período actual: pendiente
  - Períodos futuros: pendiente (preemitida)

Uso:
  python scripts/seed_tasas_completo.py <municipio_id>

Ej: python scripts/seed_tasas_completo.py 72   # Villa Gesell
"""
import asyncio
import random
import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from core.config import settings
from models.tasas import TipoTasa, Partida, Deuda, EstadoPartida, EstadoDeuda
from models.user import User


# ============================================================
# Datos de relleno realistas
# ============================================================

CALLES = [
    "Av. Costanera", "Av. 3", "Av. Libertad", "Calle 26", "Calle 40",
    "Buenos Aires", "Paseo 110", "Avenida 2", "Los Pinares", "Los Médanos",
    "Avenida del Mar", "Calle 45", "Calle 15", "Diagonal Urquiza",
]

ZONAS = ["Centro", "Playa", "Residencial Norte", "Residencial Sur", "Rural", "Parque"]

MARCAS_AUTO = [
    ("Fiat", ["Cronos", "Argo", "Mobi", "Pulse", "Toro"]),
    ("Volkswagen", ["Gol", "Voyage", "Polo", "Amarok", "Taos"]),
    ("Toyota", ["Etios", "Corolla", "Hilux", "Yaris", "Corolla Cross"]),
    ("Ford", ["Fiesta", "Ka", "Focus", "Ranger", "Ecosport"]),
    ("Peugeot", ["208", "2008", "308", "Partner"]),
    ("Renault", ["Sandero", "Logan", "Duster", "Kangoo", "Stepway"]),
    ("Chevrolet", ["Onix", "Cruze", "Tracker", "S10"]),
]

RUBROS_COMERCIO = [
    ("Almacén / Minimercado", 20_000, 8_000),
    ("Kiosco / Polirubro", 10_000, 5_000),
    ("Bar / Restaurante", 45_000, 20_000),
    ("Peluquería", 12_000, 6_000),
    ("Ropa / Indumentaria", 25_000, 10_000),
    ("Farmacia", 40_000, 15_000),
    ("Panadería", 20_000, 9_000),
    ("Carnicería", 18_000, 7_000),
    ("Ferretería", 22_000, 10_000),
    ("Inmobiliaria", 35_000, 14_000),
]

INFRACCIONES_TRANSITO = [
    ("Exceso de velocidad (hasta 20 km/h)", 8_000),
    ("Estacionar en zona prohibida", 15_000),
    ("No respetar semáforo en rojo", 50_000),
    ("Conducir sin cinturón", 12_000),
    ("Conducir usando celular", 25_000),
    ("Mal estacionado en rampa", 18_000),
    ("Circular sin luces bajas", 6_000),
    ("No respetar la senda peatonal", 30_000),
    ("Doble fila", 10_000),
    ("Faltante de seguro obligatorio", 40_000),
]


# ============================================================
# Helpers
# ============================================================

def patente_random() -> str:
    """Genera un dominio argentino random — mezcla viejo (ABC123) y nuevo (AB123CD)."""
    if random.random() < 0.3:
        # Formato viejo
        letras = "".join(random.choices("ABCDEFGHJKLMNOPQRSTUVWXYZ", k=3))
        nums = "".join(random.choices("0123456789", k=3))
        return f"{letras}{nums}"
    # Formato nuevo
    l1 = "".join(random.choices("ABCDEFGHJKLMNOPQRSTUVWXYZ", k=2))
    n = "".join(random.choices("0123456789", k=3))
    l2 = "".join(random.choices("ABCDEFGHJKLMNOPQRSTUVWXYZ", k=2))
    return f"{l1}{n}{l2}"


def cuenta_abl_random() -> str:
    """Nro de cuenta ABL tipo '12345/6' o '01-00234-5'."""
    return f"{random.randint(1000, 99999)}/{random.randint(0, 9)}"


def direccion_random() -> str:
    calle = random.choice(CALLES)
    nro = random.randint(100, 4999)
    return f"{calle} {nro}"


def elegir_estado_historico() -> EstadoDeuda:
    """Para deudas pasadas: 70% pagada, 20% pendiente, 10% vencida."""
    r = random.random()
    if r < 0.70:
        return EstadoDeuda.PAGADA
    if r < 0.90:
        return EstadoDeuda.PENDIENTE
    return EstadoDeuda.VENCIDA


def periodos_bimestrales(hoy: date, cuantos_atras: int, cuantos_adelante: int):
    """Devuelve (periodo_str, fecha_emision, fecha_vto) bimestrales."""
    año = hoy.year
    # Bimestre actual: 1=ene-feb, 2=mar-abr, 3=may-jun, 4=jul-ago, 5=sep-oct, 6=nov-dic
    mes = hoy.month
    bim_actual = (mes + 1) // 2
    out = []
    for offset in range(-cuantos_atras, cuantos_adelante + 1):
        bim = bim_actual + offset
        a = año
        while bim > 6:
            bim -= 6
            a += 1
        while bim < 1:
            bim += 6
            a -= 1
        periodo = f"{a}-B{bim}"
        mes_emision = (bim - 1) * 2 + 1
        fecha_emi = date(a, mes_emision, 1)
        fecha_vto = date(a, mes_emision, 20)
        out.append((periodo, fecha_emi, fecha_vto, offset))
    return out


def periodos_cuatrimestrales(hoy: date, cuantos_atras: int, cuantos_adelante: int):
    año = hoy.year
    mes = hoy.month
    cuat_actual = (mes + 3) // 4
    out = []
    for offset in range(-cuantos_atras, cuantos_adelante + 1):
        c = cuat_actual + offset
        a = año
        while c > 3:
            c -= 3
            a += 1
        while c < 1:
            c += 3
            a -= 1
        periodo = f"{a}-C{c}"
        mes_emision = (c - 1) * 4 + 1
        fecha_emi = date(a, mes_emision, 1)
        fecha_vto = date(a, mes_emision, 25)
        out.append((periodo, fecha_emi, fecha_vto, offset))
    return out


def periodos_mensuales(hoy: date, cuantos_atras: int, cuantos_adelante: int):
    año = hoy.year
    mes = hoy.month
    out = []
    for offset in range(-cuantos_atras, cuantos_adelante + 1):
        m = mes + offset
        a = año
        while m > 12:
            m -= 12
            a += 1
        while m < 1:
            m += 12
            a -= 1
        periodo = f"{a}-{m:02d}"
        fecha_emi = date(a, m, 1)
        fecha_vto = date(a, m, 10)
        out.append((periodo, fecha_emi, fecha_vto, offset))
    return out


# ============================================================
# Generadores por tipo de tasa
# ============================================================

async def gen_abl(db: AsyncSession, muni_id: int, tipo: TipoTasa, user: User, hoy: date):
    """ABL: 1 partida con 12 deudas bimestrales pasadas + 1 futura."""
    zona = random.choice(ZONAS)
    superficie = random.randint(60, 350)
    direccion = user.direccion or direccion_random()
    base = random.randint(3_000, 12_000)  # base bimestral por la casa

    partida = Partida(
        municipio_id=muni_id,
        tipo_tasa_id=tipo.id,
        identificador=cuenta_abl_random(),
        titular_user_id=user.id,
        titular_dni=user.dni,
        titular_nombre=f"{user.nombre} {user.apellido or ''}".strip(),
        objeto={"direccion": direccion, "superficie_m2": superficie, "zona": zona},
        estado=EstadoPartida.ACTIVA,
    )
    db.add(partida)
    await db.flush()

    for periodo, f_emi, f_vto, offset in periodos_bimestrales(hoy, 12, 1):
        # Pequeña variación por actualización tarifaria
        importe = Decimal(str(int(base * (1 + offset * 0.02))))
        if offset < 0:
            estado = elegir_estado_historico()
        else:
            estado = EstadoDeuda.PENDIENTE
        db.add(Deuda(
            partida_id=partida.id,
            periodo=periodo,
            importe=importe,
            fecha_emision=f_emi,
            fecha_vencimiento=f_vto,
            estado=estado,
        ))


async def gen_patente(db: AsyncSession, muni_id: int, tipo: TipoTasa, user: User, hoy: date):
    """Patente automotor: 1 partida con 4 deudas cuatrimestrales."""
    marca, modelos = random.choice(MARCAS_AUTO)
    modelo = random.choice(modelos)
    año_auto = random.randint(2010, 2024)
    base = random.randint(15_000, 75_000)

    partida = Partida(
        municipio_id=muni_id,
        tipo_tasa_id=tipo.id,
        identificador=patente_random(),
        titular_user_id=user.id,
        titular_dni=user.dni,
        titular_nombre=f"{user.nombre} {user.apellido or ''}".strip(),
        objeto={"dominio": None, "marca": marca, "modelo": modelo, "año": año_auto},
        estado=EstadoPartida.ACTIVA,
    )
    partida.objeto["dominio"] = partida.identificador
    db.add(partida)
    await db.flush()

    for periodo, f_emi, f_vto, offset in periodos_cuatrimestrales(hoy, 3, 1):
        importe = Decimal(str(int(base * (1 + offset * 0.03))))
        estado = elegir_estado_historico() if offset < 0 else EstadoDeuda.PENDIENTE
        db.add(Deuda(
            partida_id=partida.id,
            periodo=periodo,
            importe=importe,
            fecha_emision=f_emi,
            fecha_vencimiento=f_vto,
            estado=estado,
        ))


async def gen_multa(db: AsyncSession, muni_id: int, tipo: TipoTasa, user: User, hoy: date):
    """Multa de tránsito: 1 partida one-shot con 1 deuda."""
    infraccion, importe_base = random.choice(INFRACCIONES_TRANSITO)
    dias_atras = random.randint(5, 180)
    fecha_infraccion = hoy - timedelta(days=dias_atras)
    nro_acta = f"ACTA-{random.randint(100000, 999999)}"

    partida = Partida(
        municipio_id=muni_id,
        tipo_tasa_id=tipo.id,
        identificador=nro_acta,
        titular_user_id=user.id,
        titular_dni=user.dni,
        titular_nombre=f"{user.nombre} {user.apellido or ''}".strip(),
        objeto={"infraccion": infraccion, "fecha_infraccion": fecha_infraccion.isoformat(), "lugar": random.choice(CALLES)},
        estado=EstadoPartida.ACTIVA,
    )
    db.add(partida)
    await db.flush()

    # Para multas: 50% pendientes, 30% vencidas, 20% pagadas
    r = random.random()
    if r < 0.5:
        estado = EstadoDeuda.PENDIENTE
    elif r < 0.8:
        estado = EstadoDeuda.VENCIDA
    else:
        estado = EstadoDeuda.PAGADA

    db.add(Deuda(
        partida_id=partida.id,
        periodo=f"{fecha_infraccion.year}-{fecha_infraccion.month:02d}",
        importe=Decimal(str(importe_base)),
        fecha_emision=fecha_infraccion,
        fecha_vencimiento=fecha_infraccion + timedelta(days=30),
        estado=estado,
    ))


async def gen_comercio(db: AsyncSession, muni_id: int, tipo_sh: TipoTasa, user: User, hoy: date):
    """Seguridad e Higiene: comercio con deudas mensuales."""
    rubro, base_alto, base_bajo = random.choice(RUBROS_COMERCIO)
    base = random.randint(base_bajo, base_alto)
    razon_social = f"{rubro.split(' /')[0]} {user.apellido or 'Comercial'}"
    cuit_base = user.dni or str(random.randint(20000000, 39999999))
    cuit = f"20-{cuit_base}-{random.randint(0,9)}"

    partida = Partida(
        municipio_id=muni_id,
        tipo_tasa_id=tipo_sh.id,
        identificador=f"HC-{random.randint(1000, 9999)}",
        titular_user_id=user.id,
        titular_dni=user.dni,
        titular_nombre=f"{user.nombre} {user.apellido or ''}".strip(),
        objeto={"razon_social": razon_social, "cuit": cuit, "rubro": rubro, "direccion": direccion_random()},
        estado=EstadoPartida.ACTIVA,
    )
    db.add(partida)
    await db.flush()

    for periodo, f_emi, f_vto, offset in periodos_mensuales(hoy, 6, 1):
        importe = Decimal(str(int(base * (1 + offset * 0.02))))
        estado = elegir_estado_historico() if offset < 0 else EstadoDeuda.PENDIENTE
        db.add(Deuda(
            partida_id=partida.id,
            periodo=periodo,
            importe=importe,
            fecha_emision=f_emi,
            fecha_vencimiento=f_vto,
            estado=estado,
        ))


# ============================================================
# Main
# ============================================================

async def seed_para_municipio(muni_id: int, limpiar: bool = True):
    engine = create_async_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    hoy = date.today()

    async with SessionLocal() as db:
        # Cargar catálogo de tipos de tasa
        tipos_q = await db.execute(select(TipoTasa).where(TipoTasa.activo == True))
        tipos = {t.codigo: t for t in tipos_q.scalars().all()}

        tipo_abl = tipos.get("abl")
        tipo_patente = tipos.get("patente_automotor")
        tipo_multa = tipos.get("multa_transito")
        tipo_sh = tipos.get("seguridad_higiene")

        if not tipo_abl:
            print("[ERROR] El catálogo de tipos_tasa no tiene ABL. Ejecutá seed_tipos_tasa.py primero.")
            return

        # Cargar vecinos del muni
        users_q = await db.execute(
            select(User).where(
                User.municipio_id == muni_id,
                User.rol == "vecino",
                User.activo == True,
            )
        )
        vecinos = list(users_q.scalars().all())
        if not vecinos:
            print(f"[ERROR] No hay vecinos en el municipio {muni_id}. Nada para seed.")
            return

        print(f"Vecinos encontrados: {len(vecinos)}")

        # Limpieza opcional — borra partidas previas del muni para no duplicar
        if limpiar:
            from sqlalchemy import text as sa_text
            await db.execute(sa_text("SET FOREIGN_KEY_CHECKS = 0"))
            await db.execute(sa_text(
                "DELETE FROM tasas_deudas WHERE partida_id IN "
                "(SELECT id FROM tasas_partidas WHERE municipio_id = :m)"
            ), {"m": muni_id})
            await db.execute(sa_text("DELETE FROM tasas_partidas WHERE municipio_id = :m"), {"m": muni_id})
            await db.execute(sa_text("SET FOREIGN_KEY_CHECKS = 1"))
            await db.commit()

        contador = {"abl": 0, "patente": 0, "multa": 0, "comercio": 0, "deudas": 0}

        for user in vecinos:
            # ABL: todos los vecinos tienen al menos una
            await gen_abl(db, muni_id, tipo_abl, user, hoy)
            contador["abl"] += 1

            # Patente: 40% de los vecinos
            if tipo_patente and random.random() < 0.4:
                await gen_patente(db, muni_id, tipo_patente, user, hoy)
                contador["patente"] += 1

            # Multa: 25% tiene al menos una
            if tipo_multa and random.random() < 0.25:
                await gen_multa(db, muni_id, tipo_multa, user, hoy)
                contador["multa"] += 1
                # 10% tiene dos
                if random.random() < 0.1:
                    await gen_multa(db, muni_id, tipo_multa, user, hoy)
                    contador["multa"] += 1

            # Comercio: 10% de los vecinos es comerciante
            if tipo_sh and random.random() < 0.1:
                await gen_comercio(db, muni_id, tipo_sh, user, hoy)
                contador["comercio"] += 1

        await db.commit()

        # Contar deudas creadas
        from sqlalchemy import text as sa_text
        r = await db.execute(sa_text(
            "SELECT COUNT(*) FROM tasas_deudas d "
            "JOIN tasas_partidas p ON d.partida_id = p.id "
            "WHERE p.municipio_id = :m"
        ), {"m": muni_id})
        contador["deudas"] = r.scalar() or 0

        print(f"""
OK — seed de tasas completo.
  Partidas ABL:         {contador['abl']}
  Partidas Patente:     {contador['patente']}
  Multas de Tránsito:   {contador['multa']}
  Comercios (Seg/Hig):  {contador['comercio']}
  TOTAL deudas creadas: {contador['deudas']}
""")

    await engine.dispose()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python seed_tasas_completo.py <municipio_id>")
        sys.exit(1)
    muni_id = int(sys.argv[1])
    asyncio.run(seed_para_municipio(muni_id))
