"""
Script para crear la estructura completa de Servicios y Tipos de Trámite.
BORRA TODOS LOS SERVICIOS Y TIPOS EXISTENTES y los recrea.

Ejecutar con: python scripts/seed_servicios_completos.py

Estructura:
- ServicioTramite: Categorías principales (17 categorías)
- TipoTramite: Servicios específicos bajo cada categoría
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, delete, text

from core.config import settings
from models.municipio import Municipio
from models.tramite import ServicioTramite, TipoTramite


# =============================================================================
# MODELO COMPLETO DE SERVICIOS MUNICIPALES
# =============================================================================

CATEGORIAS_SERVICIOS = [
    # 1. HABILITACIONES COMERCIALES
    {
        "nombre": "Habilitaciones Comerciales",
        "icono": "Store",
        "color": "#3B82F6",
        "descripcion": "Trámites para comercios, industrias y actividades económicas",
        "servicios": [
            {"nombre": "Nueva habilitación comercial", "tiempo": 30, "costo": 15000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Renovación de habilitación", "tiempo": 15, "costo": 8000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Cambio de rubro", "tiempo": 20, "costo": 10000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Ampliación de local comercial", "tiempo": 25, "costo": 12000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Transferencia de habilitación", "tiempo": 20, "costo": 8000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Baja de habilitación", "tiempo": 10, "costo": 0, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Habilitación de kiosco/maxikiosco", "tiempo": 20, "costo": 10000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Habilitación de gastronomía", "tiempo": 45, "costo": 25000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Habilitación de espectáculos públicos", "tiempo": 30, "costo": 20000, "permite_anonimo": False, "requiere_turno": True},
        ]
    },

    # 2. TRÁNSITO Y TRANSPORTE
    {
        "nombre": "Tránsito y Transporte",
        "icono": "Car",
        "color": "#10B981",
        "descripcion": "Licencias de conducir, infracciones y transporte público",
        "servicios": [
            {"nombre": "Primera licencia de conducir", "tiempo": 15, "costo": 8000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Renovación de licencia", "tiempo": 7, "costo": 6000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Duplicado de licencia", "tiempo": 5, "costo": 4000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Cambio de categoría", "tiempo": 10, "costo": 5000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Consulta de infracciones", "tiempo": 1, "costo": 0, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Pago de multas", "tiempo": 1, "costo": 0, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Descargo de infracción", "tiempo": 30, "costo": 0, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Permiso de estacionamiento", "tiempo": 5, "costo": 2000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Habilitación de remis/taxi", "tiempo": 30, "costo": 15000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Señalización vial (reclamo)", "tiempo": 15, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
        ]
    },

    # 3. OBRAS Y CONSTRUCCIONES
    {
        "nombre": "Obras y Construcciones",
        "icono": "Building2",
        "color": "#F59E0B",
        "descripcion": "Permisos de obra, planos y construcciones",
        "servicios": [
            {"nombre": "Permiso de obra nueva residencial", "tiempo": 45, "costo": 25000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Permiso de obra nueva comercial", "tiempo": 60, "costo": 35000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Permiso de obra multifamiliar", "tiempo": 90, "costo": 50000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Ampliación menor (hasta 50m²)", "tiempo": 20, "costo": 10000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Ampliación mayor (más de 50m²)", "tiempo": 35, "costo": 18000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Regularización de obra total", "tiempo": 60, "costo": 35000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Regularización de obra parcial", "tiempo": 45, "costo": 25000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Final de obra", "tiempo": 30, "costo": 15000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Demolición", "tiempo": 20, "costo": 8000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Cerco y vereda", "tiempo": 15, "costo": 5000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Obra clandestina (denuncia)", "tiempo": 30, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "DENUNCIA"},
        ]
    },

    # 4. CATASTRO E INMUEBLES
    {
        "nombre": "Catastro e Inmuebles",
        "icono": "Map",
        "color": "#8B5CF6",
        "descripcion": "Certificados catastrales, subdivisiones y valuaciones",
        "servicios": [
            {"nombre": "Certificado catastral simple", "tiempo": 5, "costo": 1500, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Certificado catastral completo", "tiempo": 10, "costo": 3000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Subdivisión de parcela", "tiempo": 45, "costo": 20000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Unificación de parcelas", "tiempo": 30, "costo": 15000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Cambio de titularidad", "tiempo": 15, "costo": 3000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Valuación fiscal", "tiempo": 10, "costo": 2000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Plano de mensura", "tiempo": 30, "costo": 10000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Nomenclatura catastral", "tiempo": 5, "costo": 1000, "permite_anonimo": False, "requiere_turno": False},
        ]
    },

    # 5. RENTAS Y TRIBUTOS
    {
        "nombre": "Rentas y Tributos",
        "icono": "Wallet",
        "color": "#EF4444",
        "descripcion": "Tasas municipales, impuestos y planes de pago",
        "servicios": [
            {"nombre": "Consulta de deuda municipal", "tiempo": 1, "costo": 0, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Reimpresión de boleta", "tiempo": 1, "costo": 0, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Detalle de liquidación", "tiempo": 2, "costo": 0, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Plan de pago hasta 6 cuotas", "tiempo": 3, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Plan de pago hasta 12 cuotas", "tiempo": 3, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Plan de pago extendido", "tiempo": 5, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Libre deuda inmobiliario", "tiempo": 3, "costo": 500, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Libre deuda comercial", "tiempo": 3, "costo": 500, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Libre deuda automotor", "tiempo": 3, "costo": 500, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Exención de tasas", "tiempo": 30, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Reclamo de liquidación", "tiempo": 15, "costo": 0, "permite_anonimo": False, "requiere_turno": False, "tipo": "RECLAMO"},
        ]
    },

    # 6. ESPACIOS VERDES Y ARBOLADO
    {
        "nombre": "Espacios Verdes y Arbolado",
        "icono": "TreePine",
        "color": "#22C55E",
        "descripcion": "Poda, extracción de árboles y mantenimiento de espacios verdes",
        "servicios": [
            {"nombre": "Poda de formación", "tiempo": 15, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Poda de emergencia", "tiempo": 5, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Extracción de árbol", "tiempo": 20, "costo": 0, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Plantación de árbol", "tiempo": 30, "costo": 0, "permite_anonimo": True, "requiere_turno": False},
            {"nombre": "Limpieza de plaza/parque", "tiempo": 7, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Reparación de juegos infantiles", "tiempo": 15, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Desmalezamiento", "tiempo": 10, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Riego de espacios verdes", "tiempo": 7, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
        ]
    },

    # 7. SALUD
    {
        "nombre": "Salud",
        "icono": "Heart",
        "color": "#EC4899",
        "descripcion": "Turnos médicos, libretas sanitarias y servicios de salud",
        "servicios": [
            {"nombre": "Turno consulta clínica", "tiempo": 1, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Turno especialidad médica", "tiempo": 1, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Turno vacunación", "tiempo": 1, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Turno laboratorio", "tiempo": 1, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Libreta sanitaria primera vez", "tiempo": 7, "costo": 1500, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Libreta sanitaria renovación", "tiempo": 5, "costo": 1000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Certificado de discapacidad", "tiempo": 30, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Fumigación/desinfección", "tiempo": 10, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Denuncia sanitaria", "tiempo": 15, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "DENUNCIA"},
        ]
    },

    # 8. SERVICIOS PÚBLICOS
    {
        "nombre": "Servicios Públicos",
        "icono": "Lightbulb",
        "color": "#FBBF24",
        "descripcion": "Alumbrado, agua, cloacas y servicios básicos",
        "servicios": [
            {"nombre": "Alumbrado público (reclamo)", "tiempo": 7, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Bache/pavimento", "tiempo": 30, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Vereda en mal estado", "tiempo": 30, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Desagüe pluvial", "tiempo": 20, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Pérdida de agua", "tiempo": 5, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Conexión de agua", "tiempo": 30, "costo": 10000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Conexión de cloaca", "tiempo": 45, "costo": 15000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Recolección de residuos", "tiempo": 3, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Contenedor de basura", "tiempo": 15, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Limpieza de calle", "tiempo": 5, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
        ]
    },

    # 9. MEDIO AMBIENTE
    {
        "nombre": "Medio Ambiente",
        "icono": "Leaf",
        "color": "#059669",
        "descripcion": "Contaminación, residuos peligrosos y denuncias ambientales",
        "servicios": [
            {"nombre": "Denuncia por contaminación", "tiempo": 15, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "DENUNCIA"},
            {"nombre": "Denuncia por ruidos molestos", "tiempo": 7, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "DENUNCIA"},
            {"nombre": "Residuos peligrosos", "tiempo": 10, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "DENUNCIA"},
            {"nombre": "Quema de basura", "tiempo": 3, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "DENUNCIA"},
            {"nombre": "Basural clandestino", "tiempo": 15, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "DENUNCIA"},
            {"nombre": "Evaluación de impacto ambiental", "tiempo": 60, "costo": 20000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Certificado ambiental", "tiempo": 30, "costo": 5000, "permite_anonimo": False, "requiere_turno": False},
        ]
    },

    # 10. ACCIÓN SOCIAL
    {
        "nombre": "Acción Social",
        "icono": "Users",
        "color": "#6366F1",
        "descripcion": "Asistencia social, subsidios y programas sociales",
        "servicios": [
            {"nombre": "Solicitud de asistencia alimentaria", "tiempo": 7, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Solicitud de subsidio habitacional", "tiempo": 30, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Informe socioambiental", "tiempo": 15, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Pensión no contributiva", "tiempo": 60, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Ayuda escolar", "tiempo": 15, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Programa de empleo", "tiempo": 30, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Adultos mayores", "tiempo": 10, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Violencia familiar (denuncia)", "tiempo": 1, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "DENUNCIA"},
        ]
    },

    # 11. EDUCACIÓN, CULTURA Y DEPORTE
    {
        "nombre": "Educación, Cultura y Deporte",
        "icono": "GraduationCap",
        "color": "#0EA5E9",
        "descripcion": "Actividades culturales, deportivas y educativas",
        "servicios": [
            {"nombre": "Inscripción a talleres municipales", "tiempo": 3, "costo": 0, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Inscripción a escuelas deportivas", "tiempo": 3, "costo": 0, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Reserva de espacio cultural", "tiempo": 10, "costo": 2000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Reserva de cancha/polideportivo", "tiempo": 5, "costo": 1000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Biblioteca (carnet)", "tiempo": 3, "costo": 0, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Becas municipales", "tiempo": 30, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Eventos culturales (consulta)", "tiempo": 1, "costo": 0, "permite_anonimo": True, "requiere_turno": False},
        ]
    },

    # 12. EMPLEO Y PRODUCCIÓN
    {
        "nombre": "Empleo y Producción",
        "icono": "Briefcase",
        "color": "#7C3AED",
        "descripcion": "Bolsa de trabajo, emprendedores y desarrollo económico",
        "servicios": [
            {"nombre": "Inscripción bolsa de trabajo", "tiempo": 5, "costo": 0, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Capacitación laboral", "tiempo": 7, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Registro de emprendedores", "tiempo": 10, "costo": 0, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Asesoramiento PYME", "tiempo": 7, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Feria de emprendedores (inscripción)", "tiempo": 10, "costo": 500, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Microcréditos productivos", "tiempo": 45, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
        ]
    },

    # 13. EVENTOS Y ESPACIO PÚBLICO
    {
        "nombre": "Eventos y Espacio Público",
        "icono": "Calendar",
        "color": "#F97316",
        "descripcion": "Permisos para eventos, uso de espacio público",
        "servicios": [
            {"nombre": "Permiso de evento público", "tiempo": 15, "costo": 5000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Permiso de corte de calle", "tiempo": 10, "costo": 2000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Permiso de food truck", "tiempo": 20, "costo": 8000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Permiso de feria barrial", "tiempo": 15, "costo": 3000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Permiso de cartelería/publicidad", "tiempo": 10, "costo": 5000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Ocupación de vereda (mesas)", "tiempo": 15, "costo": 4000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Venta ambulante (permiso)", "tiempo": 10, "costo": 2000, "permite_anonimo": False, "requiere_turno": True},
        ]
    },

    # 14. ZOONOSIS Y ANIMALES
    {
        "nombre": "Zoonosis y Animales",
        "icono": "Dog",
        "color": "#D946EF",
        "descripcion": "Control de animales, vacunación y denuncias",
        "servicios": [
            {"nombre": "Vacunación antirrábica", "tiempo": 1, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Castración gratuita", "tiempo": 7, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Registro de mascotas", "tiempo": 5, "costo": 500, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Animal suelto (reclamo)", "tiempo": 3, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Animal en mal estado (denuncia)", "tiempo": 3, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "DENUNCIA"},
            {"nombre": "Plaga de roedores/insectos", "tiempo": 7, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Habilitación de criadero", "tiempo": 30, "costo": 10000, "permite_anonimo": False, "requiere_turno": True},
        ]
    },

    # 15. SEGURIDAD Y DEFENSA CIVIL
    {
        "nombre": "Seguridad y Defensa Civil",
        "icono": "Shield",
        "color": "#DC2626",
        "descripcion": "Emergencias, bomberos y protección civil",
        "servicios": [
            {"nombre": "Solicitud de móvil policial", "tiempo": 1, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Cámara de seguridad (reclamo)", "tiempo": 30, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Luminaria de seguridad", "tiempo": 15, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Inundación (emergencia)", "tiempo": 1, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Árbol caído (emergencia)", "tiempo": 1, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "RECLAMO"},
            {"nombre": "Inspección de bomberos", "tiempo": 15, "costo": 3000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Plan de evacuación", "tiempo": 20, "costo": 5000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Vandalismo (denuncia)", "tiempo": 7, "costo": 0, "permite_anonimo": True, "requiere_turno": False, "tipo": "DENUNCIA"},
        ]
    },

    # 16. VIVIENDA Y DESARROLLO URBANO
    {
        "nombre": "Vivienda y Desarrollo Urbano",
        "icono": "Home",
        "color": "#0D9488",
        "descripcion": "Programas de vivienda, urbanización y desarrollo",
        "servicios": [
            {"nombre": "Inscripción plan de viviendas", "tiempo": 30, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Mejoramiento habitacional", "tiempo": 45, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Regularización dominial", "tiempo": 90, "costo": 5000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Certificado de aptitud urbanística", "tiempo": 20, "costo": 3000, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Consulta de zonificación", "tiempo": 5, "costo": 0, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Loteo (aprobación)", "tiempo": 90, "costo": 30000, "permite_anonimo": False, "requiere_turno": True},
        ]
    },

    # 17. REGISTRO CIVIL Y DOCUMENTACIÓN
    {
        "nombre": "Registro Civil y Documentación",
        "icono": "FileText",
        "color": "#64748B",
        "descripcion": "Partidas, certificados y documentación personal",
        "servicios": [
            {"nombre": "Partida de nacimiento", "tiempo": 5, "costo": 500, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Partida de matrimonio", "tiempo": 5, "costo": 500, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Partida de defunción", "tiempo": 5, "costo": 500, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Certificado de domicilio", "tiempo": 3, "costo": 300, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Certificado de convivencia", "tiempo": 5, "costo": 500, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Certificado de supervivencia", "tiempo": 3, "costo": 300, "permite_anonimo": False, "requiere_turno": False},
            {"nombre": "Turno para matrimonio civil", "tiempo": 30, "costo": 3000, "permite_anonimo": False, "requiere_turno": True},
            {"nombre": "Reconocimiento de hijo", "tiempo": 10, "costo": 0, "permite_anonimo": False, "requiere_turno": True},
        ]
    },
]


async def main():
    print("=" * 70)
    print("SEED COMPLETO DE SERVICIOS Y TIPOS DE TRAMITE")
    print("=" * 70)
    print("\n[!] ATENCION: Este script BORRARA todos los servicios y tipos existentes")
    print("    y los recreara con el modelo completo.\n")

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Obtener municipio Merlo
        result = await session.execute(
            select(Municipio).where(Municipio.nombre.ilike("%merlo%"))
        )
        municipio = result.scalar_one_or_none()

        if not municipio:
            result = await session.execute(
                select(Municipio).where(Municipio.activo == True).limit(1)
            )
            municipio = result.scalar_one_or_none()

        if not municipio:
            print("\n[ERROR] No hay municipios en la base de datos.")
            return

        print(f"Municipio: {municipio.nombre} (ID: {municipio.id})")

        # BORRAR tipos y servicios existentes del municipio
        print("\nEliminando datos existentes...")

        # Primero desasociar tramites de tipos
        await session.execute(
            text("UPDATE tramites SET tipo_tramite_id = NULL WHERE municipio_id = :mun_id"),
            {"mun_id": municipio.id}
        )

        # Borrar tramites (para poder borrar servicios)
        await session.execute(
            text("DELETE FROM tramites WHERE municipio_id = :mun_id"),
            {"mun_id": municipio.id}
        )

        # Borrar tipos de tramite
        await session.execute(
            text("""
                DELETE FROM tipos_tramites
                WHERE servicio_id IN (
                    SELECT id FROM servicios_tramites WHERE municipio_id = :mun_id
                )
            """),
            {"mun_id": municipio.id}
        )

        # Borrar servicios
        await session.execute(
            delete(ServicioTramite).where(ServicioTramite.municipio_id == municipio.id)
        )

        await session.commit()
        print("   [OK] Datos anteriores eliminados")

        # CREAR NUEVA ESTRUCTURA
        print("\nCreando nueva estructura...")

        servicios_creados = 0
        tipos_creados = 0

        for i, categoria in enumerate(CATEGORIAS_SERVICIOS):
            print(f"\n>> {categoria['nombre']} ({len(categoria['servicios'])} servicios)")

            # Crear el servicio (categoría principal)
            servicio = ServicioTramite(
                municipio_id=municipio.id,
                nombre=categoria["nombre"],
                descripcion=categoria.get("descripcion", ""),
                icono=categoria.get("icono", "FileText"),
                color=categoria.get("color", "#6B7280"),
                activo=True,
                orden=i + 1,
                favorito=(i < 6),  # Los primeros 6 como favoritos
            )
            session.add(servicio)
            await session.flush()  # Para obtener el ID
            servicios_creados += 1

            # Crear los tipos de trámite (servicios específicos)
            for j, srv in enumerate(categoria["servicios"]):
                tipo = TipoTramite(
                    servicio_id=servicio.id,
                    nombre=srv["nombre"],
                    descripcion=srv.get("descripcion", ""),
                    tiempo_estimado_dias=srv.get("tiempo", 15),
                    costo=srv.get("costo", 0),
                    activo=True,
                    orden=j + 1,
                )
                session.add(tipo)
                tipos_creados += 1

                # Mostrar indicador de tipo si no es trámite normal
                tipo_str = ""
                if srv.get("tipo") == "RECLAMO":
                    tipo_str = " [RECLAMO]"
                elif srv.get("tipo") == "DENUNCIA":
                    tipo_str = " [DENUNCIA]"
                elif srv.get("permite_anonimo"):
                    tipo_str = " [anónimo]"

                print(f"   + {srv['nombre']}{tipo_str}")

        await session.commit()

        print(f"\n{'=' * 70}")
        print(f"[OK] SEED COMPLETADO")
        print(f"   - {servicios_creados} categorias de servicio creadas")
        print(f"   - {tipos_creados} tipos de tramite creados")
        print(f"{'=' * 70}")


if __name__ == "__main__":
    asyncio.run(main())
