"""
Script para poblar la base de datos con servicios de trámites municipales completos.
Incluye 10 rubros con todos sus trámites asociados.
Ejecutar con: python scripts/seed_tramites_completos.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, delete

from core.config import settings
from models.municipio import Municipio
from models.tramite import ServicioTramite


# Rubros con sus trámites - CON DOCUMENTACION Y REQUISITOS DETALLADOS
RUBROS_TRAMITES = {
    "HABILITACIONES Y COMERCIO": {
        "icono": "Store",
        "color": "#3B82F6",
        "tramites": [
            {
                "nombre": "Habilitación comercial",
                "descripcion": "Trámite para habilitar un nuevo comercio o industria",
                "tiempo": 30,
                "costo": 15000,
                "documentos": "DNI titular, Contrato de alquiler o escritura, Plano del local, Certificado de bomberos, Inscripción AFIP, Libre deuda municipal",
                "requisitos": "El local debe cumplir con las normas de seguridad e higiene. Se requiere inspección previa."
            },
            {
                "nombre": "Renovación de habilitación",
                "descripcion": "Renovación anual de habilitación comercial vigente",
                "tiempo": 15,
                "costo": 8000,
                "documentos": "DNI titular, Habilitación anterior, Libre deuda municipal, Certificado de bomberos vigente",
                "requisitos": "La habilitación anterior no debe estar vencida hace más de 60 días."
            },
            {
                "nombre": "Cambio de titularidad",
                "descripcion": "Transferencia de habilitación a nuevo titular",
                "tiempo": 20,
                "costo": 10000,
                "documentos": "DNI nuevo titular, DNI titular anterior, Contrato de cesión o compraventa, Habilitación vigente, Libre deuda a nombre del titular anterior",
                "requisitos": "Ambas partes deben firmar la transferencia. No debe haber deudas pendientes."
            },
            {
                "nombre": "Cambio de rubro",
                "descripcion": "Modificación del rubro comercial habilitado",
                "tiempo": 25,
                "costo": 12000,
                "documentos": "DNI titular, Habilitación vigente, Nota explicando el nuevo rubro, Plano actualizado si hay modificaciones",
                "requisitos": "El nuevo rubro debe ser compatible con la zonificación del lugar."
            },
            {
                "nombre": "Ampliación / modificación de local",
                "descripcion": "Autorización para ampliar o modificar el local comercial",
                "tiempo": 30,
                "costo": 8000,
                "documentos": "DNI titular, Habilitación vigente, Plano de modificaciones, Memoria descriptiva, Certificado de bomberos actualizado",
                "requisitos": "Las modificaciones deben respetar el Código de Edificación."
            },
            {
                "nombre": "Baja comercial",
                "descripcion": "Solicitud de baja de habilitación comercial",
                "tiempo": 10,
                "costo": 0,
                "documentos": "DNI titular, Habilitación original, Nota de solicitud de baja, Libre deuda municipal",
                "requisitos": "No debe haber deudas pendientes con el municipio."
            },
            {
                "nombre": "Habilitación provisoria",
                "descripcion": "Habilitación temporal mientras se completa el trámite definitivo",
                "tiempo": 7,
                "costo": 5000,
                "documentos": "DNI titular, Solicitud de habilitación definitiva en trámite, Contrato de alquiler o escritura",
                "requisitos": "Válida por 90 días. El local debe cumplir condiciones mínimas de seguridad."
            },
            {
                "nombre": "Inspección comercial",
                "descripcion": "Solicitud de inspección del local comercial",
                "tiempo": 15,
                "costo": 3000,
                "documentos": "DNI titular, Número de expediente o habilitación",
                "requisitos": "El local debe estar disponible para la inspección en horario comercial."
            },
            {
                "nombre": "Autorización de cartelería",
                "descripcion": "Permiso para instalar cartelería comercial",
                "tiempo": 10,
                "costo": 2500,
                "documentos": "DNI titular, Croquis del cartel con medidas, Fotografía del frente, Habilitación comercial",
                "requisitos": "El cartel debe respetar las ordenanzas de publicidad exterior."
            },
            {
                "nombre": "Libre deuda comercial",
                "descripcion": "Certificado de libre deuda para comercios",
                "tiempo": 5,
                "costo": 1000,
                "documentos": "DNI titular, Número de habilitación o expediente",
                "requisitos": "No debe haber deudas de tasas comerciales."
            },
            {
                "nombre": "Certificado de habilitación",
                "descripcion": "Copia certificada de habilitación comercial",
                "tiempo": 3,
                "costo": 500,
                "documentos": "DNI titular, Número de habilitación",
                "requisitos": "La habilitación debe estar vigente."
            },
        ]
    },
    "OBRAS PARTICULARES": {
        "icono": "HardHat",
        "color": "#F59E0B",
        "tramites": [
            {
                "nombre": "Permiso de obra nueva",
                "descripcion": "Autorización para construcción nueva",
                "tiempo": 45,
                "costo": 25000,
                "documentos": "DNI propietario, Escritura del terreno, Planos de arquitectura firmados, Planos de estructura, Planos de instalaciones, Estudio de suelos, Póliza de seguro",
                "requisitos": "Los planos deben estar firmados por profesional matriculado. Cumplir con FOS y FOT permitidos."
            },
            {
                "nombre": "Ampliación de obra",
                "descripcion": "Permiso para ampliar construcción existente",
                "tiempo": 30,
                "costo": 15000,
                "documentos": "DNI propietario, Escritura, Planos de obra existente, Planos de ampliación, Certificado de final de obra anterior",
                "requisitos": "La ampliación debe respetar los índices urbanísticos de la zona."
            },
            {
                "nombre": "Regularización de obra",
                "descripcion": "Regularizar construcciones sin permiso previo",
                "tiempo": 60,
                "costo": 35000,
                "documentos": "DNI propietario, Escritura, Plano de relevamiento de lo construido, Fotografías actuales, Declaración jurada",
                "requisitos": "Puede aplicar multa por construcción sin permiso. Sujeto a inspección."
            },
            {
                "nombre": "Final de obra",
                "descripcion": "Certificado de finalización de obra",
                "tiempo": 20,
                "costo": 8000,
                "documentos": "DNI propietario, Permiso de obra original, Planos conforme a obra, Certificado de instalación eléctrica, Certificado de instalación de gas",
                "requisitos": "La obra debe estar 100% terminada y habitable."
            },
            {
                "nombre": "Declaración de obra menor",
                "descripcion": "Obras menores que no requieren permiso completo",
                "tiempo": 10,
                "costo": 3000,
                "documentos": "DNI propietario, Croquis de la obra, Descripción de los trabajos",
                "requisitos": "Aplica para obras de hasta 30m2 que no modifiquen estructura."
            },
            {
                "nombre": "Aprobación de planos",
                "descripcion": "Aprobación de planos de construcción",
                "tiempo": 30,
                "costo": 12000,
                "documentos": "Planos en formato municipal, Memoria descriptiva, Planilla de superficies, Certificado de aptitud profesional",
                "requisitos": "Los planos deben cumplir con el Código de Edificación vigente."
            },
            {
                "nombre": "Visado de planos",
                "descripcion": "Visado municipal de planos arquitectónicos",
                "tiempo": 15,
                "costo": 5000,
                "documentos": "Planos a visar, DNI del profesional actuante, Matrícula profesional",
                "requisitos": "Paso previo a la aprobación definitiva."
            },
            {
                "nombre": "Inspecciones de obra",
                "descripcion": "Solicitud de inspección de avance de obra",
                "tiempo": 10,
                "costo": 2000,
                "documentos": "Número de expediente de obra, DNI propietario o profesional",
                "requisitos": "La obra debe estar en condiciones de ser inspeccionada."
            },
            {
                "nombre": "Certificado de aptitud técnica",
                "descripcion": "Certificado de aptitud técnica de la construcción",
                "tiempo": 15,
                "costo": 4000,
                "documentos": "Final de obra, Planos aprobados, DNI propietario",
                "requisitos": "Necesario para trámites notariales y bancarios."
            },
            {
                "nombre": "Consulta técnica",
                "descripcion": "Consulta técnica sobre obras y construcciones",
                "tiempo": 7,
                "costo": 1500,
                "documentos": "Descripción de la consulta, Ubicación del inmueble",
                "requisitos": "Consulta no vinculante sobre factibilidad de obra."
            },
        ]
    },
    "CATASTRO": {
        "icono": "Map",
        "color": "#EC4899",
        "tramites": [
            {
                "nombre": "Certificado catastral",
                "descripcion": "Certificado con datos catastrales del inmueble",
                "tiempo": 10,
                "costo": 2000,
                "documentos": "DNI solicitante, Escritura o boleto de compraventa, Partida inmobiliaria",
                "requisitos": "El inmueble debe estar registrado en catastro."
            },
            {
                "nombre": "Numeración domiciliaria",
                "descripcion": "Asignación o verificación de número de calle",
                "tiempo": 10,
                "costo": 1500,
                "documentos": "DNI propietario, Escritura, Croquis de ubicación",
                "requisitos": "El inmueble debe tener frente a calle pública."
            },
            {
                "nombre": "Nomenclatura catastral",
                "descripcion": "Obtención de nomenclatura catastral oficial",
                "tiempo": 7,
                "costo": 1000,
                "documentos": "DNI solicitante, Datos del inmueble (dirección o partida)",
                "requisitos": "Información básica del inmueble."
            },
            {
                "nombre": "Subdivisión / unificación de parcelas",
                "descripcion": "Trámite de subdivisión o unificación parcelaria",
                "tiempo": 45,
                "costo": 20000,
                "documentos": "DNI propietario, Escritura de todos los lotes involucrados, Plano de mensura, Certificado de no inundabilidad, Factibilidad de servicios",
                "requisitos": "Las parcelas resultantes deben cumplir con la superficie mínima de la zona."
            },
            {
                "nombre": "Mensura",
                "descripcion": "Solicitud de mensura oficial",
                "tiempo": 30,
                "costo": 15000,
                "documentos": "DNI propietario, Escritura, Antecedentes catastrales",
                "requisitos": "Debe ser realizada por agrimensor matriculado."
            },
            {
                "nombre": "Actualización de datos catastrales",
                "descripcion": "Actualizar información catastral del inmueble",
                "tiempo": 15,
                "costo": 2500,
                "documentos": "DNI propietario, Documentación que respalde el cambio, Partida inmobiliaria",
                "requisitos": "Aplica para actualizar superficie, destino o mejoras."
            },
            {
                "nombre": "Certificado de zonificación",
                "descripcion": "Certificado de uso de suelo permitido",
                "tiempo": 10,
                "costo": 2000,
                "documentos": "DNI solicitante, Ubicación del inmueble, Descripción del uso pretendido",
                "requisitos": "Indica qué actividades están permitidas en el lote."
            },
            {
                "nombre": "Informe parcelario",
                "descripcion": "Informe detallado de la parcela",
                "tiempo": 7,
                "costo": 1500,
                "documentos": "DNI solicitante, Nomenclatura catastral o dirección",
                "requisitos": "Incluye datos de superficie, linderos y restricciones."
            },
        ]
    },
    "TRÁNSITO": {
        "icono": "Car",
        "color": "#8B5CF6",
        "tramites": [
            {
                "nombre": "Licencia de conducir (alta / renovación)",
                "descripcion": "Obtención o renovación de licencia de conducir",
                "tiempo": 15,
                "costo": 8000,
                "documentos": "DNI, Certificado de grupo sanguíneo, Certificado de aptitud psicofísica, Foto 4x4, Comprobante de domicilio",
                "requisitos": "Aprobar examen teórico y práctico. Edad mínima según categoría."
            },
            {
                "nombre": "Duplicado de licencia",
                "descripcion": "Duplicado por robo, extravío o deterioro",
                "tiempo": 10,
                "costo": 4000,
                "documentos": "DNI, Denuncia policial (en caso de robo), Licencia deteriorada (si corresponde)",
                "requisitos": "La licencia original debe estar vigente."
            },
            {
                "nombre": "Cambio de categoría",
                "descripcion": "Cambio de categoría de licencia de conducir",
                "tiempo": 15,
                "costo": 6000,
                "documentos": "DNI, Licencia actual, Certificado médico específico para la categoría",
                "requisitos": "Aprobar examen práctico con vehículo de la nueva categoría."
            },
            {
                "nombre": "Turnos para licencia",
                "descripcion": "Solicitud de turno para trámite de licencia",
                "tiempo": 1,
                "costo": 0,
                "documentos": "DNI",
                "requisitos": "Disponibilidad según agenda del centro de licencias."
            },
            {
                "nombre": "Infracciones (consulta / descargo)",
                "descripcion": "Consulta de infracciones o presentación de descargo",
                "tiempo": 15,
                "costo": 0,
                "documentos": "DNI, Cédula del vehículo, Acta de infracción (para descargo)",
                "requisitos": "El descargo debe presentarse dentro de los 5 días hábiles."
            },
            {
                "nombre": "Permisos de estacionamiento",
                "descripcion": "Permiso especial de estacionamiento",
                "tiempo": 10,
                "costo": 3000,
                "documentos": "DNI, Cédula del vehículo, Certificado de discapacidad (si aplica), Comprobante de domicilio",
                "requisitos": "Aplica para zonas de estacionamiento medido o permisos especiales."
            },
            {
                "nombre": "Corte de calle",
                "descripcion": "Autorización para corte temporal de calle",
                "tiempo": 7,
                "costo": 2000,
                "documentos": "DNI solicitante, Nota con motivo y duración, Croquis del corte, Seguro de responsabilidad civil",
                "requisitos": "Presentar con 72hs de anticipación. Máximo 24hs de corte."
            },
            {
                "nombre": "Señalización vial",
                "descripcion": "Solicitud de nueva señalización vial",
                "tiempo": 20,
                "costo": 0,
                "documentos": "DNI solicitante, Descripción del pedido, Ubicación exacta, Fotografías del lugar",
                "requisitos": "Sujeto a evaluación técnica del área de Tránsito."
            },
        ]
    },
    "TASAS Y RECAUDACIÓN": {
        "icono": "CreditCard",
        "color": "#10B981",
        "tramites": [
            {
                "nombre": "Tasas municipales (consulta)",
                "descripcion": "Consulta de estado de tasas municipales",
                "tiempo": 1,
                "costo": 0,
                "documentos": "DNI, Partida inmobiliaria o dirección del inmueble",
                "requisitos": "Consulta inmediata en ventanilla o web."
            },
            {
                "nombre": "Reimpresión de boletas",
                "descripcion": "Reimpresión de boletas de tasas municipales",
                "tiempo": 1,
                "costo": 0,
                "documentos": "DNI, Partida inmobiliaria",
                "requisitos": "Disponible para períodos no prescriptos."
            },
            {
                "nombre": "Planes de pago",
                "descripcion": "Solicitud de plan de pagos para deudas",
                "tiempo": 5,
                "costo": 0,
                "documentos": "DNI titular, Partida inmobiliaria, Último recibo de sueldo o constancia de ingresos",
                "requisitos": "Anticipo mínimo del 10%. Hasta 12 cuotas sin interés."
            },
            {
                "nombre": "Moratorias",
                "descripcion": "Adhesión a moratorias vigentes",
                "tiempo": 5,
                "costo": 0,
                "documentos": "DNI titular, Partida inmobiliaria",
                "requisitos": "Sujeto a ordenanzas de moratoria vigentes."
            },
            {
                "nombre": "Libre deuda municipal",
                "descripcion": "Certificado de libre deuda del inmueble",
                "tiempo": 5,
                "costo": 500,
                "documentos": "DNI solicitante, Partida inmobiliaria, Escritura (opcional)",
                "requisitos": "El inmueble no debe registrar deuda de ningún período."
            },
            {
                "nombre": "Certificado de deuda",
                "descripcion": "Certificado de estado de deuda",
                "tiempo": 3,
                "costo": 300,
                "documentos": "DNI solicitante, Partida inmobiliaria",
                "requisitos": "Detalla períodos adeudados y montos."
            },
            {
                "nombre": "Exenciones",
                "descripcion": "Solicitud de exención de tasas",
                "tiempo": 20,
                "costo": 0,
                "documentos": "DNI titular, Documentación que acredite la exención (jubilación, discapacidad, etc.), Partida inmobiliaria",
                "requisitos": "Aplica para jubilados, personas con discapacidad, entidades sin fines de lucro."
            },
            {
                "nombre": "Reclamos por liquidación",
                "descripcion": "Reclamo por errores en liquidación de tasas",
                "tiempo": 15,
                "costo": 0,
                "documentos": "DNI titular, Boleta cuestionada, Documentación de respaldo",
                "requisitos": "Presentar dentro de los 30 días de emitida la boleta."
            },
            {
                "nombre": "Cambio de titularidad tributaria",
                "descripcion": "Cambio de titular para pago de tasas",
                "tiempo": 10,
                "costo": 500,
                "documentos": "DNI nuevo titular, Escritura o boleto de compraventa, Libre deuda a nombre del titular anterior",
                "requisitos": "El inmueble debe estar al día con las tasas."
            },
        ]
    },
    "SERVICIOS PÚBLICOS": {
        "icono": "Lightbulb",
        "color": "#F97316",
        "tramites": [
            {
                "nombre": "Alumbrado público",
                "descripcion": "Reclamo por falta o falla de alumbrado público",
                "tiempo": 7,
                "costo": 0,
                "documentos": "DNI solicitante, Ubicación exacta (calle y altura), Descripción del problema",
                "requisitos": "Indicar si es lámpara apagada, intermitente o con daño visible."
            },
            {
                "nombre": "Barrido y limpieza",
                "descripcion": "Reclamo por deficiencia en barrido y limpieza",
                "tiempo": 5,
                "costo": 0,
                "documentos": "DNI solicitante, Dirección afectada, Fotografías (opcional)",
                "requisitos": "Indicar frecuencia del problema y horario observado."
            },
            {
                "nombre": "Recolección de residuos",
                "descripcion": "Reclamo por problemas en recolección de residuos",
                "tiempo": 3,
                "costo": 0,
                "documentos": "DNI solicitante, Dirección, Descripción del problema",
                "requisitos": "Verificar los días y horarios de recolección de la zona."
            },
            {
                "nombre": "Bacheo",
                "descripcion": "Solicitud de reparación de baches en calzada",
                "tiempo": 15,
                "costo": 0,
                "documentos": "DNI solicitante, Ubicación exacta, Fotografías del bache",
                "requisitos": "Indicar tamaño aproximado y si representa peligro."
            },
            {
                "nombre": "Veredas en mal estado",
                "descripcion": "Reclamo por veredas deterioradas",
                "tiempo": 20,
                "costo": 0,
                "documentos": "DNI solicitante, Ubicación, Fotografías",
                "requisitos": "Las veredas son responsabilidad del frentista. El municipio puede intimar a reparar."
            },
            {
                "nombre": "Desagües pluviales",
                "descripcion": "Reclamo por problemas de desagües pluviales",
                "tiempo": 15,
                "costo": 0,
                "documentos": "DNI solicitante, Ubicación, Descripción del problema, Fotografías",
                "requisitos": "Indicar si hay acumulación de agua o desborde."
            },
            {
                "nombre": "Semáforos",
                "descripcion": "Reclamo por fallas en semáforos",
                "tiempo": 5,
                "costo": 0,
                "documentos": "DNI solicitante, Ubicación de la intersección",
                "requisitos": "Indicar tipo de falla: apagado, intermitente, desincronizado."
            },
            {
                "nombre": "Espacios verdes",
                "descripcion": "Solicitud de mantenimiento de espacios verdes",
                "tiempo": 10,
                "costo": 0,
                "documentos": "DNI solicitante, Ubicación del espacio verde",
                "requisitos": "Indicar tipo de mantenimiento: poda, corte de pasto, limpieza."
            },
        ]
    },
    "MEDIO AMBIENTE": {
        "icono": "TreeDeciduous",
        "color": "#22C55E",
        "tramites": [
            {
                "nombre": "Poda / extracción de árboles",
                "descripcion": "Solicitud de poda o extracción de árboles",
                "tiempo": 20,
                "costo": 0,
                "documentos": "DNI solicitante, Ubicación del árbol, Fotografías, Motivo de la solicitud",
                "requisitos": "Requiere inspección previa. La extracción solo se autoriza en casos justificados."
            },
            {
                "nombre": "Denuncia por quema",
                "descripcion": "Denuncia por quema de residuos o pastizales",
                "tiempo": 3,
                "costo": 0,
                "documentos": "DNI denunciante, Ubicación exacta, Fotografías o videos",
                "requisitos": "La quema de residuos está prohibida por ordenanza municipal."
            },
            {
                "nombre": "Ruidos molestos",
                "descripcion": "Denuncia por ruidos molestos",
                "tiempo": 5,
                "costo": 0,
                "documentos": "DNI denunciante, Dirección del origen del ruido, Horarios en que se produce",
                "requisitos": "Los ruidos molestos están regulados por ordenanza. Horario nocturno: 22 a 7hs."
            },
            {
                "nombre": "Denuncia ambiental",
                "descripcion": "Denuncia por contaminación o daño ambiental",
                "tiempo": 10,
                "costo": 0,
                "documentos": "DNI denunciante, Ubicación, Descripción detallada, Fotografías o videos",
                "requisitos": "Se realizará inspección y se pueden aplicar multas."
            },
            {
                "nombre": "Gestión de residuos especiales",
                "descripcion": "Autorización para disposición de residuos especiales",
                "tiempo": 15,
                "costo": 3000,
                "documentos": "DNI solicitante, Descripción del tipo de residuo, Cantidad estimada, Plan de disposición",
                "requisitos": "Aplica para residuos electrónicos, patogénicos, industriales, etc."
            },
        ]
    },
    "SALUD": {
        "icono": "Heart",
        "color": "#EF4444",
        "tramites": [
            {
                "nombre": "Turnos en centros de salud",
                "descripcion": "Solicitud de turnos en centros de salud municipales",
                "tiempo": 1,
                "costo": 0,
                "documentos": "DNI, Carnet de obra social o constancia de no tener cobertura",
                "requisitos": "Turnos disponibles según especialidad y centro de salud."
            },
            {
                "nombre": "Libreta sanitaria",
                "descripcion": "Obtención o renovación de libreta sanitaria",
                "tiempo": 7,
                "costo": 1500,
                "documentos": "DNI, Foto 4x4, Certificado de vacunas, Análisis clínicos (según rubro)",
                "requisitos": "Obligatoria para manipuladores de alimentos. Válida por 1 año."
            },
            {
                "nombre": "Certificados médicos",
                "descripcion": "Emisión de certificados médicos varios",
                "tiempo": 3,
                "costo": 500,
                "documentos": "DNI, Turno previo con médico municipal",
                "requisitos": "Incluye certificados de buena salud, apto físico, etc."
            },
            {
                "nombre": "Denuncias sanitarias",
                "descripcion": "Denuncia por condiciones sanitarias deficientes",
                "tiempo": 5,
                "costo": 0,
                "documentos": "DNI denunciante, Ubicación del lugar, Descripción del problema, Fotografías",
                "requisitos": "Se realizará inspección sanitaria. Puede derivar en clausura."
            },
            {
                "nombre": "Control bromatológico",
                "descripcion": "Solicitud de inspección bromatológica",
                "tiempo": 10,
                "costo": 2000,
                "documentos": "DNI solicitante, Datos del establecimiento, Habilitación comercial",
                "requisitos": "Obligatorio para locales gastronómicos y de venta de alimentos."
            },
        ]
    },
    "ACCIÓN SOCIAL": {
        "icono": "Users",
        "color": "#6366F1",
        "tramites": [
            {
                "nombre": "Solicitud de asistencia social",
                "descripcion": "Solicitud de asistencia social municipal",
                "tiempo": 15,
                "costo": 0,
                "documentos": "DNI de todos los integrantes del grupo familiar, Constancia de ingresos, Comprobante de domicilio, Informe social previo",
                "requisitos": "Se evalúa situación socioeconómica mediante entrevista."
            },
            {
                "nombre": "Ayuda económica",
                "descripcion": "Solicitud de ayuda económica de emergencia",
                "tiempo": 10,
                "costo": 0,
                "documentos": "DNI, Constancia de situación de emergencia, Certificado de ingresos o desempleo",
                "requisitos": "Para situaciones de emergencia comprobable. Monto según disponibilidad."
            },
            {
                "nombre": "Emergencia habitacional",
                "descripcion": "Solicitud por situación de emergencia habitacional",
                "tiempo": 7,
                "costo": 0,
                "documentos": "DNI grupo familiar, Documentación que acredite la emergencia, Informe de Defensa Civil (si aplica)",
                "requisitos": "Para casos de incendio, inundación, derrumbe u orden de desalojo."
            },
            {
                "nombre": "Entrevista social",
                "descripcion": "Turno para entrevista con trabajador social",
                "tiempo": 5,
                "costo": 0,
                "documentos": "DNI",
                "requisitos": "Primer paso para acceder a programas de asistencia."
            },
            {
                "nombre": "Certificados sociales",
                "descripcion": "Emisión de certificados sociales varios",
                "tiempo": 7,
                "costo": 0,
                "documentos": "DNI, Documentación según tipo de certificado",
                "requisitos": "Incluye certificados de pobreza, convivencia, cargas de familia."
            },
        ]
    },
    "INSTITUCIONAL / ADMINISTRATIVO": {
        "icono": "FileText",
        "color": "#64748B",
        "tramites": [
            {
                "nombre": "Mesa de entradas",
                "descripcion": "Ingreso de documentación por mesa de entradas",
                "tiempo": 1,
                "costo": 0,
                "documentos": "DNI, Nota o documentación a presentar en original y copia",
                "requisitos": "Toda documentación se registra con número de expediente."
            },
            {
                "nombre": "Expedientes administrativos",
                "descripcion": "Consulta de estado de expedientes",
                "tiempo": 3,
                "costo": 0,
                "documentos": "DNI, Número de expediente",
                "requisitos": "Solo puede consultar el titular o representante autorizado."
            },
            {
                "nombre": "Acceso a la información pública",
                "descripcion": "Solicitud de información pública",
                "tiempo": 15,
                "costo": 0,
                "documentos": "DNI, Nota detallando la información solicitada",
                "requisitos": "Según Ley de Acceso a la Información Pública. Respuesta en 15 días hábiles."
            },
            {
                "nombre": "Quejas y sugerencias",
                "descripcion": "Presentación de quejas o sugerencias",
                "tiempo": 10,
                "costo": 0,
                "documentos": "DNI, Descripción de la queja o sugerencia",
                "requisitos": "Todas las presentaciones reciben respuesta formal."
            },
            {
                "nombre": "Solicitud de audiencias",
                "descripcion": "Solicitud de audiencia con funcionarios",
                "tiempo": 15,
                "costo": 0,
                "documentos": "DNI, Nota indicando motivo y funcionario solicitado",
                "requisitos": "Sujeto a disponibilidad de agenda del funcionario."
            },
            {
                "nombre": "Certificaciones varias",
                "descripcion": "Certificaciones y constancias administrativas",
                "tiempo": 7,
                "costo": 500,
                "documentos": "DNI, Documentación según tipo de certificado",
                "requisitos": "Incluye certificados de residencia, supervivencia, etc."
            },
        ]
    },
}


async def main():
    print("=" * 70)
    print("SEED DE SERVICIOS DE TRAMITES MUNICIPALES - COMPLETO")
    print("=" * 70)

    # Contar total de trámites
    total_tramites = sum(len(rubro["tramites"]) for rubro in RUBROS_TRAMITES.values())
    print(f"\nTotal de trámites a cargar: {total_tramites}")
    print(f"Rubros: {len(RUBROS_TRAMITES)}")

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Obtener todos los municipios
        result = await session.execute(select(Municipio).where(Municipio.activo == True))
        municipios = result.scalars().all()

        if not municipios:
            print("\n[ERROR] No hay municipios en la base de datos.")
            return

        print(f"\nMunicipios encontrados: {len(municipios)}")

        for municipio in municipios:
            print(f"\n>> Procesando: {municipio.nombre}")

            # Eliminar servicios existentes del municipio
            await session.execute(
                delete(ServicioTramite).where(ServicioTramite.municipio_id == municipio.id)
            )
            await session.commit()
            print(f"   [INFO] Servicios anteriores eliminados")

            orden = 1
            servicios_creados = 0

            for rubro_nombre, rubro_data in RUBROS_TRAMITES.items():
                for tramite in rubro_data["tramites"]:
                    servicio = ServicioTramite(
                        municipio_id=municipio.id,
                        nombre=tramite["nombre"],
                        descripcion=f"[{rubro_nombre}] {tramite['descripcion']}",
                        icono=rubro_data["icono"],
                        color=rubro_data["color"],
                        requisitos=tramite.get("requisitos", ""),
                        documentos_requeridos=tramite.get("documentos", ""),
                        tiempo_estimado_dias=tramite["tiempo"],
                        costo=float(tramite["costo"]),
                        orden=orden,
                        activo=True,
                        favorito=orden <= 6  # Los primeros 6 son favoritos
                    )
                    session.add(servicio)
                    servicios_creados += 1
                    orden += 1

            await session.commit()
            print(f"   [OK] {servicios_creados} servicios creados")

        print("\n" + "=" * 70)
        print("SEED COMPLETADO")
        print("=" * 70)
        print(f"\nResumen por rubro:")
        for rubro_nombre, rubro_data in RUBROS_TRAMITES.items():
            print(f"  - {rubro_nombre}: {len(rubro_data['tramites'])} trámites")
        print(f"\nTotal: {total_tramites} trámites por municipio")
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
