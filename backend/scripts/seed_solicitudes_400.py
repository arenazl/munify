"""
Script para crear 400 solicitudes de trámites con distintos estados.
Ejecutar con: python backend/scripts/seed_solicitudes_400.py
"""
import asyncio
import sys
import random
from datetime import datetime, timedelta

sys.path.insert(0, "c:/Code/sugerenciasMun/backend")

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from core.config import settings

MUNICIPIO_ID = 48  # Merlo
CANTIDAD_SOLICITUDES = 400

# Datos de ejemplo
NOMBRES = [
    "Juan", "María", "Carlos", "Ana", "Pedro", "Laura", "Diego", "Lucía",
    "Martín", "Sofía", "Pablo", "Valentina", "Nicolás", "Camila", "Fernando",
    "Agustina", "Sebastián", "Florencia", "Tomás", "Julieta", "Matías", "Rocío",
    "Lucas", "Milagros", "Facundo", "Aldana", "Gonzalo", "Brenda", "Emiliano", "Abril"
]

APELLIDOS = [
    "García", "Rodríguez", "López", "Martínez", "González", "Fernández", "Pérez",
    "Sánchez", "Romero", "Torres", "Díaz", "Álvarez", "Ruiz", "Jiménez", "Hernández",
    "Moreno", "Muñoz", "Castro", "Vargas", "Ortiz", "Silva", "Núñez", "Rojas", "Medina",
    "Aguirre", "Flores", "Cabrera", "Molina", "Suárez", "Benítez"
]

CALLES = [
    "Av. San Martín", "Av. del Libertador", "Calle 25 de Mayo", "Belgrano", "Rivadavia",
    "Mitre", "Sarmiento", "Moreno", "Av. de Mayo", "Italia", "España", "Francia",
    "Colón", "Urquiza", "Roca", "Pellegrini", "Alberdi", "Lavalle", "Tucumán", "Corrientes",
    "Av. Eva Perón", "Av. Juan Manuel de Rosas", "Los Cedros", "Las Acacias", "Los Álamos"
]

BARRIOS = [
    "Centro", "San Antonio", "Libertad", "Mariano Acosta", "Pontevedra",
    "Parque San Martín", "Villa Luzuriaga", "San Carlos", "La Perlita", "El Olimpo"
]

# Asuntos específicos por tipo de trámite
ASUNTOS_COMERCIO = [
    "Apertura de local gastronómico",
    "Habilitación de kiosco",
    "Local de ropa y accesorios",
    "Peluquería y estética",
    "Ferretería barrial",
    "Verdulería y almacén",
    "Gimnasio y fitness",
    "Panadería artesanal",
    "Farmacia",
    "Consultorio médico"
]

ASUNTOS_OBRAS = [
    "Construcción de vivienda unifamiliar",
    "Ampliación de dormitorio",
    "Construcción de garage",
    "Refacción de baño y cocina",
    "Regularización de ampliación existente",
    "Construcción de pileta",
    "Obra nueva en lote baldío",
    "Ampliación de local comercial",
    "Construcción de quincho",
    "Demolición de estructura antigua"
]

ASUNTOS_TRANSITO = [
    "Obtener licencia clase B",
    "Renovación de licencia vencida",
    "Duplicado por robo",
    "Licencia profesional clase D",
    "Cambio de domicilio en licencia",
    "Libre deuda para transferencia",
    "Permiso de estacionamiento especial",
    "Solicitud de rampa para discapacidad",
    "Licencia de moto clase A",
    "Renovación anticipada"
]

ASUNTOS_GENERICOS = [
    "Solicitud de certificado",
    "Trámite de regularización",
    "Consulta por requisitos",
    "Presentación de documentación",
    "Renovación de permiso",
    "Actualización de datos",
    "Solicitud urgente",
    "Trámite iniciado online"
]

OBSERVACIONES = [
    "Adjunto toda la documentación requerida.",
    "Por favor, comunicarse al celular indicado.",
    "Necesito este trámite con urgencia por motivos laborales.",
    "Es para regularizar una situación pendiente.",
    "Ya presenté documentación anteriormente, falta completar.",
    "Consulté en mesa de entradas y me derivaron acá.",
    "Tengo turno programado para la semana que viene.",
    "Solicito información sobre el estado del trámite.",
    "Adjunto comprobante de pago de la tasa correspondiente.",
    ""
]

RESPUESTAS_APROBADO = [
    "Trámite aprobado. Puede retirar su documentación en mesa de entradas.",
    "Solicitud aprobada según lo requerido. Aguarde notificación para retiro.",
    "Trámite finalizado satisfactoriamente.",
    "Aprobado. Se envía notificación al email registrado.",
]

RESPUESTAS_RECHAZADO = [
    "Documentación incompleta. Falta certificado de domicilio.",
    "No cumple con los requisitos establecidos en la ordenanza vigente.",
    "Rechazado por inconsistencias en la documentación presentada.",
    "La actividad solicitada no está permitida en la zona indicada.",
]

# Estados con distribución realista
ESTADOS_DISTRIBUCION = [
    ("INICIADO", 25),           # 25%
    ("EN_REVISION", 20),        # 20%
    ("REQUIERE_DOCUMENTACION", 15),  # 15%
    ("EN_PROCESO", 15),         # 15%
    ("APROBADO", 10),           # 10%
    ("FINALIZADO", 10),         # 10%
    ("RECHAZADO", 5),           # 5%
]


def generar_estados():
    """Genera lista de estados según distribución"""
    estados = []
    for estado, porcentaje in ESTADOS_DISTRIBUCION:
        estados.extend([estado] * porcentaje)
    return estados


def generar_telefono():
    return f"11{random.randint(30000000, 69999999)}"


def generar_dni():
    return str(random.randint(20000000, 45000000))


def generar_email(nombre, apellido):
    dominios = ["gmail.com", "hotmail.com", "yahoo.com.ar", "outlook.com"]
    return f"{nombre.lower()}.{apellido.lower()}{random.randint(1,99)}@{random.choice(dominios)}"


def generar_direccion():
    calle = random.choice(CALLES)
    numero = random.randint(100, 9999)
    barrio = random.choice(BARRIOS)
    return f"{calle} {numero}, {barrio}, Merlo"


async def seed_solicitudes():
    print("=" * 60)
    print(f"CREANDO {CANTIDAD_SOLICITUDES} SOLICITUDES DE TRAMITES")
    print("=" * 60)

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # Obtener trámites existentes
        result = await db.execute(text(f"""
            SELECT t.id, t.nombre, tt.nombre as tipo_nombre
            FROM tramites t
            JOIN tipos_tramites tt ON t.tipo_tramite_id = tt.id
            WHERE tt.municipio_id = {MUNICIPIO_ID} AND t.activo = 1
        """))
        tramites = result.fetchall()

        if not tramites:
            print("[ERROR] No hay trámites. Ejecute primero seed_tipos_tramites_completo.py")
            return

        print(f"Trámites disponibles: {len(tramites)}")

        # Obtener empleados para asignar
        result = await db.execute(text(f"""
            SELECT id FROM empleados WHERE municipio_id = {MUNICIPIO_ID} AND activo = 1
        """))
        empleados = [row[0] for row in result.fetchall()]
        print(f"Empleados disponibles: {len(empleados)}")

        # Obtener usuarios existentes
        result = await db.execute(text(f"""
            SELECT id, nombre, apellido, email FROM usuarios WHERE municipio_id = {MUNICIPIO_ID} LIMIT 20
        """))
        usuarios = result.fetchall()
        print(f"Usuarios para asociar: {len(usuarios)}")

        # Obtener último número de solicitud
        result = await db.execute(text(f"""
            SELECT COALESCE(MAX(CAST(SUBSTRING(numero_tramite, 10) AS UNSIGNED)), 0)
            FROM solicitudes WHERE municipio_id = {MUNICIPIO_ID}
        """))
        ultimo_numero = result.scalar() or 0
        print(f"Último número de solicitud: {ultimo_numero}")

        year = datetime.now().year
        estados = generar_estados()

        creadas = 0
        for i in range(CANTIDAD_SOLICITUDES):
            tramite = random.choice(tramites)
            tramite_id = tramite[0]
            tramite_nombre = tramite[1]
            tipo_nombre = tramite[2]

            # Seleccionar asunto según tipo
            if "Comercio" in tipo_nombre:
                asunto = random.choice(ASUNTOS_COMERCIO)
            elif "Obra" in tipo_nombre:
                asunto = random.choice(ASUNTOS_OBRAS)
            elif "Tránsito" in tipo_nombre:
                asunto = random.choice(ASUNTOS_TRANSITO)
            else:
                asunto = random.choice(ASUNTOS_GENERICOS)

            asunto = f"{asunto} - {tramite_nombre}"

            nombre = random.choice(NOMBRES)
            apellido = random.choice(APELLIDOS)

            # 40% tendrán usuario asociado
            usuario = random.choice(usuarios) if usuarios and random.random() < 0.4 else None

            estado = random.choice(estados)

            # Fecha de creación en los últimos 120 días
            dias_atras = random.randint(0, 120)
            created_at = datetime.now() - timedelta(days=dias_atras)

            # Prioridad (1=urgente a 5=baja)
            prioridad = random.choices([1, 2, 3, 4, 5], weights=[5, 15, 50, 20, 10])[0]

            numero_tramite = f"SOL-{year}-{str(ultimo_numero + i + 1).zfill(5)}"

            # Empleado asignado para estados que ya fueron revisados
            empleado_id = None
            if estado in ["EN_REVISION", "REQUIERE_DOCUMENTACION", "EN_PROCESO", "APROBADO", "FINALIZADO", "RECHAZADO"] and empleados:
                empleado_id = random.choice(empleados)

            # Respuesta para estados finales
            respuesta = None
            fecha_resolucion = None
            if estado in ["APROBADO", "FINALIZADO"]:
                respuesta = random.choice(RESPUESTAS_APROBADO)
                fecha_resolucion = created_at + timedelta(days=random.randint(5, 45))
            elif estado == "RECHAZADO":
                respuesta = random.choice(RESPUESTAS_RECHAZADO)
                fecha_resolucion = created_at + timedelta(days=random.randint(3, 30))

            observaciones = random.choice(OBSERVACIONES) if random.random() > 0.3 else None

            # Calcular updated_at según estado (simular demoras realistas)
            updated_at = created_at
            if estado == "INICIADO":
                # Recién creado, sin actividad
                updated_at = created_at
            elif estado == "EN_REVISION":
                # Tomado 1-3 días después
                updated_at = created_at + timedelta(days=random.randint(1, 3))
            elif estado == "REQUIERE_DOCUMENTACION":
                # Revisado 2-7 días después
                updated_at = created_at + timedelta(days=random.randint(2, 7))
            elif estado == "EN_PROCESO":
                # En proceso 3-15 días después
                updated_at = created_at + timedelta(days=random.randint(3, 15))
            elif estado in ["APROBADO", "FINALIZADO", "RECHAZADO"]:
                # Resuelto, usar fecha_resolucion
                updated_at = fecha_resolucion if fecha_resolucion else created_at + timedelta(days=random.randint(5, 30))

            # Insertar solicitud
            await db.execute(text("""
                INSERT INTO solicitudes (
                    municipio_id, tramite_id, numero_tramite, asunto, descripcion,
                    estado, prioridad,
                    solicitante_id, nombre_solicitante, apellido_solicitante,
                    dni_solicitante, email_solicitante, telefono_solicitante, direccion_solicitante,
                    empleado_id, respuesta, observaciones, fecha_resolucion, created_at, updated_at
                ) VALUES (
                    :municipio_id, :tramite_id, :numero_tramite, :asunto, :descripcion,
                    :estado, :prioridad,
                    :solicitante_id, :nombre, :apellido,
                    :dni, :email, :telefono, :direccion,
                    :empleado_id, :respuesta, :observaciones, :fecha_resolucion, :created_at, :updated_at
                )
            """), {
                "municipio_id": MUNICIPIO_ID,
                "tramite_id": tramite_id,
                "numero_tramite": numero_tramite,
                "asunto": asunto,
                "descripcion": f"Solicitud de {tramite_nombre}",
                "estado": estado,
                "prioridad": prioridad,
                "solicitante_id": usuario[0] if usuario else None,
                "nombre": usuario[1] if usuario else nombre,
                "apellido": usuario[2] if usuario else apellido,
                "dni": generar_dni(),
                "email": usuario[3] if usuario else generar_email(nombre, apellido),
                "telefono": generar_telefono(),
                "direccion": generar_direccion(),
                "empleado_id": empleado_id,
                "respuesta": respuesta,
                "observaciones": observaciones,
                "fecha_resolucion": fecha_resolucion,
                "created_at": created_at,
                "updated_at": updated_at,
            })

            creadas += 1
            if creadas % 50 == 0:
                print(f"  ... {creadas}/{CANTIDAD_SOLICITUDES} creadas")

        await db.commit()

        # Resumen por estado
        print(f"\n[OK] {creadas} solicitudes creadas")

        result = await db.execute(text(f"""
            SELECT estado, COUNT(*) as cantidad
            FROM solicitudes
            WHERE municipio_id = {MUNICIPIO_ID}
            GROUP BY estado
            ORDER BY cantidad DESC
        """))

        print("\nResumen por estado:")
        for row in result.fetchall():
            print(f"  - {row[0]}: {row[1]}")

        # Resumen por tipo de trámite
        result = await db.execute(text(f"""
            SELECT tt.nombre, COUNT(*) as cantidad
            FROM solicitudes s
            JOIN tramites t ON s.tramite_id = t.id
            JOIN tipos_tramites tt ON t.tipo_tramite_id = tt.id
            WHERE s.municipio_id = {MUNICIPIO_ID}
            GROUP BY tt.nombre
            ORDER BY cantidad DESC
            LIMIT 10
        """))

        print("\nTop 10 por tipo de trámite:")
        for row in result.fetchall():
            print(f"  - {row[0]}: {row[1]}")

        print("\n" + "=" * 60)
        print("SEED COMPLETADO")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed_solicitudes())
