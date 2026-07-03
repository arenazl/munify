"""Seed completo del modulo Tesoreria para una demo nueva.

Lo invoca crear_municipio_demo despues del seed base. Crea:
- Modulo tesoreria activado (feature flag)
- 15 tipos de concepto + 300 conceptos (catalogo per-muni)
- 10 tipos de empleado
- 5 cajas/fondos (Tesoro + Coparticipacion + FOFINDE + FODEMEP + FOMEP)
- 5 parajes con poligonos demo
- ~30 contactos (empleados / proveedores / contratistas / profesionales)
- ~50 gastos historicos repartidos en los ultimos 6 meses
- 3 proyectos
- 2 pagos programados

Best-effort: si falla algun paso, los anteriores quedan. Idempotente:
skip si ya hay data del modulo en ese muni.
"""
import json
import math
import random
from datetime import date, timedelta
from decimal import Decimal
from calendar import monthrange
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Municipio, Contacto, Gasto, GastoCuota, User, MunicipioModulo,
    TipoContacto, DestinoGasto, TipoFinanciacion, FormaPago, EstadoGastoCuota,
    TesoreriaTipoConcepto, TesoreriaConcepto, TesoreriaTipoEmpleado,
    TesoreriaCaja, TesoreriaParaje, Proyecto, EstadoProyecto,
    TesoreriaPagoProgramado, FrecuenciaPago, TesoreriaConceptoLiquidacion,
)


# ============================================================
# Catalogos: 15 tipos + 300 conceptos (mismo del seed honesto)
# ============================================================
TIPOS_CONCEPTO = [
    ("Sueldos y haberes", "#3b82f6", "Briefcase", [
        "Sueldo mensual", "Sueldo basico", "Sueldo personal de planta", "Sueldo personal contratado",
        "Sueldo personal jornalizado", "Horas extras", "Horas extras 50%", "Horas extras 100%",
        "Aguinaldo (SAC)", "Medio aguinaldo", "Bono fin de año", "Adicional por antiguedad",
        "Adicional por presentismo", "Adicional por zona desfavorable", "Adicional jerarquico",
        "Adicional por funcion", "Liquidacion final", "Vacaciones no gozadas",
        "Indemnizacion por despido", "Indemnizacion sustitutiva preaviso",
    ]),
    ("Concejales y politicos", "#8b5cf6", "Vote", [
        "Dieta concejal", "Dieta concejal aguinaldo", "Dieta presidente concejo", "Dieta secretario concejo",
        "Gastos de representacion intendente", "Gastos de representacion concejales",
        "Movilidad concejales", "Viaticos sesiones", "Asesoria legislativa",
        "Bloque oficialista", "Bloque oposicion", "Publicidad institucional concejo",
        "Premios y reconocimientos", "Reunion vecinal", "Audiencia publica",
        "Eventos protocolares", "Convenios intermunicipales", "Hermanamientos",
        "Viaticos congresos", "Otros gastos politicos",
    ]),
    ("Honorarios profesionales", "#f59e0b", "GraduationCap", [
        "Honorarios abogado", "Honorarios contador", "Honorarios escribano", "Honorarios medico",
        "Honorarios veterinario", "Honorarios ingeniero", "Honorarios arquitecto",
        "Honorarios maestro mayor de obras", "Honorarios agrimensor", "Honorarios agronomo",
        "Honorarios sistemas / IT", "Honorarios consultor", "Honorarios prensa",
        "Honorarios diseño grafico", "Honorarios psicologo", "Honorarios traductor",
        "Honorarios auditor externo", "Honorarios perito", "Honorarios mediador",
        "Honorarios otros profesionales",
    ]),
    ("Obras y servicios", "#06b6d4", "HardHat", [
        "Mano de obra albañileria", "Mano de obra plomeria", "Mano de obra electricidad",
        "Mano de obra herreria", "Mano de obra pintura", "Mano de obra carpinteria",
        "Mano de obra techista", "Mano de obra gas", "Mano de obra zinguero",
        "Contratista obra civil", "Contratista vialidad", "Contratista alumbrado",
        "Contratista riego", "Contratista cloacas", "Contratista desagües",
        "Contratista cordon cuneta", "Contratista pavimentacion", "Contratista demolicion",
        "Servicio de jardineria", "Servicio de limpieza",
    ]),
    ("Materiales e insumos", "#10b981", "Package", [
        "Cemento Portland", "Cal hidratada", "Arena", "Piedra", "Ladrillos cemento",
        "Ladrillos huecos", "Hierro construccion", "Madera", "Pintura latex", "Pintura sintetica",
        "Caños PVC", "Caños galvanizados", "Cable electrico", "Insumos ferreteria",
        "Herramientas manuales", "Insumos limpieza", "Agroquimicos", "Semillas",
        "Fertilizante", "Repuestos varios",
    ]),
    ("Equipamiento e inversiones", "#0ea5e9", "Truck", [
        "Camion atmosferico", "Camion volcador", "Camion compactador", "Hidroelevador",
        "Tractor", "Retroexcavadora", "Motoniveladora", "Camioneta utilitaria",
        "Auto institucional", "Moto", "Bicicleta electrica", "Computadora desktop",
        "Notebook", "Impresora", "Mobiliario oficina", "Aire acondicionado",
        "Generador electrico", "Bomba de agua", "Equipamiento bomberos", "Equipamiento sala primeros auxilios",
    ]),
    ("Combustibles y movilidad", "#ef4444", "Fuel", [
        "Nafta super", "Nafta premium", "Gasoil", "GNC", "Aceite motor", "Filtros",
        "Lubricantes", "Mantenimiento vehicular", "Service general", "Cambio de neumaticos",
        "Alineacion y balanceo", "Mecanica general", "Lavadero", "Patente vehicular",
        "Seguro automotor", "Verificacion tecnica", "Viaticos personal",
        "Pasajes interurbanos", "Peajes", "Estacionamiento",
    ]),
    ("Servicios e impuestos", "#71717a", "Receipt", [
        "Luz / energia electrica", "Agua corriente", "Gas natural", "Internet fibra",
        "Telefonia fija", "Telefonia movil", "Servicio limpieza urbana", "Recoleccion residuos",
        "Tasa municipal otra muni", "Impuesto inmobiliario", "Impuesto automotor",
        "Ingresos brutos", "Sellos provinciales", "Tasas nacionales", "AFIP / IVA",
        "ARBA / Rentas", "Cuota AySA", "Cuota ABL", "Tributos varios", "Multas administrativas",
    ]),
    ("Salud", "#ec4899", "Heart", [
        "Medicamentos", "Insumos descartables", "Vacunas", "Reactivos lab",
        "Material curacion", "Oxigeno medicinal", "Traslado ambulancia",
        "Traslado a hospital", "Estudios complementarios", "Laboratorio",
        "Radiografias", "Ecografias", "Camilla / mobiliario sanitario",
        "Equipamiento odontologico", "Insumos veterinaria municipal",
        "Castracion mascotas", "Campaña sanitaria", "Pago a especialistas",
        "Convenio hospital regional", "Otros gastos sanitarios",
    ]),
    ("Educacion", "#22c55e", "BookOpen", [
        "Beca estudiantil primaria", "Beca estudiantil secundaria", "Beca terciaria / universitaria",
        "Aporte cooperadora escuela", "Kit escolar", "Utiles escolares",
        "Libros / material didactico", "Mochilas", "Guardapolvos", "Zapatillas escolares",
        "Transporte escolar", "Refrigerio escolar", "Merienda reforzada",
        "Pago internado", "Apoyo escolar / tutorias", "Mantenimiento edificio escolar",
        "Pintura / refaccion escuela", "Equipamiento informatico escolar",
        "Capacitacion docente", "Premios estudiantes destacados",
    ]),
    ("Cultura, deporte y turismo", "#a855f7", "Trophy", [
        "Fiesta patronal", "Fiesta del Pueblo", "Carnaval", "Acto patrio 25 de mayo",
        "Acto patrio 9 de julio", "Festival folklorico", "Festival rock", "Peña tradicionalista",
        "Premios competencia deportiva", "Alquiler escenario", "Alquiler sonido",
        "Alquiler luminaria evento", "Sanitarios moviles", "Catering evento",
        "Premios concurso literario", "Taller cultural", "Curso de pintura / arte",
        "Promocion turistica", "Cartelera turistica", "Acto patrio 17 de agosto",
    ]),
    ("Aportes y subsidios", "#f97316", "HandHeart", [
        "Subsidio club deportivo", "Subsidio cooperadora", "Subsidio centro de jubilados",
        "Subsidio bomberos voluntarios", "Subsidio asociacion civil",
        "Aporte caja de jubilaciones", "Aporte sindical", "Ayuda social familia",
        "Ayuda alimentaria", "Modulo alimentario", "Pago de servicios a vecino",
        "Materiales construccion vivienda social", "Bolson de mercaderia",
        "Ayuda funeral", "Ayuda pasaje", "Ayuda medicamentos vecino",
        "Subsidio a centro de salud", "Subsidio a parroquia", "Aporte a iglesia evangelica",
        "Otros subsidios",
    ]),
    ("Publicidad y comunicacion", "#0891b2", "Megaphone", [
        "Publicidad radio FM local", "Publicidad radio regional",
        "Publicidad red social Facebook", "Publicidad red social Instagram",
        "Publicidad TV regional", "Diseño grafico afiches",
        "Impresion folleteria", "Impresion volantes", "Imprenta papeleria oficial",
        "Imprenta talonarios", "Cartelero / cartelera publica", "Banner / lona",
        "Pintura mural informativo", "Pago a prensista", "Edicion video institucional",
        "Fotografia institucional", "Pago dominio web", "Hosting web",
        "Mantenimiento web", "Otros gastos prensa",
    ]),
    ("Prestamos", "#dc2626", "Banknote", [
        "Prestamo agrario", "Prestamo emprendedor", "Prestamo construccion",
        "Prestamo mejora vivienda", "Prestamo refaccion local comercial",
        "Prestamo herramientas", "Prestamo vehicular", "Prestamo salud",
        "Prestamo educacion", "Prestamo emergencia familiar",
        "Adelanto sueldo empleado", "Prestamo empleado mediano plazo",
        "Prestamo empleado largo plazo", "Prestamo electrodomestico empleado",
        "Reintegro prestamo (devolucion)", "Cancelacion anticipada",
        "Interes generado", "Ajuste indexacion", "Saldo a favor", "Otros prestamos",
    ]),
    ("Otros", "#a3a3a3", "MoreHorizontal", [
        "Caja chica", "Ajuste contable", "Diferencia de cambio",
        "Pago a determinar", "Reembolso", "Devolucion saldo",
        "Honorarios judiciales", "Multa recibida", "Gasto bancario",
        "Comision bancaria", "Costo de transferencia", "Sellado bancario",
        "Mantenimiento cuenta", "Chequera nueva", "Token bancario",
        "Servicio mercadopago", "Servicio gateway pago", "Otros bancarios",
        "Imprevisto", "Gasto sin clasificar",
    ]),
]


TIPOS_EMPLEADO = [
    ("Personal de planta", "#3b82f6", "Briefcase"),
    ("Personal contratado", "#06b6d4", "FileText"),
    ("Personal jornalizado", "#f59e0b", "Calendar"),
    ("Albañil", "#a855f7", "HardHat"),
    ("Maestro mayor de obras", "#8b5cf6", "HardHat"),
    ("Arquitecto", "#ec4899", "Compass"),
    ("Electricista", "#eab308", "Zap"),
    ("Plomero", "#0ea5e9", "Wrench"),
    ("Chofer", "#10b981", "Truck"),
    ("Personal de mantenimiento", "#84cc16", "Wrench"),
]


CAJAS_DEMO = [
    ("Tesoro propio", "TES", "#3b82f6", "Wallet", Decimal(20_000_000), "Recaudacion propia del municipio"),
    ("Coparticipacion provincial", "COPA", "#10b981", "TrendingUp", Decimal(15_000_000), "Coparticipacion mensual"),
    ("FOFINDE", "FOFINDE", "#f59e0b", "PiggyBank", Decimal(8_000_000), "Fondo Financiamiento Desarrollo"),
    ("FODEMEP", "FODEMEP", "#a855f7", "PiggyBank", Decimal(5_000_000), "Fondo Desarrollo Municipal"),
    ("FOMEP", "FOMEP", "#0ea5e9", "PiggyBank", Decimal(3_000_000), "Fondo Obras y Equipamiento"),
]


PARAJES_DEMO = [
    ("Santa Rita", "Paraje al norte del municipio", "#10b981", "Trees", (0.04, 0.02), 1.5),
    ("Los Alamos", "Zona oeste, principalmente productiva", "#a855f7", "TreePine", (0, -0.06), 2.0),
    ("El Cerrito", "Al sur, sobre el camino al rio", "#f59e0b", "Mountain", (-0.05, 0), 1.2),
    ("La Esperanza", "Paraje agropecuario al este", "#06b6d4", "Wheat", (0.01, 0.07), 1.8),
    ("Don Pedro", "Paraje historico al noreste", "#ec4899", "Home", (0.06, 0.05), 1.4),
]


# Catálogo básico de conceptos de liquidación (Pagos Programados). Antes el
# campo era texto libre; ahora los pagos programados demo referencian un
# nombre que también existe acá, mostrando el autocomplete poblado.
# (nombre, frecuencia_default, dia_del_mes_default)
CONCEPTOS_LIQUIDACION_DEMO = [
    ("Sueldo Básico", "mensual", 5),
    ("Presentismo", "mensual", 5),
    ("Antigüedad", "mensual", 5),
    ("Bono por Zona", "mensual", 5),
    ("Horas Extra", "mensual", 10),
    ("Descuento Jubilatorio", "mensual", 5),
    ("Obra Social", "mensual", 5),
    ("Aporte Sindical", "mensual", 5),
]


CONTACTOS_DEMO = [
    # 5 empleados de muni
    ("Juan", "Perez", TipoContacto.EMPLEADO, "Personal de planta"),
    ("Maria", "Gomez", TipoContacto.EMPLEADO, "Personal de planta"),
    ("Carlos", "Rodriguez", TipoContacto.EMPLEADO, "Jornalizado"),
    ("Ana", "Martinez", TipoContacto.EMPLEADO, "Contratado"),
    ("Luis", "Fernandez", TipoContacto.EMPLEADO, "Personal de planta"),
    # 4 proveedores
    ("Ferreteria", "El Tornillo", TipoContacto.PROVEEDOR, "Ferreteria"),
    ("Corralon", "San Cayetano", TipoContacto.PROVEEDOR, "Materiales construccion"),
    ("Distribuidora", "El Surco", TipoContacto.PROVEEDOR, "Combustibles"),
    ("Agroinsumos", "La Pampa", TipoContacto.PROVEEDOR, "Insumos agropecuarios"),
    # 3 contratistas
    ("Hernan", "Olivero", TipoContacto.CONTRATISTA, "Arquitecto"),
    ("Carlos", "Dominguez", TipoContacto.CONTRATISTA, "Maestro mayor de obras"),
    ("Mario", "Acosta", TipoContacto.CONTRATISTA, "Electricista"),
    # 3 profesionales
    ("Roberto", "Mendez", TipoContacto.PROFESIONAL, "Abogado"),
    ("Mariana", "Lopez", TipoContacto.PROFESIONAL, "Contadora"),
    ("Pablo", "Castro", TipoContacto.PROFESIONAL, "Medico clinico"),
    # 2 beneficiarios
    ("Club Atletico", None, TipoContacto.BENEFICIARIO, "Club deportivo"),
    ("Cooperadora", "Escuela 73", TipoContacto.BENEFICIARIO, "Cooperadora escolar"),
    # 3 concejales
    ("Juan", "Lopez", TipoContacto.CONCEJAL, "Concejal oficialista"),
    ("Patricia", "Garcia", TipoContacto.CONCEJAL, "Concejal oposicion"),
    ("Diego", "Suarez", TipoContacto.CONCEJAL, "Presidente concejo"),
]


async def _geocodificar_contacto_demo(muni_lat: float, muni_lon: float, seed: int):
    """Geocodifica una dirección REAL cercana al centro del municipio vía
    Nominatim (mismo patrón que el vecino demo en seed_demo.py — jamás
    coordenadas inventadas). Devuelve (direccion, lat, lon) o (None, None,
    None) si Nominatim no responde o no encuentra calle."""
    import httpx
    dlat = (((seed >> 3) % 2000) - 1000) / 100000.0  # offset ~1km
    dlon = (((seed >> 7) % 2000) - 1000) / 100000.0
    lat, lon = muni_lat + dlat, muni_lon + dlon
    try:
        async with httpx.AsyncClient(timeout=5.0) as hc:
            r = await hc.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lon, "format": "json", "zoom": 18, "addressdetails": 1},
                headers={"User-Agent": "Munify/1.0 (demo seed)"},
            )
            if r.status_code == 200:
                data = r.json()
                addr = data.get("address", {}) if isinstance(data, dict) else {}
                road = addr.get("road") or addr.get("pedestrian") or addr.get("street")
                if road:
                    num = 100 + ((seed >> 11) % 4900)
                    loc = (addr.get("suburb") or addr.get("city_district")
                           or addr.get("city") or addr.get("town") or addr.get("village") or "")
                    direccion = f"{road} {num}" + (f", {loc}" if loc else "")
                    return direccion, lat, lon
    except Exception:
        pass
    return None, None, None


def _poligono_circular(cx: float, cy: float, radio_km: float, vertices: int = 8, offset: float = 0) -> list[list[float]]:
    coords = []
    for i in range(vertices):
        ang = (2 * math.pi * i / vertices) + math.radians(offset)
        dlat = (radio_km / 111.0) * math.sin(ang)
        dlon = (radio_km / (111.0 * math.cos(math.radians(cx)))) * math.cos(ang)
        coords.append([round(cx + dlat, 6), round(cy + dlon, 6)])
    return coords


async def seed_tesoreria_demo(db: AsyncSession, municipio_id: int, admin_user_id: int) -> dict:
    """Carga TODO el modulo Tesoreria para una demo nueva.

    Idempotente: si encuentra catalogos ya cargados, los saltea.
    Devuelve dict con counts.
    """
    muni = await db.get(Municipio, municipio_id)
    if not muni:
        return {"error": "muni no existe"}

    muni_lat = muni.latitud or -30.265
    muni_lon = muni.longitud or -64.124

    counts = {
        "tipos_concepto": 0, "conceptos": 0, "tipos_empleado": 0,
        "conceptos_liquidacion": 0,
        "cajas": 0, "parajes": 0, "contactos": 0, "gastos": 0,
        "proyectos": 0, "pagos_programados": 0,
    }

    # 1. Activar modulo tesoreria
    existing_mod = (await db.execute(
        select(MunicipioModulo).where(
            MunicipioModulo.municipio_id == municipio_id,
            MunicipioModulo.modulo == 'tesoreria',
        )
    )).scalar_one_or_none()
    if not existing_mod:
        db.add(MunicipioModulo(municipio_id=municipio_id, modulo='tesoreria', activo=True))
    else:
        existing_mod.activo = True

    # 2. Tipos de concepto + conceptos
    has_tipos = (await db.execute(
        select(TesoreriaTipoConcepto).where(TesoreriaTipoConcepto.municipio_id == municipio_id).limit(1)
    )).scalar_one_or_none()
    if not has_tipos:
        for orden, (nombre, color, icono, conceptos) in enumerate(TIPOS_CONCEPTO):
            t = TesoreriaTipoConcepto(
                municipio_id=municipio_id, nombre=nombre, color=color, icono=icono,
                orden=orden, activo=True,
            )
            db.add(t)
            await db.flush()
            counts["tipos_concepto"] += 1
            for oc, nom in enumerate(conceptos):
                db.add(TesoreriaConcepto(
                    municipio_id=municipio_id, tipo_concepto_id=t.id, nombre=nom,
                    orden=oc, activo=True,
                ))
                counts["conceptos"] += 1

    # 3. Tipos de empleado
    has_te = (await db.execute(
        select(TesoreriaTipoEmpleado).where(TesoreriaTipoEmpleado.municipio_id == municipio_id).limit(1)
    )).scalar_one_or_none()
    if not has_te:
        for orden, (nombre, color, icono) in enumerate(TIPOS_EMPLEADO):
            db.add(TesoreriaTipoEmpleado(
                municipio_id=municipio_id, nombre=nombre, color=color, icono=icono,
                orden=orden, activo=True,
            ))
            counts["tipos_empleado"] += 1

    # 3.bis Conceptos de liquidación (catálogo de Pagos Programados)
    has_conceptos_liq = (await db.execute(
        select(TesoreriaConceptoLiquidacion).where(TesoreriaConceptoLiquidacion.municipio_id == municipio_id).limit(1)
    )).scalar_one_or_none()
    if not has_conceptos_liq:
        for orden, (nombre, frecuencia, dia_mes) in enumerate(CONCEPTOS_LIQUIDACION_DEMO):
            db.add(TesoreriaConceptoLiquidacion(
                municipio_id=municipio_id, nombre=nombre,
                frecuencia_default=frecuencia, dia_del_mes_default=dia_mes,
                orden=orden, activo=True,
            ))
            counts["conceptos_liquidacion"] += 1

    # 4. Cajas
    has_cajas = (await db.execute(
        select(TesoreriaCaja).where(TesoreriaCaja.municipio_id == municipio_id).limit(1)
    )).scalar_one_or_none()
    caja_tesoro_id = None
    if not has_cajas:
        for orden, (nombre, codigo, color, icono, saldo, desc) in enumerate(CAJAS_DEMO):
            c = TesoreriaCaja(
                municipio_id=municipio_id, nombre=nombre, codigo=codigo,
                descripcion=desc, color=color, icono=icono, saldo_inicial=saldo,
                fecha_apertura=date.today() - timedelta(days=180),
                orden=orden, activo=True,
            )
            db.add(c)
            await db.flush()
            if codigo == 'TES':
                caja_tesoro_id = c.id
            counts["cajas"] += 1
    else:
        caja_tesoro = (await db.execute(
            select(TesoreriaCaja).where(TesoreriaCaja.municipio_id == municipio_id, TesoreriaCaja.codigo == 'TES')
        )).scalar_one_or_none()
        caja_tesoro_id = caja_tesoro.id if caja_tesoro else None

    # 5. Parajes (alrededor del centro del muni)
    has_parajes = (await db.execute(
        select(TesoreriaParaje).where(TesoreriaParaje.municipio_id == municipio_id).limit(1)
    )).scalar_one_or_none()
    if not has_parajes:
        for orden, (nombre, desc, color, icono, offset, radio) in enumerate(PARAJES_DEMO):
            cx = muni_lat + offset[0]
            cy = muni_lon + offset[1]
            coords = _poligono_circular(cx, cy, radio, 8, orden * 10)
            db.add(TesoreriaParaje(
                municipio_id=municipio_id, nombre=nombre, descripcion=desc,
                color=color, icono=icono, poligono=json.dumps(coords),
                centro_lat=cx, centro_lon=cy, orden=orden, activo=True,
            ))
            counts["parajes"] += 1

    # 6. Contactos demo
    contactos_creados = []
    has_contactos = (await db.execute(
        select(Contacto).where(Contacto.municipio_id == municipio_id).limit(1)
    )).scalar_one_or_none()
    if not has_contactos:
        # Un par de contactos (2 empleados + 1 beneficiario) quedan
        # geolocalizados con una dirección REAL del municipio (Nominatim),
        # nunca coordenadas inventadas. El resto queda sin domicilio, como
        # ya lo estaba.
        _GEOLOCALIZAR_IDX = {0, 1, 15}  # Juan Perez, Maria Gomez, Club Atletico
        for idx, (nombre, apellido, tipo, subtipo) in enumerate(CONTACTOS_DEMO):
            direccion = lat = lon = None
            if idx in _GEOLOCALIZAR_IDX:
                direccion, lat, lon = await _geocodificar_contacto_demo(
                    muni_lat, muni_lon, municipio_id * 1000 + idx,
                )
            notas = "[DEMO] Contacto generado para la demo"
            if direccion:
                notas += " — geolocalizado"
            c = Contacto(
                municipio_id=municipio_id, nombre=nombre, apellido=apellido,
                tipo=tipo, subtipo=subtipo,
                direccion=direccion, latitud=lat, longitud=lon,
                alias_pago=f"{nombre.upper()}.{(apellido or 'SPN').split()[0].upper()}",
                notas=notas,
                activo=True,
            )
            db.add(c)
            contactos_creados.append(c)
            counts["contactos"] += 1
        await db.flush()
    else:
        contactos_creados = (await db.execute(
            select(Contacto).where(Contacto.municipio_id == municipio_id, Contacto.activo == True)  # noqa: E712
            .limit(20)
        )).scalars().all()

    # 7. Gastos historicos: ~50 distribuidos en los ultimos 6 meses
    has_gastos = (await db.execute(
        select(Gasto).where(Gasto.municipio_id == municipio_id).limit(1)
    )).scalar_one_or_none()
    if not has_gastos and contactos_creados:
        random.seed(municipio_id)  # determinista por muni
        hoy = date.today()
        conceptos_mix = [
            "Sueldo mensual", "Honorarios abogado", "Honorarios contador",
            "Honorarios medico", "Cemento Portland", "Ladrillos huecos",
            "Nafta super", "Gasoil", "Luz / energia electrica", "Agua corriente",
            "Mano de obra electricidad", "Subsidio club deportivo",
            "Publicidad radio FM local", "Aporte cooperadora escuela",
        ]
        for i in range(50):
            mes_atras = random.randint(0, 6)
            anio = hoy.year if hoy.month - mes_atras > 0 else hoy.year - 1
            mes = ((hoy.month - mes_atras - 1) % 12) + 1
            last_day = monthrange(anio, mes)[1]
            dia = random.randint(1, last_day)
            fecha_g = date(anio, mes, dia)
            contacto = random.choice(contactos_creados)
            concepto = random.choice(conceptos_mix)
            monto = Decimal(random.choice([50_000, 80_000, 120_000, 180_000, 250_000, 350_000, 500_000, 800_000]))
            forma = random.choice([FormaPago.TRANSFERENCIA, FormaPago.EFECTIVO, FormaPago.CHEQUE])

            g = Gasto(
                municipio_id=municipio_id,
                creador_id=admin_user_id,
                destino_tipo=DestinoGasto.CONTACTO,
                destino_contacto_id=contacto.id,
                concepto=concepto,
                descripcion="[DEMO] Gasto generado automaticamente",
                monto_pesos=monto,
                fecha=fecha_g,
                tipo_financiacion=TipoFinanciacion.CONTADO,
                forma_pago=forma,
                activo=True,
            )
            db.add(g)
            await db.flush()
            db.add(GastoCuota(
                gasto_id=g.id, numero=1, monto=monto,
                fecha_vencimiento=fecha_g, fecha_pago=fecha_g,
                estado=EstadoGastoCuota.PAGADA, forma_pago=forma,
            ))
            counts["gastos"] += 1

    # 8. Proyectos (3)
    has_proyectos = (await db.execute(
        select(Proyecto).where(Proyecto.municipio_id == municipio_id).limit(1)
    )).scalar_one_or_none()
    if not has_proyectos:
        proys = [
            ("Repavimentacion Av. Principal", "[DEMO] Obra de pavimentacion en avenida principal", Decimal(12_000_000), EstadoProyecto.ACTIVO),
            ("Departamento para el vecindario", "[DEMO] Construccion vivienda social", Decimal(8_500_000), EstadoProyecto.ACTIVO),
            ("Plaza del Bicentenario", "[DEMO] Remodelacion plaza central", Decimal(3_800_000), EstadoProyecto.FINALIZADO),
        ]
        for nombre, desc, presup, estado in proys:
            db.add(Proyecto(
                municipio_id=municipio_id, nombre=nombre, descripcion=desc,
                presupuesto=presup, estado=estado, activo=True,
                fecha_inicio=date.today() - timedelta(days=90),
            ))
            counts["proyectos"] += 1

    # 9. Pagos programados (2)
    has_pp = (await db.execute(
        select(TesoreriaPagoProgramado).where(TesoreriaPagoProgramado.municipio_id == municipio_id).limit(1)
    )).scalar_one_or_none()
    if not has_pp and contactos_creados:
        empleados = [c for c in contactos_creados if c.tipo == TipoContacto.EMPLEADO][:2]
        # Conceptos reales del catálogo recién sembrado (no texto libre) —
        # variedad: uno paga el sueldo básico, el otro un plus de presentismo.
        _conceptos_pp = [("Sueldo Básico", 500_000), ("Presentismo", 45_000)]
        for idx, emp in enumerate(empleados):
            concepto_nombre, monto = _conceptos_pp[idx % len(_conceptos_pp)]
            hoy = date.today()
            inicio = date(hoy.year, hoy.month, 1)
            proximo_mes = hoy.month + 1 if hoy.month < 12 else 1
            proximo_anio = hoy.year if hoy.month < 12 else hoy.year + 1
            db.add(TesoreriaPagoProgramado(
                municipio_id=municipio_id, contacto_id=emp.id,
                caja_id=caja_tesoro_id,
                concepto=concepto_nombre,
                descripcion="[DEMO] Pago programado de prueba",
                monto_pesos=Decimal(monto),
                forma_pago="transferencia",
                frecuencia=FrecuenciaPago.MENSUAL,
                dia_del_mes=5,
                fecha_inicio=inicio,
                proximo_pago=date(proximo_anio, proximo_mes, 5),
                activo=True,
            ))
            counts["pagos_programados"] += 1

    await db.flush()
    return counts
