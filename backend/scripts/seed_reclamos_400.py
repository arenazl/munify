"""Script para generar 400 reclamos con datos coherentes"""
import asyncio
import random
from datetime import datetime, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import AsyncSessionLocal

# Datos coherentes por categoría
CATEGORIA_DATA = {
    "Alumbrado": {
        "titulos": [
            "Luz de poste apagada", "Poste de luz sin funcionar", "Lámpara quemada",
            "Falta iluminación en la cuadra", "Poste inclinado peligroso",
            "Cable de luz colgando", "Luz titilante molesta", "Zona muy oscura",
            "Luminaria vandalizada", "Poste con luz intermitente"
        ],
        "descripciones": [
            "El poste de luz de esta esquina no funciona hace varios días, la zona queda muy oscura de noche.",
            "La lámpara del alumbrado público está quemada, necesita reemplazo urgente.",
            "Hay un cable de luz que cuelga peligrosamente, puede causar accidentes.",
            "La cuadra entera está sin iluminación, es peligroso para los vecinos.",
            "El poste está muy inclinado y puede caerse, es un peligro.",
            "La luz del poste titila constantemente, es muy molesto.",
            "No hay ninguna luz en esta zona, necesitamos iluminación.",
            "Vandalizaron la luminaria y quedamos sin luz.",
            "El poste funciona de día pero no de noche, tiene un problema.",
            "Hace semanas que este poste no enciende, por favor revisar."
        ]
    },
    "Baches": {
        "titulos": [
            "Bache enorme en la calle", "Calle destruida", "Pozo peligroso",
            "Asfalto hundido", "Bache en esquina", "Calle en mal estado",
            "Pozo que crece cada día", "Bache frente a escuela", "Calle rota",
            "Hundimiento de pavimento"
        ],
        "descripciones": [
            "Hay un bache enorme que causa problemas a los autos, ya pincharon varias cubiertas.",
            "La calle está completamente destruida, es intransitable.",
            "El pozo es muy profundo y peligroso, especialmente de noche.",
            "El asfalto se hundió y quedó un desnivel importante.",
            "En la esquina hay un bache que se llena de agua cuando llueve.",
            "La calle está en pésimo estado, necesita reparación urgente.",
            "Este bache crece cada día más, hay que arreglarlo antes de que sea peor.",
            "Hay un bache grande frente a la escuela, los chicos pueden lastimarse.",
            "La calle está toda rota, no se puede circular normalmente.",
            "El pavimento se hundió después de las últimas lluvias."
        ]
    },
    "Basura": {
        "titulos": [
            "Basura acumulada en esquina", "No pasan a recolectar", "Contenedor desbordado",
            "Microbasural", "Basura en terreno baldío", "Falta contenedor",
            "Residuos en vereda", "Bolsas rotas por perros", "Olor nauseabundo",
            "Acumulación de residuos"
        ],
        "descripciones": [
            "Hay mucha basura acumulada en la esquina, no la retiran hace días.",
            "El camión de basura no pasa por esta cuadra desde la semana pasada.",
            "El contenedor está desbordado y la basura cae al piso.",
            "Se formó un microbasural, la gente tira basura constantemente.",
            "Tiraron mucha basura en el terreno baldío, hay ratas.",
            "Necesitamos un contenedor en esta cuadra, no hay ninguno.",
            "Dejaron residuos en la vereda y nadie los levanta.",
            "Los perros rompen las bolsas y queda toda la basura desparramada.",
            "El olor es insoportable por la basura acumulada.",
            "Hace varios días que se acumula la basura, necesitamos recolección."
        ]
    },
    "Arbolado": {
        "titulos": [
            "Árbol caído", "Rama peligrosa", "Árbol seco para podar",
            "Raíces que rompen vereda", "Árbol que tapa semáforo",
            "Rama sobre cables de luz", "Árbol inclinado", "Poda necesaria",
            "Árbol muerto", "Rama a punto de caer"
        ],
        "descripciones": [
            "Un árbol se cayó y bloquea la vereda, no se puede pasar.",
            "Hay una rama grande que está por caer, es muy peligroso.",
            "El árbol está seco y necesita poda urgente.",
            "Las raíces del árbol rompieron toda la vereda.",
            "El árbol creció mucho y tapa el semáforo, no se ve.",
            "Hay una rama sobre los cables de luz que puede causar un corte.",
            "El árbol está muy inclinado y puede caerse.",
            "Hace falta podar este árbol, las ramas tapan todo.",
            "El árbol está muerto y puede caerse en cualquier momento.",
            "Una rama grande está por caer sobre la vereda."
        ]
    },
    "Agua": {
        "titulos": [
            "Pérdida de agua en calle", "Caño roto", "Falta presión de agua",
            "Agua marrón", "Inundación por caño", "Sin agua hace días",
            "Boca de tormenta tapada", "Cloaca desbordada", "Olor a cloaca",
            "Pérdida en vereda"
        ],
        "descripciones": [
            "Hay una pérdida de agua importante en la calle, se desperdicia mucha agua.",
            "Se rompió un caño y sale agua constantemente.",
            "No tenemos presión de agua, apenas sale un hilito.",
            "El agua sale marrón, no se puede usar para nada.",
            "Un caño roto inundó toda la cuadra.",
            "Estamos sin agua desde hace varios días, necesitamos solución.",
            "La boca de tormenta está tapada y se inunda cuando llueve.",
            "La cloaca se desbordó y hay un olor terrible.",
            "Sale olor a cloaca por los desagües, es insoportable.",
            "Hay una pérdida de agua en la vereda que no para."
        ]
    },
    "Señalizacion": {
        "titulos": [
            "Cartel de PARE caído", "Falta señal de velocidad", "Señal vandalizada",
            "Cartel ilegible", "Falta señalización", "Semáforo no funciona",
            "Señal de tránsito rota", "Cartel tapado por árbol",
            "Falta lomo de burro", "Señalización horizontal borrada"
        ],
        "descripciones": [
            "El cartel de PARE se cayó y los autos no paran.",
            "Falta la señal de velocidad máxima, los autos pasan muy rápido.",
            "Vandalizaron el cartel y no se puede leer.",
            "El cartel está tan viejo que no se puede leer.",
            "No hay ninguna señalización en esta esquina peligrosa.",
            "El semáforo no funciona, casi hay accidentes todos los días.",
            "La señal de tránsito está rota, hay que reponerla.",
            "Un árbol tapa el cartel y no se puede ver.",
            "Necesitamos un lomo de burro, los autos pasan muy rápido.",
            "La señalización horizontal (rayas) está completamente borrada."
        ]
    },
    "Espacios": {
        "titulos": [
            "Plaza en mal estado", "Juegos rotos", "Pasto muy alto",
            "Banco roto", "Falta iluminación en plaza", "Basura en plaza",
            "Bebedero sin funcionar", "Cerca rota", "Plaza abandonada",
            "Juegos oxidados"
        ],
        "descripciones": [
            "La plaza está en muy mal estado, necesita mantenimiento.",
            "Los juegos para chicos están rotos, pueden lastimarse.",
            "El pasto está muy alto, no se puede usar la plaza.",
            "Los bancos están rotos, no hay donde sentarse.",
            "La plaza no tiene luz, de noche es peligroso.",
            "Hay mucha basura tirada en la plaza.",
            "El bebedero no funciona, no hay agua.",
            "La cerca perimetral está rota, entran perros.",
            "La plaza está completamente abandonada.",
            "Los juegos están muy oxidados, son peligrosos para los chicos."
        ]
    },
    "Veredas": {
        "titulos": [
            "Vereda rota", "Baldosas flojas", "Vereda hundida",
            "Falta rampa para discapacitados", "Vereda levantada",
            "Escalón peligroso", "Vereda angosta", "Obstrucción en vereda",
            "Vereda inundada", "Baldosas faltantes"
        ],
        "descripciones": [
            "La vereda está toda rota, es difícil caminar.",
            "Las baldosas están flojas y salen cuando pisás.",
            "La vereda se hundió y quedó un pozo.",
            "Falta la rampa para discapacitados en la esquina.",
            "La vereda está levantada por las raíces, te tropezás.",
            "Hay un escalón muy alto que es peligroso.",
            "La vereda es muy angosta, no se puede pasar.",
            "Hay algo obstruyendo la vereda, no se puede pasar.",
            "La vereda siempre está inundada, el agua no escurre.",
            "Faltan varias baldosas, quedaron los huecos."
        ]
    },
    "Animales": {
        "titulos": [
            "Perro suelto agresivo", "Jauría de perros", "Gatos abandonados",
            "Animal muerto en calle", "Perros que ladran toda la noche",
            "Animal atropellado", "Nido de abejas", "Plaga de palomas",
            "Perro perdido", "Animales en terreno baldío"
        ],
        "descripciones": [
            "Hay un perro suelto que ataca a la gente, es muy agresivo.",
            "Una jauría de perros se instaló en la cuadra, es peligroso.",
            "Abandonaron muchos gatos, necesitan ayuda.",
            "Hay un animal muerto en la calle, nadie lo retira.",
            "Los perros del vecino ladran toda la noche, no se puede dormir.",
            "Atropellaron un perro y quedó en la calle.",
            "Hay un nido de abejas grande, es peligroso.",
            "Hay una plaga de palomas que ensucian todo.",
            "Encontré un perro perdido con collar, busco al dueño.",
            "En el terreno baldío hay muchos animales abandonados."
        ]
    },
    "Ruidos": {
        "titulos": [
            "Música fuerte de vecino", "Obra en horario no permitido",
            "Alarma que no para", "Ruidos molestos nocturnos",
            "Local con música muy alta", "Maquinaria ruidosa",
            "Fiesta hasta la madrugada", "Perros que ladran constantemente",
            "Ruido de generador", "Taller mecánico ruidoso"
        ],
        "descripciones": [
            "El vecino pone música muy fuerte a cualquier hora.",
            "Están haciendo obra fuera del horario permitido.",
            "Hay una alarma que suena sin parar, es insoportable.",
            "Todos los fines de semana hay ruidos hasta la madrugada.",
            "El local de la esquina pone la música muy alta.",
            "Una maquinaria hace ruido todo el día.",
            "Hacen fiesta hasta las 5 de la mañana.",
            "Los perros del vecino ladran todo el día y toda la noche.",
            "El generador de un comercio hace mucho ruido.",
            "El taller mecánico trabaja con mucho ruido a cualquier hora."
        ]
    },
    "Desagues": {
        "titulos": [
            "Desagüe tapado", "Inundación en esquina", "Boca de tormenta rota",
            "Agua estancada", "Desagüe con olor", "Zanja tapada",
            "Desborde cuando llueve", "Alcantarilla tapada",
            "Desagüe obstruido", "Canal de desagüe sucio"
        ],
        "descripciones": [
            "El desagüe está tapado y el agua no escurre.",
            "Cada vez que llueve se inunda toda la esquina.",
            "La boca de tormenta está rota, es un peligro.",
            "El agua queda estancada y hay mosquitos.",
            "El desagüe tiene un olor terrible.",
            "La zanja está tapada de basura y no drena.",
            "Cuando llueve un poco se desborda todo.",
            "La alcantarilla está tapada con hojas y basura.",
            "El desagüe está obstruido y no funciona.",
            "El canal de desagüe está muy sucio, necesita limpieza."
        ]
    },
    "Semaforos": {
        "titulos": [
            "Semáforo apagado", "Semáforo desincronizado", "Luz roja no funciona",
            "Semáforo parpadeando", "Falta semáforo peatonal",
            "Semáforo vandalizado", "Tiempo de cruce muy corto",
            "Semáforo caído", "Botón de peatón roto", "Semáforo mal orientado"
        ],
        "descripciones": [
            "El semáforo está completamente apagado, es muy peligroso.",
            "Los semáforos están desincronizados, se arma un caos.",
            "La luz roja no funciona, los autos pasan igual.",
            "El semáforo parpadea en amarillo todo el tiempo.",
            "Falta el semáforo peatonal, es difícil cruzar.",
            "Vandalizaron el semáforo y no funciona.",
            "El tiempo para cruzar es muy corto, no se alcanza.",
            "El semáforo se cayó por el viento.",
            "El botón para pedir paso peatonal no funciona.",
            "El semáforo está girado y no se ve bien."
        ]
    },
    "Plagas": {
        "titulos": [
            "Plaga de ratas", "Cucarachas en la cuadra", "Mosquitos",
            "Hormigas invadiendo", "Plaga de moscas", "Murciélagos",
            "Plaga de palomas", "Ratas en terreno baldío",
            "Vinchucas", "Alacranes"
        ],
        "descripciones": [
            "Hay muchas ratas en la cuadra, necesitamos fumigación.",
            "Hay plaga de cucarachas, salen de todos lados.",
            "Hay muchos mosquitos por el agua estancada.",
            "Las hormigas invadieron todo, no se puede estar.",
            "Hay una plaga de moscas terrible.",
            "Se metieron murciélagos en el barrio.",
            "Las palomas ensuciaron todo, son una plaga.",
            "En el terreno baldío hay muchas ratas.",
            "Encontramos vinchucas, es urgente fumigar.",
            "Aparecieron alacranes, necesitamos control de plagas."
        ]
    },
    "default": {
        "titulos": [
            "Problema en la vía pública", "Situación a resolver",
            "Inconveniente urbano", "Problema en el barrio",
            "Reclamo general", "Situación irregular",
            "Problema a solucionar", "Inconveniente en la zona",
            "Tema a atender", "Situación a mejorar"
        ],
        "descripciones": [
            "Hay un problema que necesita atención de las autoridades.",
            "Se presenta una situación que requiere solución.",
            "Este inconveniente afecta a todos los vecinos.",
            "El problema persiste desde hace tiempo.",
            "Necesitamos que las autoridades intervengan.",
            "La situación es irregular y debe normalizarse.",
            "Este problema afecta la calidad de vida del barrio.",
            "Solicitamos una pronta solución.",
            "El tema debe ser atendido con urgencia.",
            "Esperamos una mejora en esta situación."
        ]
    }
}

# Calles típicas de Merlo
CALLES_MERLO = [
    "Av. San Martín", "Av. del Libertador", "Calle Alsina", "Calle Belgrano",
    "Calle Rivadavia", "Calle Sarmiento", "Calle Mitre", "Calle Moreno",
    "Calle 25 de Mayo", "Calle 9 de Julio", "Calle España", "Calle Italia",
    "Calle Francia", "Calle Perón", "Calle Colón", "Calle San Lorenzo",
    "Calle Independencia", "Calle Libertad", "Calle Córdoba", "Calle Mendoza",
    "Calle Buenos Aires", "Calle Entre Ríos", "Calle Santa Fe", "Calle Tucumán",
    "Av. Eva Perón", "Calle Los Aromos", "Calle Los Pinos", "Calle Las Rosas",
    "Calle Los Álamos", "Calle Los Cedros", "Pasaje San José", "Pasaje La Paz"
]

ESTADOS = ['nuevo', 'asignado', 'en_proceso', 'pendiente_confirmacion', 'resuelto', 'rechazado']
ESTADO_PESOS = [0.25, 0.2, 0.2, 0.1, 0.2, 0.05]  # Distribución realista


def get_categoria_key(nombre: str) -> str:
    """Obtiene la clave del diccionario según el nombre de categoría"""
    nombre_lower = nombre.lower()
    if "alumbrado" in nombre_lower:
        return "Alumbrado"
    elif "bache" in nombre_lower or "calle" in nombre_lower:
        return "Baches"
    elif "basura" in nombre_lower or "residuo" in nombre_lower or "limpieza" in nombre_lower or "recolec" in nombre_lower:
        return "Basura"
    elif "arbol" in nombre_lower or "poda" in nombre_lower:
        return "Arbolado"
    elif "agua" in nombre_lower or "cloaca" in nombre_lower or "cañer" in nombre_lower:
        return "Agua"
    elif "señal" in nombre_lower:
        return "Señalizacion"
    elif "espacio" in nombre_lower or "plaza" in nombre_lower or "verde" in nombre_lower:
        return "Espacios"
    elif "vereda" in nombre_lower:
        return "Veredas"
    elif "animal" in nombre_lower or "perro" in nombre_lower or "mascota" in nombre_lower:
        return "Animales"
    elif "ruido" in nombre_lower:
        return "Ruidos"
    elif "desag" in nombre_lower or "pluvial" in nombre_lower or "inundac" in nombre_lower:
        return "Desagues"
    elif "semaf" in nombre_lower or "transito" in nombre_lower:
        return "Semaforos"
    elif "plaga" in nombre_lower or "fumig" in nombre_lower or "rata" in nombre_lower:
        return "Plagas"
    else:
        return "default"


async def seed_reclamos():
    async with AsyncSessionLocal() as db:
        # Obtener categorías del municipio 1 (Merlo)
        result = await db.execute(text("""
            SELECT id, nombre FROM categorias
            WHERE activo = 1 AND municipio_id = 1
        """))
        categorias = result.fetchall()

        if not categorias:
            print("No hay categorías para municipio 1, buscando todas...")
            result = await db.execute(text("""
                SELECT id, nombre FROM categorias WHERE activo = 1 LIMIT 20
            """))
            categorias = result.fetchall()

        print(f"Encontradas {len(categorias)} categorías")

        # Obtener zonas del municipio 1
        result = await db.execute(text("""
            SELECT id, nombre FROM zonas
            WHERE activo = 1 AND municipio_id = 1
        """))
        zonas = result.fetchall()

        if not zonas:
            result = await db.execute(text("""
                SELECT id, nombre FROM zonas WHERE activo = 1 LIMIT 10
            """))
            zonas = result.fetchall()

        print(f"Encontradas {len(zonas)} zonas")

        # Obtener vecinos del municipio 1
        result = await db.execute(text("""
            SELECT id FROM usuarios
            WHERE rol = 'vecino' AND municipio_id = 1 AND activo = 1
        """))
        vecinos = [r[0] for r in result.fetchall()]

        if not vecinos:
            result = await db.execute(text("""
                SELECT id FROM usuarios WHERE rol = 'vecino' AND activo = 1 LIMIT 50
            """))
            vecinos = [r[0] for r in result.fetchall()]

        print(f"Encontrados {len(vecinos)} vecinos")

        if not categorias or not zonas or not vecinos:
            print("Error: Faltan datos básicos")
            return

        # Generar 400 reclamos
        reclamos_creados = 0

        for i in range(400):
            # Seleccionar categoría random
            cat_id, cat_nombre = random.choice(categorias)
            cat_key = get_categoria_key(cat_nombre)
            cat_data = CATEGORIA_DATA.get(cat_key, CATEGORIA_DATA["default"])

            # Seleccionar zona random
            zona_id, zona_nombre = random.choice(zonas)

            # Seleccionar vecino random
            creador_id = random.choice(vecinos)

            # Generar datos
            titulo = random.choice(cat_data["titulos"])
            descripcion = random.choice(cat_data["descripciones"])

            # Dirección random
            calle = random.choice(CALLES_MERLO)
            numero = random.randint(100, 5000)
            direccion = f"{calle} {numero}, {zona_nombre}, Merlo, Buenos Aires"

            # Coordenadas aproximadas de Merlo
            latitud = -34.66 + random.uniform(-0.05, 0.05)
            longitud = -58.73 + random.uniform(-0.05, 0.05)

            # Estado con distribución realista
            estado = random.choices(ESTADOS, weights=ESTADO_PESOS)[0]

            # Prioridad
            prioridad = random.randint(1, 5)

            # Fecha de creación (últimos 90 días)
            dias_atras = random.randint(0, 90)
            created_at = datetime.now() - timedelta(days=dias_atras, hours=random.randint(0, 23))

            # Insertar reclamo
            await db.execute(text("""
                INSERT INTO reclamos (
                    municipio_id, titulo, descripcion, direccion,
                    latitud, longitud, estado, prioridad,
                    categoria_id, zona_id, creador_id,
                    created_at, updated_at
                ) VALUES (
                    1, :titulo, :descripcion, :direccion,
                    :latitud, :longitud, :estado, :prioridad,
                    :categoria_id, :zona_id, :creador_id,
                    :created_at, :created_at
                )
            """), {
                "titulo": titulo,
                "descripcion": descripcion,
                "direccion": direccion,
                "latitud": latitud,
                "longitud": longitud,
                "estado": estado,
                "prioridad": prioridad,
                "categoria_id": cat_id,
                "zona_id": zona_id,
                "creador_id": creador_id,
                "created_at": created_at
            })

            reclamos_creados += 1

            if reclamos_creados % 50 == 0:
                print(f"Creados {reclamos_creados} reclamos...")

        await db.commit()
        print(f"\nSe crearon {reclamos_creados} reclamos exitosamente!")


if __name__ == "__main__":
    asyncio.run(seed_reclamos())
