"""
Servicio de IA para clasificación y asistencia en reclamos municipales.
Usa Gemini (Google) como IA por defecto para clasificación inteligente.
"""
import httpx
import json
import re
from typing import List, Dict, Optional
from core.config import settings


# =============================================================================
# BASE DE DATOS DE PALABRAS CLAVE POR CATEGORÍA
# =============================================================================

CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    # === ALUMBRADO PÚBLICO ===
    'alumbrado': [
        'luz', 'luces', 'foco', 'focos', 'lampara', 'lámpara', 'lamparas', 'lámparas',
        'farola', 'farolas', 'farol', 'faroles', 'poste', 'postes', 'luminaria', 'luminarias',
        'iluminacion', 'iluminación', 'alumbrado', 'faro', 'reflector', 'reflectores',
        'apagado', 'apagada', 'apagados', 'apagadas', 'no enciende', 'no prende', 'no funciona',
        'titila', 'titilando', 'parpadea', 'parpadeando', 'intermitente', 'quemado', 'quemada',
        'fundido', 'fundida', 'oscuro', 'oscura', 'oscuridad', 'a oscuras', 'sin luz', 'falta luz',
        'poca luz', 'cable', 'cables', 'cableado', 'columna', 'brazo', 'bombilla', 'bombillo',
        'led', 'sodio', 'mercurio', 'halógeno', 'esquina oscura', 'calle oscura', 'vereda oscura',
        'alunbrado', 'iluminasion', 'lus', 'foko', 'lampra'
    ],

    # === BACHES Y CALLES ===
    'bache': [
        'bache', 'baches', 'pozo', 'pozos', 'hueco', 'huecos', 'hoyo', 'hoyos',
        'hundimiento', 'hundimientos', 'hundido', 'hundida', 'socavon', 'socavón',
        'asfalto', 'pavimento', 'calzada', 'carpeta', 'capa asfáltica', 'empedrado',
        'adoquin', 'adoquín', 'adoquines', 'adoquinado', 'ripio',
        'roto', 'rota', 'rotos', 'rotas', 'agrietado', 'agrietada', 'grieta', 'grietas',
        'rajadura', 'rajaduras', 'fisura', 'fisuras', 'deteriorado', 'deteriorada',
        'destruido', 'destruida', 'dañado', 'dañada', 'levantado', 'levantada',
        'deformado', 'deformada', 'desnivelado', 'desnivelada',
        'calle rota', 'calle en mal estado', 'calle destruida', 'calle intransitable',
        'peligroso para autos', 'rompe autos', 'rompe ruedas', 'pincha gomas',
        'vache', 'poso', 'asfaltado'
    ],

    # === AGUA Y CAÑERÍAS ===
    'agua': [
        'agua', 'aguas', 'pérdida', 'perdida', 'pérdidas', 'fuga', 'fugas',
        'derrame', 'derrames', 'filtración', 'filtracion', 'filtraciones',
        'caño', 'caños', 'cañería', 'cañerías', 'cañeria', 'tubería', 'tuberías', 'tuberia',
        'tubo', 'tubos', 'conducto', 'acueducto', 'red de agua',
        'canilla', 'canillas', 'grifo', 'grifos', 'llave de paso', 'válvula', 'valvula',
        'medidor', 'medidores', 'hidrante', 'boca de agua',
        'presión', 'presion', 'baja presión', 'sin presión', 'poca presión',
        'corte de agua', 'sin agua', 'falta agua', 'no sale agua', 'no llega agua',
        'agua sucia', 'agua turbia', 'agua marrón', 'agua marron', 'agua con olor',
        'inundación', 'inundacion', 'inundado', 'inundada', 'anegado', 'anegada',
        'charco', 'charcos', 'encharcado', 'encharcamiento', 'empozado',
        'pierde', 'pierde agua', 'gotea', 'goteando', 'goteo', 'chorrea', 'chorreando',
        'brota', 'brotando', 'sale agua', 'surge agua', 'emana',
        'reventó', 'revento', 'explotó', 'exploto', 'rompió', 'rompio',
        'cañeria', 'tueria', 'precion'
    ],

    # === CLOACAS Y DESAGÜES ===
    'cloaca': [
        'cloaca', 'cloacas', 'cloacal', 'desagüe', 'desague', 'desagües', 'desagues',
        'alcantarilla', 'alcantarillas', 'alcantarillado', 'sumidero', 'sumideros',
        'boca de tormenta', 'rejilla', 'rejillas', 'cámara', 'camara', 'pozo ciego',
        'fosa', 'fosa séptica', 'fosa septica',
        'tapado', 'tapada', 'tapados', 'tapadas', 'obstruido', 'obstruida',
        'taponado', 'taponada', 'atascado', 'atascada', 'bloqueado', 'bloqueada',
        'desborde', 'desbordes', 'desbordado', 'desbordada', 'desborda', 'rebalsa',
        'rebalsando', 'rebosando', 'emanación', 'emanacion',
        'olor', 'olores', 'hedor', 'pestilencia', 'mal olor', 'olor feo', 'olor fuerte',
        'olor nauseabundo', 'hediondo', 'apesta', 'peste', 'fétido', 'fetido',
        'gases', 'emanaciones', 'olor a podrido', 'olor a cloaca',
        'aguas servidas', 'aguas negras', 'líquido cloacal', 'liquido cloacal',
        'materia fecal', 'excrementos', 'efluentes',
        'tapa', 'tapas', 'tapa de cloaca', 'marco', 'aro',
        'cloaka', 'alsantarilla'
    ],

    # === ARBOLADO Y ESPACIOS VERDES ===
    'arbolado': [
        'árbol', 'arbol', 'árboles', 'arboles', 'arbolado', 'arboleda',
        'tronco', 'troncos', 'copa', 'copas', 'follaje',
        'rama', 'ramas', 'ramaje', 'gajo', 'gajos', 'raíz', 'raiz', 'raíces', 'raices',
        'hoja', 'hojas', 'hojarasca', 'corteza',
        'pino', 'eucalipto', 'fresno', 'tilo', 'paraíso', 'paraiso', 'plátano', 'platano',
        'jacarandá', 'jacaranda', 'ceibo', 'lapacho', 'sauce', 'álamo', 'alamo',
        'caído', 'caido', 'caída', 'caida', 'cayó', 'cayo', 'volcado', 'volcada',
        'inclinado', 'inclinada', 'torcido', 'torcida', 'a punto de caer',
        'poda', 'podar', 'necesita poda', 'sin podar', 'desprolijo',
        'seco', 'seca', 'secos', 'secas', 'muerto', 'muerta', 'marchito', 'marchita',
        'enfermo', 'enferma', 'plaga en árbol', 'hongos', 'parásitos',
        'peligroso', 'peligrosa', 'riesgo de caída',
        'verde', 'verdes', 'espacio verde', 'espacios verdes', 'área verde', 'area verde',
        'plaza', 'plazas', 'plazoleta', 'parque', 'parques', 'paseo', 'bulevar',
        'cantero', 'canteros', 'jardín', 'jardin', 'jardines', 'césped', 'cesped', 'pasto',
        'planta', 'plantas', 'plantación', 'plantacion', 'arbusto', 'arbustos', 'cerco vivo',
        'cortar', 'corte', 'desmalezar', 'desmalezado', 'maleza', 'yuyos', 'yuyo',
        'pasto alto', 'pasto crecido', 'abandonado', 'descuidado',
        'arvol', 'rramas'
    ],

    # === BASURA Y RESIDUOS ===
    'basura': [
        'basura', 'basuras', 'basural', 'basurales', 'microbasural', 'minibasural',
        'residuo', 'residuos', 'desecho', 'desechos', 'desperdicio', 'desperdicios',
        'escombros', 'cascotes', 'chatarra', 'fierros', 'hierros',
        'muebles viejos', 'colchón', 'colchon', 'electrodoméstico', 'electrodomestico',
        'neumático', 'neumatico', 'goma', 'cubiertas', 'restos de poda',
        'orgánico', 'organico', 'inorgánico', 'inorganico', 'reciclable', 'reciclables',
        'contenedor', 'contenedores', 'tacho', 'tachos', 'cesto', 'cestos',
        'papelera', 'papeleras', 'volquete', 'volquetes', 'campana', 'campanas',
        'bolsa', 'bolsas', 'bolsón', 'bolson',
        'recolección', 'recoleccion', 'no pasó', 'no paso', 'no recolectaron',
        'sin recolectar', 'falta recolección', 'acumulada', 'acumulado', 'amontonado',
        'tirada', 'tirado', 'arrojada', 'arrojado',
        'desbordado', 'desbordada', 'lleno', 'llena', 'rebalsando',
        'sucio', 'sucia', 'suciedad', 'mugre', 'inmundo', 'inmunda',
        'basurra', 'vasurero'
    ],

    # === TRÁNSITO Y SEÑALIZACIÓN ===
    'transito': [
        'tránsito', 'transito', 'tráfico', 'trafico', 'vial', 'viales',
        'circulación', 'circulacion', 'vehicular',
        'semáforo', 'semaforo', 'semáforos', 'semaforos', 'señal', 'senal',
        'señales', 'senales', 'señalización', 'senalizacion', 'señalética', 'senaletica',
        'cartel', 'carteles', 'indicador', 'indicadores',
        'pare', 'stop', 'ceda el paso', 'prohibido estacionar', 'contramano',
        'velocidad máxima', 'velocidad maxima', 'giro', 'dirección', 'direccion',
        'sentido único', 'sentido unico', 'doble mano', 'rotonda', 'flecha',
        'senda', 'sendas', 'senda peatonal', 'paso de cebra', 'cebra',
        'línea', 'linea', 'líneas', 'lineas', 'demarcación', 'demarcacion',
        'pintura', 'pintado', 'borrado', 'borroso', 'despintado',
        'lomo de burro', 'lomada', 'reductor', 'reductores', 'badén', 'baden',
        'estacionamiento', 'parking', 'cochera', 'playa',
        'bicisenda', 'ciclovía', 'ciclovia', 'carril', 'carril bici',
        'barrera', 'valla', 'guardarrail',
        'tapado', 'oculto', 'no se ve', 'falta', 'faltan', 'sin señal',
        'semafaro', 'transitto'
    ],

    # === VEREDAS Y CORDONES ===
    'vereda': [
        'vereda', 'veredas', 'acera', 'aceras', 'banqueta',
        'cordón', 'cordon', 'cordones', 'cuneta', 'cunetas',
        'baldosa', 'baldosas', 'baldosón', 'baldoson', 'mosaico', 'mosaicos',
        'cemento', 'hormigón', 'hormigon', 'concreto', 'loseta', 'losetas',
        'adoquín', 'adoquin', 'adoquines',
        'rota', 'roto', 'rotas', 'rotos', 'rajada', 'rajado', 'rajadas',
        'hundida', 'hundido', 'hundidas', 'levantada', 'levantado', 'levantadas',
        'floja', 'flojas', 'flojo', 'suelta', 'suelto', 'sueltas',
        'faltante', 'faltantes', 'sin baldosa',
        'desnivelada', 'desnivelado', 'irregular', 'peligrosa', 'peligroso',
        'agrietada', 'agrietado', 'fisura', 'fisuras',
        'rampa', 'rampas', 'rampa discapacitados', 'accesibilidad', 'accesible',
        'silla de ruedas', 'ciego', 'no vidente', 'guía', 'guia', 'podotáctil',
        'obstruida', 'obstruido', 'bloqueada', 'bloqueado', 'ocupada', 'ocupado',
        'auto en vereda', 'moto en vereda', 'vehículo', 'vehiculo',
        'levantada por raíz',
        'bereda', 'verede', 'valdosa'
    ],

    # === LIMPIEZA URBANA ===
    'limpieza': [
        'limpieza', 'limpio', 'limpia', 'limpiar', 'higiene', 'aseo',
        'barrido', 'barrer', 'baldeo', 'baldear',
        'sucio', 'sucia', 'sucios', 'sucias', 'suciedad',
        'mugre', 'mugriento', 'mugrienta', 'inmundo', 'inmunda',
        'abandono', 'abandonado', 'abandonada', 'descuido', 'descuidado', 'descuidada',
        'dejadez', 'desatención', 'desatencion',
        'tierra', 'barro', 'lodo', 'polvo', 'hojas', 'hojarasca',
        'graffiti', 'grafiti', 'pintada', 'pintadas', 'vandalismo',
        'chicle', 'chicles', 'escupitajo', 'orina', 'excremento', 'caca', 'meo',
        'vómito', 'vomito', 'mancha', 'manchas',
        'calle sucia', 'vereda sucia', 'plaza sucia', 'parque sucio',
        'esquina sucia', 'rincón sucio', 'rincon sucio',
        'necesita limpieza', 'falta limpieza', 'sin barrer', 'hace tiempo no limpian',
        'nunca limpian', 'no pasa la barredora',
        'linpieza', 'varro', 'susio'
    ],

    # === PLAGAS Y FUMIGACIÓN ===
    'plaga': [
        'plaga', 'plagas', 'infestación', 'infestacion', 'infestado', 'infestada',
        'fumigación', 'fumigacion', 'fumigado', 'fumigar', 'desinfección', 'desinfeccion',
        'control de plagas', 'desratización', 'desratizacion',
        'rata', 'ratas', 'ratón', 'raton', 'ratones', 'laucha', 'lauchas',
        'roedor', 'roedores', 'cueva', 'cuevas', 'madriguera',
        'cucaracha', 'cucarachas', 'mosquito', 'mosquitos', 'mosca', 'moscas',
        'hormiga', 'hormigas', 'hormiguero', 'araña', 'arana', 'arañas', 'aranas',
        'avispa', 'avispas', 'avispero', 'abeja', 'abejas', 'panal', 'enjambre',
        'pulga', 'pulgas', 'garrapata', 'garrapatas', 'chinche', 'chinches',
        'alacrán', 'alacran', 'alacranes', 'escorpión', 'escorpion',
        'vinchuca', 'vinchucas', 'polilla', 'polillas', 'termita', 'termitas',
        'bicho', 'bichos', 'insecto', 'insectos',
        'murciélago', 'murcielago', 'murciélagos', 'murcielagos',
        'paloma', 'palomas', 'excremento de paloma',
        'serpiente', 'víbora', 'vibora',
        'invasión', 'invasion', 'muchos', 'muchas', 'cantidad', 'montón', 'monton',
        'picadura', 'picaduras', 'mordedura', 'mordeduras',
        'dengue', 'hantavirus', 'leptospirosis',
        'rrata', 'cucarracha', 'fumigasion'
    ],

    # === EDIFICIOS Y OBRAS PÚBLICAS ===
    'edificio': [
        'edificio', 'edificios', 'construcción', 'construccion', 'obra', 'obras',
        'inmueble', 'propiedad', 'estructura',
        'municipal', 'público', 'publico', 'escuela', 'hospital', 'centro de salud',
        'biblioteca', 'museo', 'teatro', 'polideportivo', 'gimnasio',
        'comisaría', 'comisaria', 'bomberos', 'destacamento',
        'grieta', 'grietas', 'rajadura', 'rajaduras', 'fisura', 'fisuras',
        'humedad', 'goteras', 'gotera', 'filtración', 'filtracion',
        'derrumbe', 'desmoronamiento', 'caída', 'caida', 'peligro de derrumbe',
        'deterioro', 'deteriorado', 'deteriorada',
        'techo', 'techos', 'tejado', 'pared', 'paredes', 'muro', 'muros',
        'puerta', 'puertas', 'ventana', 'ventanas', 'vidrio', 'vidrios',
        'escalera', 'escaleras', 'baranda', 'barandas', 'pasamanos',
        'ascensor', 'elevador',
        'vandalizado', 'vandalizada', 'grafiteado',
        'edifico', 'contruccion', 'edeficio'
    ],

    # === MOBILIARIO URBANO ===
    'mobiliario': [
        'mobiliario', 'mobiliario urbano', 'equipamiento',
        'banco', 'bancos', 'asiento', 'asientos', 'silla', 'sillas',
        'mesa', 'mesas', 'mesita', 'bebedero', 'bebederos', 'fuente', 'fuentes',
        'papelera', 'papeleras', 'cesto', 'cestos', 'tacho', 'tachos',
        'bicicletero', 'bicicleteros', 'estacionamiento bici',
        'parada', 'paradas', 'refugio', 'refugios', 'garita', 'garitas',
        'kiosco', 'quiosco', 'pérgola', 'pergola', 'glorieta', 'gazebo',
        'juego', 'juegos', 'hamaca', 'hamacas', 'tobogán', 'tobogan', 'calesita',
        'sube y baja', 'trepadoras', 'arenero',
        'aparato', 'aparatos', 'gimnasio', 'estación saludable', 'estacion saludable',
        'columna', 'columnas', 'mástil', 'mastil',
        'cartelera', 'carteleras', 'panel', 'paneles', 'pantalla',
        'reloj', 'relojes', 'termómetro', 'termometro',
        'oxidado', 'oxidada', 'herrumbrado', 'desvencijado',
        'robado', 'robada', 'desaparecido',
        'moviliario', 'papelero'
    ],

    # === RUIDOS Y CONTAMINACIÓN SONORA ===
    'ruido': [
        'ruido', 'ruidos', 'sonido', 'sonidos', 'bulla', 'bullicio',
        'contaminación sonora', 'contaminacion sonora', 'acústica', 'acustica',
        'fuerte', 'fuertes', 'alto', 'altos', 'excesivo', 'excesivos',
        'molesto', 'molesta', 'molestos', 'molestas', 'insoportable', 'ensordecedor',
        'música', 'musica', 'parlante', 'parlantes', 'equipo de música',
        'fiesta', 'fiestas', 'boliche', 'bar', 'local', 'comercio',
        'motor', 'motores', 'escape', 'caño de escape', 'moto', 'motos',
        'camión', 'camion', 'camiones', 'máquina', 'maquina', 'maquinaria',
        'martillo', 'taladro',
        'perro', 'perros', 'ladrido', 'ladridos', 'ladra', 'ladran',
        'alarma', 'alarmas', 'sirena', 'sirenas', 'bocina', 'bocinas',
        'noche', 'nocturno', 'madrugada', 'tarde', 'mediodía', 'mediodia',
        'todo el día', 'todo el dia', 'constante', 'permanente', 'siempre',
        'no puedo dormir', 'no deja dormir', 'afecta', 'perturba',
        'rruido', 'bullisio', 'musika'
    ],

    # === ANIMALES ===
    'animal': [
        'animal', 'animales', 'mascota', 'mascotas', 'fauna',
        'perro', 'perros', 'can', 'canes', 'canino', 'caninos',
        'perro suelto', 'perros sueltos', 'perro callejero', 'perro abandonado',
        'jauría', 'jauria', 'manada', 'perro peligroso', 'perro agresivo',
        'mordedura', 'mordió', 'mordio', 'ataque', 'atacó', 'ataco',
        'gato', 'gatos', 'felino', 'felinos', 'gato callejero', 'colonia de gatos',
        'caballo', 'caballos', 'equino', 'yegua', 'potro',
        'vaca', 'vacas', 'ganado', 'bovino',
        'cerdo', 'cerdos', 'chancho', 'chanchos',
        'herido', 'herida', 'lastimado', 'lastimada', 'enfermo', 'enferma',
        'muerto', 'muerta', 'atropellado', 'atropellada', 'cadáver', 'cadaver',
        'restos', 'cuerpo',
        'excremento', 'excrementos', 'caca', 'heces', 'bosta',
        'orín', 'orin', 'orina', 'meado',
        'suelta', 'sueltos', 'sin correa', 'sin bozal',
        'zoonosis', 'vacunación', 'vacunacion', 'castración', 'castracion',
        'adopción', 'adopcion', 'refugio',
        'gatto'
    ],

    # === SEGURIDAD ===
    'seguridad': [
        'seguridad', 'inseguridad', 'peligro', 'peligroso', 'peligrosa',
        'riesgo', 'riesgoso', 'riesgosa',
        'abandonado', 'abandonada', 'deshabitado', 'deshabitada',
        'terreno baldío', 'terreno baldio', 'lote baldío', 'lote baldio',
        'casa abandonada', 'edificio abandonado', 'tapera',
        'usurpado', 'usurpada', 'intrusos', 'ocupas',
        'oscuro', 'oscura', 'sin luz', 'poca luz', 'mal iluminado',
        'vandalismo', 'vandalizado', 'destrozado', 'destruido',
        'graffiti', 'grafiti', 'pintada', 'rayado',
        'vidrio roto', 'vidrios rotos',
        'cámara', 'camara', 'cámaras', 'camaras', 'vigilancia', 'monitoreo',
        'patrullaje', 'presencia policial', 'ronda',
        'segurida', 'peligrozo', 'bandalismo'
    ]
}


def normalize_text(text: str) -> str:
    """Normaliza texto para comparación (minúsculas, sin acentos)"""
    import unicodedata
    text = text.lower()
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    return text


# Mapeo de keywords a nombres de categorías (para matching flexible)
KEYWORD_TO_CATEGORY = {
    'alumbrado': ['alumbrado', 'luz', 'luminaria', 'foco', 'farola', 'poste'],
    'bache': ['bache', 'calle', 'asfalto', 'pavimento', 'calzada', 'hundimiento'],
    'agua': ['agua', 'caneria', 'perdida', 'fuga', 'tuberia', 'cano'],
    'cloaca': ['cloaca', 'desague', 'alcantarilla', 'desborde', 'olor'],
    'arbolado': ['arbol', 'poda', 'rama', 'verde', 'plaza', 'parque', 'espacio'],
    'basura': ['basura', 'residuo', 'recoleccion', 'contenedor', 'escombro'],
    'transito': ['transito', 'senal', 'semaforo', 'cartel', 'senda'],
    'vereda': ['vereda', 'baldosa', 'cordon', 'rampa', 'acera'],
    'plaga': ['plaga', 'rata', 'cucaracha', 'mosquito', 'fumigacion', 'roedor', 'insecto'],
    'ruido': ['ruido', 'sonido', 'musica', 'molesto', 'bulla'],
    'animal': ['animal', 'perro', 'gato', 'suelto', 'mordedura', 'abandonado'],
    'seguridad': ['seguridad', 'abandonado', 'peligro', 'vandalismo'],
}


def clasificar_local(texto: str, categorias: List[Dict]) -> List[Dict]:
    """
    Clasificación rápida usando palabras clave locales.
    Retorna las 3 mejores categorías con su score.
    """
    if not texto or len(texto) < 3:
        return []

    normalized_text = normalize_text(texto)
    scores = []

    for categoria in categorias:
        cat_name = normalize_text(categoria['nombre'])
        score = 0

        # Buscar coincidencias usando CATEGORY_KEYWORDS
        for key, keywords in CATEGORY_KEYWORDS.items():
            # Verificar si esta key corresponde a esta categoría
            match_cat = False
            # Mapeo directo de key a nombre de categoría
            if key in KEYWORD_TO_CATEGORY:
                for word in KEYWORD_TO_CATEGORY[key]:
                    if word in cat_name:
                        match_cat = True
                        break

            if match_cat:
                for keyword in keywords:
                    normalized_keyword = normalize_text(keyword)
                    if normalized_keyword in normalized_text:
                        score += 1 + (len(keyword) // 5)

        # Bonus si palabras del nombre de la categoría están en el texto
        cat_words = cat_name.split()
        for word in cat_words:
            if len(word) > 3 and word in normalized_text:
                score += 3

        if score > 0:
            scores.append({
                'categoria_id': categoria['id'],
                'categoria_nombre': categoria['nombre'],
                'score': score,
                'metodo': 'local'
            })

    # Ordenar por score y retornar top 3
    scores.sort(key=lambda x: x['score'], reverse=True)
    return scores[:3]


async def clasificar_con_gemini(texto: str, categorias: List[Dict]) -> Optional[List[Dict]]:
    """
    Clasificación usando Gemini (Google) - IA por defecto.
    Se usa cuando el matching local no es suficiente.
    """
    if not settings.GEMINI_API_KEY:
        return None

    # Construir lista de categorías
    cats_list = "\n".join([f"- ID {c['id']}: {c['nombre']}" for c in categorias])

    prompt = f"""Eres un asistente que clasifica reclamos municipales argentinos.

TEXTO DEL RECLAMO:
"{texto}"

CATEGORÍAS DISPONIBLES:
{cats_list}

Analiza el texto y devuelve las 3 categorías más probables en formato JSON.
Responde SOLO con un JSON válido, sin explicaciones:
[
  {{"categoria_id": <id>, "categoria_nombre": "<nombre>", "confianza": <0-100>}},
  {{"categoria_id": <id>, "categoria_nombre": "<nombre>", "confianza": <0-100>}},
  {{"categoria_id": <id>, "categoria_nombre": "<nombre>", "confianza": <0-100>}}
]

Si el texto no describe un reclamo municipal claro, devuelve un array vacío: []"""

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}",
                headers={
                    "Content-Type": "application/json"
                },
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.1,
                        "maxOutputTokens": 1000,
                    }
                }
            )

            if response.status_code == 200:
                data = response.json()
                text_response = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')

                # Extraer JSON de la respuesta
                json_match = re.search(r'\[[\s\S]*\]', text_response)
                if json_match:
                    result = json.loads(json_match.group())
                    # Agregar metodo
                    for item in result:
                        item['metodo'] = 'gemini'
                        item['score'] = item.get('confianza', 50)
                    return result

            return None

    except Exception as e:
        print(f"Error en Gemini: {e}")
        return None


async def clasificar_con_groq(texto: str, categorias: List[Dict]) -> Optional[List[Dict]]:
    """
    Clasificación usando Groq (API rápida con Llama) - alternativa a Gemini.
    """
    if not settings.GROK_API_KEY:
        return None

    # Construir lista de categorías
    cats_list = "\n".join([f"- ID {c['id']}: {c['nombre']}" for c in categorias])

    prompt = f"""Eres un asistente que clasifica reclamos municipales argentinos.

TEXTO DEL RECLAMO:
"{texto}"

CATEGORÍAS DISPONIBLES:
{cats_list}

Analiza el texto y devuelve las 3 categorías más probables en formato JSON.
Responde SOLO con un JSON válido, sin explicaciones:
[
  {{"categoria_id": <id>, "categoria_nombre": "<nombre>", "confianza": <0-100>}},
  {{"categoria_id": <id>, "categoria_nombre": "<nombre>", "confianza": <0-100>}},
  {{"categoria_id": <id>, "categoria_nombre": "<nombre>", "confianza": <0-100>}}
]

Si el texto no describe un reclamo municipal claro, devuelve un array vacío: []"""

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.GROK_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": settings.GROK_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": 300,
                }
            )

            if response.status_code == 200:
                data = response.json()
                text_response = data.get('choices', [{}])[0].get('message', {}).get('content', '')

                # Extraer JSON de la respuesta
                json_match = re.search(r'\[[\s\S]*\]', text_response)
                if json_match:
                    result = json.loads(json_match.group())
                    for item in result:
                        item['metodo'] = 'groq'
                        item['score'] = item.get('confianza', 50)
                    return result

            return None

    except Exception as e:
        print(f"Error en Groq: {e}")
        return None


async def clasificar_reclamo(texto: str, categorias: List[Dict], usar_ia: bool = True) -> Dict:
    """
    Clasificación: usa IA si está habilitada, sino local.
    Prioridad de IA: Groq > Gemini > local

    Args:
        texto: Título y/o descripción del reclamo
        categorias: Lista de categorías del municipio
        usar_ia: Si usar IA para clasificar (True = siempre IA si disponible)

    Returns:
        Dict con sugerencias y metadata
    """
    # 1. Calcular clasificación local como backup
    local_results = clasificar_local(texto, categorias)

    # 2. Si usar_ia está habilitado, intentar IA directamente
    ia_results = None
    ia_metodo = None

    if usar_ia:
        # Intentar Groq primero (más rápido)
        if settings.GROK_API_KEY:
            ia_results = await clasificar_con_groq(texto, categorias)
            if ia_results:
                ia_metodo = 'groq'

        # Si Groq no funcionó, intentar Gemini como fallback
        if not ia_results and settings.GEMINI_API_KEY:
            ia_results = await clasificar_con_gemini(texto, categorias)
            if ia_results:
                ia_metodo = 'gemini'

    # 4. Combinar resultados
    if ia_results:
        return {
            'sugerencias': ia_results,
            'metodo_principal': ia_metodo,
            'local_backup': local_results
        }
    else:
        return {
            'sugerencias': local_results,
            'metodo_principal': 'local',
            'ia_disponible': bool(settings.GROK_API_KEY or settings.GEMINI_API_KEY)
        }


