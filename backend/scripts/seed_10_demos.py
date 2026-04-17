"""
Seed dinamico: 10 reclamos + 10 tramites por cada municipio demo activo.
Toma calles, barrios, categorias, etc. directo de la DB — no hardcodea Chacabuco.

Ejecutar: python -m scripts.seed_10_chacabuco
"""
import asyncio
import random
import sys
import os
from datetime import datetime, timedelta
from sqlalchemy import text

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import AsyncSessionLocal
from scripts.seed_masivo_chacabuco import (
    CATEGORIA_DATA,
    ESTADOS_RECLAMOS,
    ESTADO_PESOS_RECLAMOS,
    RESOLUCIONES_FINALIZADAS,
)

CANT_RECLAMOS_POR_MUNI = 10
CANT_TRAMITES_POR_MUNI = 10

# Calles tipicas de cualquier ciudad argentina (genericas)
CALLES_GENERICAS = [
    "San Martin", "Belgrano", "Mitre", "Sarmiento", "Rivadavia", "Alsina",
    "Moreno", "9 de Julio", "25 de Mayo", "Av. Libertad", "Av. Independencia",
    "Av. Hipolito Yrigoyen", "Brown", "Lavalle", "Av. Roca", "Pueyrredon",
    "Las Heras", "Estrada", "Pellegrini", "Urquiza",
]

# Catalogo de tramites coherentes por categoria
TRAMITES_CATALOGO = {
    "Catastro": [
        ("Certificado de Dominio", "Solicitud de certificado de titularidad de un inmueble en el municipio.", 7, 1500.0, "FileText"),
        ("Plano de Mensura", "Tramite de aprobacion de plano de mensura para subdivision o unificacion parcelaria.", 30, 8500.0, "Map"),
    ],
    "Cementerios": [
        ("Renovacion de Boveda", "Renovacion del derecho de uso de boveda familiar por 10 anos.", 5, 12000.0, "Building"),
    ],
    "Certificados y Documentacion": [
        ("Libre Deuda Municipal", "Constancia de no adeudar tasas y servicios municipales para tramites varios.", 3, 800.0, "ShieldCheck"),
        ("Certificado de Residencia", "Acreditacion de domicilio dentro del municipio para tramites administrativos.", 2, 500.0, "MapPin"),
    ],
    "Desarrollo Social": [
        ("Tarjeta Alimentar Municipal", "Inscripcion al programa de asistencia alimentaria para familias en situacion vulnerable.", 15, 0.0, "HandHeart"),
    ],
    "Espacios Publicos": [
        ("Permiso de Uso de Plaza", "Autorizacion para realizar evento publico en plaza o espacio verde municipal.", 10, 3000.0, "Trees"),
    ],
    "Habilitaciones Comerciales": [
        ("Habilitacion Comercial Inicial", "Tramite de apertura de comercio nuevo: gastronomia, indumentaria, servicios.", 21, 15000.0, "Store"),
        ("Renovacion de Habilitacion", "Renovacion anual de habilitacion comercial vigente.", 5, 5000.0, "RefreshCw"),
    ],
    "Obras Particulares": [
        ("Permiso de Construccion", "Autorizacion para construccion de vivienda o ampliacion mayor a 30m2.", 45, 25000.0, "Hammer"),
    ],
    "Salud y Bromatologia": [
        ("Carnet de Manipulacion de Alimentos", "Certificado obligatorio para personal de gastronomia y comercios alimenticios.", 7, 2500.0, "Apple"),
    ],
    "Tasas y Tributos": [
        ("Plan de Pago de Tasas", "Refinanciacion de deuda de Tasa de Servicios Generales en cuotas.", 3, 0.0, "Receipt"),
    ],
    "Transito y Transporte": [
        ("Renovacion Licencia de Conducir", "Renovacion de licencia de conducir clases B, C o D vigente.", 1, 4500.0, "Car"),
    ],
}


def normaliza(s: str) -> str:
    """Normaliza para matchear nombres con tildes/sin tildes."""
    return (s or "").lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")


async def seed_municipio(db, muni_id: int, muni_nombre: str):
    print(f"\n{'='*60}")
    print(f"  MUNICIPIO {muni_id}: {muni_nombre}")
    print(f"{'='*60}")

    # Categorias de reclamo del municipio
    r = await db.execute(text("""
        SELECT id, nombre FROM categorias_reclamo
        WHERE municipio_id = :mid AND activo = 1
    """), {"mid": muni_id})
    categorias = r.fetchall()
    if not categorias:
        print(f"  [SKIP] Sin categorias de reclamo")
        return 0, 0

    # Mapeo categoria -> dependencia
    r = await db.execute(text("""
        SELECT mdc.categoria_id, mdc.municipio_dependencia_id
        FROM municipio_dependencia_categorias mdc
        WHERE mdc.municipio_id = :mid AND mdc.activo = 1
    """), {"mid": muni_id})
    cat_to_dep = {row[0]: row[1] for row in r.fetchall()}

    # Vecinos del municipio
    r = await db.execute(text("""
        SELECT id FROM usuarios
        WHERE rol = 'vecino' AND municipio_id = :mid AND activo = 1
    """), {"mid": muni_id})
    vecinos = [row[0] for row in r.fetchall()]
    if not vecinos:
        print(f"  [SKIP] Sin vecinos")
        return 0, 0

    # Barrios del municipio (con coords)
    r = await db.execute(text("""
        SELECT nombre, latitud, longitud FROM barrios
        WHERE municipio_id = :mid AND latitud IS NOT NULL
    """), {"mid": muni_id})
    barrios = r.fetchall()
    if not barrios:
        print(f"  [SKIP] Sin barrios")
        return 0, 0

    # Categorias de tramite del municipio
    r = await db.execute(text("""
        SELECT id, nombre FROM categorias_tramite
        WHERE municipio_id = :mid AND activo = 1
    """), {"mid": muni_id})
    cat_tramite = [(row[0], row[1]) for row in r.fetchall()]

    print(f"  - {len(categorias)} categorias reclamo, {len(vecinos)} vecinos, {len(barrios)} barrios, {len(cat_tramite)} cats tramite")

    # =================== 10 RECLAMOS ===================
    reclamos_creados = 0
    for i in range(CANT_RECLAMOS_POR_MUNI):
        cat_id, cat_nombre = random.choice(categorias)

        # Buscar data coherente por nombre de categoria
        cat_data = None
        for key, val in CATEGORIA_DATA.items():
            if normaliza(key) in normaliza(cat_nombre) or normaliza(cat_nombre) in normaliza(key):
                cat_data = val
                break
        if not cat_data:
            cat_data = CATEGORIA_DATA.get("Otros Reclamos") or list(CATEGORIA_DATA.values())[0]

        titulo = random.choice(cat_data["titulos"])
        descripcion = random.choice(cat_data["descripciones"])

        barrio_nombre, barrio_lat, barrio_lon = random.choice(barrios)
        calle = random.choice(CALLES_GENERICAS)
        numero = random.randint(100, 3500)
        direccion = f"{calle} {numero}, {barrio_nombre}, {muni_nombre}"
        latitud = float(barrio_lat) + random.uniform(-0.005, 0.005)
        longitud = float(barrio_lon) + random.uniform(-0.005, 0.005)

        estado = random.choices(ESTADOS_RECLAMOS, weights=ESTADO_PESOS_RECLAMOS)[0]
        prioridad = random.randint(1, 5)
        created_at = datetime.now() - timedelta(days=random.randint(0, 30), hours=random.randint(0, 23))
        fecha_recibido = (created_at + timedelta(hours=random.randint(1, 72))) if estado in ['en_curso', 'finalizado', 'pospuesto', 'rechazado'] else None
        fecha_resolucion = (fecha_recibido + timedelta(days=random.randint(1, 14))) if estado == 'finalizado' and fecha_recibido else None
        resolucion = random.choice(RESOLUCIONES_FINALIZADAS) if estado == 'finalizado' else None

        await db.execute(text("""
            INSERT INTO reclamos (
                municipio_id, titulo, descripcion, direccion,
                latitud, longitud, estado, prioridad,
                categoria_id, creador_id, municipio_dependencia_id,
                fecha_recibido, fecha_resolucion, resolucion,
                created_at, updated_at
            ) VALUES (
                :mid, :titulo, :descripcion, :direccion,
                :lat, :lon, :estado, :prioridad,
                :cat_id, :creador_id, :muni_dep_id,
                :fecha_recibido, :fecha_resolucion, :resolucion,
                :created_at, :created_at
            )
        """), {
            "mid": muni_id,
            "titulo": titulo[:200],
            "descripcion": descripcion,
            "direccion": direccion,
            "lat": latitud,
            "lon": longitud,
            "estado": estado,
            "prioridad": prioridad,
            "cat_id": cat_id,
            "creador_id": random.choice(vecinos),
            "muni_dep_id": cat_to_dep.get(cat_id),
            "fecha_recibido": fecha_recibido,
            "fecha_resolucion": fecha_resolucion,
            "resolucion": resolucion,
            "created_at": created_at,
        })
        reclamos_creados += 1

    print(f"  - {reclamos_creados} reclamos creados")

    # =================== 10 TRAMITES ===================
    tramites_creados = 0
    if not cat_tramite:
        print(f"  - 0 tramites (sin categorias de tramite)")
        return reclamos_creados, 0

    # Armar candidatos: tramites del catalogo cuya categoria existe en este municipio
    candidatos = []
    for cat_nombre_catalogo, lista in TRAMITES_CATALOGO.items():
        cat_id = None
        for cid, cnombre in cat_tramite:
            if normaliza(cat_nombre_catalogo) in normaliza(cnombre) or normaliza(cnombre) in normaliza(cat_nombre_catalogo):
                cat_id = cid
                break
        if cat_id:
            for tdata in lista:
                candidatos.append((cat_id, cat_nombre_catalogo, *tdata))

    if not candidatos:
        print(f"  - 0 tramites (sin coincidencia con catalogo)")
        return reclamos_creados, 0

    # Cargar nombres existentes una sola vez para detectar solapamiento conceptual
    r_existentes = await db.execute(text("""
        SELECT nombre FROM tramites WHERE municipio_id = :mid
    """), {"mid": muni_id})
    existentes_norm = [normaliza(row[0]) for row in r_existentes.fetchall()]

    def ya_existe_conceptualmente(nombre: str) -> bool:
        """True si hay un tramite con nombre que solapa conceptualmente.
        Evita duplicar 'Renovacion Licencia de Conducir' cuando ya existe
        'Licencia de conducir - Primera vez' del seed_demo base."""
        n = normaliza(nombre)
        palabras_clave = [w for w in n.split() if len(w) > 4][:3]
        if not palabras_clave:
            palabras_clave = n.split()[:2]
        for ex in existentes_norm:
            comunes = sum(1 for w in palabras_clave if w in ex)
            if comunes >= 2:
                return True
            if n in ex or ex in n:
                return True
        return False

    seleccionados = random.sample(candidatos, min(CANT_TRAMITES_POR_MUNI, len(candidatos)))
    for cat_id, cat_nombre, nombre, descripcion, dias, costo, icono in seleccionados:
        if ya_existe_conceptualmente(nombre):
            continue

        await db.execute(text("""
            INSERT INTO tramites (
                municipio_id, categoria_tramite_id, nombre, descripcion,
                icono, requiere_validacion_dni, requiere_validacion_facial,
                tiempo_estimado_dias, costo, activo, orden, created_at, updated_at
            ) VALUES (
                :mid, :cat_id, :nombre, :descripcion,
                :icono, 0, 0,
                :dias, :costo, 1, :orden, NOW(), NOW()
            )
        """), {
            "mid": muni_id,
            "cat_id": cat_id,
            "nombre": nombre,
            "descripcion": descripcion,
            "icono": icono,
            "dias": dias,
            "costo": costo,
            "orden": tramites_creados + 1,
        })
        tramites_creados += 1

    print(f"  - {tramites_creados} tramites creados en catalogo")
    return reclamos_creados, tramites_creados


async def seed():
    async with AsyncSessionLocal() as db:
        print("=== SEED DINAMICO 10+10 PARA TODAS LAS DEMOS ===")

        # Todos los municipios activos
        r = await db.execute(text("SELECT id, nombre FROM municipios WHERE activo = 1 ORDER BY id"))
        municipios = r.fetchall()
        print(f"\n{len(municipios)} municipios activos detectados\n")

        total_rec = 0
        total_tra = 0
        for muni_id, muni_nombre in municipios:
            rec, tra = await seed_municipio(db, muni_id, muni_nombre)
            total_rec += rec
            total_tra += tra
            await db.commit()

        print(f"\n{'='*60}")
        print(f"  TOTAL: {total_rec} reclamos + {total_tra} tramites en {len(municipios)} municipios")
        print(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(seed())
