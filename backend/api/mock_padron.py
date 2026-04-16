"""Mock endpoint que simula el padron que expondria un sistema tributario.

Cuando un muni real nos de su API, la URL la pega el admin en Settings y
Munify fetchea ese JSON. Mientras tanto, esta URL (/mock/padron-ejemplo)
sirve para demos: devuelve un padron realista con 4 tipos de tasa,
20+ partidas, 50+ deudas.

El formato JSON es el que proponemos como estandar — cualquier muni (con
GEMA, RAFAM, Municipium, in-house) puede adaptar su export para matchear
este schema.
"""
from datetime import date, timedelta
from fastapi import APIRouter
import hashlib

router = APIRouter(prefix="/mock", tags=["Mock"])


# Nombres de ejemplo (locales, como los usan algunos munis de PBA)
TASAS_EJEMPLO = [
    {
        "codigo_local": "TSUM-01",
        "nombre_local": "Tasa por Servicios Urbanos Municipales",
        "descripcion_local": "Alumbrado público, barrido y limpieza de calles. Servicios urbanos generales.",
        "frecuencia": "bimestral",
    },
    {
        "codigo_local": "INSP-COM",
        "nombre_local": "Derecho de Inspección Comercial",
        "descripcion_local": "Inspección y contralor de comercios habilitados.",
        "frecuencia": "mensual",
    },
    {
        "codigo_local": "PAT-AUT",
        "nombre_local": "Impuesto a los Automotores",
        "descripcion_local": "Patente de vehículos empadronados en el partido.",
        "frecuencia": "cuatrimestral",
    },
    {
        "codigo_local": "CEM-ANUAL",
        "nombre_local": "Cementerio Municipal - Canon anual",
        "descripcion_local": "Mantenimiento y ocupación de sepulturas y nichos.",
        "frecuencia": "anual",
    },
    {
        "codigo_local": "OCUP-VP",
        "nombre_local": "Ocupación del Espacio Público",
        "descripcion_local": "Mesas y sillas en vereda, kioscos, obradores.",
        "frecuencia": "mensual",
    },
]

NOMBRES = ["Juan", "María", "Carlos", "Ana", "Pedro", "Laura", "Diego", "Sofía", "Pablo", "Lucía"]
APELLIDOS = ["González", "Rodríguez", "López", "Martínez", "García", "Pérez", "Fernández", "Sánchez"]
CALLES = ["Av. San Martín", "Belgrano", "Mitre", "Rivadavia", "Sarmiento", "9 de Julio", "25 de Mayo", "Independencia"]


def _generar_partidas(codigo_tasa: str, seed_base: int, cantidad: int):
    """Genera partidas con datos realistas deterministicos por seed."""
    partidas = []
    hoy = date.today()
    for i in range(cantidad):
        h = int(hashlib.sha1(f"{codigo_tasa}-{seed_base}-{i}".encode()).hexdigest(), 16)
        dni = 25_000_000 + (h % 23_000_000)
        nombre = NOMBRES[(h >> 3) % len(NOMBRES)]
        apellido = APELLIDOS[(h >> 7) % len(APELLIDOS)]

        objeto = {}
        if codigo_tasa == "TSUM-01":
            calle = CALLES[(h >> 11) % len(CALLES)]
            altura = 100 + ((h >> 13) % 4900)
            objeto = {
                "direccion": f"{calle} {altura}",
                "superficie_m2": 60 + ((h >> 17) % 200),
                "zona": "A" if i % 3 == 0 else "B" if i % 3 == 1 else "C",
            }
            identificador = f"ABL-{(h >> 5) % 900000 + 100000}/{(h % 9) + 1}"
        elif codigo_tasa == "INSP-COM":
            rubros = ["Gastronomia", "Almacen", "Farmacia", "Ropa", "Ferreteria"]
            objeto = {
                "razon_social": f"{apellido} {rubros[h % len(rubros)]} SRL",
                "rubro": rubros[h % len(rubros)],
                "cuit": f"30-{dni}-{h % 10}",
                "superficie_m2": 40 + ((h >> 19) % 200),
            }
            identificador = f"COM-{h % 90000 + 10000}"
        elif codigo_tasa == "PAT-AUT":
            marcas = [("Fiat", "Cronos"), ("VW", "Gol"), ("Toyota", "Corolla"), ("Ford", "Ka")]
            marca, modelo = marcas[h % len(marcas)]
            anio = 2018 + ((h >> 19) % 7)
            letras1 = ["AB", "AC", "AD", "AE"][(h >> 21) % 4]
            letras2 = ["CD", "DF", "GH"][(h >> 23) % 3]
            dominio = f"{letras1}{((h >> 25) % 900) + 100}{letras2}"
            objeto = {"dominio": dominio, "marca": marca, "modelo": modelo, "anio": anio}
            identificador = dominio
        elif codigo_tasa == "CEM-ANUAL":
            objeto = {"tipo_sepultura": "Nicho" if i % 2 == 0 else "Parcela",
                      "seccion": chr(65 + (i % 8)),
                      "numero": (h >> 13) % 500 + 1}
            identificador = f"CEM-S{chr(65 + (i % 8))}-{objeto['numero']}"
        else:  # OCUP-VP
            objeto = {"tipo_ocupacion": "Mesas en vereda" if i % 2 == 0 else "Kiosco",
                      "ubicacion": f"{CALLES[i % len(CALLES)]} {(h >> 13) % 2000 + 100}"}
            identificador = f"OCP-{h % 90000 + 10000}"

        # Generar 2-3 deudas (pagada anterior, pendiente actual, vencida anterior)
        importe_base = [15000, 8000, 35000, 25000, 12000][(h >> 29) % 5]

        deudas = []
        # Pagada (bimestre anterior) para algunos
        if i % 3 != 0:
            deudas.append({
                "periodo": f"{hoy.year}-{str(max(1, hoy.month - 3)).zfill(2)}",
                "importe": importe_base,
                "fecha_emision": (hoy - timedelta(days=90)).isoformat(),
                "fecha_vencimiento": (hoy - timedelta(days=60)).isoformat(),
                "estado": "pagada",
            })
        # Vencida
        if i % 4 == 0:
            deudas.append({
                "periodo": f"{hoy.year}-{str(max(1, hoy.month - 1)).zfill(2)}",
                "importe": int(importe_base * 1.15),  # con recargo
                "fecha_emision": (hoy - timedelta(days=45)).isoformat(),
                "fecha_vencimiento": (hoy - timedelta(days=15)).isoformat(),
                "estado": "vencida",
            })
        # Pendiente actual (siempre)
        deudas.append({
            "periodo": f"{hoy.year}-{str(hoy.month).zfill(2)}",
            "importe": importe_base,
            "fecha_emision": (hoy - timedelta(days=5)).isoformat(),
            "fecha_vencimiento": (hoy + timedelta(days=15)).isoformat(),
            "estado": "pendiente",
        })

        partidas.append({
            "identificador": identificador,
            "titular_dni": str(dni),
            "titular_nombre": f"{nombre} {apellido}",
            "objeto": objeto,
            "deudas": deudas,
        })

    return partidas


@router.get("/padron-ejemplo/{codigo_muni}")
async def padron_ejemplo(codigo_muni: str):
    """Simula la API de un sistema tributario exponiendo el padron."""
    seed = int(hashlib.sha1(codigo_muni.encode()).hexdigest()[:8], 16)
    tasas = []
    for i, tasa in enumerate(TASAS_EJEMPLO):
        cantidades = [30, 12, 18, 8, 5]  # partidas por tipo
        cant = cantidades[i] if i < len(cantidades) else 10
        tasas.append({
            **tasa,
            "partidas": _generar_partidas(tasa["codigo_local"], seed + i, cant),
        })

    return {
        "municipio": codigo_muni,
        "sistema_origen": "Sistema Tributario Municipal v2.4",
        "exported_at": date.today().isoformat(),
        "version_schema": "1.0",
        "tasas": tasas,
    }
