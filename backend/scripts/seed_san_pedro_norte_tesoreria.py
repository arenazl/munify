"""Seed especial Tesorería para San Pedro Norte (Córdoba).

Basado en los datos reales del intendente (Excel Control.xlsx + KMZ).

Objetivo: dejar la demo de San Pedro Norte lista para mostrar Tesorería
con data real, sin pasar por el flujo manual de "loguearme + importar
Excel + importar KMZ".

Idempotente: se puede correr múltiples veces sin duplicar.

Qué hace:
  1. Localiza el muni "San Pedro Norte" (codigo='san-pedro-norte').
  2. Asegura las dependencias que aparecen en el Excel:
       - Concejo Deliberante (nueva)
       - Secretaría de Turismo y Cultura (nueva)
     Las otras ya están en el seed genérico.
  3. Activa el módulo `tesoreria` para el muni.
  4. Limpia gastos/cuotas/contactos del muni para arrancar limpio.
  5. Re-importa los datos del Excel del bartolo (Concejales, Empleados,
     Profesionales y publicidad, Turismo y cultura, Obra Vestuarios).
  6. Geolocaliza los contactos dispersándolos alrededor del centro
     de San Pedro Norte (-30.266, -64.125) en radio ~3 km.
  7. Genera gastos recurrentes adicionales para los Empleados que
     tenían sueldo base en la col 1 del Excel pero no estaban
     asignados a un mes específico (Sueldo base mensual).
  8. Genera 3-4 préstamos de muestra a beneficiarios para que la
     pantalla Proyecciones tenga datos.

Uso:
    cd backend && python scripts/seed_san_pedro_norte_tesoreria.py
"""
import asyncio
import random
import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

# Permitir ejecutar desde la raíz del proyecto o desde backend/
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from core.config import settings
from models import (
    Municipio, MunicipioDependencia, MunicipioModulo,
    Dependencia, Contacto, Gasto, GastoCuota, User,
    TipoContacto, DestinoGasto, TipoFinanciacion, FrecuenciaRecurrencia,
    FormaPago, EstadoGastoCuota, RolUsuario,
)
from models.dependencia import TipoGestionDependencia


SPN_CODIGO = "san-pedro-norte"
SPN_LAT = -30.266
SPN_LON = -64.125
DELTA = 0.025  # ~2.5 km

random.seed(42)


# Dependencias que faltan en el seed generico y aparecen en el Excel
DEPS_NUEVAS = [
    {"nombre": "Concejo Deliberante", "descripcion": "Cuerpo legislativo del municipio", "color": "#8b5cf6", "icono": "Landmark"},
    {"nombre": "Secretaría de Turismo y Cultura", "descripcion": "Eventos culturales y promoción turística", "color": "#ec4899", "icono": "Palette"},
]


async def get_muni(session: AsyncSession) -> Municipio:
    res = await session.execute(select(Municipio).where(Municipio.codigo == SPN_CODIGO))
    muni = res.scalar_one_or_none()
    if not muni:
        raise RuntimeError(f"Muni con codigo={SPN_CODIGO} no existe. Creá la demo primero.")
    return muni


async def get_admin(session: AsyncSession, muni_id: int) -> User:
    res = await session.execute(
        select(User).where(User.municipio_id == muni_id, User.rol == RolUsuario.ADMIN)
    )
    admin = res.scalar_one_or_none()
    if not admin:
        raise RuntimeError(f"Admin del muni {muni_id} no existe. Re-seedeá el muni.")
    return admin


async def ensure_dependencias(session: AsyncSession, muni: Municipio) -> dict[str, int]:
    """Crea las dependencias faltantes del catálogo + las asocia al muni.
    Devuelve un dict {nombre_normalizado: municipio_dependencia_id}.
    """
    out: dict[str, int] = {}

    # 1) Catalogo: dep que no existan se crean
    for d in DEPS_NUEVAS:
        res = await session.execute(select(Dependencia).where(Dependencia.nombre == d["nombre"]))
        dep = res.scalar_one_or_none()
        if not dep:
            dep = Dependencia(
                nombre=d["nombre"],
                descripcion=d.get("descripcion"),
                color=d.get("color"),
                icono=d.get("icono"),
                tipo_gestion=TipoGestionDependencia.AMBOS,
                activo=True,
            )
            session.add(dep)
            await session.flush()
            print(f"  [+] Dependencia catalogo: {dep.nombre}")
        # 2) Asociar al muni
        res2 = await session.execute(
            select(MunicipioDependencia).where(
                MunicipioDependencia.municipio_id == muni.id,
                MunicipioDependencia.dependencia_id == dep.id,
            )
        )
        md = res2.scalar_one_or_none()
        if not md:
            md = MunicipioDependencia(municipio_id=muni.id, dependencia_id=dep.id, activo=True)
            session.add(md)
            await session.flush()
            print(f"  [+] Asociada {dep.nombre} al muni")
        out[d["nombre"].lower()] = md.id

    # Cargar también las existentes para mapearlas
    res = await session.execute(
        select(MunicipioDependencia, Dependencia)
        .join(Dependencia, MunicipioDependencia.dependencia_id == Dependencia.id)
        .where(MunicipioDependencia.municipio_id == muni.id)
    )
    for md, dep in res.all():
        out[dep.nombre.lower()] = md.id

    return out


async def activar_modulo_tesoreria(session: AsyncSession, muni_id: int):
    res = await session.execute(
        select(MunicipioModulo).where(
            MunicipioModulo.municipio_id == muni_id, MunicipioModulo.modulo == "tesoreria"
        )
    )
    row = res.scalar_one_or_none()
    if not row:
        session.add(MunicipioModulo(municipio_id=muni_id, modulo="tesoreria", activo=True))
        print("  [+] Modulo tesoreria activado")
    elif not row.activo:
        row.activo = True
        print("  [~] Modulo tesoreria reactivado")
    else:
        print("  [=] Modulo tesoreria ya activo")


async def limpiar_tesoreria(session: AsyncSession, muni_id: int):
    """Borra contactos+gastos+cuotas del muni para arrancar limpio."""
    await session.execute(text("""
        DELETE FROM gastos_cuotas WHERE gasto_id IN (
            SELECT id FROM gastos WHERE municipio_id = :mid
        )
    """), {"mid": muni_id})
    await session.execute(text("DELETE FROM gastos WHERE municipio_id = :mid"), {"mid": muni_id})
    await session.execute(text("DELETE FROM contactos WHERE municipio_id = :mid"), {"mid": muni_id})
    print(f"  [-] Limpiado tesoreria previa del muni {muni_id}")


# Datos hardcodeados: 12 concejales reales del Excel del intendente
CONCEJALES = [
    ("María", "del Pino", "720246188000036000000"),
    ("David", "Huenz", "FUTBOL.SAN.PEDRO"),
    ("Milagro", "Di Gaudio", "MDIGAUDIOTOLE.NX.ARS"),
    ("Aldrin", "Garay", None),
    ("Guada", "Carranza", "CARRANZAGUADI.mp"),
    ("Alejandro", "Loza", None),
    ("Rosa", "Estanciero", "tomy.78"),
    ("Caro", "Ávila", "FACU.CARO.GABI"),
    ("Elpidio", "Sosa", None),
    ("Julio", "Ávila", "cala.oro.zar"),
    ("Laly", "Mariño", None),
    ("Eduardo", "García", None),  # el del KMZ
]

# Sample de empleados (subset del Excel para la demo)
EMPLEADOS = [
    ("Pilar", "Arias", "MARIAS6792.NX.ARS", 85000),
    ("Adriana", "Ávila", None, 160000),
    ("Gabriela", "Ávila", None, 220000),
    ("Roque", "Ávila", None, 20000),
    ("Verónica", "Baez", None, 165000),
    ("Eduardo", "Baez Santos", None, 310000),
    ("Alan", "Barrios", "AlanBarrios.SPN", 207000),
    ("Cristian", "Barrios", None, 300000),
    ("Cristina", "Barrios", None, 110000),
    ("Mariela", "Barrios", "MBARRIOS2278.NX.ARS", 250000),
    ("Martín", "Barrios", "ARIETE.BORLAS.SALIDA", 182000),
    ("Karina", "Bustamante", None, 85000),
    ("Sandra", "Busto", None, 215000),
    ("Pablo", "Carranza", None, 195000),
    ("Lucía", "Cebada", None, 145000),
]

PROFESIONALES = [
    ("Roberto", "Méndez", "abogado", "abogado"),
    ("Susana", "Pérez", "contadora", "contador"),
    ("Eduardo", "Romero", "ingeniero", "ingeniero"),
    ("Lía", "Sosa", "arquitecta", "arquitecto"),
    ("Hugo", "Castro", "doctor", "doctor"),
    ("Pablo", "Suárez", None, "sistema"),
]

TURISMO_CULTURA = [
    ("Giyo", "Toledo"),
    ("Tatiana", "Barrios"),
    ("Sebastián", "Chánchez"),
    ("Cesar", "Ávila"),
    ("Anita", "Vivas Carranza"),
    ("Romina", "Toledo"),
    ("Camila", "Soria"),
]

# Beneficiarios extra para mostrar prestamos
BENEFICIARIOS = [
    ("Juan", "González", "PRODUCTOR.AGRARIO"),
    ("Marta", "Fernández", "almacen.barrio"),
    ("Ramón", "Ledesma", None),
    ("Patricia", "Acosta", "p.acosta.spn"),
]


def random_loc():
    return (
        SPN_LAT + random.uniform(-DELTA, DELTA),
        SPN_LON + random.uniform(-DELTA, DELTA),
    )


async def crear_contactos(session: AsyncSession, muni_id: int) -> dict[str, Contacto]:
    out: dict[str, Contacto] = {}

    def add(nombre, apellido, alias, tipo, subtipo=None):
        lat, lon = random_loc()
        c = Contacto(
            municipio_id=muni_id,
            nombre=nombre, apellido=apellido,
            alias_pago=alias,
            tipo=tipo, subtipo=subtipo,
            latitud=lat, longitud=lon,
        )
        session.add(c)
        return c

    cuts = []
    for n, a, alias in CONCEJALES:
        cuts.append(add(n, a, alias, TipoContacto.CONCEJAL))
    for n, a, alias, _ in EMPLEADOS:
        cuts.append(add(n, a, alias, TipoContacto.EMPLEADO))
    for n, a, alias, sub in PROFESIONALES:
        cuts.append(add(n, a, alias, TipoContacto.PROFESIONAL, subtipo=sub))
    for n, a in TURISMO_CULTURA:
        cuts.append(add(n, a, None, TipoContacto.BENEFICIARIO, subtipo="turismo y cultura"))
    for n, a, alias in BENEFICIARIOS:
        cuts.append(add(n, a, alias, TipoContacto.BENEFICIARIO))

    await session.flush()
    print(f"  [+] {len(cuts)} contactos creados con lat/lon")
    return cuts


# Coords del placemark real del KMZ para Eduardo Garcia
KMZ_EDUARDO_LAT = -30.26586490649007
KMZ_EDUARDO_LON = -64.12454421138095


async def fix_eduardo_garcia(session: AsyncSession, muni_id: int):
    """El KMZ original tenía Eduardo García en estas coords exactas."""
    res = await session.execute(
        select(Contacto).where(
            Contacto.municipio_id == muni_id,
            Contacto.nombre == "Eduardo",
            Contacto.apellido == "García",
        )
    )
    eduardo = res.scalar_one_or_none()
    if eduardo:
        eduardo.latitud = KMZ_EDUARDO_LAT
        eduardo.longitud = KMZ_EDUARDO_LON
        print(f"  [~] Eduardo García georeferenciado con coords del KMZ")


def _add_months(d: date, n: int) -> date:
    from calendar import monthrange
    total = d.month - 1 + n
    y = d.year + total // 12
    m = total % 12 + 1
    last = monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


async def crear_gastos(session: AsyncSession, muni_id: int, admin_id: int, deps: dict[str, int]):
    """Gastos realistas basados en el Excel:
      - Concejales: dieta mensual recurrente ($88.000 ene-feb, $100.000 mar-dic) → simplificado a recurrente $90.000
      - Empleados: sueldo base mensual recurrente
      - Profesionales: 1 honorario suelto + algunos meses
      - Turismo: 1-2 pagos por evento
      - Beneficiarios: 1 préstamo en cuotas cada uno
    """
    res = await session.execute(
        select(Contacto).where(Contacto.municipio_id == muni_id)
    )
    contactos = res.scalars().all()

    dep_concejo = deps.get("concejo deliberante")
    dep_turismo = deps.get("secretaría de turismo y cultura") or deps.get("secretaria de turismo y cultura")
    dep_hacienda = deps.get("secretaria de hacienda")
    dep_obras = deps.get("secretaría de obras públicas") or deps.get("secretaria de obras publicas")

    hoy = date.today()
    primer_dia_mes = date(hoy.year, hoy.month, 1)
    inicio_anio = date(hoy.year, 1, 1)
    fin_anio = date(hoy.year, 12, 31)

    gastos_creados = 0

    for c in contactos:
        if c.tipo == TipoContacto.CONCEJAL:
            # Dieta mensual recurrente
            monto = Decimal("90000")
            await _crear_gasto_recurrente(
                session, muni_id, admin_id, c, monto,
                concepto="Dieta mensual concejal",
                fecha_inicio=inicio_anio, fecha_fin=fin_anio,
            )
            gastos_creados += 1
        elif c.tipo == TipoContacto.EMPLEADO:
            # Sueldo base recurrente — busco el monto en EMPLEADOS por nombre
            monto = next(
                (m for n, a, _, m in EMPLEADOS if n == c.nombre and a == c.apellido),
                100000,
            )
            await _crear_gasto_recurrente(
                session, muni_id, admin_id, c, Decimal(str(monto)),
                concepto="Sueldo mensual",
                fecha_inicio=inicio_anio, fecha_fin=fin_anio,
            )
            gastos_creados += 1
        elif c.tipo == TipoContacto.PROFESIONAL:
            # 1 honorario suelto (mes actual)
            sub = (c.subtipo or "").capitalize()
            await _crear_gasto_contado(
                session, muni_id, admin_id, c,
                monto=Decimal(random.choice(["120000", "180000", "250000", "300000"])),
                concepto=f"Honorarios {sub}" if sub else "Honorarios profesionales",
                fecha=primer_dia_mes,
            )
            gastos_creados += 1
        elif c.tipo == TipoContacto.BENEFICIARIO and (c.subtipo or "").startswith("turismo"):
            # Aporte cultural
            await _crear_gasto_contado(
                session, muni_id, admin_id, c,
                monto=Decimal(random.choice(["50000", "75000", "100000"])),
                concepto="Aporte por evento cultural",
                fecha=primer_dia_mes - timedelta(days=random.randint(0, 60)),
            )
            gastos_creados += 1
        elif c.tipo == TipoContacto.BENEFICIARIO:
            # Préstamo en cuotas
            total = Decimal(random.choice(["500000", "800000", "1200000", "1500000"]))
            n_cuotas = random.choice([6, 12])
            await _crear_gasto_cuotas(
                session, muni_id, admin_id, c, total,
                concepto=random.choice([
                    "Préstamo agrario", "Préstamo productivo",
                    "Préstamo para vivienda", "Préstamo personal",
                ]),
                cuotas_total=n_cuotas,
                fecha_inicio=primer_dia_mes - timedelta(days=random.randint(0, 30)),
            )
            gastos_creados += 1

    # Algunos gastos a dependencias (sin contacto) — obra y turismo
    if dep_obras:
        await _crear_gasto_dependencia(
            session, muni_id, admin_id, dep_obras,
            monto=Decimal("8100771.30"),
            concepto="Obra Vestuarios — pago a Fofindes",
            fecha=primer_dia_mes - timedelta(days=20),
        )
        gastos_creados += 1
    if dep_turismo:
        await _crear_gasto_dependencia(
            session, muni_id, admin_id, dep_turismo,
            monto=Decimal("450000"),
            concepto="Festival de Fútbol — gastos generales",
            fecha=primer_dia_mes - timedelta(days=45),
        )
        gastos_creados += 1

    print(f"  [+] {gastos_creados} gastos creados")


async def _crear_gasto_contado(session, muni_id, admin_id, contacto, monto, concepto, fecha):
    g = Gasto(
        municipio_id=muni_id, creador_id=admin_id,
        destino_tipo=DestinoGasto.CONTACTO, destino_contacto_id=contacto.id,
        concepto=concepto, monto_pesos=monto, fecha=fecha,
        tipo_financiacion=TipoFinanciacion.CONTADO,
        forma_pago=FormaPago.TRANSFERENCIA,
    )
    session.add(g)
    await session.flush()
    session.add(GastoCuota(
        gasto_id=g.id, numero=1, monto=monto,
        fecha_vencimiento=fecha, fecha_pago=fecha,
        estado=EstadoGastoCuota.PAGADA,
        forma_pago=FormaPago.TRANSFERENCIA,
    ))


async def _crear_gasto_dependencia(session, muni_id, admin_id, md_id, monto, concepto, fecha):
    g = Gasto(
        municipio_id=muni_id, creador_id=admin_id,
        destino_tipo=DestinoGasto.DEPENDENCIA, destino_dependencia_id=md_id,
        concepto=concepto, monto_pesos=monto, fecha=fecha,
        tipo_financiacion=TipoFinanciacion.CONTADO,
        forma_pago=FormaPago.TRANSFERENCIA,
    )
    session.add(g)
    await session.flush()
    session.add(GastoCuota(
        gasto_id=g.id, numero=1, monto=monto,
        fecha_vencimiento=fecha, fecha_pago=fecha,
        estado=EstadoGastoCuota.PAGADA,
        forma_pago=FormaPago.TRANSFERENCIA,
    ))


async def _crear_gasto_recurrente(session, muni_id, admin_id, contacto, monto, concepto, fecha_inicio, fecha_fin):
    g = Gasto(
        municipio_id=muni_id, creador_id=admin_id,
        destino_tipo=DestinoGasto.CONTACTO, destino_contacto_id=contacto.id,
        concepto=concepto, monto_pesos=monto, fecha=fecha_inicio,
        tipo_financiacion=TipoFinanciacion.RECURRENTE,
        forma_pago=FormaPago.TRANSFERENCIA,
        frecuencia=FrecuenciaRecurrencia.MENSUAL,
        fecha_fin_recurrencia=fecha_fin,
    )
    session.add(g)
    await session.flush()
    hoy = date.today()
    fecha = fecha_inicio
    numero = 1
    while fecha <= fecha_fin and numero <= 12:
        # Marcar como pagada si la fecha ya pasó, pendiente si es futura
        estado = EstadoGastoCuota.PAGADA if fecha < hoy else EstadoGastoCuota.PENDIENTE
        session.add(GastoCuota(
            gasto_id=g.id, numero=numero, monto=monto,
            fecha_vencimiento=fecha,
            fecha_pago=fecha if estado == EstadoGastoCuota.PAGADA else None,
            estado=estado,
            forma_pago=FormaPago.TRANSFERENCIA if estado == EstadoGastoCuota.PAGADA else None,
        ))
        fecha = _add_months(fecha, 1)
        numero += 1


async def _crear_gasto_cuotas(session, muni_id, admin_id, contacto, monto_total, concepto, cuotas_total, fecha_inicio):
    monto_cuota = (monto_total / cuotas_total).quantize(Decimal("0.01"))
    g = Gasto(
        municipio_id=muni_id, creador_id=admin_id,
        destino_tipo=DestinoGasto.CONTACTO, destino_contacto_id=contacto.id,
        concepto=concepto, monto_pesos=monto_total, fecha=fecha_inicio,
        tipo_financiacion=TipoFinanciacion.PRESTAMO,
        forma_pago=FormaPago.TRANSFERENCIA,
        cuotas_total=cuotas_total,
    )
    session.add(g)
    await session.flush()
    hoy = date.today()
    for i in range(cuotas_total):
        fecha_venc = _add_months(fecha_inicio, i)
        # Las primeras 2-3 pagadas, el resto pendiente
        estado = EstadoGastoCuota.PAGADA if i < 2 and fecha_venc <= hoy else EstadoGastoCuota.PENDIENTE
        session.add(GastoCuota(
            gasto_id=g.id, numero=i + 1, monto=monto_cuota,
            fecha_vencimiento=fecha_venc,
            fecha_pago=fecha_venc if estado == EstadoGastoCuota.PAGADA else None,
            estado=estado,
            forma_pago=FormaPago.TRANSFERENCIA if estado == EstadoGastoCuota.PAGADA else None,
        ))


async def main():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as session:
        print("=== Seed Tesorería para San Pedro Norte ===")
        muni = await get_muni(session)
        print(f"  Muni: {muni.nombre} (id={muni.id})")
        admin = await get_admin(session, muni.id)
        print(f"  Admin: {admin.email} (id={admin.id})")

        await limpiar_tesoreria(session, muni.id)
        await session.commit()

        await activar_modulo_tesoreria(session, muni.id)
        deps = await ensure_dependencias(session, muni)
        await session.commit()

        await crear_contactos(session, muni.id)
        await fix_eduardo_garcia(session, muni.id)
        await session.commit()

        await crear_gastos(session, muni.id, admin.id, deps)
        await session.commit()

        print()
        print("[OK] Seed Tesoreria completado.")
        print(f"   Loguear como: {admin.email} / demo123")
        print(f"   Ir a /gestion/tesoreria")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
