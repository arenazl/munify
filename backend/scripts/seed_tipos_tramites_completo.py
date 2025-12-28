"""Script para crear 10 tipos de trámites con 10 trámites cada uno"""
import asyncio
import sys
sys.path.insert(0, "c:/Code/sugerenciasMun/backend")

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from core.config import settings

MUNICIPIO_ID = 48  # Merlo

# 10 Tipos de trámites (categorías) con sus trámites
TIPOS_TRAMITES = {
    "Obras Privadas": {
        "icono": "HardHat",
        "color": "#f59e0b",
        "tramites": [
            ("Permiso de Obra Nueva", "Autorización para construcción de vivienda nueva", 45, 15000, "Plano municipal, Título de propiedad, DNI"),
            ("Ampliación de Vivienda", "Permiso para ampliar construcción existente", 30, 10000, "Plano de ampliación, Plano original, DNI"),
            ("Regularización de Obra", "Regularizar construcciones sin permiso", 60, 20000, "Plano de relevamiento, Título, Informe técnico"),
            ("Demolición", "Permiso para demoler construcción", 15, 5000, "Plano de demolición, Seguro, DNI"),
            ("Permiso de Refacción", "Autorización para refacciones menores", 20, 3000, "Descripción de trabajos, DNI"),
            ("Final de Obra", "Certificado de finalización de obra", 30, 8000, "Plano conforme a obra, Fotos, Inspección"),
            ("Conexión de Servicios", "Autorización para conexión de servicios", 15, 2000, "Plano de instalaciones, DNI"),
            ("Ocupación de Vía Pública", "Permiso para obras en vereda", 10, 1500, "Croquis, Seguro, Cronograma"),
            ("Plano de Mensura", "Aprobación de plano de mensura", 45, 12000, "Plano de agrimensor, Título"),
            ("Subdivisión de Lote", "Autorización para subdividir terreno", 60, 25000, "Plano de subdivisión, Título, Factibilidades"),
        ]
    },
    "Comercio": {
        "icono": "Store",
        "color": "#10b981",
        "tramites": [
            ("Habilitación Comercial", "Habilitación de nuevo comercio", 30, 8000, "Contrato de alquiler, Habilitación sanitaria, DNI"),
            ("Renovación de Habilitación", "Renovar habilitación comercial", 15, 4000, "Habilitación anterior, Libre deuda"),
            ("Cambio de Rubro", "Modificar actividad comercial", 20, 5000, "Habilitación actual, Nueva actividad"),
            ("Cambio de Titularidad", "Transferir habilitación", 25, 6000, "Contrato de transferencia, DNI nuevo titular"),
            ("Ampliación de Rubro", "Agregar actividad comercial", 15, 3000, "Habilitación actual, Nueva actividad"),
            ("Baja de Habilitación", "Dar de baja comercio", 10, 0, "Habilitación, Libre deuda municipal"),
            ("Cartel Publicitario", "Permiso para cartelería", 15, 2000, "Diseño del cartel, Fotos fachada"),
            ("Habilitación de Depósito", "Habilitar depósito comercial", 20, 5000, "Plano, Habilitación bomberos"),
            ("Venta Ambulante", "Permiso de venta ambulante", 10, 1000, "DNI, Fotos del puesto"),
            ("Feria o Evento", "Permiso para feria o evento", 15, 3000, "Descripción del evento, Seguro"),
        ]
    },
    "Tránsito": {
        "icono": "Car",
        "color": "#3b82f6",
        "tramites": [
            ("Licencia de Conducir Nueva", "Obtener licencia por primera vez", 7, 5000, "DNI, Certificado psicofísico, Curso"),
            ("Renovación de Licencia", "Renovar licencia vencida", 5, 4000, "Licencia anterior, Certificado psicofísico"),
            ("Duplicado de Licencia", "Obtener duplicado por extravío", 5, 3000, "DNI, Denuncia policial"),
            ("Cambio de Domicilio", "Actualizar domicilio en licencia", 5, 1500, "DNI actualizado, Licencia"),
            ("Libre Deuda de Infracciones", "Certificado de libre deuda", 3, 500, "DNI, Patente"),
            ("Permiso de Carga y Descarga", "Autorización para carga/descarga", 10, 2000, "Habilitación comercial, Patente"),
            ("Estacionamiento Reservado", "Solicitar lugar reservado", 15, 3000, "Justificación, Croquis ubicación"),
            ("Señalización Vial", "Solicitar señalización", 20, 0, "Descripción del pedido, Ubicación"),
            ("Permiso Especial de Tránsito", "Para vehículos especiales", 10, 2500, "Documentación del vehículo"),
            ("Informe de Accidente", "Solicitar informe de accidente", 10, 1000, "DNI, Fecha y lugar del accidente"),
        ]
    },
    "Catastro": {
        "icono": "Map",
        "color": "#8b5cf6",
        "tramites": [
            ("Certificado Catastral", "Certificado de datos catastrales", 10, 2000, "Título de propiedad, DNI"),
            ("Valuación Fiscal", "Obtener valuación del inmueble", 15, 2500, "Partida inmobiliaria, DNI"),
            ("Empadronamiento", "Inscribir inmueble en catastro", 30, 5000, "Plano, Título, DNI"),
            ("Nomenclatura Catastral", "Certificado de nomenclatura", 10, 1500, "Partida, DNI"),
            ("Deslinde", "Definir límites del terreno", 45, 8000, "Plano de mensura, Título"),
            ("Unificación de Partidas", "Unificar partidas catastrales", 30, 6000, "Partidas a unificar, Plano"),
            ("Estado Parcelario", "Certificado de estado parcelario", 10, 2000, "Partida, DNI"),
            ("Copia de Plano", "Solicitar copia de plano archivado", 5, 1000, "Número de plano, DNI"),
            ("Informe de Dominio", "Información sobre titularidad", 10, 2500, "Partida inmobiliaria"),
            ("Actualización de Datos", "Actualizar datos catastrales", 15, 1500, "Documentación respaldatoria"),
        ]
    },
    "Espacios Verdes": {
        "icono": "TreeDeciduous",
        "color": "#22c55e",
        "tramites": [
            ("Poda de Árbol", "Solicitar poda en vía pública", 15, 0, "Ubicación, Fotos del árbol"),
            ("Extracción de Árbol", "Solicitar extracción de árbol", 30, 0, "Ubicación, Justificación, Fotos"),
            ("Plantación de Árbol", "Solicitar plantación", 20, 0, "Ubicación preferida"),
            ("Mantenimiento de Plaza", "Reportar necesidad de mantenimiento", 10, 0, "Ubicación, Descripción"),
            ("Permiso de Poda Privada", "Autorización para podar en propiedad", 10, 500, "Ubicación, Tipo de árbol"),
            ("Denuncia de Daño Ambiental", "Reportar daño a espacios verdes", 5, 0, "Ubicación, Fotos, Descripción"),
            ("Uso de Espacio Verde", "Permiso para evento en plaza", 15, 2000, "Descripción del evento, Fecha"),
            ("Informe Fitosanitario", "Evaluación de salud del árbol", 20, 1500, "Ubicación del árbol"),
            ("Reposición de Césped", "Solicitar reposición de césped", 15, 0, "Ubicación, Fotos"),
            ("Instalación de Riego", "Solicitar sistema de riego", 30, 0, "Ubicación, Justificación"),
        ]
    },
    "Desarrollo Social": {
        "icono": "Users",
        "color": "#ec4899",
        "tramites": [
            ("Subsidio Habitacional", "Solicitar subsidio para vivienda", 30, 0, "DNI, Certificado de ingresos, Informe social"),
            ("Bolsón Alimentario", "Solicitar asistencia alimentaria", 10, 0, "DNI, Certificado de domicilio"),
            ("Tarjeta Alimentaria", "Gestionar tarjeta alimentar", 15, 0, "DNI, Certificado de AUH"),
            ("Subsidio por Emergencia", "Ayuda por situación de emergencia", 7, 0, "DNI, Documentación de emergencia"),
            ("Programa de Empleo", "Inscripción en programa de empleo", 15, 0, "DNI, CV, Certificado de estudios"),
            ("Microcrédito Productivo", "Solicitar microcrédito", 30, 0, "DNI, Plan de negocio, Garantía"),
            ("Pensión No Contributiva", "Gestionar pensión", 45, 0, "DNI, Certificado médico, Informe social"),
            ("Programa de Capacitación", "Inscripción en cursos", 10, 0, "DNI, Formulario de inscripción"),
            ("Asistencia a Víctimas", "Programa de asistencia", 5, 0, "DNI, Denuncia si corresponde"),
            ("Certificado de Vulnerabilidad", "Certificado para trámites", 15, 0, "DNI, Informe social"),
        ]
    },
    "Rentas": {
        "icono": "CreditCard",
        "color": "#f97316",
        "tramites": [
            ("Libre Deuda Municipal", "Certificado de libre deuda", 5, 500, "DNI, Partida inmobiliaria"),
            ("Plan de Pago", "Adhesión a plan de pago", 10, 0, "DNI, Deuda a regularizar"),
            ("Exención de Tasas", "Solicitar exención impositiva", 30, 0, "DNI, Documentación respaldatoria"),
            ("Reclamo de Boleta", "Reclamo por boleta incorrecta", 15, 0, "Boleta, Documentación"),
            ("Alta de Contribuyente", "Inscribirse como contribuyente", 10, 0, "DNI, Título o contrato"),
            ("Baja de Contribuyente", "Darse de baja como contribuyente", 10, 0, "DNI, Documentación de venta/transferencia"),
            ("Cambio de Titularidad", "Cambiar titular de tasa", 15, 0, "Escritura, DNI nuevo titular"),
            ("Valuación de Inmueble", "Solicitar revaluación", 20, 1000, "Partida, Documentación"),
            ("Copia de Boleta", "Solicitar copia de boleta", 3, 200, "DNI, Período solicitado"),
            ("Certificado de Deuda", "Certificado con detalle de deuda", 5, 500, "DNI, Partida"),
        ]
    },
    "Salud": {
        "icono": "Heart",
        "color": "#ef4444",
        "tramites": [
            ("Libreta Sanitaria", "Obtener libreta sanitaria", 7, 1500, "DNI, Análisis clínicos"),
            ("Renovación Libreta Sanitaria", "Renovar libreta vencida", 5, 1000, "Libreta anterior, Análisis"),
            ("Vacunación", "Turno para vacunación", 3, 0, "DNI, Carnet de vacunas"),
            ("Certificado de Salud", "Para trámites varios", 7, 1500, "DNI"),
            ("Fumigación de Vivienda", "Solicitar fumigación", 15, 0, "DNI, Dirección"),
            ("Denuncia Sanitaria", "Denunciar problema sanitario", 5, 0, "Descripción, Ubicación"),
            ("Certificado Prenupcial", "Para matrimonio", 10, 2000, "DNI, Análisis"),
            ("Control de Plagas", "Solicitar control de plagas", 10, 0, "Dirección, Tipo de plaga"),
            ("Habilitación Sanitaria", "Para establecimientos", 30, 5000, "Plano, Documentación del local"),
            ("Certificado de Discapacidad", "Gestión de CUD", 45, 0, "DNI, Historia clínica, Estudios"),
        ]
    },
    "Cultura y Educación": {
        "icono": "Lightbulb",
        "color": "#06b6d4",
        "tramites": [
            ("Inscripción a Talleres", "Inscribirse en talleres municipales", 10, 0, "DNI, Formulario de inscripción"),
            ("Reserva de Espacio Cultural", "Reservar auditorio o sala", 15, 2000, "Descripción del evento, Fecha"),
            ("Auspicio Municipal", "Solicitar auspicio para evento", 20, 0, "Proyecto del evento, Presupuesto"),
            ("Biblioteca: Carnet", "Obtener carnet de biblioteca", 5, 0, "DNI, Foto carnet"),
            ("Beca de Estudios", "Solicitar beca municipal", 30, 0, "DNI, Certificado de alumno regular, Ingresos"),
            ("Uso de Escenario Público", "Para eventos artísticos", 15, 1500, "Descripción, Fecha, Rider técnico"),
            ("Registro de Artistas", "Inscripción en registro cultural", 10, 0, "DNI, Portfolio, CV artístico"),
            ("Subsidio Cultural", "Apoyo a proyectos culturales", 30, 0, "Proyecto, Presupuesto, Antecedentes"),
            ("Permiso de Filmación", "Filmar en espacios públicos", 15, 3000, "Guión, Locaciones, Seguro"),
            ("Declaración de Interés", "Declarar evento de interés", 20, 0, "Descripción del evento, Fundamentos"),
        ]
    },
    "Legales": {
        "icono": "FileCheck",
        "color": "#6366f1",
        "tramites": [
            ("Certificado de Residencia", "Certificar domicilio", 7, 500, "DNI, Servicio a nombre"),
            ("Legalización de Documentos", "Legalizar documentos municipales", 5, 300, "Documentos a legalizar"),
            ("Certificado de Convivencia", "Para trámites varios", 10, 500, "DNI de ambos, Testigos"),
            ("Fe de Vida", "Certificado de supervivencia", 3, 0, "DNI"),
            ("Autorización de Menores", "Para viaje de menores", 10, 1000, "DNI padres, DNI menor, Datos del viaje"),
            ("Registro de Firmas", "Registrar firma en municipio", 5, 500, "DNI"),
            ("Certificado de Conducta", "Antecedentes municipales", 10, 1000, "DNI"),
            ("Mediación Vecinal", "Solicitar mediación", 15, 0, "DNI, Descripción del conflicto"),
            ("Información Pública", "Acceso a información pública", 15, 0, "Solicitud detallada"),
            ("Registro Civil: Partidas", "Solicitar partidas", 10, 1500, "DNI, Datos del acta"),
        ]
    }
}


async def seed_tipos_tramites():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print("=" * 60)
        print("CREANDO TIPOS DE TRAMITES Y TRAMITES")
        print("=" * 60)

        # Verificar tipos existentes para no duplicar
        result = await db.execute(text(f"SELECT id, nombre FROM tipos_tramites WHERE municipio_id = {MUNICIPIO_ID}"))
        tipos_existentes = {row[1]: row[0] for row in result.fetchall()}
        print(f"Tipos existentes: {list(tipos_existentes.keys())}")

        # Obtener max orden
        result = await db.execute(text(f"SELECT COALESCE(MAX(orden), 0) FROM tipos_tramites WHERE municipio_id = {MUNICIPIO_ID}"))
        orden_tipo = result.scalar() + 1

        total_tipos_creados = 0
        total_tramites = 0

        for tipo_nombre, tipo_data in TIPOS_TRAMITES.items():
            # Si el tipo ya existe, obtener su ID y verificar/agregar tramites
            if tipo_nombre in tipos_existentes:
                tipo_id = tipos_existentes[tipo_nombre]
                print(f"\nTipo existente: {tipo_nombre} (ID: {tipo_id})")

                # Verificar tramites existentes para este tipo
                result = await db.execute(text(f"SELECT nombre FROM tramites WHERE tipo_tramite_id = {tipo_id}"))
                tramites_existentes = {row[0] for row in result.fetchall()}

                # Obtener max orden de tramites
                result = await db.execute(text(f"SELECT COALESCE(MAX(orden), 0) FROM tramites WHERE tipo_tramite_id = {tipo_id}"))
                orden_tramite = result.scalar() + 1

                tramites_agregados = 0
                for tramite in tipo_data["tramites"]:
                    nombre, descripcion, dias, costo, documentos = tramite

                    if nombre not in tramites_existentes:
                        await db.execute(text("""
                            INSERT INTO tramites (tipo_tramite_id, nombre, descripcion, tiempo_estimado_dias, costo, documentos_requeridos, activo, orden, created_at)
                            VALUES (:tipo_id, :nombre, :descripcion, :dias, :costo, :documentos, 1, :orden, NOW())
                        """), {
                            "tipo_id": tipo_id,
                            "nombre": nombre,
                            "descripcion": descripcion,
                            "dias": dias,
                            "costo": costo if costo > 0 else None,
                            "documentos": documentos,
                            "orden": orden_tramite
                        })
                        orden_tramite += 1
                        tramites_agregados += 1
                        total_tramites += 1

                print(f"  Ya tenía {len(tramites_existentes)} tramites, agregados {tramites_agregados} nuevos")
            else:
                # Crear nuevo tipo de trámite
                await db.execute(text("""
                    INSERT INTO tipos_tramites (municipio_id, nombre, icono, color, activo, orden, created_at)
                    VALUES (:municipio_id, :nombre, :icono, :color, 1, :orden, NOW())
                """), {
                    "municipio_id": MUNICIPIO_ID,
                    "nombre": tipo_nombre,
                    "icono": tipo_data["icono"],
                    "color": tipo_data["color"],
                    "orden": orden_tipo
                })

                # Obtener el ID del tipo creado
                result = await db.execute(text("SELECT LAST_INSERT_ID()"))
                tipo_id = result.scalar()

                print(f"\nNuevo tipo: {tipo_nombre} (ID: {tipo_id})")
                total_tipos_creados += 1
                orden_tipo += 1

                # Crear trámites para este tipo
                orden_tramite = 1
                for tramite in tipo_data["tramites"]:
                    nombre, descripcion, dias, costo, documentos = tramite

                    await db.execute(text("""
                        INSERT INTO tramites (tipo_tramite_id, nombre, descripcion, tiempo_estimado_dias, costo, documentos_requeridos, activo, orden, created_at)
                        VALUES (:tipo_id, :nombre, :descripcion, :dias, :costo, :documentos, 1, :orden, NOW())
                    """), {
                        "tipo_id": tipo_id,
                        "nombre": nombre,
                        "descripcion": descripcion,
                        "dias": dias,
                        "costo": costo if costo > 0 else None,
                        "documentos": documentos,
                        "orden": orden_tramite
                    })

                    orden_tramite += 1
                    total_tramites += 1

                print(f"  Creados {len(tipo_data['tramites'])} tramites")

        await db.commit()

        print("\n" + "=" * 60)
        print(f"COMPLETADO: {total_tipos_creados} tipos nuevos, {total_tramites} tramites agregados")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed_tipos_tramites())
