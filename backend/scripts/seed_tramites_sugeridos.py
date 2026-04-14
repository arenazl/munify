"""
Crea la tabla `tramites_sugeridos` si no existe y la puebla con un catálogo
de ~100 trámites típicos de municipios argentinos.

Esta tabla es COMÚN a todos los municipios — no tiene FK a municipios ni a
categorías. Sirve solamente como knowledge base para el autocomplete del
wizard de alta de trámites.

Ejecutar:
    cd backend && python -m scripts.seed_tramites_sugeridos
    # o para limpiar y recrear:
    cd backend && python -m scripts.seed_tramites_sugeridos --reset
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from core.config import settings


# Catálogo inicial: ~100 trámites agrupados por rubro aproximado.
# El `rubro` es un label descriptivo que NO tiene FK — solo agrupa visualmente
# en el autocomplete. Cada municipio decide en qué categoría propia lo mete.
CATALOGO = {
    "Obras Privadas": [
        ("Permiso de Obra Nueva",       "Autorización para construcción de vivienda nueva",       45, 15000, "Plano municipal|Título de propiedad|DNI"),
        ("Ampliación de Vivienda",      "Permiso para ampliar construcción existente",            30, 10000, "Plano de ampliación|Plano original|DNI"),
        ("Regularización de Obra",      "Regularizar construcciones sin permiso",                 60, 20000, "Plano de relevamiento|Título|Informe técnico"),
        ("Demolición",                  "Permiso para demoler construcción",                      15,  5000, "Plano de demolición|Seguro|DNI"),
        ("Permiso de Refacción",        "Autorización para refacciones menores",                  20,  3000, "Descripción de trabajos|DNI"),
        ("Final de Obra",               "Certificado de finalización de obra",                    30,  8000, "Plano conforme a obra|Fotos|Inspección"),
        ("Conexión de Servicios",       "Autorización para conexión de servicios",                15,  2000, "Plano de instalaciones|DNI"),
        ("Ocupación de Vía Pública",    "Permiso para obras en vereda",                           10,  1500, "Croquis|Seguro|Cronograma"),
        ("Plano de Mensura",            "Aprobación de plano de mensura",                         45, 12000, "Plano de agrimensor|Título"),
        ("Subdivisión de Lote",         "Autorización para subdividir terreno",                   60, 25000, "Plano de subdivisión|Título|Factibilidades"),
    ],
    "Comercio": [
        ("Habilitación Comercial",      "Habilitación de nuevo comercio",                         30,  8000, "Contrato de alquiler|Habilitación sanitaria|DNI"),
        ("Renovación de Habilitación",  "Renovar habilitación comercial",                         15,  4000, "Habilitación anterior|Libre deuda"),
        ("Cambio de Rubro",             "Modificar actividad comercial",                          20,  5000, "Habilitación actual|Nueva actividad"),
        ("Cambio de Titularidad",       "Transferir habilitación",                                25,  6000, "Contrato de transferencia|DNI nuevo titular"),
        ("Ampliación de Rubro",         "Agregar actividad comercial",                            15,  3000, "Habilitación actual|Nueva actividad"),
        ("Baja de Habilitación",        "Dar de baja comercio",                                   10,     0, "Habilitación|Libre deuda municipal"),
        ("Cartel Publicitario",         "Permiso para cartelería",                                15,  2000, "Diseño del cartel|Fotos fachada"),
        ("Habilitación de Depósito",    "Habilitar depósito comercial",                           20,  5000, "Plano|Habilitación bomberos"),
        ("Venta Ambulante",             "Permiso de venta ambulante",                             10,  1000, "DNI|Fotos del puesto"),
        ("Feria o Evento",              "Permiso para feria o evento",                            15,  3000, "Descripción del evento|Seguro"),
    ],
    "Tránsito": [
        ("Licencia de Conducir - Primera vez", "Obtener licencia de conducir por primera vez",     7,  5000, "DNI|Certificado psicofísico|Curso vial aprobado|Libre deuda infracciones"),
        ("Renovación de Licencia",      "Renovar licencia vencida",                                5,  4000, "Licencia anterior|Certificado psicofísico"),
        ("Duplicado de Licencia",       "Obtener duplicado por extravío",                          5,  3000, "DNI|Denuncia policial"),
        ("Cambio de Domicilio",         "Actualizar domicilio en licencia",                        5,  1500, "DNI actualizado|Licencia"),
        ("Libre Deuda de Infracciones", "Certificado de libre deuda de multas",                    3,   500, "DNI|Patente"),
        ("Permiso de Carga y Descarga", "Autorización para carga/descarga en zona comercial",     10,  2000, "Habilitación comercial|Patente"),
        ("Estacionamiento Reservado",   "Solicitar lugar reservado (discapacidad, etc)",          15,  3000, "Justificación|Croquis ubicación"),
        ("Señalización Vial",           "Solicitar señal de tránsito",                            20,     0, "Descripción del pedido|Ubicación"),
        ("Permiso Especial de Tránsito","Para vehículos especiales (cargas, medidas)",            10,  2500, "Documentación del vehículo"),
        ("Informe de Accidente",        "Solicitar informe de accidente de tránsito",             10,  1000, "DNI|Fecha y lugar del accidente"),
    ],
    "Catastro": [
        ("Certificado Catastral",       "Certificado de datos catastrales",                       10,  2000, "Título de propiedad|DNI"),
        ("Valuación Fiscal",            "Obtener valuación del inmueble",                         15,  2500, "Partida inmobiliaria|DNI"),
        ("Empadronamiento",             "Inscribir inmueble en catastro",                         30,  5000, "Plano|Título|DNI"),
        ("Nomenclatura Catastral",      "Certificado de nomenclatura",                            10,  1500, "Partida|DNI"),
        ("Deslinde",                    "Definir límites del terreno",                            45,  8000, "Plano de mensura|Título"),
        ("Unificación de Partidas",     "Unificar partidas catastrales",                          30,  6000, "Partidas a unificar|Plano"),
        ("Estado Parcelario",           "Certificado de estado parcelario",                       10,  2000, "Partida|DNI"),
        ("Copia de Plano",              "Solicitar copia de plano archivado",                      5,  1000, "Número de plano|DNI"),
        ("Informe de Dominio",          "Información sobre titularidad",                          10,  2500, "Partida inmobiliaria"),
        ("Actualización de Datos Catastrales", "Actualizar datos catastrales",                    15,  1500, "Documentación respaldatoria"),
    ],
    "Espacios Verdes": [
        ("Poda de Árbol",               "Solicitar poda en vía pública",                          15,     0, "Ubicación|Fotos del árbol"),
        ("Extracción de Árbol",         "Solicitar extracción de árbol en vía pública",           30,     0, "Ubicación|Justificación|Fotos"),
        ("Plantación de Árbol",         "Solicitar plantación en vereda o plaza",                 20,     0, "Ubicación preferida"),
        ("Mantenimiento de Plaza",      "Reportar necesidad de mantenimiento",                    10,     0, "Ubicación|Descripción"),
        ("Permiso de Poda Privada",     "Autorización para podar árbol en propiedad",             10,   500, "Ubicación|Tipo de árbol"),
        ("Uso de Espacio Verde",        "Permiso para evento en plaza pública",                   15,  2000, "Descripción del evento|Fecha|Seguro"),
        ("Informe Fitosanitario",       "Evaluación de salud del árbol",                          20,  1500, "Ubicación del árbol"),
    ],
    "Desarrollo Social": [
        ("Subsidio Habitacional",       "Solicitar subsidio para vivienda",                       30,     0, "DNI|Certificado de ingresos|Informe social"),
        ("Asistencia Alimentaria",      "Solicitar bolsón alimentario",                           10,     0, "DNI|Certificado de domicilio"),
        ("Tarjeta Alimentaria",         "Gestionar tarjeta alimentar",                            15,     0, "DNI|Certificado de AUH"),
        ("Subsidio por Emergencia",     "Ayuda por situación de emergencia",                       7,     0, "DNI|Documentación de emergencia"),
        ("Programa de Empleo",          "Inscripción en programa de empleo municipal",            15,     0, "DNI|CV|Certificado de estudios"),
        ("Microcrédito Productivo",     "Solicitar microcrédito para emprendimiento",             30,     0, "DNI|Plan de negocio|Garantía"),
        ("Pensión No Contributiva",     "Gestionar pensión no contributiva",                      45,     0, "DNI|Certificado médico|Informe social"),
        ("Programa de Capacitación",    "Inscripción en cursos y capacitaciones",                 10,     0, "DNI|Formulario de inscripción"),
        ("Certificado de Vulnerabilidad","Certificado de vulnerabilidad social",                  15,     0, "DNI|Informe social"),
    ],
    "Tasas y Tributos": [
        ("Libre Deuda Municipal",       "Certificado de libre deuda municipal",                    5,   500, "DNI|Partida inmobiliaria"),
        ("Plan de Pago",                "Adhesión a plan de pago de deuda",                       10,     0, "DNI|Deuda a regularizar"),
        ("Exención de Tasas",           "Solicitar exención impositiva",                          30,     0, "DNI|Documentación respaldatoria"),
        ("Reclamo de Boleta",           "Reclamo por boleta incorrecta",                          15,     0, "Boleta|Documentación"),
        ("Alta de Contribuyente",       "Inscribirse como contribuyente",                         10,     0, "DNI|Título o contrato"),
        ("Baja de Contribuyente",       "Darse de baja como contribuyente",                       10,     0, "DNI|Documentación de venta/transferencia"),
        ("Cambio de Titularidad de Tasa","Cambiar titular de tasa municipal",                     15,     0, "Escritura|DNI nuevo titular"),
        ("Revaluación de Inmueble",     "Solicitar revaluación de inmueble",                      20,  1000, "Partida|Documentación"),
        ("Copia de Boleta",             "Solicitar copia de boleta",                               3,   200, "DNI|Período solicitado"),
        ("Certificado de Deuda",        "Certificado con detalle de deuda",                        5,   500, "DNI|Partida"),
    ],
    "Salud y Bromatología": [
        ("Libreta Sanitaria",           "Obtener libreta sanitaria",                               7,  1500, "DNI|Análisis clínicos"),
        ("Renovación Libreta Sanitaria","Renovar libreta sanitaria vencida",                       5,  1000, "Libreta anterior|Análisis"),
        ("Vacunación",                  "Turno para vacunación",                                   3,     0, "DNI|Carnet de vacunas"),
        ("Certificado de Salud",        "Certificado de salud para trámites varios",               7,  1500, "DNI"),
        ("Fumigación de Vivienda",      "Solicitar fumigación de vivienda",                       15,     0, "DNI|Dirección"),
        ("Denuncia Sanitaria",          "Denunciar problema sanitario",                            5,     0, "Descripción|Ubicación"),
        ("Control de Plagas",           "Solicitar control de plagas en vía pública",             10,     0, "Dirección|Tipo de plaga"),
        ("Habilitación Sanitaria",      "Habilitación sanitaria para establecimientos",           30,  5000, "Plano|Documentación del local"),
        ("Certificado de Discapacidad", "Gestión de Certificado Único de Discapacidad (CUD)",     45,     0, "DNI|Historia clínica|Estudios"),
    ],
    "Cultura y Educación": [
        ("Inscripción a Talleres",      "Inscribirse en talleres municipales",                    10,     0, "DNI|Formulario de inscripción"),
        ("Reserva de Espacio Cultural", "Reservar auditorio o sala cultural",                     15,  2000, "Descripción del evento|Fecha"),
        ("Auspicio Municipal",          "Solicitar auspicio municipal para evento",               20,     0, "Proyecto del evento|Presupuesto"),
        ("Carnet de Biblioteca",        "Obtener carnet de biblioteca municipal",                  5,     0, "DNI|Foto carnet"),
        ("Beca de Estudios",            "Solicitar beca de estudios municipal",                   30,     0, "DNI|Certificado de alumno regular|Ingresos"),
        ("Permiso de Filmación",        "Permiso para filmar en espacios públicos",               15,  3000, "Guión|Locaciones|Seguro"),
        ("Declaración de Interés",      "Declarar evento de interés municipal",                   20,     0, "Descripción del evento|Fundamentos"),
    ],
    "Certificados y Legales": [
        ("Certificado de Residencia",   "Certificar domicilio",                                    7,   500, "DNI|Servicio a nombre"),
        ("Legalización de Documentos",  "Legalizar documentos municipales",                        5,   300, "Documentos a legalizar"),
        ("Certificado de Convivencia",  "Certificado de convivencia para trámites",               10,   500, "DNI de ambos|Testigos"),
        ("Fe de Vida",                  "Certificado de supervivencia",                            3,     0, "DNI"),
        ("Autorización de Menores",     "Autorización para viaje de menores",                     10,  1000, "DNI padres|DNI menor|Datos del viaje"),
        ("Certificado de Conducta",     "Certificado de antecedentes municipales",                10,  1000, "DNI"),
        ("Mediación Vecinal",           "Solicitar mediación vecinal",                            15,     0, "DNI|Descripción del conflicto"),
        ("Información Pública",         "Acceso a información pública",                           15,     0, "Solicitud detallada"),
        ("Solicitud de Partida",        "Solicitar partida del registro civil",                   10,  1500, "DNI|Datos del acta"),
    ],
    "Cementerios": [
        ("Concesión de Parcela",        "Solicitar concesión de parcela en cementerio",           30,  8000, "DNI|Documentación del fallecido"),
        ("Renovación de Concesión",     "Renovar concesión de parcela vencida",                   15,  5000, "Concesión anterior|DNI"),
        ("Traslado de Restos",          "Autorización para traslado de restos",                   20,  3000, "DNI|Autorización de familiares|Destino"),
        ("Exhumación",                  "Permiso de exhumación",                                  25,  4000, "DNI|Documentación del fallecido|Motivo"),
        ("Inhumación",                  "Permiso de inhumación",                                   2,  2000, "Certificado de defunción|DNI solicitante"),
    ],
}


async def run(reset: bool = False) -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        # 1. Crear la tabla si no existe
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS tramites_sugeridos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(200) NOT NULL,
                descripcion TEXT,
                tiempo_estimado_dias INT,
                costo FLOAT,
                documentos_sugeridos TEXT,
                rubro VARCHAR(100),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_ts_nombre (nombre),
                INDEX idx_ts_rubro (rubro)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))

        # 2. Si viene --reset, vaciar
        if reset:
            await conn.execute(text("DELETE FROM tramites_sugeridos"))
            print("[RESET] tabla vaciada")

        # 3. Contar cuántos hay
        r = await conn.execute(text("SELECT COUNT(*) FROM tramites_sugeridos"))
        existentes = r.scalar() or 0
        if existentes > 0 and not reset:
            print(f"[SKIP] ya hay {existentes} filas. Usar --reset para rehacer.")
            await engine.dispose()
            return

        # 4. Insertar
        total = 0
        for rubro, tramites in CATALOGO.items():
            for nombre, desc, tiempo, costo, docs in tramites:
                await conn.execute(
                    text("""
                        INSERT INTO tramites_sugeridos
                            (nombre, descripcion, tiempo_estimado_dias, costo, documentos_sugeridos, rubro)
                        VALUES (:nombre, :desc, :tiempo, :costo, :docs, :rubro)
                    """),
                    {
                        "nombre": nombre,
                        "desc": desc,
                        "tiempo": tiempo,
                        "costo": costo if costo > 0 else None,
                        "docs": docs,
                        "rubro": rubro,
                    },
                )
                total += 1

        print(f"[OK] sembrados {total} tramites sugeridos en {len(CATALOGO)} rubros")

    await engine.dispose()


if __name__ == "__main__":
    reset = "--reset" in sys.argv
    asyncio.run(run(reset=reset))
