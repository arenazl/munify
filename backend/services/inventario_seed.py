"""Semilla del módulo de inventario.

`TEMPLATE_CATEGORIAS` es el template genérico que arranca todo municipio
(igual criterio que las categorías de reclamo): rubros amplios con su
naturaleza (activo | consumible). El municipio después lo customiza.

`ITEMS_DEMO` son ítems de ejemplo para las demos. Datos claramente demo:
los vehículos/máquinas usan numeración interna municipal ("Móvil 1"),
NO patentes inventadas. El stock son cantidades plausibles, no reales.

`seed_inventario(db, municipio_id, incluir_demo)` es idempotente: no
duplica categorías ni ítems ya existentes (match por nombre).
"""
from datetime import datetime, timedelta

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    FlotaCarga,
    InventarioCategoria, InventarioItem,
    InventarioDeposito, InventarioMovimiento,
    InventarioOrdenCompra, InventarioOrdenCompraLinea,
    TipoMovimientoInventario, EstadoOrdenCompra,
)
from services.inventario_movimientos import registrar_movimiento
from models.enums import NaturalezaInventario, EstadoActivo


# (nombre, icono, color, naturaleza, orden)
TEMPLATE_CATEGORIAS = [
    ("Vehículos", "Truck", "#3b82f6", NaturalezaInventario.ACTIVO, 1),
    ("Maquinaria", "Forklift", "#6366f1", NaturalezaInventario.ACTIVO, 2),
    ("Herramientas", "Wrench", "#8b5cf6", NaturalezaInventario.ACTIVO, 3),
    ("Materiales", "Package", "#10b981", NaturalezaInventario.CONSUMIBLE, 4),
    ("Insumos", "Container", "#f59e0b", NaturalezaInventario.CONSUMIBLE, 5),
]

# categoria -> lista de ítems.
# Activos:     (nombre, identificador)
# Consumibles: (nombre, stock_actual, stock_minimo, unidad)
ITEMS_DEMO_ACTIVOS = {
    "Vehículos": [
        ("Camioneta utilitaria", "Móvil 1"),
        ("Camión volcador", "Móvil 2"),
        ("Camioneta 4x4", "Móvil 3"),
    ],
    "Maquinaria": [
        ("Retroexcavadora", "Máquina 1"),
        ("Motoniveladora", "Máquina 2"),
    ],
    "Herramientas": [
        ("Motosierra", "Herramienta 1"),
        ("Hidrolavadora", "Herramienta 2"),
        ("Grupo electrógeno", "Herramienta 3"),
    ],
}
# Perfil de flota de los vehículos demo. Sin esto la pantalla Flota de
# Patrimonio nace VACÍA: un vehículo "de flota" es un activo con
# `tipo_combustible` cargado, y los ítems de arriba no lo traen.
# Igual criterio que el resto del archivo: datos claramente demo (el dominio
# sigue siendo la numeración interna, no una patente inventada) y serie
# DETERMINÍSTICA, sin azar.
#   nombre -> (marca_modelo, año, combustible, km inicial,
#              km por tramo, litros por tramo, días entre cargas)
# El consumo que la pantalla calcula sale de km/litros por tramo:
# utilitaria ~11 l/100km, volcador ~26, 4x4 ~13.
FLOTA_DEMO = {
    "Camioneta utilitaria": ("Ford Ranger 2.2 TDI", 2019, "gasoil", 84300, 420, 48.0, 9),
    "Camión volcador":      ("Iveco Tector 170E22", 2016, "gasoil", 147800, 260, 68.0, 11),
    "Camioneta 4x4":        ("Toyota Hilux 4x4 2.8", 2022, "gasoil", 36500, 380, 50.0, 8),
}
# Oscilación fija por tramo (litros y km usan distinto corrimiento, así el
# consumo por carga varía como en la realidad pero la serie es reproducible).
FLOTA_VAIVEN = (1.0, 0.88, 1.10, 0.95, 1.06, 0.92, 1.12, 0.90, 1.04, 0.98)
# Precios de referencia DEMO del litro de gasoil (no son precios reales):
# las cargas viejas salen algo menos, así el gasto mensual no es una línea plana.
FLOTA_PRECIO_LITRO = 1350.0
FLOTA_PRECIO_LITRO_VIEJO = 1240.0

ITEMS_DEMO_CONSUMIBLES = {
    "Materiales": [
        ("Cemento Portland 50kg", 40, 10, "bolsas"),
        ("Arena", 15, 5, "m3"),
        ("Caño PVC 110mm", 60, 20, "u"),
        ("Tosca", 8, 3, "m3"),
    ],
    "Insumos": [
        ("Guantes de trabajo", 50, 12, "pares"),
        ("Pintura vial", 12, 4, "l"),
        ("Lámpara LED 150W", 25, 8, "u"),
    ],
}


# Los depósitos NO son datos demo: son estructura, igual que las categorías.
# Todo municipio arranca con los tres que tiene cualquiera, y de ahí los
# edita. Antes no existían y la pantalla de Configuración los prometía igual
# (dueño, 2026-08-31).
TEMPLATE_DEPOSITOS = [
    ("Depósito Central", "Depósito principal del municipio", 1),
    ("Corralón Municipal", "Vehículos, maquinaria y áridos", 2),
    ("Vivero", "Plantas, tierra y herramienta de parques", 3),
]

# Dónde vive cada familia por defecto. Sin esto los ítems demo nacerían sin
# ubicación, que es justo el agujero que vinimos a tapar.
DEPOSITO_POR_CATEGORIA = {
    "Vehículos": "Corralón Municipal",
    "Maquinaria": "Corralón Municipal",
    "Herramientas": "Depósito Central",
    "Materiales": "Corralón Municipal",
    "Insumos": "Depósito Central",
}


async def seed_depositos(db: AsyncSession, municipio_id: int) -> dict:
    """Siembra los depósitos template. Idempotente (match por nombre)."""
    existentes = {
        d.nombre: d for d in (await db.execute(
            select(InventarioDeposito).where(InventarioDeposito.municipio_id == municipio_id)
        )).scalars().all()
    }
    creados = 0
    for nombre, desc, orden in TEMPLATE_DEPOSITOS:
        if nombre in existentes:
            continue
        dep = InventarioDeposito(
            municipio_id=municipio_id, nombre=nombre, descripcion=desc,
            orden=orden, activo=True,
        )
        db.add(dep)
        existentes[nombre] = dep
        creados += 1
    await db.flush()
    return {"depositos": creados, "por_nombre": existentes}


async def seed_movimientos_demo(db: AsyncSession, municipio_id: int, deps: dict) -> dict:
    """Le da HISTORIA al depósito: 90 días de entradas, consumos y un conteo.

    Una demo sin historial no muestra nada — el libro vacío se ve igual que un
    módulo que no existe. La serie es DETERMINÍSTICA (se deriva del stock
    declarado de cada ítem, sin azar) y **termina en un ajuste por conteo
    físico**, así el saldo final coincide exacto con el stock del ítem: la
    historia explica el número, no lo contradice.

    Idempotente: si el municipio ya tiene movimientos, no hace nada.
    """
    ya = (await db.execute(
        select(func.count(InventarioMovimiento.id))
        .where(InventarioMovimiento.municipio_id == municipio_id)
    )).scalar() or 0
    if ya:
        return {"movimientos": 0}

    items = (await db.execute(
        select(InventarioItem).where(
            InventarioItem.municipio_id == municipio_id,
            InventarioItem.naturaleza == NaturalezaInventario.CONSUMIBLE,
            InventarioItem.activo == True,  # noqa: E712
        ).order_by(InventarioItem.id)
    )).scalars().all()
    if not items:
        return {"movimientos": 0}

    ahora = datetime.now()
    central = deps.get("Depósito Central")
    corralon = deps.get("Corralón Municipal")

    # La orden de compra que explica la reposición del mes pasado, ya recibida.
    oc_recibida = InventarioOrdenCompra(
        municipio_id=municipio_id,
        numero=f"OC-{ahora.year}-0001",
        proveedor="Corralón San Martín",
        estado=EstadoOrdenCompra.RECIBIDA,
        deposito_id=getattr(corralon, "id", None),
        fecha=(ahora - timedelta(days=28)).date(),
        fecha_esperada=(ahora - timedelta(days=20)).date(),
        notas="Reposición mensual de materiales.",
    )
    db.add(oc_recibida)
    await db.flush()

    creados = 0
    for idx, item in enumerate(items):
        objetivo = float(item.stock_actual or 0)
        # Los que hoy están en CERO también llevan historia: son los que
        # aparecen en "bajo el mínimo", y sin movimientos no se puede explicar
        # por qué se quedaron sin nada. La escala sale del mínimo.
        base = objetivo if objetivo > 0 else max(float(item.stock_minimo or 0), 5.0)
        # El stock del ítem lo va a fijar la historia: se arranca de cero.
        item.stock_actual = 0.0

        compra_inicial = round(base * 2, 2)
        consumo_1 = round(base * 0.55, 2)
        consumo_2 = round(base * 0.4, 2)
        reposicion = round(base * 0.35, 2)
        dep_id = getattr(corralon if idx % 2 == 0 else central, "id", None)

        await registrar_movimiento(
            db, item, TipoMovimientoInventario.ENTRADA, compra_inicial,
            deposito_id=dep_id, contraparte="Corralón San Martín",
            motivo="Carga inicial del depósito",
            fecha=ahora - timedelta(days=88),
        )
        await registrar_movimiento(
            db, item, TipoMovimientoInventario.CONSUMO_OT, consumo_1,
            deposito_id=dep_id, motivo="Consumido por órdenes de trabajo del mes",
            fecha=ahora - timedelta(days=61),
        )
        await registrar_movimiento(
            db, item, TipoMovimientoInventario.SALIDA, round(base * 0.1, 2),
            deposito_id=dep_id, contraparte="Cuadrilla de Obras",
            motivo="Entrega para trabajo en la vía pública",
            fecha=ahora - timedelta(days=44),
        )
        await registrar_movimiento(
            db, item, TipoMovimientoInventario.CONSUMO_OT, consumo_2,
            deposito_id=dep_id, motivo="Consumido por órdenes de trabajo del mes",
            fecha=ahora - timedelta(days=33),
        )
        await registrar_movimiento(
            db, item, TipoMovimientoInventario.ENTRADA, reposicion,
            deposito_id=dep_id, contraparte="Corralón San Martín",
            motivo=f"Recepción {oc_recibida.numero}",
            orden_compra_id=oc_recibida.id,
            fecha=ahora - timedelta(days=20),
        )
        # El conteo físico deja el saldo en el stock declarado del ítem.
        await registrar_movimiento(
            db, item, TipoMovimientoInventario.AJUSTE, objetivo,
            deposito_id=dep_id,
            motivo="Conteo físico de depósito" if objetivo > 0 else "Conteo físico: quedó sin stock",
            fecha=ahora - timedelta(days=6),
        )
        creados += 6
        item.deposito_id = item.deposito_id or dep_id

        # add directo y no `oc.lineas.append`: tocar la relacion de un objeto
        # ya persistido dispara un lazy load, y en async eso explota
        # (MissingGreenlet).
        db.add(InventarioOrdenCompraLinea(
            orden_compra_id=oc_recibida.id, item_id=item.id, item_nombre=item.nombre,
            cantidad=reposicion, cantidad_recibida=reposicion,
        ))

    # Y una que está esperando: sirve para ver el estado "enviada" y el
    # circuito de recepción sin tener que armar una a mano.
    bajo_minimo = [i for i in items if (i.stock_minimo or 0) > 0][:3]
    if bajo_minimo:
        oc_pendiente = InventarioOrdenCompra(
            municipio_id=municipio_id,
            numero=f"OC-{ahora.year}-0002",
            proveedor="Distribuidora del Centro",
            estado=EstadoOrdenCompra.ENVIADA,
            deposito_id=getattr(central, "id", None),
            fecha=(ahora - timedelta(days=4)).date(),
            fecha_esperada=(ahora + timedelta(days=6)).date(),
            notas="Reposición de lo que está cerca del mínimo.",
        )
        db.add(oc_pendiente)
        await db.flush()
        for i in bajo_minimo:
            db.add(InventarioOrdenCompraLinea(
                orden_compra_id=oc_pendiente.id, item_id=i.id, item_nombre=i.nombre,
                cantidad=round(float(i.stock_minimo or 1) * 2, 2), cantidad_recibida=0,
            ))

    await db.flush()
    return {"movimientos": creados, "ordenes_compra": 2}


async def seed_flota_demo(db: AsyncSession, municipio_id: int) -> dict:
    """Le da HISTORIA a la flota: ~90 días de cargas de combustible.

    Mismo principio que `seed_movimientos_demo`: una pantalla sin datos se ve
    igual que un módulo que no existe. Completa los datos de flota de los
    vehículos demo (marca, año, combustible, km) y les siembra la bitácora de
    cargas con la que la pantalla calcula consumo cada 100 km, litros y gasto
    del mes.

    Idempotente por dos vías: si el muni ya tiene cargas no hace nada, y los
    datos de flota sólo se completan donde están en NULL (lo editado a mano no
    se pisa). Sirve tanto para demos nuevas como para retro-llenar un muni que
    ya tenía los ítems sembrados sin perfil de flota.
    """
    ya = (await db.execute(
        select(func.count(FlotaCarga.id)).where(FlotaCarga.municipio_id == municipio_id)
    )).scalar() or 0
    if ya:
        return {"cargas_flota": 0}

    hoy = datetime.now().date()
    n_vaiven = len(FLOTA_VAIVEN)
    creadas = 0

    for v_idx, (nombre, perfil) in enumerate(sorted(FLOTA_DEMO.items())):
        marca_modelo, anio, combustible, km_inicial, km_tramo, litros_tramo, dias_tramo = perfil
        item = (await db.execute(
            select(InventarioItem).where(
                InventarioItem.municipio_id == municipio_id,
                InventarioItem.nombre == nombre,
                InventarioItem.activo == True,  # noqa: E712
            )
        )).scalars().first()
        if not item:
            continue

        # La carga más nueva es de HOY (la ronda matinal del corralón): el
        # KPI de litros/gasto del endpoint filtra por MES CALENDARIO, y con la
        # última carga "hace unos días" una demo generada el 1 o el 2 del mes
        # mostraría el mes vacío. La serie cubre ~90 días hacia atrás.
        n_cargas = 90 // dias_tramo + 1

        km = km_inicial
        for i in range(n_cargas):
            fecha = hoy - timedelta(days=(n_cargas - 1 - i) * dias_tramo)
            if i > 0:
                km += int(km_tramo * FLOTA_VAIVEN[(i + 3) % n_vaiven])
            litros = round(litros_tramo * FLOTA_VAIVEN[i % n_vaiven], 1)
            precio = FLOTA_PRECIO_LITRO if (hoy - fecha).days <= 45 else FLOTA_PRECIO_LITRO_VIEJO
            db.add(FlotaCarga(
                municipio_id=municipio_id, item_id=item.id,
                fecha=fecha, litros=litros, importe=round(litros * precio, 2), km=km,
                observaciones="Arranque del registro de flota" if i == 0 else None,
            ))
            creadas += 1

        # El perfil del vehículo, sólo donde falta.
        item.marca_modelo = item.marca_modelo or marca_modelo
        item.anio = item.anio or anio
        item.tipo_combustible = item.tipo_combustible or combustible
        item.km_actual = item.km_actual or km
        item.km_proximo_service = item.km_proximo_service or (km + 4000)
        # Un vehículo con la VTV cerca del vencimiento: la demo también tiene
        # que mostrar ese estado, no sólo el "todo en orden".
        item.vencimiento_vtv = item.vencimiento_vtv or (
            hoy + timedelta(days=12 if v_idx == 1 else 150 + 30 * v_idx))
        item.vencimiento_seguro = item.vencimiento_seguro or (hoy + timedelta(days=80 + 20 * v_idx))

    await db.flush()
    return {"cargas_flota": creadas}


async def seed_inventario(db: AsyncSession, municipio_id: int, incluir_demo: bool = True) -> dict:
    """Siembra categorías template (y opcionalmente ítems demo) para un muni.

    Idempotente: saltea lo que ya exista (match por nombre). Devuelve conteos.
    """
    # Los depositos van SIEMPRE, con demo o sin demo: son estructura.
    res_dep = await seed_depositos(db, municipio_id)
    deps = res_dep["por_nombre"]

    # --- Categorías template ---
    existentes = {
        c.nombre: c for c in (await db.execute(
            select(InventarioCategoria).where(InventarioCategoria.municipio_id == municipio_id)
        )).scalars().all()
    }
    cats_por_nombre = dict(existentes)
    cats_creadas = 0
    for nombre, icono, color, naturaleza, orden in TEMPLATE_CATEGORIAS:
        if nombre in cats_por_nombre:
            continue
        cat = InventarioCategoria(
            municipio_id=municipio_id, nombre=nombre, icono=icono, color=color,
            naturaleza=naturaleza, orden=orden, activo=True,
        )
        db.add(cat)
        cats_por_nombre[nombre] = cat
        cats_creadas += 1
    await db.flush()

    if not incluir_demo:
        return {"categorias": cats_creadas, "items": 0, "depositos": res_dep["depositos"]}

    # --- Ítems demo ---
    # scalars() sobre un SELECT de una sola columna devuelve los nombres (strings),
    # no objetos InventarioItem — se usan directo (antes hacía i.nombre => AttributeError).
    items_existentes = set(
        (await db.execute(
            select(InventarioItem.nombre).where(InventarioItem.municipio_id == municipio_id)
        )).scalars().all()
    )
    items_creados = 0

    for cat_nombre, items in ITEMS_DEMO_ACTIVOS.items():
        cat = cats_por_nombre.get(cat_nombre)
        if not cat:
            continue
        for nombre, identificador in items:
            if nombre in items_existentes:
                continue
            dep = deps.get(DEPOSITO_POR_CATEGORIA.get(cat_nombre, ""))
            db.add(InventarioItem(
                municipio_id=municipio_id, categoria_id=cat.id, nombre=nombre,
                naturaleza=NaturalezaInventario.ACTIVO, identificador=identificador,
                estado_activo=EstadoActivo.DISPONIBLE, activo=True,
                deposito_id=getattr(dep, "id", None),
            ))
            items_creados += 1

    for cat_nombre, items in ITEMS_DEMO_CONSUMIBLES.items():
        cat = cats_por_nombre.get(cat_nombre)
        if not cat:
            continue
        for nombre, stock, minimo, unidad in items:
            if nombre in items_existentes:
                continue
            dep = deps.get(DEPOSITO_POR_CATEGORIA.get(cat_nombre, ""))
            db.add(InventarioItem(
                municipio_id=municipio_id, categoria_id=cat.id, nombre=nombre,
                naturaleza=NaturalezaInventario.CONSUMIBLE,
                stock_actual=float(stock), stock_minimo=float(minimo), unidad=unidad,
                activo=True, deposito_id=getattr(dep, "id", None),
            ))
            items_creados += 1

    await db.flush()

    # La historia del deposito: sin 90 dias de movimientos, el libro arranca
    # vacio y la demo no muestra nada (regla de demos con historico).
    res_mov = await seed_movimientos_demo(db, municipio_id, deps)
    # Y la de la flota: mismo principio para la pantalla de vehículos.
    res_flota = await seed_flota_demo(db, municipio_id)
    return {
        "categorias": cats_creadas, "items": items_creados,
        "depositos": res_dep["depositos"], **res_mov, **res_flota,
    }


async def activar_modulo_patrimonio(db: AsyncSession, municipio_id: int) -> None:
    """Activa (o crea) el flag `patrimonio` en municipio_modulos.

    `patrimonio` es la fusión de los viejos `inventario` + `flota` (2026-09-02);
    los nombres viejos ya no existen en el catálogo ni en el sidebar."""
    from models.municipio_modulo import MunicipioModulo
    row = (await db.execute(
        select(MunicipioModulo).where(
            MunicipioModulo.municipio_id == municipio_id,
            MunicipioModulo.modulo == "patrimonio",
        )
    )).scalar_one_or_none()
    if row:
        row.activo = True
    else:
        db.add(MunicipioModulo(municipio_id=municipio_id, modulo="patrimonio", activo=True))
    await db.flush()
