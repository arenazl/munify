"""
Script para generar 100 reclamos coherentes para Chacabuco (municipio_id=7)
Con los nuevos estados activos y asignación automática de dependencias.

Ejecutar: python -m scripts.seed_reclamos_chacabuco_100
"""
import asyncio
import random
from datetime import datetime, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import AsyncSessionLocal

MUNICIPIO_ID = 7  # Chacabuco

# Datos coherentes por categoría de reclamo
CATEGORIA_DATA = {
    "Baches y Calzadas": {
        "titulos": [
            "Bache peligroso en esquina", "Calle destruida por lluvia", "Pozo enorme en calzada",
            "Asfalto hundido frente a mi casa", "Bache que crece cada día", "Calle intransitable",
            "Pozo profundo en cruce", "Bache frente a la escuela", "Calle con múltiples pozos",
            "Hundimiento de pavimento grave"
        ],
        "descripciones": [
            "Hay un bache muy grande que ya dañó varios autos, es urgente repararlo.",
            "La calle está completamente destruida después de las últimas lluvias, no se puede circular.",
            "El pozo es muy profundo y peligroso, especialmente de noche que no se ve.",
            "El asfalto se hundió dejando un desnivel importante que daña los vehículos.",
            "Este bache crece con cada lluvia, hay que arreglarlo antes de que sea peor.",
            "La calle está en pésimo estado, necesita bacheo urgente.",
            "En el cruce hay un bache muy grande que causa problemas a todos los vehículos.",
            "Hay un bache grande frente a la escuela, los chicos pueden lastimarse al cruzar.",
            "La calle tiene múltiples pozos que hacen imposible circular normalmente.",
            "El pavimento se hundió varios centímetros, es muy peligroso."
        ]
    },
    "Iluminación Pública": {
        "titulos": [
            "Luminaria apagada hace días", "Poste de luz sin funcionar", "Falta luz en toda la cuadra",
            "Lámpara quemada en esquina", "Zona muy oscura de noche", "Poste inclinado peligroso",
            "Cable de luz colgando bajo", "Luz titilante muy molesta", "Luminaria vandalizada",
            "Poste con luz intermitente"
        ],
        "descripciones": [
            "El poste de luz no funciona desde hace una semana, la zona queda muy oscura.",
            "La lámpara está quemada y necesita reemplazo urgente para nuestra seguridad.",
            "Toda la cuadra está sin iluminación, es muy peligroso caminar de noche.",
            "En la esquina la luminaria no enciende, es un punto ciego muy inseguro.",
            "Esta zona no tiene ninguna luz, necesitamos iluminación urgente.",
            "El poste está muy inclinado y puede caerse, además no funciona.",
            "Hay un cable de luz que cuelga bajo, es peligroso para peatones.",
            "La luz titila constantemente, además de molesto puede dañar la vista.",
            "Rompieron la luminaria y quedamos sin luz en la cuadra.",
            "El poste enciende y apaga sin control, necesita revisión."
        ]
    },
    "Recolección de Residuos": {
        "titulos": [
            "Basura acumulada en esquina", "No pasó el camión hace días", "Contenedor desbordado",
            "Microbasural en terreno", "Falta contenedor en la cuadra", "Residuos en la vereda",
            "Bolsas rotas por animales", "Olor insoportable por basura", "Acumulación de residuos",
            "Basura desparramada"
        ],
        "descripciones": [
            "Hay mucha basura acumulada en la esquina, no la retiraron desde hace varios días.",
            "El camión de basura no pasó por nuestra cuadra desde la semana pasada.",
            "El contenedor está desbordado y la basura cae al piso, atrae plagas.",
            "Se formó un microbasural en el terreno baldío, la gente tira basura constantemente.",
            "Necesitamos un contenedor en esta cuadra, actualmente no hay ninguno.",
            "Dejaron residuos en la vereda y nadie los levanta, obstruye el paso.",
            "Los perros rompen las bolsas de basura y queda todo desparramado.",
            "El olor es insoportable por la basura acumulada, hay muchas moscas.",
            "Hace varios días que se acumula la basura, necesitamos recolección urgente.",
            "La basura quedó toda desparramada por el viento, hay que limpiar."
        ]
    },
    "Espacios Verdes": {
        "titulos": [
            "Plaza abandonada sin mantenimiento", "Juegos infantiles rotos", "Pasto muy alto en plaza",
            "Bancos de plaza destruidos", "Falta iluminación en plaza", "Bebedero sin funcionar",
            "Cerco perimetral roto", "Juegos oxidados peligrosos", "Árboles sin podar",
            "Riego automático roto"
        ],
        "descripciones": [
            "La plaza está completamente abandonada, necesita mantenimiento urgente.",
            "Los juegos para chicos están rotos y son peligrosos, pueden lastimarse.",
            "El pasto está tan alto que no se puede usar la plaza, hay que cortarlo.",
            "Los bancos de la plaza están destruidos, no hay donde sentarse.",
            "La plaza no tiene luz de noche, es peligroso e inseguro.",
            "El bebedero no funciona, los chicos no tienen donde tomar agua.",
            "El cerco de la plaza está roto, entran perros y es peligroso.",
            "Los juegos están muy oxidados y tienen partes cortantes, es urgente.",
            "Los árboles necesitan poda, las ramas bajas son peligrosas.",
            "El sistema de riego está roto y las plantas se están secando."
        ]
    },
    "Agua y Cloacas": {
        "titulos": [
            "Pérdida de agua en la calle", "Caño roto en vereda", "Sin presión de agua",
            "Agua marrón del grifo", "Inundación por caño roto", "Sin agua hace días",
            "Cloaca desbordada", "Olor terrible a cloaca", "Tapa de cloaca rota",
            "Boca de tormenta tapada"
        ],
        "descripciones": [
            "Hay una pérdida de agua importante en la calle, se desperdicia mucha agua.",
            "Se rompió un caño en la vereda y sale agua constantemente.",
            "No tenemos presión de agua, apenas sale un hilito de la canilla.",
            "El agua sale marrón y con olor, no se puede usar para nada.",
            "Un caño roto inundó toda la cuadra, necesitamos reparación urgente.",
            "Estamos sin agua desde hace varios días, es una emergencia.",
            "La cloaca se desbordó y hay aguas servidas en la calle.",
            "Sale olor horrible a cloaca por los desagües, es insoportable.",
            "La tapa de la cloaca está rota y es un peligro para peatones.",
            "La boca de tormenta está tapada y se inunda todo cuando llueve."
        ]
    },
    "Semáforos y Señalización Vial": {
        "titulos": [
            "Semáforo apagado en cruce", "Cartel de PARE caído", "Señal vial vandalizada",
            "Semáforo desincronizado", "Falta señal de velocidad", "Cartel ilegible",
            "Semáforo parpadeando", "Lomo de burro sin señalizar", "Señalización borrada",
            "Semáforo peatonal roto"
        ],
        "descripciones": [
            "El semáforo está completamente apagado, es muy peligroso cruzar.",
            "El cartel de PARE se cayó y los autos no paran, hubo casi accidentes.",
            "Vandalizaron la señal de tránsito y no se puede leer.",
            "Los semáforos están desincronizados, se forma mucho caos vehicular.",
            "Falta la señal de velocidad máxima, los autos pasan muy rápido.",
            "El cartel está tan viejo y despintado que no se puede leer.",
            "El semáforo parpadea en amarillo todo el tiempo, no regula el tránsito.",
            "Hay un lomo de burro sin señalizar, los autos pasan rápido y saltan.",
            "La señalización horizontal está completamente borrada.",
            "El semáforo peatonal no funciona, es difícil cruzar con seguridad."
        ]
    },
    "Zoonosis y Animales": {
        "titulos": [
            "Perro suelto agresivo", "Jauría de perros en barrio", "Gatos abandonados",
            "Animal muerto en calle", "Perros que ladran toda la noche", "Nido de abejas grande",
            "Plaga de palomas", "Perro perdido con collar", "Animales en terreno baldío",
            "Animal herido en la calle"
        ],
        "descripciones": [
            "Hay un perro suelto muy agresivo que ataca a la gente, es peligroso.",
            "Una jauría de perros se instaló en el barrio, atacan a otros animales.",
            "Abandonaron varios gatos que necesitan ser rescatados urgente.",
            "Hay un animal muerto en la calle desde hace días, nadie lo retira.",
            "Los perros del vecino ladran toda la noche, no podemos descansar.",
            "Hay un panal de abejas muy grande, es peligroso para los vecinos.",
            "Las palomas se convirtieron en plaga, ensucian todo y transmiten enfermedades.",
            "Encontré un perro perdido con collar, necesito ayuda para ubicar al dueño.",
            "En el terreno baldío hay muchos animales abandonados sin cuidado.",
            "Hay un perro herido en la calle que necesita atención veterinaria."
        ]
    },
    "Veredas y Baldíos": {
        "titulos": [
            "Vereda completamente rota", "Baldosas flojas peligrosas", "Vereda hundida",
            "Falta rampa para discapacitados", "Vereda levantada por raíces", "Escalón muy alto",
            "Terreno baldío abandonado", "Vereda obstruida", "Baldosas faltantes",
            "Baldío con yuyos muy altos"
        ],
        "descripciones": [
            "La vereda está toda rota, es muy difícil caminar sin tropezarse.",
            "Las baldosas están flojas y salen cuando uno pisa, es muy peligroso.",
            "La vereda se hundió dejando un desnivel que es trampa para peatones.",
            "En la esquina falta la rampa para discapacitados y cochecitos.",
            "Las raíces de los árboles levantaron toda la vereda, no se puede caminar.",
            "Hay un escalón muy alto entre propiedades que es peligroso.",
            "El terreno baldío está completamente abandonado, lleno de basura y ratas.",
            "Hay materiales de construcción obstruyendo toda la vereda.",
            "Faltan varias baldosas, quedaron los huecos que son peligrosos.",
            "El baldío tiene yuyos de más de un metro, hay víboras y alimañas."
        ]
    },
    "Ruidos Molestos": {
        "titulos": [
            "Música fuerte de vecino", "Obra fuera de horario", "Alarma que no para",
            "Fiesta hasta la madrugada", "Local con música muy alta", "Taller mecánico ruidoso",
            "Generador hace mucho ruido", "Perros que ladran sin parar", "Caño de escape ruidoso",
            "Ruidos de construcción"
        ],
        "descripciones": [
            "El vecino pone música muy fuerte a cualquier hora, no podemos descansar.",
            "Están haciendo obra fuera del horario permitido, hacen ruido de noche.",
            "Hay una alarma de auto que suena sin parar desde hace horas.",
            "Todos los fines de semana hacen fiesta hasta las 5 de la mañana.",
            "El local de la esquina tiene la música altísima, tiemblan las paredes.",
            "El taller mecánico hace ruido muy fuerte todo el día.",
            "El generador de un comercio hace un ruido insoportable.",
            "Los perros del vecino ladran sin parar día y noche.",
            "Pasan motos con caño de escape libre haciendo mucho ruido.",
            "La construcción hace ruido desde muy temprano y hasta tarde."
        ]
    },
    "Limpieza Urbana": {
        "titulos": [
            "Calle sin barrer hace semanas", "Hojas acumuladas en cordón", "Desechos en vía pública",
            "Canal de desagüe sucio", "Aceite derramado en calle", "Escombros abandonados",
            "Grafitis en pared pública", "Cartel publicitario abandonado", "Basura en cantero",
            "Suciedad general en cuadra"
        ],
        "descripciones": [
            "La calle no se barre desde hace semanas, hay mucha suciedad acumulada.",
            "Las hojas se acumularon en el cordón y tapan los desagües.",
            "Hay desechos de construcción abandonados en la vía pública.",
            "El canal de desagüe está muy sucio, hay olor y mosquitos.",
            "Derramaron aceite en la calle y nadie lo limpió, es resbaloso.",
            "Dejaron escombros de una obra abandonados en la vereda.",
            "Hay grafitis en la pared del edificio público, queda muy feo.",
            "Un cartel publicitario viejo está abandonado y roto.",
            "El cantero está lleno de basura y botellas de vidrio.",
            "La cuadra está muy sucia en general, necesita limpieza."
        ]
    },
    "Seguridad Urbana": {
        "titulos": [
            "Zona oscura sin vigilancia", "Terreno baldío inseguro", "Falta cámara de seguridad",
            "Esquina con robos frecuentes", "Autos abandonados en calle", "Falta presencia policial",
            "Parada de colectivo insegura", "Vandalismo frecuente", "Punto de venta de drogas",
            "Zona liberada de noche"
        ],
        "descripciones": [
            "La zona está muy oscura y sin vigilancia, hay muchos robos.",
            "El terreno baldío se usa para cosas raras de noche, es muy inseguro.",
            "Necesitamos cámaras de seguridad en esta zona, hay muchos delitos.",
            "En esta esquina roban frecuentemente, necesitamos más presencia policial.",
            "Hay varios autos abandonados que usan para esconderse delincuentes.",
            "Hace mucho que no vemos patrulleros, necesitamos más vigilancia.",
            "La parada de colectivo es muy insegura de noche, no hay luz.",
            "Vandalizan constantemente los carteles y mobiliario urbano.",
            "Se rumorea que hay venta de drogas en la esquina, hay mucho movimiento raro.",
            "De noche la zona queda totalmente liberada, no hay control."
        ]
    },
    "Obras Públicas": {
        "titulos": [
            "Obra abandonada hace meses", "Zanja sin tapar peligrosa", "Cordón cuneta destruido",
            "Puente peatonal dañado", "Escalera pública rota", "Muro de contención agrietado",
            "Desagüe pluvial colapsado", "Calle sin terminar", "Vereda pública sin hacer",
            "Obra que no avanza"
        ],
        "descripciones": [
            "Hay una obra pública abandonada hace meses, quedó todo a medio hacer.",
            "Dejaron una zanja abierta sin tapar, es muy peligroso especialmente de noche.",
            "El cordón cuneta está completamente destruido, no escurre el agua.",
            "El puente peatonal tiene tablones rotos, es peligroso cruzar.",
            "La escalera pública tiene escalones rotos y sin baranda.",
            "El muro de contención tiene grietas grandes, puede derrumbarse.",
            "El desagüe pluvial colapsó y se inunda todo el barrio cuando llueve.",
            "La calle quedó sin terminar, falta el asfalto en varios tramos.",
            "La vereda pública nunca la hicieron, caminamos por el barro.",
            "La obra lleva meses sin avanzar, está todo paralizado."
        ]
    },
    "Salud Ambiental": {
        "titulos": [
            "Quema de basura en terreno", "Humo tóxico de fábrica", "Agua estancada con mosquitos",
            "Derrame de líquidos en calle", "Olor químico muy fuerte", "Fumigación necesaria",
            "Contaminación de arroyo", "Basural a cielo abierto", "Residuos patológicos",
            "Plaga de ratas"
        ],
        "descripciones": [
            "En el terreno baldío queman basura constantemente, el humo es tóxico.",
            "De la fábrica sale humo negro que afecta a todo el barrio.",
            "Hay agua estancada que genera mosquitos, riesgo de dengue.",
            "Derramaron algún líquido químico en la calle, hay olor fuerte.",
            "Se siente un olor químico muy fuerte que viene de algún lugar cercano.",
            "Necesitamos fumigación urgente, hay muchos mosquitos y cucarachas.",
            "El arroyo está contaminado, tiene espuma y mal olor.",
            "Se formó un basural a cielo abierto, hay mucha contaminación.",
            "Encontramos residuos que parecen ser de hospital, es peligroso.",
            "Hay plaga de ratas en el barrio, necesitamos control de plagas."
        ]
    },
    "Transporte y Paradas": {
        "titulos": [
            "Parada sin refugio", "Colectivo que no pasa", "Falta banco en parada",
            "Parada mal ubicada", "Cartel de recorrido ilegible", "Refugio vandalizado",
            "Falta señalización de parada", "Parada inundable", "Colectivo que no para",
            "Horarios no se cumplen"
        ],
        "descripciones": [
            "La parada no tiene refugio, cuando llueve la gente se moja toda.",
            "El colectivo no pasa por esta parada desde hace días, no hay servicio.",
            "No hay banco en la parada, la gente mayor no puede esperar parada.",
            "La parada está muy mal ubicada, hay que cruzar la calle corriendo.",
            "El cartel con el recorrido está tan viejo que no se puede leer.",
            "Vandalizaron el refugio de la parada, rompieron los vidrios.",
            "No hay cartel que indique que es parada de colectivo.",
            "Cuando llueve la parada se inunda, hay que pararse en el agua.",
            "El colectivo pasa de largo y no para aunque haya gente esperando.",
            "Los horarios del colectivo nunca se cumplen, pasan cuando quieren."
        ]
    },
    "Otros Reclamos": {
        "titulos": [
            "Problema no categorizado", "Consulta general al municipio", "Situación irregular",
            "Reclamo múltiple", "Inconveniente en la zona", "Solicitud especial",
            "Tema a evaluar", "Problema a resolver", "Situación a mejorar",
            "Pedido de información"
        ],
        "descripciones": [
            "Tengo un problema que no sé en qué categoría entra, necesito orientación.",
            "Quisiera hacer una consulta general al municipio sobre varios temas.",
            "Hay una situación irregular que no corresponde a ninguna categoría específica.",
            "Tengo varios reclamos relacionados que prefiero hacer juntos.",
            "Hay un inconveniente en la zona que afecta a varios vecinos.",
            "Necesito hacer una solicitud especial que requiere evaluación.",
            "Este tema necesita ser evaluado por las autoridades correspondientes.",
            "Hay un problema que necesita solución pero no sé a quién corresponde.",
            "La situación podría mejorarse con intervención municipal.",
            "Necesito información sobre trámites y servicios municipales."
        ]
    }
}

# Calles típicas de Chacabuco
CALLES_CHACABUCO = [
    "Av. Alsina", "Av. Hipólito Yrigoyen", "Av. Urquiza", "Av. Lamadrid",
    "Calle San Martín", "Calle Belgrano", "Calle Rivadavia", "Calle Moreno",
    "Calle 25 de Mayo", "Calle 9 de Julio", "Calle Sarmiento", "Calle Mitre",
    "Calle Pellegrini", "Calle Alem", "Calle Brown", "Calle Colón",
    "Calle España", "Calle Italia", "Calle Perón", "Calle Maipú",
    "Calle Lavalle", "Calle Güemes", "Calle Necochea", "Calle Dorrego",
    "Calle Las Heras", "Calle Paso", "Calle Castelli", "Calle Pueyrredón",
    "Calle Balcarce", "Calle Suipacha", "Pasaje Los Aromos", "Pasaje San José"
]

# Barrios de Chacabuco
BARRIOS_CHACABUCO = [
    "Centro", "Barrio Norte", "Barrio Sur", "Villa Italia",
    "Barrio Libertad", "Barrio Progreso", "Las Quintas", "Villa del Parque"
]

# Estados activos del nuevo flujo (no legacy)
ESTADOS_ACTIVOS = ['recibido', 'en_curso', 'finalizado', 'pospuesto', 'rechazado']
# Distribución realista: muchos recibidos/en_curso, menos finalizados, pocos rechazados
ESTADO_PESOS = [0.30, 0.30, 0.25, 0.10, 0.05]


async def seed_reclamos_chacabuco():
    async with AsyncSessionLocal() as db:
        print(f"=== SEED 100 RECLAMOS PARA CHACABUCO (municipio_id={MUNICIPIO_ID}) ===\n")

        # Obtener categorías habilitadas para Chacabuco
        result = await db.execute(text("""
            SELECT c.id, c.nombre
            FROM categorias c
            JOIN municipio_categorias mc ON c.id = mc.categoria_id
            WHERE mc.municipio_id = :municipio_id AND c.activo = 1
        """), {"municipio_id": MUNICIPIO_ID})
        categorias = result.fetchall()

        if not categorias:
            print("No hay categorías habilitadas para Chacabuco, buscando globales...")
            result = await db.execute(text("""
                SELECT id, nombre FROM categorias WHERE activo = 1 LIMIT 15
            """))
            categorias = result.fetchall()

        print(f"Encontradas {len(categorias)} categorías")
        for cat in categorias:
            print(f"  - {cat[1]}")

        # Obtener dependencias habilitadas y su mapeo con categorías
        result = await db.execute(text("""
            SELECT mdc.categoria_id, mdc.municipio_dependencia_id
            FROM municipio_dependencia_categorias mdc
            WHERE mdc.municipio_id = :municipio_id AND mdc.activo = 1
        """), {"municipio_id": MUNICIPIO_ID})
        cat_to_dep = {row[0]: row[1] for row in result.fetchall()}
        print(f"\nMapeo categoría->dependencia: {len(cat_to_dep)} asignaciones")

        # Obtener vecinos del municipio
        result = await db.execute(text("""
            SELECT id FROM usuarios
            WHERE rol = 'vecino' AND municipio_id = :municipio_id AND activo = 1
        """), {"municipio_id": MUNICIPIO_ID})
        vecinos = [r[0] for r in result.fetchall()]

        if not vecinos:
            print("No hay vecinos para Chacabuco, buscando cualquier vecino...")
            result = await db.execute(text("""
                SELECT id FROM usuarios WHERE rol = 'vecino' AND activo = 1 LIMIT 20
            """))
            vecinos = [r[0] for r in result.fetchall()]

        if not vecinos:
            print("ERROR: No hay usuarios con rol 'vecino'. Creando uno...")
            await db.execute(text("""
                INSERT INTO usuarios (nombre, email, password_hash, rol, municipio_id, activo, created_at)
                VALUES ('Vecino Demo Chacabuco', 'vecino.chacabuco@demo.com',
                        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiLXCJzLvKy2',
                        'vecino', :municipio_id, 1, NOW())
            """), {"municipio_id": MUNICIPIO_ID})
            await db.commit()
            result = await db.execute(text("""
                SELECT id FROM usuarios WHERE email = 'vecino.chacabuco@demo.com'
            """))
            vecinos = [r[0] for r in result.fetchall()]

        print(f"Encontrados {len(vecinos)} vecinos\n")

        if not categorias:
            print("ERROR: No hay categorías disponibles")
            return

        # Generar 100 reclamos
        reclamos_creados = 0
        estados_count = {e: 0 for e in ESTADOS_ACTIVOS}

        for i in range(100):
            # Seleccionar categoría aleatoria
            cat_id, cat_nombre = random.choice(categorias)

            # Buscar datos coherentes para esta categoría
            cat_data = CATEGORIA_DATA.get(cat_nombre)
            if not cat_data:
                # Buscar por coincidencia parcial
                for key in CATEGORIA_DATA.keys():
                    if key.lower() in cat_nombre.lower() or cat_nombre.lower() in key.lower():
                        cat_data = CATEGORIA_DATA[key]
                        break
            if not cat_data:
                cat_data = CATEGORIA_DATA["Otros Reclamos"]

            # Obtener dependencia asignada (si existe)
            municipio_dependencia_id = cat_to_dep.get(cat_id)

            # Seleccionar vecino creador
            creador_id = random.choice(vecinos)

            # Generar título y descripción coherentes
            titulo = random.choice(cat_data["titulos"])
            descripcion = random.choice(cat_data["descripciones"])

            # Generar dirección realista
            calle = random.choice(CALLES_CHACABUCO)
            numero = random.randint(100, 3000)
            barrio = random.choice(BARRIOS_CHACABUCO)
            direccion = f"{calle} {numero}, {barrio}, Chacabuco, Buenos Aires"

            # Coordenadas aproximadas de Chacabuco (-34.64, -60.47)
            latitud = -34.64 + random.uniform(-0.03, 0.03)
            longitud = -60.47 + random.uniform(-0.03, 0.03)

            # Estado con distribución realista
            estado = random.choices(ESTADOS_ACTIVOS, weights=ESTADO_PESOS)[0]
            estados_count[estado] += 1

            # Prioridad (1=urgente, 5=baja)
            prioridad = random.randint(1, 5)

            # Fecha de creación (últimos 60 días)
            dias_atras = random.randint(0, 60)
            horas_atras = random.randint(0, 23)
            created_at = datetime.now() - timedelta(days=dias_atras, hours=horas_atras)

            # Fecha de recibido (para estados que ya fueron procesados)
            fecha_recibido = None
            if estado in ['en_curso', 'finalizado', 'pospuesto', 'rechazado']:
                fecha_recibido = created_at + timedelta(hours=random.randint(1, 48))

            # Fecha de resolución (solo para finalizados)
            fecha_resolucion = None
            resolucion = None
            if estado == 'finalizado':
                fecha_resolucion = fecha_recibido + timedelta(days=random.randint(1, 14))
                resolucion = random.choice([
                    "Trabajo completado satisfactoriamente.",
                    "Se realizó la reparación solicitada.",
                    "Personal de la dependencia solucionó el problema.",
                    "Intervención realizada según protocolo.",
                    "Tarea finalizada, verificar en sitio."
                ])

            # Insertar reclamo
            await db.execute(text("""
                INSERT INTO reclamos (
                    municipio_id, titulo, descripcion, direccion,
                    latitud, longitud, estado, prioridad,
                    categoria_id, creador_id, municipio_dependencia_id,
                    fecha_recibido, fecha_resolucion, resolucion,
                    created_at, updated_at
                ) VALUES (
                    :municipio_id, :titulo, :descripcion, :direccion,
                    :latitud, :longitud, :estado, :prioridad,
                    :categoria_id, :creador_id, :municipio_dependencia_id,
                    :fecha_recibido, :fecha_resolucion, :resolucion,
                    :created_at, :created_at
                )
            """), {
                "municipio_id": MUNICIPIO_ID,
                "titulo": titulo,
                "descripcion": descripcion,
                "direccion": direccion,
                "latitud": latitud,
                "longitud": longitud,
                "estado": estado,
                "prioridad": prioridad,
                "categoria_id": cat_id,
                "creador_id": creador_id,
                "municipio_dependencia_id": municipio_dependencia_id,
                "fecha_recibido": fecha_recibido,
                "fecha_resolucion": fecha_resolucion,
                "resolucion": resolucion,
                "created_at": created_at
            })

            reclamos_creados += 1

            if reclamos_creados % 25 == 0:
                print(f"Creados {reclamos_creados} reclamos...")

        await db.commit()

        # Resumen
        print(f"\n{'='*50}")
        print(f"RESUMEN - 100 RECLAMOS CREADOS PARA CHACABUCO")
        print(f"{'='*50}")
        print(f"\nDistribución por estado:")
        for estado, count in estados_count.items():
            print(f"  - {estado}: {count}")
        print(f"\nTotal: {reclamos_creados} reclamos creados exitosamente!")


if __name__ == "__main__":
    asyncio.run(seed_reclamos_chacabuco())
