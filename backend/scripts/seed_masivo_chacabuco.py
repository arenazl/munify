"""
Script MASIVO para generar datos de prueba para Chacabuco (municipio_id=7)
- 3000 reclamos con descripciones coherentes
- 2000 solicitudes de tramites

Ejecutar: python -m scripts.seed_masivo_chacabuco
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
CANTIDAD_RECLAMOS = 3000
CANTIDAD_SOLICITUDES = 2000

# ============================================================================
# DATOS PARA RECLAMOS - 15 Categorias con datos coherentes expandidos
# ============================================================================
CATEGORIA_DATA = {
    "Baches y Calzadas": {
        "titulos": [
            "Bache peligroso en esquina", "Calle destruida por lluvia", "Pozo enorme en calzada",
            "Asfalto hundido frente a mi casa", "Bache que crece cada dia", "Calle intransitable",
            "Pozo profundo en cruce", "Bache frente a la escuela", "Calle con multiples pozos",
            "Hundimiento de pavimento grave", "Crater en avenida principal", "Bache cerca del hospital",
            "Roturas en calle de tierra", "Bache que dano mi auto", "Calle sin asfaltar deteriorada",
            "Pozo gigante sin senalizar", "Bache en entrada de barrio", "Calle comercial destruida",
            "Multiples baches consecutivos", "Calzada con grietas profundas"
        ],
        "descripciones": [
            "Hay un bache muy grande que ya dano varios autos, es urgente repararlo.",
            "La calle esta completamente destruida despues de las ultimas lluvias, no se puede circular.",
            "El pozo es muy profundo y peligroso, especialmente de noche que no se ve.",
            "El asfalto se hundio dejando un desnivel importante que dana los vehiculos.",
            "Este bache crece con cada lluvia, hay que arreglarlo antes de que sea peor.",
            "La calle esta en pesimo estado, necesita bacheo urgente.",
            "En el cruce hay un bache muy grande que causa problemas a todos los vehiculos.",
            "Hay un bache grande frente a la escuela, los chicos pueden lastimarse al cruzar.",
            "La calle tiene multiples pozos que hacen imposible circular normalmente.",
            "El pavimento se hundio varios centimetros, es muy peligroso.",
            "El bache ya tiene mas de un mes y nadie lo repara, cada vez es mas grande.",
            "Los colectivos tienen que esquivar este crater todos los dias.",
            "Despues de la ultima tormenta la calle quedo intransitable con baches enormes.",
            "Mi auto se dano al pasar por este bache, necesito que lo arreglen urgente.",
            "La calle nunca fue asfaltada bien y ahora esta llena de pozos.",
            "Hay un pozo que ocupa casi todo el ancho de la calle, muy peligroso.",
            "El bache esta justo en la entrada del barrio, todos los vecinos nos quejamos.",
            "Los comercios pierden clientes porque la calle esta destruida.",
            "Hay una sucesion de baches que obliga a ir a paso de hombre.",
            "Las grietas en el asfalto son profundas y peligrosas para motos y bicicletas."
        ]
    },
    "Iluminacion Publica": {
        "titulos": [
            "Luminaria apagada hace dias", "Poste de luz sin funcionar", "Falta luz en toda la cuadra",
            "Lampara quemada en esquina", "Zona muy oscura de noche", "Poste inclinado peligroso",
            "Cable de luz colgando bajo", "Luz titilante muy molesta", "Luminaria vandalizada",
            "Poste con luz intermitente", "Sin iluminacion en plaza", "Farola rota por tormenta",
            "Cables expuestos peligrosos", "Falta luz en parada de colectivo", "Poste oxidado a punto de caer",
            "Luminaria LED quemada", "Zona insegura por falta de luz", "Farol antiguo sin funcionar",
            "Toda la manzana a oscuras", "Reflector de plaza apagado"
        ],
        "descripciones": [
            "El poste de luz no funciona desde hace una semana, la zona queda muy oscura.",
            "La lampara esta quemada y necesita reemplazo urgente para nuestra seguridad.",
            "Toda la cuadra esta sin iluminacion, es muy peligroso caminar de noche.",
            "En la esquina la luminaria no enciende, es un punto ciego muy inseguro.",
            "Esta zona no tiene ninguna luz, necesitamos iluminacion urgente.",
            "El poste esta muy inclinado y puede caerse, ademas no funciona.",
            "Hay un cable de luz que cuelga bajo, es peligroso para peatones.",
            "La luz titila constantemente, ademas de molesto puede danar la vista.",
            "Rompieron la luminaria y quedamos sin luz en la cuadra.",
            "El poste enciende y apaga sin control, necesita revision.",
            "La plaza queda completamente a oscuras, es zona de robos.",
            "La tormenta rompio la farola y nadie vino a arreglarla.",
            "Hay cables pelados colgando del poste, es muy peligroso.",
            "La parada del colectivo no tiene luz, es inseguro esperar de noche.",
            "El poste esta tan oxidado que puede caerse en cualquier momento.",
            "Las nuevas luminarias LED se quemaron al poco tiempo de instalarlas.",
            "Han robado varias veces en esta zona porque no hay iluminacion.",
            "El farol antiguo nunca fue reemplazado y ya no funciona.",
            "Hace un mes que toda la manzana esta sin luz, es urgente.",
            "El reflector de la plaza deportiva no enciende, no se puede jugar de noche."
        ]
    },
    "Recoleccion de Residuos": {
        "titulos": [
            "Basura acumulada en esquina", "No paso el camion hace dias", "Contenedor desbordado",
            "Microbasural en terreno", "Falta contenedor en la cuadra", "Residuos en la vereda",
            "Bolsas rotas por animales", "Olor insoportable por basura", "Acumulacion de residuos",
            "Basura desparramada", "Contenedor roto sin tapa", "Camion no pasa los feriados",
            "Residuos de poda sin retirar", "Basura electronica abandonada", "Escombros en la vereda",
            "Contenedor lleno de moscas", "Reciclables sin recolectar", "Basura en cuneta",
            "Residuos de obra abandonados", "Camion pasa muy temprano"
        ],
        "descripciones": [
            "Hay mucha basura acumulada en la esquina, no la retiraron desde hace varios dias.",
            "El camion de basura no paso por nuestra cuadra desde la semana pasada.",
            "El contenedor esta desbordado y la basura cae al piso, atrae plagas.",
            "Se formo un microbasural en el terreno baldio, la gente tira basura constantemente.",
            "Necesitamos un contenedor en esta cuadra, actualmente no hay ninguno.",
            "Dejaron residuos en la vereda y nadie los levanta, obstruye el paso.",
            "Los perros rompen las bolsas de basura y queda todo desparramado.",
            "El olor es insoportable por la basura acumulada, hay muchas moscas.",
            "Hace varios dias que se acumula la basura, necesitamos recoleccion urgente.",
            "La basura quedo toda desparramada por el viento, hay que limpiar.",
            "El contenedor esta roto y sin tapa, la basura se vuela por todo el barrio.",
            "Cuando hay feriado el camion no pasa y la basura se acumula por dias.",
            "Pode los arboles hace dos semanas y nadie retiro las ramas.",
            "Alguien abandono electrodomesticos viejos en la esquina.",
            "Dejaron escombros de una obra en la vereda y nadie los retira.",
            "El contenedor esta infestado de moscas, hay que fumigarlo y limpiarlo.",
            "Separamos los reciclables pero el camion nunca los lleva.",
            "La cuneta esta llena de basura que arrastra el agua cuando llueve.",
            "Abandonaron residuos de construccion en la via publica.",
            "El camion pasa a las 5am y muchos vecinos no llegamos a sacar la basura."
        ]
    },
    "Espacios Verdes": {
        "titulos": [
            "Plaza abandonada sin mantenimiento", "Juegos infantiles rotos", "Pasto muy alto en plaza",
            "Bancos de plaza destruidos", "Falta iluminacion en plaza", "Bebedero sin funcionar",
            "Cerco perimetral roto", "Juegos oxidados peligrosos", "Arboles sin podar",
            "Riego automatico roto", "Cesped seco por falta de agua", "Canteros abandonados",
            "Grafitis en juegos de plaza", "Falta sombra en plaza", "Basura en espacio verde",
            "Hamaca rota peligrosa", "Tobogan con partes rotas", "Piso de goma deteriorado",
            "Fuente de agua vandalizada", "Senderos de plaza destruidos"
        ],
        "descripciones": [
            "La plaza esta completamente abandonada, necesita mantenimiento urgente.",
            "Los juegos para chicos estan rotos y son peligrosos, pueden lastimarse.",
            "El pasto esta tan alto que no se puede usar la plaza, hay que cortarlo.",
            "Los bancos de la plaza estan destruidos, no hay donde sentarse.",
            "La plaza no tiene luz de noche, es peligroso e inseguro.",
            "El bebedero no funciona, los chicos no tienen donde tomar agua.",
            "El cerco de la plaza esta roto, entran perros y es peligroso.",
            "Los juegos estan muy oxidados y tienen partes cortantes, es urgente.",
            "Los arboles necesitan poda, las ramas bajas son peligrosas.",
            "El sistema de riego esta roto y las plantas se estan secando.",
            "El cesped se seco completamente porque nadie riega la plaza.",
            "Los canteros estan llenos de yuyos y basura, muy descuidados.",
            "Pintaron grafitis en todos los juegos de la plaza.",
            "No hay arboles grandes que den sombra, es imposible estar en verano.",
            "La plaza esta llena de basura, botellas y restos de comida.",
            "La hamaca tiene la cadena rota, un nene puede caerse.",
            "El tobogan tiene partes metalicas filosas, es muy peligroso.",
            "El piso de goma esta todo roto, los chicos se lastiman.",
            "Rompieron la fuente de agua y ahora esta toda vandalizada.",
            "Los senderos internos de la plaza estan destruidos, llenos de pozos."
        ]
    },
    "Agua y Cloacas": {
        "titulos": [
            "Perdida de agua en la calle", "Cano roto en vereda", "Sin presion de agua",
            "Agua marron del grifo", "Inundacion por cano roto", "Sin agua hace dias",
            "Cloaca desbordada", "Olor terrible a cloaca", "Tapa de cloaca rota",
            "Boca de tormenta tapada", "Perdida en canilla publica", "Medidor de agua roto",
            "Agua con olor a cloro fuerte", "Cloaca tapada en esquina", "Falta conexion de agua",
            "Pozo ciego colapsado", "Agua de pozo contaminada", "Perdida subterranea",
            "Desague pluvial obstruido", "Camara de cloaca destruida"
        ],
        "descripciones": [
            "Hay una perdida de agua importante en la calle, se desperdicia mucha agua.",
            "Se rompio un cano en la vereda y sale agua constantemente.",
            "No tenemos presion de agua, apenas sale un hilito de la canilla.",
            "El agua sale marron y con olor, no se puede usar para nada.",
            "Un cano roto inundo toda la cuadra, necesitamos reparacion urgente.",
            "Estamos sin agua desde hace varios dias, es una emergencia.",
            "La cloaca se desbordo y hay aguas servidas en la calle.",
            "Sale olor horrible a cloaca por los desagues, es insoportable.",
            "La tapa de la cloaca esta rota y es un peligro para peatones.",
            "La boca de tormenta esta tapada y se inunda todo cuando llueve.",
            "La canilla publica de la plaza pierde agua las 24 horas.",
            "El medidor de agua de mi casa esta roto y marca mal.",
            "El agua viene con olor a cloro muy fuerte, no se puede tomar.",
            "La cloaca de la esquina esta tapada y rebalsa constantemente.",
            "Hace meses que esperamos la conexion de agua potable.",
            "El pozo ciego colapso y contamina el terreno.",
            "El agua del pozo sale con olor raro, puede estar contaminada.",
            "Hay una perdida subterranea que hace que la calle este siempre mojada.",
            "Cuando llueve se inunda todo porque el desague pluvial esta tapado.",
            "La camara de cloaca tiene la tapa rota y el pozo abierto."
        ]
    },
    "Semaforos y Senalizacion Vial": {
        "titulos": [
            "Semaforo apagado en cruce", "Cartel de PARE caido", "Senal vial vandalizada",
            "Semaforo desincronizado", "Falta senal de velocidad", "Cartel ilegible",
            "Semaforo parpadeando", "Lomo de burro sin senalizar", "Senalizacion borrada",
            "Semaforo peatonal roto", "Falta cartel de calle", "Semaforo con tiempos cortos",
            "Senal de STOP tapada por arbol", "Flecha de giro danada", "Semaforo sin luz verde",
            "Cartel de direccion mal puesto", "Falta senalizacion en escuela", "Reflectores viales rotos",
            "Semaforo suena muy fuerte", "Senales horizontales borradas"
        ],
        "descripciones": [
            "El semaforo esta completamente apagado, es muy peligroso cruzar.",
            "El cartel de PARE se cayo y los autos no paran, hubo casi accidentes.",
            "Vandalizaron la senal de transito y no se puede leer.",
            "Los semaforos estan desincronizados, se forma mucho caos vehicular.",
            "Falta la senal de velocidad maxima, los autos pasan muy rapido.",
            "El cartel esta tan viejo y despintado que no se puede leer.",
            "El semaforo parpadea en amarillo todo el tiempo, no regula el transito.",
            "Hay un lomo de burro sin senalizar, los autos pasan rapido y saltan.",
            "La senalizacion horizontal esta completamente borrada.",
            "El semaforo peatonal no funciona, es dificil cruzar con seguridad.",
            "Falta el cartel con el nombre de la calle en la esquina.",
            "El semaforo da muy poco tiempo para cruzar, los ancianos no llegan.",
            "Las ramas del arbol tapan completamente la senal de STOP.",
            "La flecha de giro a la derecha esta rota y confunde.",
            "El semaforo no tiene luz verde, solo roja y amarilla.",
            "El cartel de direccion apunta para el lado equivocado.",
            "Falta senalizacion de zona escolar, los autos van muy rapido.",
            "Los reflectores del lomo de burro estan todos rotos.",
            "El sonido del semaforo para ciegos esta demasiado fuerte.",
            "Las lineas de la cebra peatonal estan completamente borradas."
        ]
    },
    "Zoonosis y Animales": {
        "titulos": [
            "Perro suelto agresivo", "Jauria de perros en barrio", "Gatos abandonados",
            "Animal muerto en calle", "Perros que ladran toda la noche", "Nido de abejas grande",
            "Plaga de palomas", "Perro perdido con collar", "Animales en terreno baldio",
            "Animal herido en la calle", "Colonia de gatos sin control", "Murciélagos en casa",
            "Perros sin vacunar", "Caballo suelto en ruta", "Roedores en la cuadra",
            "Perros de vecino sin correa", "Animales muertos en baldio", "Enjambre de abejas",
            "Perro atropellado", "Gatos que entran a las casas"
        ],
        "descripciones": [
            "Hay un perro suelto muy agresivo que ataca a la gente, es peligroso.",
            "Una jauria de perros se instalo en el barrio, atacan a otros animales.",
            "Abandonaron varios gatos que necesitan ser rescatados urgente.",
            "Hay un animal muerto en la calle desde hace dias, nadie lo retira.",
            "Los perros del vecino ladran toda la noche, no podemos descansar.",
            "Hay un panal de abejas muy grande, es peligroso para los vecinos.",
            "Las palomas se convirtieron en plaga, ensucian todo y transmiten enfermedades.",
            "Encontre un perro perdido con collar, necesito ayuda para ubicar al dueno.",
            "En el terreno baldio hay muchos animales abandonados sin cuidado.",
            "Hay un perro herido en la calle que necesita atencion veterinaria.",
            "Hay una colonia de gatos que crece sin control, necesitan castrarlos.",
            "Entraron murcielagos a la casa, necesitamos que los retiren.",
            "Hay perros callejeros sin vacunar que pueden transmitir rabia.",
            "Hay un caballo suelto en la ruta que es peligroso para los autos.",
            "Se ven muchas ratas en la cuadra, necesitamos control de roedores.",
            "El vecino saca a pasear sus perros sin correa y son agresivos.",
            "En el baldio hay varios animales muertos, huele muy mal.",
            "Se formo un enjambre de abejas en un arbol de la vereda.",
            "Atropellaron un perro y nadie lo retira de la calle.",
            "Gatos callejeros se meten en las casas y rompen todo."
        ]
    },
    "Veredas y Baldios": {
        "titulos": [
            "Vereda completamente rota", "Baldosas flojas peligrosas", "Vereda hundida",
            "Falta rampa para discapacitados", "Vereda levantada por raices", "Escalon muy alto",
            "Terreno baldio abandonado", "Vereda obstruida", "Baldosas faltantes",
            "Baldio con yuyos muy altos", "Vereda angosta", "Baldio usado como basural",
            "Vereda con desniveles", "Arbol que rompe vereda", "Baldio con alimanas",
            "Vereda sin construir", "Materiales obstruyendo paso", "Baldio con agua estancada",
            "Vereda resbaladiza", "Baldio con construccion abandonada"
        ],
        "descripciones": [
            "La vereda esta toda rota, es muy dificil caminar sin tropezarse.",
            "Las baldosas estan flojas y salen cuando uno pisa, es muy peligroso.",
            "La vereda se hundio dejando un desnivel que es trampa para peatones.",
            "En la esquina falta la rampa para discapacitados y cochecitos.",
            "Las raices de los arboles levantaron toda la vereda, no se puede caminar.",
            "Hay un escalon muy alto entre propiedades que es peligroso.",
            "El terreno baldio esta completamente abandonado, lleno de basura y ratas.",
            "Hay materiales de construccion obstruyendo toda la vereda.",
            "Faltan varias baldosas, quedaron los huecos que son peligrosos.",
            "El baldio tiene yuyos de mas de un metro, hay viboras y alimanass.",
            "La vereda es tan angosta que no pasan dos personas.",
            "El baldio lo usan para tirar basura, es un foco de infeccion.",
            "La vereda tiene muchos desniveles, es peligroso para ancianos.",
            "El arbol crecio tanto que levanto y rompio toda la vereda.",
            "En el baldio hay ratas, cucarachas y hasta viboras.",
            "El propietario nunca construyo la vereda, caminamos por el barro.",
            "Dejaron arena y ladrillos en la vereda que impiden el paso.",
            "El baldio tiene agua estancada que cria mosquitos.",
            "La vereda esta muy lisa y cuando llueve es resbaladiza.",
            "Hay una construccion abandonada en el baldio que es peligrosa."
        ]
    },
    "Ruidos Molestos": {
        "titulos": [
            "Musica fuerte de vecino", "Obra fuera de horario", "Alarma que no para",
            "Fiesta hasta la madrugada", "Local con musica muy alta", "Taller mecanico ruidoso",
            "Generador hace mucho ruido", "Perros que ladran sin parar", "Cano de escape ruidoso",
            "Ruidos de construccion", "Karaoke todas las noches", "Discoteca sin aislacion",
            "Fabrica ruidosa en zona residencial", "Maquinas agricolas de madrugada", "Camiones de carga a la noche",
            "Vecino grita todo el tiempo", "Ruido de aire acondicionado", "Motores en taller clandestino",
            "Fiestas clandestinas frecuentes", "Ruidos en departamento de arriba"
        ],
        "descripciones": [
            "El vecino pone musica muy fuerte a cualquier hora, no podemos descansar.",
            "Estan haciendo obra fuera del horario permitido, hacen ruido de noche.",
            "Hay una alarma de auto que suena sin parar desde hace horas.",
            "Todos los fines de semana hacen fiesta hasta las 5 de la manana.",
            "El local de la esquina tiene la musica altisima, tiemblan las paredes.",
            "El taller mecanico hace ruido muy fuerte todo el dia.",
            "El generador de un comercio hace un ruido insoportable.",
            "Los perros del vecino ladran sin parar dia y noche.",
            "Pasan motos con cano de escape libre haciendo mucho ruido.",
            "La construccion hace ruido desde muy temprano y hasta tarde.",
            "Hacen karaoke todas las noches hasta cualquier hora.",
            "La discoteca no tiene aislacion acustica y el ruido es tremendo.",
            "La fabrica hace un ruido constante que no nos deja descansar.",
            "Las maquinas agricolas pasan de madrugada haciendo mucho ruido.",
            "Los camiones de carga descargan a la noche con mucho ruido.",
            "El vecino grita constantemente, se escucha todo.",
            "El aire acondicionado del comercio hace un ruido insoportable.",
            "Hay un taller clandestino donde prueban motores a toda hora.",
            "Hacen fiestas clandestinas los fines de semana, mucho ruido.",
            "El vecino de arriba hace ruido todo el tiempo, no respeta horarios."
        ]
    },
    "Limpieza Urbana": {
        "titulos": [
            "Calle sin barrer hace semanas", "Hojas acumuladas en cordon", "Desechos en via publica",
            "Canal de desague sucio", "Aceite derramado en calle", "Escombros abandonados",
            "Grafitis en pared publica", "Cartel publicitario abandonado", "Basura en cantero",
            "Suciedad general en cuadra", "Vidrios rotos en vereda", "Agua sucia estancada",
            "Carteles viejos sin retirar", "Propaganda politica vieja", "Manchas de pintura en vereda",
            "Residuos de feria", "Basura de evento municipal", "Suciedad en plaza comercial",
            "Chicles en toda la vereda", "Restos de construccion sin limpiar"
        ],
        "descripciones": [
            "La calle no se barre desde hace semanas, hay mucha suciedad acumulada.",
            "Las hojas se acumularon en el cordon y tapan los desagues.",
            "Hay desechos de construccion abandonados en la via publica.",
            "El canal de desague esta muy sucio, hay olor y mosquitos.",
            "Derramaron aceite en la calle y nadie lo limpio, es resbaloso.",
            "Dejaron escombros de una obra abandonados en la vereda.",
            "Hay grafitis en la pared del edificio publico, queda muy feo.",
            "Un cartel publicitario viejo esta abandonado y roto.",
            "El cantero esta lleno de basura y botellas de vidrio.",
            "La cuadra esta muy sucia en general, necesita limpieza.",
            "Hay vidrios rotos en la vereda desde hace dias, es peligroso.",
            "Se acumulo agua sucia que atrae mosquitos y huele mal.",
            "Hay carteles viejos que nadie retira, se ven muy mal.",
            "La propaganda politica de hace meses sigue pegada en todos lados.",
            "Alguien derramo pintura en la vereda y quedo manchado todo.",
            "Despues de la feria quedo todo sucio y nadie limpio.",
            "El evento municipal dejo basura por todas partes.",
            "La zona comercial esta muy sucia, afecta a los comercios.",
            "Toda la vereda esta llena de chicles pegados.",
            "Terminaron la obra y dejaron todos los restos sin limpiar."
        ]
    },
    "Seguridad Urbana": {
        "titulos": [
            "Zona oscura sin vigilancia", "Terreno baldio inseguro", "Falta camara de seguridad",
            "Esquina con robos frecuentes", "Autos abandonados en calle", "Falta presencia policial",
            "Parada de colectivo insegura", "Vandalismo frecuente", "Punto de venta de drogas",
            "Zona liberada de noche", "Motos sin patente circulando", "Plaza tomada por delincuentes",
            "Personas sospechosas merodeando", "Robos a comercios frecuentes", "Asaltos en bicicleta",
            "Casa abandonada usada por malvivientes", "Falta patrullaje movil", "Robos de medidores",
            "Zona de arrebatos", "Autos circulando a alta velocidad"
        ],
        "descripciones": [
            "La zona esta muy oscura y sin vigilancia, hay muchos robos.",
            "El terreno baldio se usa para cosas raras de noche, es muy inseguro.",
            "Necesitamos camaras de seguridad en esta zona, hay muchos delitos.",
            "En esta esquina roban frecuentemente, necesitamos mas presencia policial.",
            "Hay varios autos abandonados que usan para esconderse delincuentes.",
            "Hace mucho que no vemos patrulleros, necesitamos mas vigilancia.",
            "La parada de colectivo es muy insegura de noche, no hay luz.",
            "Vandalizan constantemente los carteles y mobiliario urbano.",
            "Se rumorea que hay venta de drogas en la esquina, hay mucho movimiento raro.",
            "De noche la zona queda totalmente liberada, no hay control.",
            "Circulan motos sin patente a toda velocidad, es muy peligroso.",
            "La plaza fue tomada por delincuentes, los vecinos no pueden ir.",
            "Hay personas sospechosas que merodean por la zona.",
            "Los comercios de la zona son robados frecuentemente.",
            "Hay una banda que asalta en bicicleta, actuan de noche.",
            "La casa abandonada es usada por malvivientes, hacen fogatas.",
            "Falta patrullaje movil en toda la zona, no hay presencia.",
            "Roban los medidores de agua y luz constantemente.",
            "Esta zona es conocida por los arrebatos de celulares.",
            "Los autos circulan a altisima velocidad, hubo casi accidentes."
        ]
    },
    "Obras Publicas": {
        "titulos": [
            "Obra abandonada hace meses", "Zanja sin tapar peligrosa", "Cordon cuneta destruido",
            "Puente peatonal danado", "Escalera publica rota", "Muro de contencion agrietado",
            "Desague pluvial colapsado", "Calle sin terminar", "Vereda publica sin hacer",
            "Obra que no avanza", "Materiales de obra abandonados", "Excavacion sin vallar",
            "Cimiento expuesto peligroso", "Estructura a medio construir", "Camino vecinal destruido",
            "Paso bajo nivel inundable", "Puente vehicular danado", "Rotonda incompleta",
            "Cordones mal colocados", "Badenes mal construidos"
        ],
        "descripciones": [
            "Hay una obra publica abandonada hace meses, quedo todo a medio hacer.",
            "Dejaron una zanja abierta sin tapar, es muy peligroso especialmente de noche.",
            "El cordon cuneta esta completamente destruido, no escurre el agua.",
            "El puente peatonal tiene tablones rotos, es peligroso cruzar.",
            "La escalera publica tiene escalones rotos y sin baranda.",
            "El muro de contencion tiene grietas grandes, puede derrumbarse.",
            "El desague pluvial colapso y se inunda todo el barrio cuando llueve.",
            "La calle quedo sin terminar, falta el asfalto en varios tramos.",
            "La vereda publica nunca la hicieron, caminamos por el barro.",
            "La obra lleva meses sin avanzar, esta todo paralizado.",
            "Abandonaron materiales de obra que obstruyen el paso.",
            "Hicieron una excavacion y no la vallaron, es muy peligroso.",
            "El cimiento de la obra esta expuesto y lleno de hierros.",
            "Dejaron una estructura a medio construir, es un peligro.",
            "El camino vecinal esta totalmente destruido, no se puede transitar.",
            "El paso bajo nivel se inunda con cualquier lluvia.",
            "El puente vehicular tiene partes danadas, es peligroso cruzar.",
            "La rotonda quedo incompleta, genera confusion en el transito.",
            "Pusieron los cordones mal, el agua no escurre bien.",
            "Los badenes estan mal construidos, los autos se danan."
        ]
    },
    "Salud Ambiental": {
        "titulos": [
            "Quema de basura en terreno", "Humo toxico de fabrica", "Agua estancada con mosquitos",
            "Derrame de liquidos en calle", "Olor quimico muy fuerte", "Fumigacion necesaria",
            "Contaminacion de arroyo", "Basural a cielo abierto", "Residuos patologicos",
            "Plaga de ratas", "Plaga de cucarachas", "Dengue en la zona",
            "Fabrica contamina el aire", "Aguas servidas en la calle", "Moscas por basural",
            "Criaderos de mosquitos", "Residuos toxicos", "Olor a podrido constante",
            "Polvo de cantera afecta", "Ruido excesivo afecta salud"
        ],
        "descripciones": [
            "En el terreno baldio queman basura constantemente, el humo es toxico.",
            "De la fabrica sale humo negro que afecta a todo el barrio.",
            "Hay agua estancada que genera mosquitos, riesgo de dengue.",
            "Derramaron algun liquido quimico en la calle, hay olor fuerte.",
            "Se siente un olor quimico muy fuerte que viene de algun lugar cercano.",
            "Necesitamos fumigacion urgente, hay muchos mosquitos y cucarachas.",
            "El arroyo esta contaminado, tiene espuma y mal olor.",
            "Se formo un basural a cielo abierto, hay mucha contaminacion.",
            "Encontramos residuos que parecen ser de hospital, es peligroso.",
            "Hay plaga de ratas en el barrio, necesitamos control de plagas.",
            "Hay plaga de cucarachas en toda la cuadra, salen de las cloacas.",
            "Hay varios casos de dengue en la zona, necesitamos prevencion.",
            "La fabrica contamina el aire, el olor es insoportable.",
            "Las aguas servidas corren por la calle, es un foco de infeccion.",
            "Las moscas son insoportables por el basural cercano.",
            "Hay muchos cacharros con agua que son criaderos de mosquitos.",
            "Abandonaron residuos toxicos que pueden contaminar el agua.",
            "Hay un olor a podrido constante que no sabemos de donde viene.",
            "El polvo de la cantera afecta la salud de los vecinos.",
            "El ruido constante nos esta afectando la salud."
        ]
    },
    "Transporte y Paradas": {
        "titulos": [
            "Parada sin refugio", "Colectivo que no pasa", "Falta banco en parada",
            "Parada mal ubicada", "Cartel de recorrido ilegible", "Refugio vandalizado",
            "Falta senalizacion de parada", "Parada inundable", "Colectivo que no para",
            "Horarios no se cumplen", "Parada insegura de noche", "Colectivo pasa lleno",
            "Falta frecuencia de colectivo", "Parada sin iluminacion", "Colectivo no respeta parada",
            "Falta linea de colectivo", "Refugio con vidrios rotos", "Parada muy lejos",
            "Colectivo no da boleto", "Parada sin rampa"
        ],
        "descripciones": [
            "La parada no tiene refugio, cuando llueve la gente se moja toda.",
            "El colectivo no pasa por esta parada desde hace dias, no hay servicio.",
            "No hay banco en la parada, la gente mayor no puede esperar parada.",
            "La parada esta muy mal ubicada, hay que cruzar la calle corriendo.",
            "El cartel con el recorrido esta tan viejo que no se puede leer.",
            "Vandalizaron el refugio de la parada, rompieron los vidrios.",
            "No hay cartel que indique que es parada de colectivo.",
            "Cuando llueve la parada se inunda, hay que pararse en el agua.",
            "El colectivo pasa de largo y no para aunque haya gente esperando.",
            "Los horarios del colectivo nunca se cumplen, pasan cuando quieren.",
            "La parada es muy insegura de noche, no hay luz ni presencia.",
            "El colectivo siempre pasa lleno, no podemos subir.",
            "La frecuencia del colectivo es muy baja, hay que esperar mucho.",
            "La parada no tiene iluminacion, es peligroso esperar de noche.",
            "El colectivo no respeta la parada oficial, para donde quiere.",
            "Necesitamos una linea de colectivo que pase por este barrio.",
            "El refugio tiene los vidrios rotos, es peligroso.",
            "La parada esta muy lejos, hay que caminar muchas cuadras.",
            "El colectivero no da boleto, cobra pero no da comprobante.",
            "La parada no tiene rampa, las personas en silla de ruedas no pueden."
        ]
    },
    "Otros Reclamos": {
        "titulos": [
            "Problema no categorizado", "Consulta general al municipio", "Situacion irregular",
            "Reclamo multiple", "Inconveniente en la zona", "Solicitud especial",
            "Tema a evaluar", "Problema a resolver", "Situacion a mejorar",
            "Pedido de informacion", "Denuncia anonima", "Situacion urgente",
            "Problema recurrente", "Queja general", "Sugerencia de mejora",
            "Pedido especial", "Consulta sobre tramite", "Reclamo complejo",
            "Tema administrativo", "Pedido de reunion"
        ],
        "descripciones": [
            "Tengo un problema que no se en que categoria entra, necesito orientacion.",
            "Quisiera hacer una consulta general al municipio sobre varios temas.",
            "Hay una situacion irregular que no corresponde a ninguna categoria especifica.",
            "Tengo varios reclamos relacionados que prefiero hacer juntos.",
            "Hay un inconveniente en la zona que afecta a varios vecinos.",
            "Necesito hacer una solicitud especial que requiere evaluacion.",
            "Este tema necesita ser evaluado por las autoridades correspondientes.",
            "Hay un problema que necesita solucion pero no se a quien corresponde.",
            "La situacion podria mejorarse con intervencion municipal.",
            "Necesito informacion sobre tramites y servicios municipales.",
            "Quiero hacer una denuncia pero prefiero mantener el anonimato.",
            "Hay una situacion urgente que requiere atencion inmediata.",
            "Este problema ya lo reclame varias veces y no se soluciona.",
            "Tengo una queja general sobre el funcionamiento del municipio.",
            "Quiero sugerir una mejora para el barrio.",
            "Necesito hacer un pedido especial al intendente.",
            "Tengo dudas sobre un tramite que estoy realizando.",
            "Mi reclamo involucra varios temas y es complejo.",
            "Tengo un tema administrativo que resolver con el municipio.",
            "Solicito una reunion con algun funcionario municipal."
        ]
    }
}

# ============================================================================
# DATOS PARA SOLICITUDES DE TRAMITES
# ============================================================================
TRAMITES_DATA = {
    "Obras Privadas": {
        "tramites": [
            ("Permiso de Obra Nueva", "Construccion de vivienda", "Solicito autorizacion para construir vivienda unifamiliar en mi terreno."),
            ("Ampliacion de Vivienda", "Ampliacion de dormitorio", "Necesito ampliar mi casa agregando un dormitorio adicional."),
            ("Regularizacion de Obra", "Regularizar construccion", "Requiero regularizar una ampliacion realizada sin permiso."),
            ("Demolicion", "Demoler estructura", "Solicito permiso para demoler una construccion antigua."),
            ("Permiso de Refaccion", "Refaccion de bano", "Quiero hacer refacciones en el bano y la cocina."),
            ("Final de Obra", "Certificado de final", "Solicito el certificado de final de obra de mi vivienda."),
            ("Conexion de Servicios", "Conexion de gas", "Necesito autorizacion para conectar gas natural."),
            ("Ocupacion de Via Publica", "Volquete en vereda", "Requiero permiso para colocar volquete en la vereda."),
            ("Plano de Mensura", "Aprobar plano", "Presento plano de mensura para su aprobacion."),
            ("Subdivision de Lote", "Subdividir terreno", "Solicito subdividir mi lote en dos parcelas."),
        ]
    },
    "Comercio": {
        "tramites": [
            ("Habilitacion Comercial", "Habilitar almacen", "Solicito habilitacion para abrir un almacen en mi local."),
            ("Renovacion de Habilitacion", "Renovar habilitacion", "Necesito renovar la habilitacion de mi comercio."),
            ("Cambio de Rubro", "Cambiar actividad", "Quiero cambiar el rubro de mi comercio de verduleria a almacen."),
            ("Cambio de Titularidad", "Transferir comercio", "Solicito transferir la habilitacion a nuevo propietario."),
            ("Ampliacion de Rubro", "Agregar rubro", "Quiero agregar venta de bebidas a mi habilitacion."),
            ("Baja de Habilitacion", "Dar de baja comercio", "Solicito la baja de mi habilitacion comercial."),
            ("Cartel Publicitario", "Instalar cartel", "Requiero permiso para instalar cartel luminoso."),
            ("Habilitacion de Deposito", "Habilitar deposito", "Necesito habilitar un deposito para mi comercio."),
            ("Venta Ambulante", "Vender en feria", "Solicito permiso para venta ambulante."),
            ("Feria o Evento", "Organizar feria", "Quiero organizar una feria en la plaza."),
        ]
    },
    "Transito": {
        "tramites": [
            ("Licencia de Conducir Nueva", "Licencia clase B", "Solicito licencia de conducir por primera vez."),
            ("Renovacion de Licencia", "Renovar licencia", "Necesito renovar mi licencia vencida."),
            ("Duplicado de Licencia", "Duplicado por robo", "Solicito duplicado por robo de mi licencia."),
            ("Cambio de Domicilio", "Actualizar domicilio", "Quiero actualizar el domicilio en mi licencia."),
            ("Libre Deuda de Infracciones", "Libre deuda", "Necesito certificado de libre deuda para transferencia."),
            ("Permiso de Carga y Descarga", "Permiso de carga", "Solicito permiso de carga y descarga para mi comercio."),
            ("Estacionamiento Reservado", "Lugar reservado", "Requiero lugar de estacionamiento reservado."),
            ("Senalizacion Vial", "Solicitar cartel", "Pido instalacion de cartel de velocidad maxima."),
            ("Permiso Especial de Transito", "Vehiculo especial", "Necesito permiso para circular con vehiculo especial."),
            ("Informe de Accidente", "Copia de acta", "Solicito copia del acta de accidente vial."),
        ]
    },
    "Catastro": {
        "tramites": [
            ("Certificado Catastral", "Certificado de datos", "Solicito certificado catastral de mi propiedad."),
            ("Valuacion Fiscal", "Valuacion de inmueble", "Necesito conocer la valuacion fiscal de mi inmueble."),
            ("Empadronamiento", "Inscribir inmueble", "Quiero empadronar mi inmueble en catastro."),
            ("Nomenclatura Catastral", "Certificado de nomenclatura", "Solicito certificado de nomenclatura catastral."),
            ("Deslinde", "Definir limites", "Requiero deslinde de mi terreno con el lindero."),
            ("Unificacion de Partidas", "Unificar parcelas", "Solicito unificar dos partidas catastrales."),
            ("Estado Parcelario", "Certificado de estado", "Necesito certificado de estado parcelario."),
            ("Copia de Plano", "Copia de plano", "Solicito copia del plano archivado."),
            ("Informe de Dominio", "Informe de titularidad", "Requiero informe de dominio de una propiedad."),
            ("Actualizacion de Datos", "Actualizar datos", "Quiero actualizar los datos catastrales."),
        ]
    },
    "Desarrollo Social": {
        "tramites": [
            ("Subsidio Habitacional", "Subsidio para vivienda", "Solicito subsidio habitacional para refaccion."),
            ("Bolson Alimentario", "Asistencia alimentaria", "Necesito bolson alimentario para mi familia."),
            ("Tarjeta Alimentaria", "Tarjeta alimentar", "Requiero gestion de tarjeta alimentar."),
            ("Subsidio por Emergencia", "Ayuda de emergencia", "Solicito ayuda por emergencia habitacional."),
            ("Programa de Empleo", "Inscripcion en programa", "Quiero inscribirme en programa de empleo."),
            ("Microcredito Productivo", "Microcredito", "Solicito microcredito para mi emprendimiento."),
            ("Pension No Contributiva", "Gestion de pension", "Necesito gestionar pension no contributiva."),
            ("Programa de Capacitacion", "Inscripcion en curso", "Quiero inscribirme en curso de capacitacion."),
            ("Asistencia a Victimas", "Asistencia", "Solicito asistencia por situacion de violencia."),
            ("Certificado de Vulnerabilidad", "Certificado social", "Necesito certificado de vulnerabilidad."),
        ]
    },
    "Rentas": {
        "tramites": [
            ("Libre Deuda Municipal", "Libre deuda", "Solicito certificado de libre deuda municipal."),
            ("Plan de Pago", "Plan de pagos", "Quiero adherirme a plan de pago de deuda."),
            ("Exencion de Tasas", "Exencion impositiva", "Solicito exencion de tasas por jubilacion."),
            ("Reclamo de Boleta", "Reclamo por monto", "Reclamo por monto incorrecto en boleta."),
            ("Alta de Contribuyente", "Alta como contribuyente", "Solicito alta como contribuyente."),
            ("Baja de Contribuyente", "Baja por venta", "Quiero darme de baja por venta de propiedad."),
            ("Cambio de Titularidad", "Cambio de titular", "Solicito cambio de titularidad de tasa."),
            ("Valuacion de Inmueble", "Solicitar revaluacion", "Pido revaluacion de mi inmueble."),
            ("Copia de Boleta", "Copia de boleta", "Necesito copia de boleta extraviada."),
            ("Certificado de Deuda", "Certificado de deuda", "Solicito certificado con detalle de deuda."),
        ]
    },
    "Salud": {
        "tramites": [
            ("Libreta Sanitaria", "Obtener libreta", "Solicito libreta sanitaria para trabajo."),
            ("Renovacion Libreta Sanitaria", "Renovar libreta", "Necesito renovar mi libreta sanitaria."),
            ("Vacunacion", "Turno de vacuna", "Solicito turno para vacunacion."),
            ("Certificado de Salud", "Certificado medico", "Necesito certificado de salud para tramite."),
            ("Fumigacion de Vivienda", "Fumigacion", "Solicito fumigacion de mi vivienda."),
            ("Denuncia Sanitaria", "Denuncia de higiene", "Denuncio problema sanitario en comercio."),
            ("Certificado Prenupcial", "Certificado para casamiento", "Necesito certificado prenupcial."),
            ("Control de Plagas", "Control de roedores", "Solicito control de plagas en mi cuadra."),
            ("Habilitacion Sanitaria", "Habilitacion de local", "Requiero habilitacion sanitaria para local."),
            ("Certificado de Discapacidad", "Gestion de CUD", "Solicito gestion de certificado de discapacidad."),
        ]
    },
    "Cultura y Educacion": {
        "tramites": [
            ("Inscripcion a Talleres", "Inscripcion en taller", "Quiero inscribirme en taller de pintura."),
            ("Reserva de Espacio Cultural", "Reservar auditorio", "Solicito reservar el auditorio municipal."),
            ("Auspicio Municipal", "Auspicio para evento", "Pido auspicio municipal para evento cultural."),
            ("Biblioteca: Carnet", "Carnet de biblioteca", "Solicito carnet de la biblioteca municipal."),
            ("Beca de Estudios", "Beca municipal", "Solicito beca de estudios municipales."),
            ("Uso de Escenario Publico", "Uso de escenario", "Requiero uso del escenario de la plaza."),
            ("Registro de Artistas", "Inscripcion en registro", "Quiero inscribirme en registro de artistas."),
            ("Subsidio Cultural", "Subsidio para proyecto", "Solicito subsidio para proyecto cultural."),
            ("Permiso de Filmacion", "Filmar en plaza", "Necesito permiso para filmar documental."),
            ("Declaracion de Interes", "Declarar de interes", "Solicito declarar evento de interes municipal."),
        ]
    },
    "Legales": {
        "tramites": [
            ("Certificado de Residencia", "Certificado de domicilio", "Solicito certificado de residencia."),
            ("Legalizacion de Documentos", "Legalizar documentos", "Necesito legalizar documentos municipales."),
            ("Certificado de Convivencia", "Certificado de convivencia", "Solicito certificado de convivencia."),
            ("Fe de Vida", "Certificado de supervivencia", "Necesito fe de vida para pension."),
            ("Autorizacion de Menores", "Autorizacion de viaje", "Solicito autorizacion para viaje de menor."),
            ("Registro de Firmas", "Registrar firma", "Quiero registrar mi firma en el municipio."),
            ("Certificado de Conducta", "Antecedentes", "Solicito certificado de buena conducta."),
            ("Mediacion Vecinal", "Mediacion con vecino", "Solicito mediacion por conflicto vecinal."),
            ("Informacion Publica", "Acceso a informacion", "Solicito acceso a informacion publica."),
            ("Registro Civil: Partidas", "Partida de nacimiento", "Solicito copia de partida de nacimiento."),
        ]
    },
    "Espacios Verdes": {
        "tramites": [
            ("Poda de Arbol", "Poda en vereda", "Solicito poda del arbol frente a mi casa."),
            ("Extraccion de Arbol", "Extraccion de arbol seco", "Pido extraccion de arbol seco peligroso."),
            ("Plantacion de Arbol", "Plantar arbol", "Solicito plantacion de arbol en mi vereda."),
            ("Mantenimiento de Plaza", "Mantenimiento de plaza", "Solicito mantenimiento de plaza del barrio."),
            ("Permiso de Poda Privada", "Permiso para podar", "Necesito permiso para podar arbol en mi terreno."),
            ("Denuncia de Dano Ambiental", "Denuncia ambiental", "Denuncio dano a espacio verde."),
            ("Uso de Espacio Verde", "Evento en plaza", "Solicito usar plaza para evento vecinal."),
            ("Informe Fitosanitario", "Estado de arbol", "Pido informe del estado de un arbol."),
            ("Reposicion de Cesped", "Reponer cesped", "Solicito reposicion de cesped en plaza."),
            ("Instalacion de Riego", "Sistema de riego", "Pido instalacion de riego en plaza."),
        ]
    }
}

# Calles de Chacabuco
CALLES_CHACABUCO = [
    "Av. Alsina", "Av. Hipolito Yrigoyen", "Av. Urquiza", "Av. Lamadrid",
    "Calle San Martin", "Calle Belgrano", "Calle Rivadavia", "Calle Moreno",
    "Calle 25 de Mayo", "Calle 9 de Julio", "Calle Sarmiento", "Calle Mitre",
    "Calle Pellegrini", "Calle Alem", "Calle Brown", "Calle Colon",
    "Calle Espana", "Calle Italia", "Calle Peron", "Calle Maipu",
    "Calle Lavalle", "Calle Guemes", "Calle Necochea", "Calle Dorrego",
    "Calle Las Heras", "Calle Paso", "Calle Castelli", "Calle Pueyrredon",
    "Calle Balcarce", "Calle Suipacha", "Pasaje Los Aromos", "Pasaje San Jose",
    "Calle Rawson", "Calle Independencia", "Calle Libertad", "Calle Junin",
    "Calle Chacabuco", "Calle Cordoba", "Calle Tucuman", "Calle Mendoza"
]

# Barrios de Chacabuco
BARRIOS_CHACABUCO = [
    "Centro", "Barrio Norte", "Barrio Sur", "Villa Italia",
    "Barrio Libertad", "Barrio Progreso", "Las Quintas", "Villa del Parque",
    "Barrio Obrero", "Barrio Industrial", "Villa Sarmiento", "Barrio Nuevo"
]

# Estados de reclamos (nuevos)
ESTADOS_RECLAMOS = ['recibido', 'en_curso', 'finalizado', 'pospuesto', 'rechazado']
ESTADO_PESOS_RECLAMOS = [0.30, 0.30, 0.25, 0.10, 0.05]

# Estados de solicitudes (alineados con reclamos)
ESTADOS_SOLICITUDES = ['recibido', 'en_curso', 'finalizado', 'pospuesto', 'rechazado']
ESTADO_PESOS_SOLICITUDES = [0.25, 0.25, 0.30, 0.10, 0.10]

# Nombres y apellidos
NOMBRES = [
    "Juan", "Maria", "Carlos", "Ana", "Pedro", "Laura", "Diego", "Lucia",
    "Martin", "Sofia", "Pablo", "Valentina", "Nicolas", "Camila", "Fernando",
    "Agustina", "Sebastian", "Florencia", "Tomas", "Julieta", "Matias", "Rocio",
    "Lucas", "Milagros", "Facundo", "Aldana", "Gonzalo", "Brenda", "Emiliano", "Abril",
    "Rodrigo", "Martina", "Leandro", "Candela", "Maximiliano", "Micaela", "Franco", "Morena",
    "Joaquin", "Delfina", "Agustin", "Catalina", "Ignacio", "Victoria", "Federico", "Antonella"
]

APELLIDOS = [
    "Garcia", "Rodriguez", "Lopez", "Martinez", "Gonzalez", "Fernandez", "Perez",
    "Sanchez", "Romero", "Torres", "Diaz", "Alvarez", "Ruiz", "Jimenez", "Hernandez",
    "Moreno", "Munoz", "Castro", "Vargas", "Ortiz", "Silva", "Nunez", "Rojas", "Medina",
    "Aguirre", "Flores", "Cabrera", "Molina", "Suarez", "Benitez", "Acosta", "Luna",
    "Pereyra", "Vega", "Gomez", "Blanco", "Rios", "Mendez", "Cardozo", "Gimenez"
]

RESOLUCIONES_FINALIZADAS = [
    "Trabajo completado satisfactoriamente.",
    "Se realizo la reparacion solicitada.",
    "Personal de la dependencia soluciono el problema.",
    "Intervencion realizada segun protocolo.",
    "Tarea finalizada, verificar en sitio.",
    "Trabajo efectuado correctamente por cuadrilla municipal.",
    "Problema solucionado, se cierra el reclamo.",
    "Reparacion completada exitosamente.",
    "Se efectuo el trabajo requerido.",
    "Finalizacion confirmada por supervisor."
]

OBSERVACIONES_RECLAMOS = [
    "Verificado en sitio por personal municipal.",
    "Se coordino con la dependencia correspondiente.",
    "Trabajo programado para la semana proxima.",
    "Se requiere segunda visita para completar.",
    "Material en camino para la reparacion.",
    "Esperando autorizacion de presupuesto.",
    "En seguimiento por supervisor de zona.",
    "Prioridad alta asignada.",
    "Coordinado con vecinos afectados.",
    "Trabajo realizado en horario nocturno."
]

RESPUESTAS_APROBADAS = [
    "Tramite aprobado. Puede retirar su documentacion en mesa de entradas.",
    "Solicitud aprobada segun lo requerido. Aguarde notificacion para retiro.",
    "Tramite finalizado satisfactoriamente.",
    "Aprobado. Se envia notificacion al email registrado.",
    "Su solicitud ha sido aprobada. Presentese con DNI.",
    "Tramite resuelto favorablemente.",
    "Documentacion aprobada. Firme constancia en mesa de entradas.",
    "Solicitud completada exitosamente."
]

RESPUESTAS_RECHAZADAS = [
    "Documentacion incompleta. Falta certificado de domicilio.",
    "No cumple con los requisitos establecidos en la ordenanza vigente.",
    "Rechazado por inconsistencias en la documentacion presentada.",
    "La actividad solicitada no esta permitida en la zona indicada.",
    "Falta documentacion respaldatoria obligatoria.",
    "Datos presentados no coinciden con registros municipales.",
    "Requiere regularizacion previa de situacion anterior.",
    "Tramite no corresponde a esta dependencia."
]


def generar_telefono():
    return f"2324{random.randint(400000, 599999)}"


def generar_dni():
    return str(random.randint(20000000, 45000000))


def generar_email(nombre, apellido):
    dominios = ["gmail.com", "hotmail.com", "yahoo.com.ar", "outlook.com"]
    return f"{nombre.lower()}.{apellido.lower()}{random.randint(1, 99)}@{random.choice(dominios)}"


async def seed_masivo_chacabuco():
    async with AsyncSessionLocal() as db:
        print("=" * 70)
        print(f" SEED MASIVO CHACABUCO - {CANTIDAD_RECLAMOS} RECLAMOS + {CANTIDAD_SOLICITUDES} TRAMITES")
        print("=" * 70)

        # ============================================================
        # FASE 1: Obtener datos necesarios
        # ============================================================
        print("\n[1] Obteniendo datos del sistema...")

        # Categorias habilitadas
        result = await db.execute(text("""
            SELECT c.id, c.nombre
            FROM categorias c
            JOIN municipio_categorias mc ON c.id = mc.categoria_id
            WHERE mc.municipio_id = :municipio_id AND c.activo = 1
        """), {"municipio_id": MUNICIPIO_ID})
        categorias = result.fetchall()
        print(f"    - {len(categorias)} categorias encontradas")

        # Mapeo categoria -> dependencia
        result = await db.execute(text("""
            SELECT mdc.categoria_id, mdc.municipio_dependencia_id
            FROM municipio_dependencia_categorias mdc
            WHERE mdc.municipio_id = :municipio_id AND mdc.activo = 1
        """), {"municipio_id": MUNICIPIO_ID})
        cat_to_dep = {row[0]: row[1] for row in result.fetchall()}
        print(f"    - {len(cat_to_dep)} asignaciones categoria->dependencia")

        # Vecinos existentes
        result = await db.execute(text("""
            SELECT id FROM usuarios
            WHERE rol = 'vecino' AND municipio_id = :municipio_id AND activo = 1
        """), {"municipio_id": MUNICIPIO_ID})
        vecinos = [r[0] for r in result.fetchall()]

        if len(vecinos) < 10:
            print(f"    - Solo {len(vecinos)} vecinos, creando mas...")
            for i in range(50 - len(vecinos)):
                nombre = random.choice(NOMBRES)
                apellido = random.choice(APELLIDOS)
                email = f"vecino.chacabuco.{i+1}@demo.com"
                await db.execute(text("""
                    INSERT INTO usuarios (nombre, apellido, email, password_hash, rol, municipio_id, activo, created_at)
                    VALUES (:nombre, :apellido, :email,
                            '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiLXCJzLvKy2',
                            'vecino', :municipio_id, 1, NOW())
                    ON DUPLICATE KEY UPDATE id=id
                """), {
                    "nombre": nombre,
                    "apellido": apellido,
                    "email": email,
                    "municipio_id": MUNICIPIO_ID
                })

            await db.commit()
            result = await db.execute(text("""
                SELECT id FROM usuarios WHERE rol = 'vecino' AND municipio_id = :municipio_id
            """), {"municipio_id": MUNICIPIO_ID})
            vecinos = [r[0] for r in result.fetchall()]

        print(f"    - {len(vecinos)} vecinos disponibles")

        # Tramites habilitados
        result = await db.execute(text("""
            SELECT t.id, t.nombre, tt.nombre as tipo_nombre
            FROM tramites t
            JOIN tipos_tramites tt ON t.tipo_tramite_id = tt.id
            JOIN municipio_tramites mt ON t.id = mt.tramite_id
            WHERE mt.municipio_id = :municipio_id AND mt.activo = 1 AND t.activo = 1
        """), {"municipio_id": MUNICIPIO_ID})
        tramites = result.fetchall()

        if not tramites:
            # Buscar tramites genericos
            result = await db.execute(text("""
                SELECT t.id, t.nombre, tt.nombre as tipo_nombre
                FROM tramites t
                JOIN tipos_tramites tt ON t.tipo_tramite_id = tt.id
                WHERE t.activo = 1
                LIMIT 50
            """))
            tramites = result.fetchall()

        print(f"    - {len(tramites)} tramites disponibles")

        # Ultimo numero de solicitud
        result = await db.execute(text("""
            SELECT COALESCE(MAX(CAST(SUBSTRING(numero_tramite, 10) AS UNSIGNED)), 0)
            FROM solicitudes WHERE municipio_id = :municipio_id
        """), {"municipio_id": MUNICIPIO_ID})
        ultimo_numero_sol = result.scalar() or 0

        # ============================================================
        # FASE 2: Crear 3000 Reclamos
        # ============================================================
        print(f"\n[2] Creando {CANTIDAD_RECLAMOS} reclamos...")

        reclamos_creados = 0
        estados_count_rec = {e: 0 for e in ESTADOS_RECLAMOS}

        for i in range(CANTIDAD_RECLAMOS):
            # Seleccionar categoria
            if categorias:
                cat_id, cat_nombre = random.choice(categorias)
            else:
                cat_id, cat_nombre = 1, "Otros Reclamos"

            # Buscar datos coherentes
            cat_data = CATEGORIA_DATA.get(cat_nombre)
            if not cat_data:
                for key in CATEGORIA_DATA.keys():
                    if key.lower() in cat_nombre.lower() or cat_nombre.lower() in key.lower():
                        cat_data = CATEGORIA_DATA[key]
                        break
            if not cat_data:
                cat_data = CATEGORIA_DATA["Otros Reclamos"]

            # Datos del reclamo
            municipio_dependencia_id = cat_to_dep.get(cat_id)
            creador_id = random.choice(vecinos)
            titulo = random.choice(cat_data["titulos"])
            descripcion = random.choice(cat_data["descripciones"])

            # Agregar variacion al titulo para que no sean todos iguales
            variacion = random.choice(["", " - Urgente", " - Hace dias", " - Por favor revisar", " - Zona peligrosa", ""])
            titulo = titulo + variacion

            # Direccion
            calle = random.choice(CALLES_CHACABUCO)
            numero = random.randint(100, 3500)
            barrio = random.choice(BARRIOS_CHACABUCO)
            direccion = f"{calle} {numero}, {barrio}, Chacabuco"

            # Coordenadas de Chacabuco
            latitud = -34.64 + random.uniform(-0.04, 0.04)
            longitud = -60.47 + random.uniform(-0.04, 0.04)

            # Estado y fechas
            estado = random.choices(ESTADOS_RECLAMOS, weights=ESTADO_PESOS_RECLAMOS)[0]
            estados_count_rec[estado] += 1
            prioridad = random.randint(1, 5)

            # Fecha en ultimos 180 dias (6 meses)
            dias_atras = random.randint(0, 180)
            horas_atras = random.randint(0, 23)
            created_at = datetime.now() - timedelta(days=dias_atras, hours=horas_atras)

            fecha_recibido = None
            if estado in ['en_curso', 'finalizado', 'pospuesto', 'rechazado']:
                fecha_recibido = created_at + timedelta(hours=random.randint(1, 72))

            fecha_resolucion = None
            resolucion = None
            if estado == 'finalizado':
                fecha_resolucion = fecha_recibido + timedelta(days=random.randint(1, 21))
                resolucion = random.choice(RESOLUCIONES_FINALIZADAS)

            # Insertar
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
                "titulo": titulo[:200],
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
            if reclamos_creados % 500 == 0:
                print(f"    - {reclamos_creados}/{CANTIDAD_RECLAMOS} reclamos creados...")
                await db.commit()

        await db.commit()
        print(f"    - Total reclamos creados: {reclamos_creados}")
        for estado, count in estados_count_rec.items():
            print(f"      * {estado}: {count}")

        # ============================================================
        # FASE 3: Crear 2000 Solicitudes de Tramites
        # ============================================================
        print(f"\n[3] Creando {CANTIDAD_SOLICITUDES} solicitudes de tramites...")

        if not tramites:
            print("    [WARN] No hay tramites disponibles, saltando...")
        else:
            solicitudes_creadas = 0
            estados_count_sol = {e: 0 for e in ESTADOS_SOLICITUDES}
            year = datetime.now().year

            for i in range(CANTIDAD_SOLICITUDES):
                tramite = random.choice(tramites)
                tramite_id = tramite[0]
                tramite_nombre = tramite[1]
                tipo_nombre = tramite[2]

                # Buscar datos coherentes
                tipo_data = TRAMITES_DATA.get(tipo_nombre)
                if tipo_data:
                    tramite_info = random.choice(tipo_data["tramites"])
                    asunto = f"{tramite_info[1]} - {tramite_nombre}"
                    descripcion = tramite_info[2]
                else:
                    asunto = f"Solicitud de {tramite_nombre}"
                    descripcion = f"Requiero tramitar {tramite_nombre} segun normativa vigente."

                nombre = random.choice(NOMBRES)
                apellido = random.choice(APELLIDOS)

                # 50% con usuario asociado
                usuario_id = random.choice(vecinos) if random.random() < 0.5 else None

                estado = random.choices(ESTADOS_SOLICITUDES, weights=ESTADO_PESOS_SOLICITUDES)[0]
                estados_count_sol[estado] += 1

                # Fecha en ultimos 180 dias
                dias_atras = random.randint(0, 180)
                created_at = datetime.now() - timedelta(days=dias_atras)

                prioridad = random.choices([1, 2, 3, 4, 5], weights=[5, 15, 50, 20, 10])[0]
                numero_tramite = f"SOL-{year}-{str(ultimo_numero_sol + i + 1).zfill(5)}"

                respuesta = None
                fecha_resolucion = None
                if estado == 'finalizado':
                    respuesta = random.choice(RESPUESTAS_APROBADAS)
                    fecha_resolucion = created_at + timedelta(days=random.randint(5, 60))
                elif estado == 'rechazado':
                    respuesta = random.choice(RESPUESTAS_RECHAZADAS)
                    fecha_resolucion = created_at + timedelta(days=random.randint(3, 30))

                observaciones = random.choice(OBSERVACIONES_RECLAMOS) if random.random() > 0.5 else None

                # Direccion del solicitante
                calle = random.choice(CALLES_CHACABUCO)
                numero_dir = random.randint(100, 3500)
                barrio = random.choice(BARRIOS_CHACABUCO)
                direccion = f"{calle} {numero_dir}, {barrio}, Chacabuco"

                await db.execute(text("""
                    INSERT INTO solicitudes (
                        municipio_id, tramite_id, numero_tramite, asunto, descripcion,
                        estado, prioridad,
                        solicitante_id, nombre_solicitante, apellido_solicitante,
                        dni_solicitante, email_solicitante, telefono_solicitante, direccion_solicitante,
                        respuesta, observaciones, fecha_resolucion, created_at, updated_at
                    ) VALUES (
                        :municipio_id, :tramite_id, :numero_tramite, :asunto, :descripcion,
                        :estado, :prioridad,
                        :solicitante_id, :nombre, :apellido,
                        :dni, :email, :telefono, :direccion,
                        :respuesta, :observaciones, :fecha_resolucion, :created_at, :created_at
                    )
                """), {
                    "municipio_id": MUNICIPIO_ID,
                    "tramite_id": tramite_id,
                    "numero_tramite": numero_tramite,
                    "asunto": asunto[:300],
                    "descripcion": descripcion,
                    "estado": estado,
                    "prioridad": prioridad,
                    "solicitante_id": usuario_id,
                    "nombre": nombre,
                    "apellido": apellido,
                    "dni": generar_dni(),
                    "email": generar_email(nombre, apellido),
                    "telefono": generar_telefono(),
                    "direccion": direccion,
                    "respuesta": respuesta,
                    "observaciones": observaciones,
                    "fecha_resolucion": fecha_resolucion,
                    "created_at": created_at,
                })

                solicitudes_creadas += 1
                if solicitudes_creadas % 500 == 0:
                    print(f"    - {solicitudes_creadas}/{CANTIDAD_SOLICITUDES} solicitudes creadas...")
                    await db.commit()

            await db.commit()
            print(f"    - Total solicitudes creadas: {solicitudes_creadas}")
            for estado, count in estados_count_sol.items():
                print(f"      * {estado}: {count}")

        # ============================================================
        # RESUMEN FINAL
        # ============================================================
        print("\n" + "=" * 70)
        print(" SEED MASIVO COMPLETADO ")
        print("=" * 70)

        # Contar totales en base
        result = await db.execute(text("""
            SELECT COUNT(*) FROM reclamos WHERE municipio_id = :mid
        """), {"mid": MUNICIPIO_ID})
        total_reclamos = result.scalar()

        result = await db.execute(text("""
            SELECT COUNT(*) FROM solicitudes WHERE municipio_id = :mid
        """), {"mid": MUNICIPIO_ID})
        total_solicitudes = result.scalar()

        print(f"\n  CHACABUCO (municipio_id={MUNICIPIO_ID}):")
        print(f"    - Total reclamos en base: {total_reclamos}")
        print(f"    - Total solicitudes en base: {total_solicitudes}")
        print("\n" + "=" * 70)


if __name__ == "__main__":
    asyncio.run(seed_masivo_chacabuco())
