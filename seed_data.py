"""
Script de seed para poblar la base de datos con datos de prueba.
Ejecutar: python seed_data.py
"""
import asyncio
import random
from datetime import datetime, timedelta
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, text

from core.database import AsyncSessionLocal, engine, Base
from models.municipio import Municipio
from models.user import User
from models.zona import Zona
from models.categoria import Categoria
from models.cuadrilla import Cuadrilla
from models.reclamo import Reclamo
from models.historial import HistorialReclamo
from models.calificacion import Calificacion
from models.enums import RolUsuario, EstadoReclamo

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Datos de municipios reales de Argentina (Buenos Aires y alrededores)
MUNICIPIOS_DATA = [
    {
        "nombre": "Merlo",
        "codigo": "merlo",
        "descripcion": "Municipio de Merlo, zona oeste del Gran Buenos Aires",
        "latitud": -34.6637,
        "longitud": -58.7276,
        "radio_km": 15.0,
        "color_primario": "#0EA5E9",
        "color_secundario": "#0284C7",
        "direccion": "Av. San Martín 2899, Merlo",
        "telefono": "0800-555-6375",
        "email": "contacto@merlo.gob.ar",
        "sitio_web": "https://www.merlo.gob.ar"
    },
    {
        "nombre": "San Isidro",
        "codigo": "san-isidro",
        "descripcion": "Municipio de San Isidro, zona norte del Gran Buenos Aires",
        "latitud": -34.4708,
        "longitud": -58.5299,
        "radio_km": 12.0,
        "color_primario": "#2563EB",
        "color_secundario": "#1E40AF",
        "direccion": "Av. Centenario 77, San Isidro",
        "telefono": "0800-333-7474",
        "email": "contacto@sanisidro.gob.ar",
        "sitio_web": "https://www.sanisidro.gob.ar"
    },
    {
        "nombre": "Vicente López",
        "codigo": "vicente-lopez",
        "descripcion": "Municipio de Vicente López, zona norte del Gran Buenos Aires",
        "latitud": -34.5253,
        "longitud": -58.4719,
        "radio_km": 8.0,
        "color_primario": "#059669",
        "color_secundario": "#047857",
        "direccion": "Av. Maipú 2609, Olivos",
        "telefono": "0800-222-8585",
        "email": "vecinos@vicentelopez.gov.ar",
        "sitio_web": "https://www.vicentelopez.gov.ar"
    },
    {
        "nombre": "Tigre",
        "codigo": "tigre",
        "descripcion": "Municipio de Tigre, zona norte del Gran Buenos Aires con delta del Paraná",
        "latitud": -34.4260,
        "longitud": -58.5797,
        "radio_km": 20.0,
        "color_primario": "#DC2626",
        "color_secundario": "#B91C1C",
        "direccion": "Av. Cazón 1514, Tigre",
        "telefono": "0800-888-8447",
        "email": "info@tigre.gov.ar",
        "sitio_web": "https://www.tigre.gov.ar"
    },
    {
        "nombre": "La Plata",
        "codigo": "la-plata",
        "descripcion": "Capital de la Provincia de Buenos Aires",
        "latitud": -34.9205,
        "longitud": -57.9536,
        "radio_km": 15.0,
        "color_primario": "#7C3AED",
        "color_secundario": "#6D28D9",
        "direccion": "Calle 12 e/ 51 y 53, La Plata",
        "telefono": "0800-222-5252",
        "email": "contacto@laplata.gob.ar",
        "sitio_web": "https://www.laplata.gob.ar"
    },
    {
        "nombre": "Quilmes",
        "codigo": "quilmes",
        "descripcion": "Municipio de Quilmes, zona sur del Gran Buenos Aires",
        "latitud": -34.7203,
        "longitud": -58.2545,
        "radio_km": 12.0,
        "color_primario": "#EA580C",
        "color_secundario": "#C2410C",
        "direccion": "Av. Rivadavia 345, Quilmes",
        "telefono": "0800-444-7845",
        "email": "vecinos@quilmes.gov.ar",
        "sitio_web": "https://www.quilmes.gov.ar"
    },
]

# Coordenadas base de Buenos Aires (zona centro)
BASE_LAT = -34.6037
BASE_LNG = -58.3816

# Variación para dispersar puntos en diferentes barrios
def random_coords(zona_offset: tuple = (0, 0)):
    """Genera coordenadas aleatorias dentro de un rango realista"""
    lat_offset, lng_offset = zona_offset
    return (
        BASE_LAT + lat_offset + random.uniform(-0.02, 0.02),
        BASE_LNG + lng_offset + random.uniform(-0.02, 0.02)
    )

# Zonas genéricas (para municipios sin datos específicos)
ZONAS_GENERICAS = [
    {"nombre": "Centro", "codigo": "Z-CTR", "descripcion": "Zona céntrica", "offset": (0, 0)},
    {"nombre": "Norte", "codigo": "Z-NOR", "descripcion": "Zona norte", "offset": (0.03, 0.01)},
    {"nombre": "Sur", "codigo": "Z-SUR", "descripcion": "Zona sur", "offset": (-0.03, -0.01)},
    {"nombre": "Este", "codigo": "Z-EST", "descripcion": "Zona este", "offset": (0.01, 0.03)},
    {"nombre": "Oeste", "codigo": "Z-OES", "descripcion": "Zona oeste", "offset": (-0.01, -0.03)},
]

# Zonas específicas por municipio (localidades reales)
ZONAS_POR_MUNICIPIO = {
    "merlo": [
        {"nombre": "Merlo Centro", "codigo": "MRL-CTR", "descripcion": "Cabecera del partido, zona comercial", "lat": -34.6637, "lng": -58.7276},
        {"nombre": "San Antonio de Padua", "codigo": "MRL-PAD", "descripcion": "Localidad residencial al norte", "lat": -34.6592, "lng": -58.7001},
        {"nombre": "Parque San Martín", "codigo": "MRL-PSM", "descripcion": "Zona residencial y comercial", "lat": -34.6756, "lng": -58.7089},
        {"nombre": "Libertad", "codigo": "MRL-LIB", "descripcion": "Localidad al este del partido", "lat": -34.6789, "lng": -58.6856},
        {"nombre": "Mariano Acosta", "codigo": "MRL-MAC", "descripcion": "Zona sur del partido", "lat": -34.6901, "lng": -58.7234},
        {"nombre": "Pontevedra", "codigo": "MRL-PON", "descripcion": "Localidad al oeste, zona industrial", "lat": -34.6845, "lng": -58.7598},
    ],
    "san-isidro": [
        {"nombre": "San Isidro Centro", "codigo": "SI-CTR", "descripcion": "Centro histórico y comercial", "lat": -34.4708, "lng": -58.5299},
        {"nombre": "Martínez", "codigo": "SI-MAR", "descripcion": "Zona residencial alta", "lat": -34.4923, "lng": -58.5067},
        {"nombre": "Boulogne", "codigo": "SI-BOU", "descripcion": "Zona mixta residencial", "lat": -34.5028, "lng": -58.5612},
        {"nombre": "Villa Adelina", "codigo": "SI-VAD", "descripcion": "Barrio residencial", "lat": -34.5189, "lng": -58.5456},
        {"nombre": "Beccar", "codigo": "SI-BEC", "descripcion": "Zona residencial cercana al río", "lat": -34.4612, "lng": -58.5489},
    ],
    "vicente-lopez": [
        {"nombre": "Olivos", "codigo": "VL-OLI", "descripcion": "Sede del gobierno municipal", "lat": -34.5123, "lng": -58.4923},
        {"nombre": "Florida", "codigo": "VL-FLO", "descripcion": "Zona residencial y comercial", "lat": -34.5289, "lng": -58.4856},
        {"nombre": "Munro", "codigo": "VL-MUN", "descripcion": "Barrio residencial", "lat": -34.5312, "lng": -58.5134},
        {"nombre": "La Lucila", "codigo": "VL-LUC", "descripcion": "Zona costera residencial", "lat": -34.4989, "lng": -58.4801},
        {"nombre": "Vicente López Centro", "codigo": "VL-CTR", "descripcion": "Centro comercial y administrativo", "lat": -34.5253, "lng": -58.4719},
    ],
    "tigre": [
        {"nombre": "Tigre Centro", "codigo": "TIG-CTR", "descripcion": "Centro histórico y puerto", "lat": -34.4260, "lng": -58.5797},
        {"nombre": "Don Torcuato", "codigo": "TIG-DT", "descripcion": "Zona residencial", "lat": -34.4867, "lng": -58.6178},
        {"nombre": "General Pacheco", "codigo": "TIG-GP", "descripcion": "Zona industrial y residencial", "lat": -34.4612, "lng": -58.6456},
        {"nombre": "El Talar", "codigo": "TIG-TAL", "descripcion": "Barrio residencial", "lat": -34.4534, "lng": -58.6234},
        {"nombre": "Nordelta", "codigo": "TIG-NOR", "descripcion": "Ciudad privada y country", "lat": -34.4078, "lng": -58.6512},
    ],
    "la-plata": [
        {"nombre": "La Plata Centro", "codigo": "LP-CTR", "descripcion": "Casco urbano fundacional", "lat": -34.9205, "lng": -57.9536},
        {"nombre": "City Bell", "codigo": "LP-CB", "descripcion": "Zona residencial al norte", "lat": -34.8612, "lng": -58.0456},
        {"nombre": "Gonnet", "codigo": "LP-GON", "descripcion": "Barrio residencial", "lat": -34.8823, "lng": -58.0178},
        {"nombre": "Los Hornos", "codigo": "LP-LH", "descripcion": "Zona sur de la ciudad", "lat": -34.9567, "lng": -57.9623},
        {"nombre": "Tolosa", "codigo": "LP-TOL", "descripcion": "Barrio cercano a la estación", "lat": -34.9023, "lng": -57.9678},
    ],
    "quilmes": [
        {"nombre": "Quilmes Centro", "codigo": "QUI-CTR", "descripcion": "Centro comercial y administrativo", "lat": -34.7203, "lng": -58.2545},
        {"nombre": "Bernal", "codigo": "QUI-BER", "descripcion": "Localidad al norte, zona universitaria", "lat": -34.7067, "lng": -58.2789},
        {"nombre": "Don Bosco", "codigo": "QUI-DB", "descripcion": "Zona residencial", "lat": -34.7312, "lng": -58.2401},
        {"nombre": "Ezpeleta", "codigo": "QUI-EZP", "descripcion": "Zona sur del partido", "lat": -34.7523, "lng": -58.2312},
        {"nombre": "San Francisco Solano", "codigo": "QUI-SFS", "descripcion": "Localidad al oeste", "lat": -34.7678, "lng": -58.3089},
    ],
}

CATEGORIAS_DATA = [
    {"nombre": "Alumbrado Público", "icono": "Lightbulb", "color": "#f59e0b", "tiempo": 24, "prioridad": 2},
    {"nombre": "Baches y Calles", "icono": "Construction", "color": "#6b7280", "tiempo": 72, "prioridad": 3},
    {"nombre": "Basura y Limpieza", "icono": "Trash2", "color": "#22c55e", "tiempo": 12, "prioridad": 2},
    {"nombre": "Arbolado", "icono": "TreePine", "color": "#16a34a", "tiempo": 168, "prioridad": 4},
    {"nombre": "Agua y Cloacas", "icono": "Droplets", "color": "#3b82f6", "tiempo": 6, "prioridad": 1},
    {"nombre": "Señalización", "icono": "SignpostBig", "color": "#8b5cf6", "tiempo": 48, "prioridad": 3},
    {"nombre": "Espacios Verdes", "icono": "Flower2", "color": "#84cc16", "tiempo": 96, "prioridad": 4},
    {"nombre": "Veredas", "icono": "Footprints", "color": "#64748b", "tiempo": 120, "prioridad": 3},
]

CUADRILLAS_DATA = [
    {"nombre": "Equipo Alumbrado", "especialidad": "Electricidad"},
    {"nombre": "Equipo Vial", "especialidad": "Baches"},
    {"nombre": "Equipo Limpieza", "especialidad": "Residuos"},
    {"nombre": "Equipo Verde", "especialidad": "Arbolado"},
    {"nombre": "Equipo Hidráulico", "especialidad": "Agua"},
]

# Nombres característicos de usuarios por municipio
# Cada municipio tiene sus propios funcionarios con nombres únicos
# El admin es genérico (rol de sistema), los demás tienen nombres de personas
USUARIOS_POR_MUNICIPIO = {
    "merlo": {
        "admin": ("Admin", "Sistema"),
        "supervisor": ("Graciela", "Fernández"),
        "empleado": ("Carlos", "Gómez"),
        "vecino": ("Marta", "Rodríguez"),
        "vecinos_extra": [
            ("Jorge", "Pérez"), ("Silvia", "Luna"), ("Raúl", "Castro"),
            ("Norma", "Vega"), ("Hugo", "Ríos"), ("Estela", "Morales"),
            ("Ramón", "Acosta"), ("Delia", "Benítez"), ("Oscar", "Romero")
        ]
    },
    "san-isidro": {
        "admin": ("Admin", "Sistema"),
        "supervisor": ("Carolina", "Thompson"),
        "empleado": ("Federico", "Williams"),
        "vecino": ("Victoria", "Spencer"),
        "vecinos_extra": [
            ("Agustín", "Murray"), ("Florencia", "Crawford"), ("Sebastián", "Bennett"),
            ("Camila", "Harrison"), ("Tomás", "Mitchell"), ("Luciana", "Foster"),
            ("Nicolás", "Sullivan"), ("Valentina", "Ross"), ("Matías", "Graham")
        ]
    },
    "vicente-lopez": {
        "admin": ("Admin", "Sistema"),
        "supervisor": ("Patricia", "Mendoza"),
        "empleado": ("Andrés", "Rivero"),
        "vecino": ("Claudia", "Aguirre"),
        "vecinos_extra": [
            ("Marcelo", "Quiroga"), ("Gabriela", "Navarro"), ("Diego", "Peralta"),
            ("Mariana", "Soria"), ("Facundo", "Medina"), ("Laura", "Campos"),
            ("Gonzalo", "Vera"), ("Natalia", "Herrera"), ("Ignacio", "Paz")
        ]
    },
    "tigre": {
        "admin": ("Admin", "Sistema"),
        "supervisor": ("Mónica", "Insúa"),
        "empleado": ("Sergio", "Bianchi"),
        "vecino": ("Elena", "Rossi"),
        "vecinos_extra": [
            ("Fabián", "Colombo"), ("Sandra", "Russo"), ("Alejandro", "Ferraro"),
            ("Verónica", "Lombardi"), ("Pablo", "Marino"), ("Adriana", "Conti"),
            ("Ricardo", "Greco"), ("Silvana", "Rizzo"), ("Damián", "Bruno")
        ]
    },
    "la-plata": {
        "admin": ("Admin", "Sistema"),
        "supervisor": ("Beatriz", "Echeverría"),
        "empleado": ("Leandro", "Ibáñez"),
        "vecino": ("Rosa", "Domínguez"),
        "vecinos_extra": [
            ("Hernán", "Bustos"), ("Cecilia", "Godoy"), ("Mauricio", "Leiva"),
            ("Soledad", "Molina"), ("Cristian", "Ojeda"), ("Lorena", "Ramos"),
            ("Ezequiel", "Sosa"), ("Mariela", "Torres"), ("Julián", "Vargas")
        ]
    },
    "quilmes": {
        "admin": ("Admin", "Sistema"),
        "supervisor": ("Alicia", "Giménez"),
        "empleado": ("Walter", "Figueroa"),
        "vecino": ("Carmen", "Álvarez"),
        "vecinos_extra": [
            ("Néstor", "Cabrera"), ("Teresa", "Díaz"), ("Rubén", "Flores"),
            ("Gloria", "Gutiérrez"), ("Alfredo", "Juárez"), ("Mirta", "López"),
            ("Héctor", "Martínez"), ("Irene", "Núñez"), ("Víctor", "Ortiz")
        ]
    },
}

# Títulos de reclamos por categoría
RECLAMOS_TITULOS = {
    "Alumbrado Público": [
        "Luminaria apagada en esquina",
        "Poste de luz caído",
        "Farola intermitente",
        "Sin luz en toda la cuadra",
        "Cable colgando de poste",
    ],
    "Baches y Calles": [
        "Bache profundo peligroso",
        "Hundimiento en la calle",
        "Cordón cuneta roto",
        "Calle inundada por lluvia",
        "Pavimento agrietado",
    ],
    "Basura y Limpieza": [
        "Basura acumulada en esquina",
        "Contenedor desbordado",
        "Residuos voluminosos abandonados",
        "Escombros en vereda",
        "Basural clandestino",
    ],
    "Arbolado": [
        "Árbol caído obstruye calle",
        "Rama peligrosa por caer",
        "Árbol seco para remover",
        "Raíces levantando vereda",
        "Poda necesaria urgente",
    ],
    "Agua y Cloacas": [
        "Pérdida de agua en calle",
        "Boca de tormenta tapada",
        "Desborde cloacal",
        "Falta de agua en zona",
        "Cloaca emanando olores",
    ],
    "Señalización": [
        "Semáforo no funciona",
        "Cartel de pare caído",
        "Señal de tránsito dañada",
        "Demarcación borrosa",
        "Falta señalización escuela",
    ],
    "Espacios Verdes": [
        "Plaza descuidada",
        "Juegos infantiles rotos",
        "Banco de plaza dañado",
        "Césped muy crecido",
        "Bebedero roto",
    ],
    "Veredas": [
        "Baldosa floja peligrosa",
        "Vereda hundida",
        "Rampa para discapacitados rota",
        "Vereda invadida por raíces",
        "Losa levantada",
    ],
}

DIRECCIONES = [
    "Av. Corrientes", "Av. Santa Fe", "Av. Rivadavia", "Av. Independencia",
    "Calle Florida", "Av. de Mayo", "Av. Callao", "Av. Belgrano",
    "Calle Lavalle", "Av. 9 de Julio", "Calle Tucumán", "Calle Sarmiento",
    "Av. Córdoba", "Calle Viamonte", "Av. Las Heras", "Calle Arenales"
]


async def clear_data(session: AsyncSession):
    """Elimina datos existentes"""
    print("Limpiando datos existentes...")
    # Desactivar FK checks temporalmente
    await session.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
    await session.execute(delete(Calificacion))
    await session.execute(delete(HistorialReclamo))
    await session.execute(delete(Reclamo))
    await session.execute(delete(User).where(User.email != "admin@test.com"))
    await session.execute(text("DELETE FROM cuadrilla_categorias"))
    await session.execute(delete(Cuadrilla))
    await session.execute(delete(Zona))
    await session.execute(delete(Categoria))
    await session.execute(delete(Municipio))
    await session.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
    await session.commit()


async def seed_municipios(session: AsyncSession) -> dict:
    """Crea municipios y devuelve dict {codigo: id}"""
    print("[+] Creando municipios...")
    municipios_map = {}

    for m in MUNICIPIOS_DATA:
        municipio = Municipio(
            nombre=m["nombre"],
            codigo=m["codigo"],
            descripcion=m["descripcion"],
            latitud=m["latitud"],
            longitud=m["longitud"],
            radio_km=m["radio_km"],
            color_primario=m["color_primario"],
            color_secundario=m["color_secundario"],
            direccion=m["direccion"],
            telefono=m["telefono"],
            email=m["email"],
            sitio_web=m["sitio_web"],
            activo=True
        )
        session.add(municipio)
        await session.flush()
        municipios_map[m["codigo"]] = municipio.id

    await session.commit()
    print(f"    [OK] {len(municipios_map)} municipios creados")
    return municipios_map


async def seed_zonas(session: AsyncSession, municipio_id: int, codigo_municipio: str = None) -> dict:
    """Crea zonas y devuelve dict {nombre: data}"""
    print("[+] Creando zonas...")
    zonas_map = {}

    # Usar zonas específicas si existen, sino genéricas
    zonas_data = ZONAS_POR_MUNICIPIO.get(codigo_municipio, ZONAS_GENERICAS)

    for z in zonas_data:
        # Si tiene lat/lng específicos, usarlos
        if "lat" in z:
            lat, lng = z["lat"], z["lng"]
        else:
            lat, lng = random_coords(z.get("offset", (0, 0)))

        zona = Zona(
            nombre=z["nombre"],
            codigo=z["codigo"],
            descripcion=z["descripcion"],
            latitud_centro=lat,
            longitud_centro=lng,
            municipio_id=municipio_id,
            activo=True
        )
        session.add(zona)
        await session.flush()
        zonas_map[z["nombre"]] = {"id": zona.id, "lat": lat, "lng": lng}
    await session.commit()
    print(f"    [OK] {len(zonas_map)} zonas creadas")
    return zonas_map


async def seed_categorias(session: AsyncSession, municipio_id: int) -> dict:
    """Crea categorías y devuelve dict {nombre: id}"""
    print("[+] Creando categorias...")
    categorias_map = {}
    for c in CATEGORIAS_DATA:
        cat = Categoria(
            nombre=c["nombre"],
            icono=c["icono"],
            color=c["color"],
            tiempo_resolucion_estimado=c["tiempo"],
            prioridad_default=c["prioridad"],
            municipio_id=municipio_id,
            activo=True
        )
        session.add(cat)
        await session.flush()
        categorias_map[c["nombre"]] = cat.id
    await session.commit()
    print(f"    [OK] {len(categorias_map)} categorias creadas")
    return categorias_map


async def seed_cuadrillas(session: AsyncSession, zonas_map: dict, categorias_map: dict, municipio_id: int) -> dict:
    """Crea cuadrillas y devuelve dict {nombre: id}"""
    print("[+] Creando cuadrillas...")
    cuadrillas_map = {}
    zona_ids = [z["id"] for z in zonas_map.values()]

    for i, c in enumerate(CUADRILLAS_DATA):
        cuadrilla = Cuadrilla(
            nombre=c["nombre"],
            especialidad=c["especialidad"],
            zona_id=zona_ids[i % len(zona_ids)],
            municipio_id=municipio_id,
            capacidad_maxima=10,
            activo=True
        )
        session.add(cuadrilla)
        await session.flush()
        cuadrillas_map[c["nombre"]] = cuadrilla.id
    await session.commit()
    print(f"    [OK] {len(cuadrillas_map)} cuadrillas creadas")
    return cuadrillas_map


async def seed_usuarios_municipio(session: AsyncSession, cuadrillas_map: dict, municipio_id: int, codigo_muni: str) -> dict:
    """Crea usuarios de prueba con emails únicos por municipio"""
    print("[+] Creando usuarios...")
    usuarios_map = {}

    # Dominio único por municipio (ej: admin@merlo.gob)
    domain = f"{codigo_muni}.gob"
    # Contraseña universal para demo
    password = pwd_context.hash("123456")

    # Obtener nombres característicos del municipio
    nombres_muni = USUARIOS_POR_MUNICIPIO.get(codigo_muni, {
        "admin": ("Admin", "Municipal"),
        "supervisor": ("Supervisor", "General"),
        "empleado": ("Empleado", "Municipal"),
        "vecino": ("Vecino", "Principal"),
        "vecinos_extra": [
            ("Ana", "López"), ("Carlos", "García"), ("Laura", "Martínez"),
            ("Diego", "Rodríguez"), ("Sofía", "Fernández"), ("Pablo", "Sánchez"),
            ("Lucía", "Romero"), ("Martín", "Torres"), ("Valentina", "Díaz")
        ]
    })

    # Admin del municipio
    admin_nombre, admin_apellido = nombres_muni["admin"]
    admin = User(
        email=f"admin@{domain}",
        password_hash=password,
        nombre=admin_nombre,
        apellido=admin_apellido,
        rol=RolUsuario.ADMIN,
        municipio_id=municipio_id,
        activo=True
    )
    session.add(admin)
    await session.flush()
    usuarios_map["admin"] = admin.id

    # Supervisor
    sup_nombre, sup_apellido = nombres_muni["supervisor"]
    supervisor = User(
        email=f"supervisor@{domain}",
        password_hash=password,
        nombre=sup_nombre,
        apellido=sup_apellido,
        rol=RolUsuario.SUPERVISOR,
        municipio_id=municipio_id,
        activo=True
    )
    session.add(supervisor)
    await session.flush()
    usuarios_map["supervisor"] = supervisor.id

    # Empleado principal
    emp_nombre, emp_apellido = nombres_muni["empleado"]
    empleado = User(
        email=f"empleado@{domain}",
        password_hash=password,
        nombre=emp_nombre,
        apellido=emp_apellido,
        rol=RolUsuario.EMPLEADO,
        municipio_id=municipio_id,
        activo=True
    )
    session.add(empleado)
    await session.flush()
    usuarios_map["empleado_0"] = empleado.id

    # Vecino principal
    vec_nombre, vec_apellido = nombres_muni["vecino"]
    vecino_principal = User(
        email=f"vecino@{domain}",
        password_hash=password,
        nombre=vec_nombre,
        apellido=vec_apellido,
        telefono=f"11-{random.randint(1000, 9999)}-{random.randint(1000, 9999)}",
        rol=RolUsuario.VECINO,
        municipio_id=municipio_id,
        activo=True
    )
    session.add(vecino_principal)
    await session.flush()
    usuarios_map["vecino_0"] = vecino_principal.id

    # Vecinos adicionales con nombres característicos
    vecinos_extra = nombres_muni.get("vecinos_extra", [])
    for i, (nombre, apellido) in enumerate(vecinos_extra, start=1):
        vecino = User(
            email=f"vecino{i+1}@{domain}",
            password_hash=password,
            nombre=nombre,
            apellido=apellido,
            telefono=f"11-{random.randint(1000, 9999)}-{random.randint(1000, 9999)}",
            rol=RolUsuario.VECINO,
            municipio_id=municipio_id,
            activo=True
        )
        session.add(vecino)
        await session.flush()
        usuarios_map[f"vecino_{i}"] = vecino.id

    await session.commit()
    print(f"    [OK] {len(usuarios_map)} usuarios creados")
    return usuarios_map


async def seed_reclamos(session: AsyncSession, zonas_map: dict, categorias_map: dict,
                        cuadrillas_map: dict, usuarios_map: dict, municipio_id: int):
    """Crea reclamos con distribucion realista para un dashboard útil"""
    print("[+] Creando reclamos...")

    # Distribución de estados más útil para dashboard
    # Más pendientes = dashboard más útil
    estados_dist = [
        (EstadoReclamo.NUEVO, 0.25),        # 25% nuevos sin asignar
        (EstadoReclamo.ASIGNADO, 0.20),     # 20% asignados esperando
        (EstadoReclamo.EN_PROCESO, 0.20),   # 20% en trabajo activo
        (EstadoReclamo.RESUELTO, 0.30),     # 30% resueltos
        (EstadoReclamo.RECHAZADO, 0.05),    # 5% rechazados
    ]

    vecino_ids = [v for k, v in usuarios_map.items() if k.startswith("vecino_")]
    cuadrilla_ids = list(cuadrillas_map.values())
    zona_nombres = list(zonas_map.keys())
    categoria_nombres = list(categorias_map.keys())

    reclamos_creados = 0

    # === RECLAMOS URGENTES: Prioridad alta con más de 3 días sin resolver ===
    # Para que la métrica "Urgentes" muestre algo
    for _ in range(random.randint(3, 6)):
        zona_nombre = random.choice(zona_nombres)
        zona_data = zonas_map[zona_nombre]
        categoria_nombre = random.choice(categoria_nombres)
        categoria_id = categorias_map[categoria_nombre]

        lat = zona_data["lat"] + random.uniform(-0.01, 0.01)
        lng = zona_data["lng"] + random.uniform(-0.01, 0.01)

        # Creados hace 4-10 días (para que sean +3 días)
        dias_atras = random.randint(4, 10)
        created_at = datetime.now() - timedelta(days=dias_atras, hours=random.randint(0, 23))

        titulos = RECLAMOS_TITULOS.get(categoria_nombre, ["Reclamo urgente"])
        titulo = random.choice(titulos)
        direccion = f"{random.choice(DIRECCIONES)} {random.randint(100, 5000)}"

        estado = random.choice([EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO])

        reclamo = Reclamo(
            titulo=f"URGENTE: {titulo}",
            descripcion=f"{titulo}. Situación urgente que requiere atención inmediata.",
            estado=estado,
            prioridad=random.randint(4, 5),  # Prioridad 4 o 5 (alta)
            direccion=direccion,
            latitud=lat,
            longitud=lng,
            referencia="Requiere atención urgente",
            categoria_id=categoria_id,
            zona_id=zona_data["id"],
            creador_id=random.choice(vecino_ids),
            municipio_id=municipio_id,
            created_at=created_at
        )

        if estado != EstadoReclamo.NUEVO:
            reclamo.cuadrilla_id = random.choice(cuadrilla_ids)

        session.add(reclamo)
        reclamos_creados += 1

    # === RECLAMOS VENCIDOS: Con fecha_programada pasada ===
    # Para que la métrica "Vencidos" muestre algo
    for _ in range(random.randint(2, 4)):
        zona_nombre = random.choice(zona_nombres)
        zona_data = zonas_map[zona_nombre]
        categoria_nombre = random.choice(categoria_nombres)
        categoria_id = categorias_map[categoria_nombre]

        lat = zona_data["lat"] + random.uniform(-0.01, 0.01)
        lng = zona_data["lng"] + random.uniform(-0.01, 0.01)

        # Creados hace 5-15 días
        dias_atras = random.randint(5, 15)
        created_at = datetime.now() - timedelta(days=dias_atras, hours=random.randint(0, 23))

        titulos = RECLAMOS_TITULOS.get(categoria_nombre, ["Reclamo"])
        titulo = random.choice(titulos)
        direccion = f"{random.choice(DIRECCIONES)} {random.randint(100, 5000)}"

        estado = random.choice([EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO])

        reclamo = Reclamo(
            titulo=titulo,
            descripcion=f"{titulo}. Trabajo programado pero vencido.",
            estado=estado,
            prioridad=random.randint(2, 4),
            direccion=direccion,
            latitud=lat,
            longitud=lng,
            referencia="Fecha vencida",
            categoria_id=categoria_id,
            zona_id=zona_data["id"],
            creador_id=random.choice(vecino_ids),
            municipio_id=municipio_id,
            created_at=created_at,
            cuadrilla_id=random.choice(cuadrilla_ids),
            # Fecha programada en el PASADO (vencido)
            fecha_programada=(datetime.now() - timedelta(days=random.randint(1, 3))).date()
        )

        session.add(reclamo)
        reclamos_creados += 1

    # === RECLAMOS PARA HOY: Programados para hoy ===
    for _ in range(random.randint(3, 5)):
        zona_nombre = random.choice(zona_nombres)
        zona_data = zonas_map[zona_nombre]
        categoria_nombre = random.choice(categoria_nombres)
        categoria_id = categorias_map[categoria_nombre]

        lat = zona_data["lat"] + random.uniform(-0.01, 0.01)
        lng = zona_data["lng"] + random.uniform(-0.01, 0.01)

        dias_atras = random.randint(1, 5)
        created_at = datetime.now() - timedelta(days=dias_atras, hours=random.randint(0, 23))

        titulos = RECLAMOS_TITULOS.get(categoria_nombre, ["Reclamo"])
        titulo = random.choice(titulos)
        direccion = f"{random.choice(DIRECCIONES)} {random.randint(100, 5000)}"

        reclamo = Reclamo(
            titulo=titulo,
            descripcion=f"{titulo}. Programado para atención hoy.",
            estado=random.choice([EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO]),
            prioridad=random.randint(2, 4),
            direccion=direccion,
            latitud=lat,
            longitud=lng,
            referencia="Programado para hoy",
            categoria_id=categoria_id,
            zona_id=zona_data["id"],
            creador_id=random.choice(vecino_ids),
            municipio_id=municipio_id,
            created_at=created_at,
            cuadrilla_id=random.choice(cuadrilla_ids),
            fecha_programada=datetime.now().date()  # HOY
        )

        session.add(reclamo)
        reclamos_creados += 1

    # === CLUSTERS: Crear grupos de reclamos cercanos (para que el dashboard detecte clusters) ===
    # 3 clusters de 5-8 reclamos cada uno en zonas aleatorias
    for cluster_num in range(3):
        zona_nombre = random.choice(zona_nombres)
        zona_data = zonas_map[zona_nombre]

        # Punto central del cluster
        cluster_lat = zona_data["lat"] + random.uniform(-0.005, 0.005)
        cluster_lng = zona_data["lng"] + random.uniform(-0.005, 0.005)

        # 5-8 reclamos muy cercanos (dentro de 300m)
        for _ in range(random.randint(5, 8)):
            lat = cluster_lat + random.uniform(-0.003, 0.003)  # ~300m de variación
            lng = cluster_lng + random.uniform(-0.003, 0.003)

            categoria_nombre = random.choice(categoria_nombres)
            categoria_id = categorias_map[categoria_nombre]

            # Estos reclamos son NUEVOS o ASIGNADOS (pendientes - para clusters activos)
            estado = random.choice([EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO])

            # Recientes (últimos 7 días)
            dias_atras = random.randint(0, 7)
            created_at = datetime.now() - timedelta(days=dias_atras, hours=random.randint(0, 23))

            titulos = RECLAMOS_TITULOS.get(categoria_nombre, ["Reclamo general"])
            titulo = random.choice(titulos)
            direccion = f"{random.choice(DIRECCIONES)} {random.randint(100, 5000)}"

            reclamo = Reclamo(
                titulo=titulo,
                descripcion=f"{titulo}. Zona con múltiples reclamos similares. Requiere atención prioritaria.",
                estado=estado,
                prioridad=random.randint(1, 3),
                direccion=direccion,
                latitud=lat,
                longitud=lng,
                referencia=f"Cluster {cluster_num + 1} - Cerca de {zona_nombre}",
                categoria_id=categoria_id,
                zona_id=zona_data["id"],
                creador_id=random.choice(vecino_ids),
                municipio_id=municipio_id,
                created_at=created_at
            )

            if estado == EstadoReclamo.ASIGNADO:
                reclamo.cuadrilla_id = random.choice(cuadrilla_ids)

            session.add(reclamo)
            reclamos_creados += 1

    # === RECLAMOS DISTRIBUIDOS: El resto con distribución normal ===
    for _ in range(random.randint(60, 80)):
        categoria_nombre = random.choice(categoria_nombres)
        categoria_id = categorias_map[categoria_nombre]
        zona_nombre = random.choice(zona_nombres)
        zona_data = zonas_map[zona_nombre]

        # Coordenadas normales en la zona
        base_lat = zona_data["lat"]
        base_lng = zona_data["lng"]
        lat = base_lat + random.uniform(-0.015, 0.015)
        lng = base_lng + random.uniform(-0.015, 0.015)

        # Seleccionar estado según distribución
        rand_val = random.random()
        cumulative = 0
        estado = EstadoReclamo.NUEVO
        for est, prob in estados_dist:
            cumulative += prob
            if rand_val <= cumulative:
                estado = est
                break

        # Más reclamos recientes (60% últimos 14 días, 40% hasta 60 días)
        if random.random() < 0.6:
            dias_atras = random.randint(0, 14)
        else:
            dias_atras = random.randint(15, 60)
        created_at = datetime.now() - timedelta(days=dias_atras, hours=random.randint(0, 23))

        titulos = RECLAMOS_TITULOS.get(categoria_nombre, ["Reclamo general"])
        titulo = random.choice(titulos)
        direccion = f"{random.choice(DIRECCIONES)} {random.randint(100, 5000)}"

        reclamo = Reclamo(
            titulo=titulo,
            descripcion=f"{titulo}. Se requiere atención en la zona. Afecta a los vecinos.",
            estado=estado,
            prioridad=random.randint(1, 5),
            direccion=direccion,
            latitud=lat,
            longitud=lng,
            referencia=f"Cerca de {random.choice(['plaza', 'escuela', 'hospital', 'comercio', 'parada de colectivo'])}",
            categoria_id=categoria_id,
            zona_id=zona_data["id"],
            creador_id=random.choice(vecino_ids),
            municipio_id=municipio_id,
            created_at=created_at
        )

        # Si está asignado o más avanzado, asignar cuadrilla
        if estado in [EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO, EstadoReclamo.RESUELTO]:
            reclamo.cuadrilla_id = random.choice(cuadrilla_ids)

            # Programar fecha para los próximos días si está asignado
            if estado == EstadoReclamo.ASIGNADO:
                reclamo.fecha_programada = (datetime.now() + timedelta(days=random.randint(1, 5))).date()

        # Si está resuelto, agregar fecha de resolución
        if estado == EstadoReclamo.RESUELTO:
            dias_resolucion = random.randint(1, max(min(dias_atras, 15), 1))
            reclamo.fecha_resolucion = created_at + timedelta(days=dias_resolucion)
            reclamo.resolucion = "Trabajo realizado satisfactoriamente por la cuadrilla asignada."

        session.add(reclamo)
        reclamos_creados += 1

    await session.commit()
    print(f"    [OK] {reclamos_creados} reclamos creados (incluyendo 3 clusters de reclamos cercanos)")

    # Crear historial para reclamos del municipio actual
    print("[+] Creando historial de reclamos...")
    result = await session.execute(
        select(Reclamo).where(Reclamo.municipio_id == municipio_id)
    )
    reclamos = result.scalars().all()
    historial_count = 0

    for idx, reclamo in enumerate(reclamos):
        # Crear entrada de historial inicial
        historial = HistorialReclamo(
            reclamo_id=reclamo.id,
            estado_anterior=None,
            estado_nuevo=EstadoReclamo.NUEVO,
            usuario_id=reclamo.creador_id,
            accion="creado",
            comentario="Reclamo creado",
            created_at=reclamo.created_at
        )
        session.add(historial)
        historial_count += 1

        # Si tiene más estados, agregar entradas
        if reclamo.estado != EstadoReclamo.NUEVO:
            estados_orden = [EstadoReclamo.NUEVO, EstadoReclamo.ASIGNADO,
                           EstadoReclamo.EN_PROCESO, EstadoReclamo.RESUELTO]
            idx_actual = estados_orden.index(reclamo.estado) if reclamo.estado in estados_orden else 0

            for i in range(1, idx_actual + 1):
                h = HistorialReclamo(
                    reclamo_id=reclamo.id,
                    estado_anterior=estados_orden[i-1],
                    estado_nuevo=estados_orden[i],
                    usuario_id=usuarios_map.get("supervisor", reclamo.creador_id),
                    accion=estados_orden[i].value,
                    comentario=f"Estado cambiado a {estados_orden[i].value}",
                    created_at=reclamo.created_at + timedelta(days=i, hours=random.randint(1, 8))
                )
                session.add(h)
                historial_count += 1

        # Commit cada 50 registros para evitar timeout
        if idx > 0 and idx % 20 == 0:
            await session.commit()

    await session.commit()
    print(f"    [OK] {historial_count} entradas de historial creadas")

    # Crear calificaciones para reclamos resueltos del municipio
    print("[+] Creando calificaciones...")
    result = await session.execute(
        select(Reclamo).where(
            Reclamo.estado == EstadoReclamo.RESUELTO,
            Reclamo.municipio_id == municipio_id
        )
    )
    reclamos_resueltos = result.scalars().all()

    calificaciones_creadas = 0
    for reclamo in reclamos_resueltos:
        if random.random() > 0.3:  # 70% tienen calificación
            calif = Calificacion(
                reclamo_id=reclamo.id,
                usuario_id=reclamo.creador_id,
                puntuacion=random.randint(3, 5),  # Mayormente positivas
                comentario=random.choice([
                    "Muy buen trabajo",
                    "Resolvieron rápido",
                    "Excelente atención",
                    "Satisfecho con el resultado",
                    "Gracias por la gestión",
                    None
                ])
            )
            session.add(calif)
            calificaciones_creadas += 1

    await session.commit()
    print(f"    [OK] {calificaciones_creadas} calificaciones creadas")


async def main():
    print("\n" + "="*60)
    print("SEED DE DATOS - Sistema de Reclamos Municipales")
    print("="*60 + "\n")

    async with AsyncSessionLocal() as session:
        try:
            await clear_data(session)

            # Crear municipios (multi-tenant)
            municipios_map = await seed_municipios(session)

            # Crear datos completos para CADA municipio
            for codigo, municipio_id in municipios_map.items():
                print(f"\n{'='*40}")
                print(f"Generando datos para: {codigo.upper()}")
                print(f"{'='*40}")

                zonas_map = await seed_zonas(session, municipio_id, codigo)
                categorias_map = await seed_categorias(session, municipio_id)
                cuadrillas_map = await seed_cuadrillas(session, zonas_map, categorias_map, municipio_id)
                usuarios_map = await seed_usuarios_municipio(session, cuadrillas_map, municipio_id, codigo)
                await seed_reclamos(session, zonas_map, categorias_map, cuadrillas_map, usuarios_map, municipio_id)

            print("\n" + "="*60)
            print("[OK] SEED COMPLETADO EXITOSAMENTE")
            print("="*60)
            print("\nMunicipios disponibles:")
            for codigo, mid in municipios_map.items():
                print(f"   - {codigo} (ID: {mid})")
            print("\nUsuarios de prueba (contraseña: 123456 para todos):")
            print("   - Admin: admin@{codigo}.gob")
            print("   - Supervisor: supervisor@{codigo}.gob")
            print("   - Empleado: empleado@{codigo}.gob")
            print("   - Vecino: vecino@{codigo}.gob")
            print("\nEjemplo para Merlo:")
            print("   - admin@merlo.gob / 123456 (Admin Sistema)")
            print("   - supervisor@merlo.gob / 123456 (Graciela Fernández)")
            print("   - empleado@merlo.gob / 123456 (Carlos Gómez)")
            print("   - vecino@merlo.gob / 123456 (Marta Rodríguez)")
            print()

        except Exception as e:
            print(f"\n[ERROR] Error durante el seed: {e}")
            import traceback
            traceback.print_exc()
            await session.rollback()


if __name__ == "__main__":
    asyncio.run(main())
