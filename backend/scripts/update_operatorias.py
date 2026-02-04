"""
Script para actualizar las operatorias de tramites con procedimientos reales
basados en municipios argentinos (fuentes: MSM, Rosario, Corrientes, ANSV, ANMAT, etc.)
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "mysql+aiomysql://avnadmin:AVNS_Fqe0qsChCHnqSnVsvoi@mysql-aiven-arenazl.e.aivencloud.com:23108/sugerenciasmun"

updates = [
    # Obras Particulares (basado en MSM, Rosario, Corrientes)
    (1, "1. Contratar arquitecto/ingeniero matriculado -> 2. Preparar carpeta de obra con planos y escritura -> 3. Presentar en Mesa de Entrada de Obras Particulares -> 4. Visado en Catastro y Planeamiento -> 5. Pago de derechos de construccion -> 6. Retiro de permiso aprobado (30-45 dias)"),
    (2, "1. Solicitar turno online o presencial -> 2. Presentar planos actuales + planos de ampliacion firmados por profesional -> 3. Verificacion de final de obra anterior -> 4. Inspeccion del inmueble si corresponde -> 5. Pago de tasas -> 6. Retiro de permiso"),
    (3, "1. Contratar profesional para relevamiento de obra existente -> 2. Presentar solicitud de regularizacion con planos conforme a obra -> 3. Inspeccion municipal obligatoria -> 4. Pago de multa (puede ser 4% del valor de obra) + derechos -> 5. Aprobacion de planos -> 6. Emision de certificado de regularizacion"),
    (4, "1. Solicitar turno para inspeccion final -> 2. Inspector municipal verifica obra conforme a planos aprobados -> 3. Si hay observaciones, subsanarlas -> 4. Presentar planos conforme a obra si hubo modificaciones -> 5. Pago de sellado -> 6. Emision de certificado de final de obra"),

    # Habilitaciones (basado en Avellaneda, Bahia Blanca, Corrientes)
    (5, "1. Verificar factibilidad de uso de suelo en Planeamiento -> 2. Reunir documentacion: contrato/escritura, CUIT, libre deuda, plano del local -> 3. Iniciar tramite online o presencial -> 4. Inspeccion del local (condiciones edilicias, electricas, sanitarias) -> 5. Subsanar observaciones si las hay -> 6. Pago de tasas -> 7. Retiro de habilitacion (72hs a 15 dias segun riesgo)"),
    (6, "1. Presentar solicitud 30 dias antes del vencimiento -> 2. Adjuntar habilitacion anterior vigente -> 3. Verificacion automatica de libre deuda municipal -> 4. Inspeccion si corresponde (cambios en el local) -> 5. Pago de tasa de renovacion -> 6. Emision de nueva habilitacion por 36 meses"),
    (7, "1. Presentar nota solicitando cambio de rubro -> 2. Adjuntar habilitacion actual y descripcion del nuevo rubro -> 3. Verificacion de compatibilidad con zonificacion -> 4. Inspeccion si el nuevo rubro lo requiere -> 5. Actualizacion en sistema -> 6. Emision de habilitacion modificada"),
    (8, "1. Presentar solicitud de baja con habilitacion original -> 2. Verificacion de libre deuda municipal -> 3. Inspeccion de cierre si corresponde -> 4. Baja en padron de contribuyentes -> 5. Emision de constancia de baja definitiva"),

    # Transito (basado en ANSV, Provincia BA, San Isidro)
    (9, "1. Realizar Curso Nacional de Educacion Vial online (5 horas, 7 modulos) -> 2. Sacar turno en Centro Emisor de Licencias del municipio -> 3. Examen psicofisico (vista, audicion, coordinacion) -> 4. Examen teorico (senales, normas de transito) -> 5. Examen practico de manejo -> 6. Pago de tasas CENAT y CEPAT -> 7. Emision de licencia (24-48hs). Condicion PRINCIPIANTE por 6 meses"),
    (10, "1. Sacar turno online en Centro Emisor de Licencias -> 2. Presentarse con DNI y licencia anterior -> 3. Examen psicofisico (obligatorio) -> 4. Examen teorico (puede eximirse segun antigueedad) -> 5. Pago de tasas -> 6. Emision de nueva licencia (24-48hs)"),
    (11, "1. Presentar solicitud con DNI y cedula verde del vehiculo -> 2. Verificar domicilio en zona de estacionamiento medido -> 3. Elegir modalidad: mensual o anual -> 4. Pago de la tasa correspondiente -> 5. Entrega de permiso/oblea para exhibir en vehiculo"),

    # Rentas y Tributos (basado en varios municipios)
    (12, "1. Consultar deuda total en Rentas municipal o web -> 2. Solicitar plan de pagos indicando cantidad de cuotas deseadas -> 3. Analisis y aprobacion segun monto (puede ser automatico) -> 4. Firma de convenio de pago -> 5. Pago de primera cuota (requisito para activar plan) -> 6. Entrega de cupones de pago mensuales"),
    (13, "1. Ingresar a web municipal o presentarse en Rentas -> 2. Indicar datos del inmueble o comercio (partida, CUIT) -> 3. Sistema verifica automaticamente deudas -> 4. Si no hay deuda: emision inmediata del certificado -> 5. Si hay deuda: regularizar primero. Certificado valido 30-90 dias segun municipio"),
    (14, "1. Presentar solicitud con documentacion respaldatoria (certificado discapacidad, recibo jubilacion, etc) -> 2. Evaluacion por area de Accion Social o Rentas -> 3. Dictamen tecnico sobre procedencia -> 4. Resolucion administrativa -> 5. Notificacion al contribuyente -> 6. Alta de exencion en sistema"),

    # Espacios Verdes
    (15, "1. Presentar solicitud indicando ubicacion exacta del arbol (direccion, foto) -> 2. Inspeccion tecnica por personal de Espacios Verdes -> 3. Evaluacion de necesidad y tipo de poda -> 4. Programacion en cronograma de cuadrilla municipal -> 5. Ejecucion de la poda -> 6. Notificacion al vecino de trabajo realizado"),
    (16, "1. Presentar solicitud con justificacion (riesgo, dano a vereda, etc) y fotos -> 2. Inspeccion tecnica del arbol por ingeniero agronomo -> 3. Evaluacion: si el arbol esta sano, se rechaza -> 4. Si se aprueba, programacion de extraccion -> 5. Ejecucion por cuadrilla especializada -> 6. Reposicion de arbol si corresponde segun ordenanza"),

    # Catastro (basado en procedimientos catastrales)
    (17, "1. Presentar solicitud de mensura -> 2. Designar agrimensor matriculado -> 3. Trabajo de campo: medicion del terreno -> 4. Confeccion de plano de mensura -> 5. Presentacion en Catastro municipal para visado -> 6. Aprobacion y registro -> 7. Inscripcion en Registro de la Propiedad provincial"),
    (18, "1. Presentar proyecto de subdivision firmado por agrimensor -> 2. Verificacion de cumplimiento de lote minimo segun zonificacion -> 3. Evaluacion tecnica en Catastro -> 4. Aprobacion de planos de subdivision -> 5. Inscripcion de nuevas parcelas -> 6. Asignacion de nuevas nomenclaturas catastrales"),
    (19, "1. Presentar solicitud con titulos de todas las parcelas a unificar -> 2. Verificacion de titularidad unica -> 3. Confeccion de plano de unificacion por agrimensor -> 4. Evaluacion catastral -> 5. Aprobacion e inscripcion de parcela unificada"),

    # Bromatologia (basado en ANMAT, municipios varios)
    (20, "1. Inscribirse en curso de Manipulacion de Alimentos (presencial u online, entidad autorizada) -> 2. Completar todos los modulos del curso -> 3. Rendir examen final (puede ser presencial) -> 4. Presentar certificado aprobacion + DNI + foto 4x4 en Bromatologia -> 5. Emision de carnet. Validez: 2 anios"),
    (21, "1. Obtener habilitacion comercial del local -> 2. Presentar carnet de manipulador de alimentos vigente de todo el personal -> 3. Inspeccion bromatologica del establecimiento (cocina, deposito, higiene) -> 4. Subsanar observaciones si las hay -> 5. Aprobacion y emision de habilitacion gastronomica"),

    # Certificaciones
    (22, "1. Presentarse en Mesa de Entradas con DNI original -> 2. Adjuntar servicio (luz, gas, agua) a nombre del titular con domicilio a certificar -> 3. Verificacion de datos -> 4. Emision de certificado de domicilio. Validez: 30-60 dias"),
    (23, "1. Presentarse PERSONALMENTE (no admite apoderado) con DNI original -> 2. Verificacion de identidad por funcionario -> 3. Emision inmediata de certificado de supervivencia/fe de vida"),

    # Desarrollo Social (basado en CABA, municipios PBA)
    (24, "1. Solicitar entrevista con trabajador social en area de Desarrollo Social -> 2. Presentar documentacion: DNI, constancia de situacion (desalojo, incendio, etc) -> 3. Visita domiciliaria para evaluacion del caso -> 4. Confeccion de informe social -> 5. Evaluacion y resolucion -> 6. Notificacion y entrega del subsidio si corresponde"),
    (25, "1. Presentar solicitud en Desarrollo Social -> 2. Entrevista socioeconomica con trabajador social -> 3. Evaluacion del grupo familiar (ingresos, composicion) -> 4. Verificacion de no duplicidad en otros programas -> 5. Alta en sistema -> 6. Entrega de tarjeta alimentaria"),
    (26, "1. Estar inscripto en padron de beneficiarios -> 2. Presentar solicitud mensual (si es requerido) -> 3. Verificacion de datos vigentes -> 4. Retiro de bolson en fecha asignada presentando DNI"),
    (27, "1. Solicitar turno en Desarrollo Social -> 2. Entrevista con trabajador social -> 3. Relevamiento socioeconomico del grupo familiar -> 4. Confeccion de informe -> 5. Emision de certificado socioeconomico"),
    (28, "1. Completar formulario de inscripcion -> 2. Presentar documentacion de todo el grupo familiar -> 3. Entrevista y evaluacion socioeconomica -> 4. Verificacion de requisitos (no poseer vivienda, etc) -> 5. Incorporacion a lista de espera del programa de viviendas"),

    # Cementerio
    (29, "1. Consultar disponibilidad de nichos/parcelas en administracion de cementerio -> 2. Seleccionar ubicacion disponible -> 3. Presentar certificado de defuncion y DNI del solicitante -> 4. Pago de adquisicion o alquiler segun modalidad -> 5. Firma de contrato -> 6. Entrega de documentacion y llave si corresponde"),
    (30, "1. Presentarse con comprobante de nicho/contrato anterior -> 2. Verificacion de estado de cuenta (no debe haber deuda) -> 3. Pago de tasa de renovacion -> 4. Actualizacion de contrato por nuevo periodo"),
    (31, "1. Presentar solicitud escrita con motivo del traslado -> 2. Adjuntar autorizaciones de familiares directos -> 3. Coordinar fecha con cementerio destino -> 4. Pago de servicios de traslado -> 5. Ejecucion del traslado con acta -> 6. Entrega de documentacion actualizada"),
    (32, "1. Presentar orden judicial o autorizacion de autoridad sanitaria -> 2. Adjuntar certificado de defuncion original -> 3. Verificacion de documentacion legal -> 4. Programacion de fecha de exhumacion -> 5. Acto de exhumacion con acta oficial -> 6. Entrega de restos o reinhumacion segun solicitud"),
    (33, "1. Presentar certificado de defuncion original -> 2. DNI del solicitante (familiar directo) -> 3. Seleccionar nicho/parcela disponible (si no tiene) -> 4. Pago de servicios de inhumacion -> 5. Coordinacion de fecha y hora del servicio"),

    # Espacio Publico
    (34, "1. Presentar solicitud con 15 dias de anticipacion minimo -> 2. Describir evento: tipo, fecha, horario, cantidad de asistentes estimada -> 3. Adjuntar seguro de responsabilidad civil -> 4. Evaluacion municipal -> 5. Pago de canon si corresponde -> 6. Emision de permiso"),
    (35, "1. Presentar proyecto de feria: ubicacion, fechas, cantidad de puestos -> 2. Listado de feriantes con datos -> 3. Inspeccion del predio propuesto -> 4. Verificacion de seguros y habilitaciones de feriantes -> 5. Aprobacion municipal -> 6. Pago de canon -> 7. Emision de permiso de feria"),
    (36, "1. Presentar solicitud con datos del vehiculo -> 2. Adjuntar habilitacion comercial, carnet manipulador, habilitacion vehicular -> 3. Inspeccion del food truck (bromatologia) -> 4. Asignacion de zona de operacion -> 5. Pago de tasas -> 6. Emision de permiso"),
    (37, "1. Presentar proyecto de cartel: medidas, ubicacion, diseno grafico -> 2. Evaluacion de impacto visual por Planeamiento -> 3. Verificacion de cumplimiento de ordenanza de publicidad -> 4. Aprobacion del proyecto -> 5. Pago de canon anual -> 6. Permiso de instalacion"),
    (38, "1. Presentar solicitud con plano de ocupacion de vereda (metros, mobiliario) -> 2. Adjuntar habilitacion comercial vigente -> 3. Inspeccion del espacio -> 4. Verificacion de no obstaculizar circulacion peatonal -> 5. Pago mensual de tasa por ocupacion -> 6. Permiso renovable"),
]


async def migrate():
    engine = create_async_engine(DATABASE_URL)

    async with engine.begin() as conn:
        for tramite_id, operatoria in updates:
            await conn.execute(
                text("UPDATE tramites SET requisitos = :req WHERE id = :id"),
                {"req": operatoria, "id": tramite_id}
            )
        print(f"[OK] {len(updates)} tramites actualizados con operatoria real")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
