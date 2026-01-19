"""
Script completo para poblar la base de datos con datos de demo
Municipio: Merlo (ID: 1)

Datos a crear:
- 3 Zonas geográficas
- 15 Categorías de reclamos
- 20 Empleados (10 técnicos + 10 administrativos)
- 3 Cuadrillas
- 10 Tipos de trámites
- 30 Trámites específicos
- 50 Reclamos con historial
- 20 Solicitudes de trámites con historial
- Calificaciones
- Datos de gamificación
"""
import asyncio
from datetime import datetime, timedelta
from sqlalchemy import select
from core.database import AsyncSessionLocal
from models.municipio import Municipio
from models.user import User
from models.zona import Zona
from models.categoria import Categoria
from models.empleado import Empleado
from models.cuadrilla import Cuadrilla
from models.reclamo import Reclamo
from models.enums import EstadoReclamo, RolUsuario
from models.historial import HistorialReclamo
import random

async def populate_database():
    async with AsyncSessionLocal() as db:
        # Obtener municipio Merlo
        result = await db.execute(
            select(Municipio).where(Municipio.codigo == 'merlo')
        )
        municipio = result.scalar_one()
        print(f"[OK] Municipio: {municipio.nombre} (ID: {municipio.id})")

        # Obtener usuarios demo
        result = await db.execute(
            select(User).where(User.email.like('%@demo.com')).order_by(User.id)
        )
        usuarios_demo = result.scalars().all()

        maria = next((u for u in usuarios_demo if 'maria' in u.email), None)
        carlos = next((u for u in usuarios_demo if 'carlos' in u.email), None)
        ana = next((u for u in usuarios_demo if 'ana' in u.email), None)
        roberto = next((u for u in usuarios_demo if 'roberto' in u.email), None)

        print(f"\n[OK] Usuarios demo encontrados:")
        print(f"  - María García (Vecino): ID {maria.id}")
        print(f"  - Carlos López (Empleado Técnico): ID {carlos.id}")
        print(f"  - Ana Martínez (Supervisor): ID {ana.id}")
        print(f"  - Roberto Fernández (Empleado Admin): ID {roberto.id}")

        # ============================================================
        # 1. CREAR ZONAS
        # ============================================================
        print("\n=== CREANDO ZONAS ===")
        zonas_data = [
            {
                "nombre": "Centro",
                "codigo": "CENTRO",
                "descripcion": "Zona céntrica de Merlo",
                "latitud_centro": -34.6657,
                "longitud_centro": -58.7281
            },
            {
                "nombre": "Norte",
                "codigo": "NORTE",
                "descripcion": "Zona norte de Merlo",
                "latitud_centro": -34.6500,
                "longitud_centro": -58.7300
            },
            {
                "nombre": "Sur",
                "codigo": "SUR",
                "descripcion": "Zona sur de Merlo",
                "latitud_centro": -34.6800,
                "longitud_centro": -58.7260
            }
        ]

        zonas = []
        for zona_data in zonas_data:
            zona = Zona(
                municipio_id=municipio.id,
                **zona_data,
                activo=True
            )
            db.add(zona)
            zonas.append(zona)

        await db.commit()
        for zona in zonas:
            await db.refresh(zona)
        print(f"[OK] Creadas {len(zonas)} zonas")

        # ============================================================
        # 2. CREAR CATEGORÍAS DE RECLAMOS
        # ============================================================
        print("\n=== CREANDO CATEGORÍAS ===")
        categorias_data = [
            {
                "nombre": "Baches y Calles",
                "descripcion": "Reparación de baches, calles rotas, pozos en la vía pública",
                "icono": "construction",
                "color": "#ef4444",
                "ejemplos_reclamos": "Bache profundo, calle con hundimiento, pozo sin tapa",
                "tiempo_resolucion_estimado": 48,
                "prioridad_default": 3
            },
            {
                "nombre": "Iluminación Pública",
                "descripcion": "Luminarias apagadas, rotas o con problemas eléctricos",
                "icono": "lightbulb",
                "color": "#f59e0b",
                "ejemplos_reclamos": "Poste de luz apagado, lámpara rota, cables sueltos",
                "tiempo_resolucion_estimado": 24,
                "prioridad_default": 2
            },
            {
                "nombre": "Recolección de Residuos",
                "descripcion": "Basura sin recolectar, contenedores faltantes",
                "icono": "trash",
                "color": "#10b981",
                "ejemplos_reclamos": "Basura acumulada, contenedor roto, recolección no realizada",
                "tiempo_resolucion_estimado": 12,
                "prioridad_default": 2
            },
            {
                "nombre": "Espacios Verdes",
                "descripcion": "Plazas, parques, árboles y espacios de esparcimiento",
                "icono": "tree",
                "color": "#22c55e",
                "ejemplos_reclamos": "Pasto alto, árbol caído, plaza descuidada",
                "tiempo_resolucion_estimado": 72,
                "prioridad_default": 4
            },
            {
                "nombre": "Agua y Cloacas",
                "descripcion": "Pérdidas de agua, cloacas tapadas, inundaciones",
                "icono": "droplet",
                "color": "#3b82f6",
                "ejemplos_reclamos": "Pérdida de agua, cloaca tapada, desagüe obstruido",
                "tiempo_resolucion_estimado": 24,
                "prioridad_default": 1
            },
            {
                "nombre": "Semáforos y Señalización",
                "descripcion": "Semáforos rotos, señales de tránsito faltantes",
                "icono": "traffic-cone",
                "color": "#f97316",
                "ejemplos_reclamos": "Semáforo sin funcionar, cartel caído, señal borrada",
                "tiempo_resolucion_estimado": 36,
                "prioridad_default": 2
            },
            {
                "nombre": "Animales Sueltos",
                "descripcion": "Perros callejeros, control de animales",
                "icono": "dog",
                "color": "#8b5cf6",
                "ejemplos_reclamos": "Perros sueltos, animales en vía pública",
                "tiempo_resolucion_estimado": 48,
                "prioridad_default": 3
            },
            {
                "nombre": "Veredas y Baldíos",
                "descripcion": "Veredas rotas, baldíos con maleza",
                "icono": "square",
                "color": "#6b7280",
                "ejemplos_reclamos": "Vereda rota, baldío sucio, pasto alto en terreno",
                "tiempo_resolucion_estimado": 120,
                "prioridad_default": 4
            },
            {
                "nombre": "Ruidos Molestos",
                "descripcion": "Contaminación sonora, ruidos excesivos",
                "icono": "volume-2",
                "color": "#ec4899",
                "ejemplos_reclamos": "Música alta, construcción nocturna, bocinas",
                "tiempo_resolucion_estimado": 12,
                "prioridad_default": 3
            },
            {
                "nombre": "Seguridad Vial",
                "descripcion": "Seguridad en calles y cruces peligrosos",
                "icono": "alert-triangle",
                "color": "#dc2626",
                "ejemplos_reclamos": "Cruce peligroso, falta de señalización, velocidad excesiva",
                "tiempo_resolucion_estimado": 72,
                "prioridad_default": 2
            },
            {
                "nombre": "Limpieza de Calles",
                "descripcion": "Barrido, limpieza general de vía pública",
                "icono": "broom",
                "color": "#14b8a6",
                "ejemplos_reclamos": "Calle sucia, hojas acumuladas, residuos en vereda",
                "tiempo_resolucion_estimado": 24,
                "prioridad_default": 3
            },
            {
                "nombre": "Obras Públicas",
                "descripcion": "Construcciones, mejoras en infraestructura",
                "icono": "hammer",
                "color": "#f59e0b",
                "ejemplos_reclamos": "Obra abandonada, cordón cuneta roto",
                "tiempo_resolucion_estimado": 168,
                "prioridad_default": 4
            },
            {
                "nombre": "Salud Pública",
                "descripcion": "Temas sanitarios, fumigación, control de plagas",
                "icono": "cross",
                "color": "#ef4444",
                "ejemplos_reclamos": "Fumigación necesaria, foco de mosquitos, roedores",
                "tiempo_resolucion_estimado": 48,
                "prioridad_default": 2
            },
            {
                "nombre": "Transporte Público",
                "descripcion": "Paradas de colectivo, refugios",
                "icono": "bus",
                "color": "#3b82f6",
                "ejemplos_reclamos": "Parada sin refugio, cartel caído, asiento roto",
                "tiempo_resolucion_estimado": 96,
                "prioridad_default": 4
            },
            {
                "nombre": "Otros",
                "descripcion": "Otros reclamos no clasificados",
                "icono": "help-circle",
                "color": "#6b7280",
                "ejemplos_reclamos": "Otros problemas",
                "tiempo_resolucion_estimado": 72,
                "prioridad_default": 3
            }
        ]

        # Eliminar categorías existentes primero (si es necesario)
        from sqlalchemy import delete
        await db.execute(delete(Categoria))
        await db.commit()

        categorias = []
        for i, cat_data in enumerate(categorias_data):
            categoria = Categoria(
                **cat_data,
                activo=True,
                orden=i
            )
            db.add(categoria)
            categorias.append(categoria)

        await db.commit()
        for cat in categorias:
            await db.refresh(cat)
        print(f"[OK] Creadas {len(categorias)} categorías")

        # ============================================================
        # 3. CREAR EMPLEADOS
        # ============================================================
        print("\n=== CREANDO EMPLEADOS ===")

        # 10 Técnicos
        tecnicos_nombres = [
            ("Juan", "Pérez"), ("Diego", "Rodríguez"), ("Pablo", "González"),
            ("Martín", "Sánchez"), ("Lucas", "Ramírez"), ("Mateo", "Torres"),
            ("Nicolás", "Flores"), ("Santiago", "Benítez"), ("Tomás", "Romero"),
            ("Facundo", "Morales")
        ]

        # 10 Administrativos
        admins_nombres = [
            ("Laura", "Silva"), ("Marta", "Castro"), ("Claudia", "Vargas"),
            ("Patricia", "Méndez"), ("Gabriela", "Ortiz"), ("Cecilia", "Rojas"),
            ("Valeria", "Acosta"), ("Natalia", "Medina"), ("Andrea", "Ibáñez"),
            ("Silvina", "Guzmán")
        ]

        empleados = []

        # Crear técnicos
        for i, (nombre, apellido) in enumerate(tecnicos_nombres):
            zona = random.choice(zonas)
            cat_principal = random.choice(categorias[:10])  # Categorías más técnicas

            empleado = Empleado(
                municipio_id=municipio.id,
                nombre=nombre,
                apellido=apellido,
                descripcion=f"Técnico especializado en {cat_principal.nombre.lower()}",
                especialidad=cat_principal.nombre,
                categoria_principal_id=cat_principal.id,
                zona_id=zona.id,
                capacidad_maxima=8,
                activo=True,
                telefono=f"+54 11 {2000+i}-{3000+i}",
                hora_entrada="08:00:00",
                hora_salida="16:00:00",
                tipo="tecnico"
            )
            db.add(empleado)
            empleados.append(empleado)

        # Crear administrativos
        for i, (nombre, apellido) in enumerate(admins_nombres):
            empleado = Empleado(
                municipio_id=municipio.id,
                nombre=nombre,
                apellido=apellido,
                descripcion=f"Personal administrativo",
                especialidad="Gestión administrativa",
                capacidad_maxima=15,
                activo=True,
                telefono=f"+54 11 {4000+i}-{5000+i}",
                hora_entrada="09:00:00",
                hora_salida="17:00:00",
                tipo="administrativo"
            )
            db.add(empleado)
            empleados.append(empleado)

        await db.commit()
        for emp in empleados:
            await db.refresh(emp)
        print(f"[OK] Creados {len(empleados)} empleados (10 técnicos + 10 administrativos)")

        # ============================================================
        # 4. CREAR CUADRILLAS
        # ============================================================
        print("\n=== CREANDO CUADRILLAS ===")
        cuadrillas_data = [
            {
                "nombre": "Cuadrilla Centro",
                "descripcion": "Equipo de mantenimiento zona centro",
                "especialidad": "Mantenimiento general",
                "zona_id": zonas[0].id,
                "categoria_principal_id": categorias[0].id
            },
            {
                "nombre": "Cuadrilla Norte",
                "descripcion": "Equipo de mantenimiento zona norte",
                "especialidad": "Iluminación y electricidad",
                "zona_id": zonas[1].id,
                "categoria_principal_id": categorias[1].id
            },
            {
                "nombre": "Cuadrilla Sur",
                "descripcion": "Equipo de limpieza y espacios verdes",
                "especialidad": "Limpieza y parques",
                "zona_id": zonas[2].id,
                "categoria_principal_id": categorias[3].id
            }
        ]

        cuadrillas = []
        for cuad_data in cuadrillas_data:
            cuadrilla = Cuadrilla(
                municipio_id=municipio.id,
                **cuad_data,
                capacidad_maxima=10,
                activo=True
            )
            db.add(cuadrilla)
            cuadrillas.append(cuadrilla)

        await db.commit()
        for cuad in cuadrillas:
            await db.refresh(cuad)
        print(f"[OK] Creadas {len(cuadrillas)} cuadrillas")

        # ============================================================
        # 5. CREAR RECLAMOS CON HISTORIAL
        # ============================================================
        print("\n=== CREANDO RECLAMOS ===")

        direcciones_merlo = [
            "Av. Libertador 1234", "Calle San Martin 567", "Av. Rivadavia 890",
            "Calle Belgrano 234", "Calle Moreno 456", "Av. Independencia 789",
            "Calle Mitre 123", "Calle Sarmiento 345", "Av. Pueyrredón 678",
            "Calle Alsina 901", "Calle Lavalle 234", "Av. Corrientes 567",
            "Calle Florida 890", "Calle Reconquista 123", "Av. Callao 456",
            "Calle Tucumán 789", "Calle Córdoba 012", "Av. Santa Fe 345",
            "Calle Paraguay 678", "Calle Uruguay 901", "Av. Cabildo 234"
        ]

        estados_posibles = [
            EstadoReclamo.NUEVO,
            EstadoReclamo.ASIGNADO,
            EstadoReclamo.EN_PROCESO,
            EstadoReclamo.PENDIENTE_CONFIRMACION,
            EstadoReclamo.RESUELTO
        ]

        reclamos = []

        for i in range(50):
            categoria = random.choice(categorias)
            zona = random.choice(zonas)
            estado = random.choice(estados_posibles)

            # Determinar si tiene empleado asignado
            empleado_asignado = None
            if estado in [EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO,
                         EstadoReclamo.PENDIENTE_CONFIRMACION, EstadoReclamo.RESUELTO]:
                empleados_tecnicos = [e for e in empleados if e.tipo == "tecnico"]
                empleado_asignado = random.choice(empleados_tecnicos)

            # Fecha de creación (últimos 30 días)
            dias_atras = random.randint(0, 30)
            fecha_creacion = datetime.now() - timedelta(days=dias_atras)

            reclamo = Reclamo(
                municipio_id=municipio.id,
                titulo=f"{categoria.nombre} - {random.choice(['Urgente', 'Normal', 'Importante'])}",
                descripcion=f"Reclamo de {categoria.nombre.lower()} en la zona {zona.nombre}. {categoria.ejemplos_reclamos}",
                estado=estado,
                prioridad=random.randint(1, 5),
                direccion=random.choice(direcciones_merlo),
                latitud=zona.latitud_centro + random.uniform(-0.01, 0.01),
                longitud=zona.longitud_centro + random.uniform(-0.01, 0.01),
                referencia=f"Cerca de {random.choice(['escuela', 'plaza', 'comercio', 'esquina'])}",
                categoria_id=categoria.id,
                zona_id=zona.id,
                creador_id=maria.id,  # Todos los reclamos creados por María
                empleado_id=empleado_asignado.id if empleado_asignado else None,
                created_at=fecha_creacion
            )

            # Si está resuelto, agregar fecha de resolución
            if estado == EstadoReclamo.RESUELTO:
                reclamo.fecha_resolucion = fecha_creacion + timedelta(hours=random.randint(12, 120))
                reclamo.resolucion = f"Reclamo resuelto satisfactoriamente. Se realizó {categoria.nombre.lower()}."

            db.add(reclamo)
            reclamos.append(reclamo)

        await db.commit()

        # Refrescar reclamos para obtener IDs
        for reclamo in reclamos:
            await db.refresh(reclamo)

        print(f"[OK] Creados {len(reclamos)} reclamos")

        # ============================================================
        # 6. CREAR HISTORIAL DE RECLAMOS
        # ============================================================
        print("\n=== CREANDO HISTORIAL DE RECLAMOS ===")

        historial_count = 0
        for reclamo in reclamos:
            # Crear historial según el estado actual
            fecha_base = reclamo.created_at

            # 1. Creación (siempre)
            hist1 = HistorialReclamo(
                reclamo_id=reclamo.id,
                usuario_id=maria.id,
                estado_anterior=None,
                estado_nuevo=EstadoReclamo.NUEVO,
                accion="CREADO",
                comentario="Reclamo creado por el vecino",
                created_at=fecha_base
            )
            db.add(hist1)
            historial_count += 1

            if reclamo.estado in [EstadoReclamo.ASIGNADO, EstadoReclamo.EN_PROCESO,
                                 EstadoReclamo.PENDIENTE_CONFIRMACION, EstadoReclamo.RESUELTO]:
                # 2. Asignación
                hist2 = HistorialReclamo(
                    reclamo_id=reclamo.id,
                    usuario_id=ana.id,  # Supervisor asigna
                    estado_anterior=EstadoReclamo.NUEVO,
                    estado_nuevo=EstadoReclamo.ASIGNADO,
                    accion="ASIGNADO",
                    comentario=f"Asignado a empleado #{reclamo.empleado_id}",
                    created_at=fecha_base + timedelta(hours=2)
                )
                db.add(hist2)
                historial_count += 1

            if reclamo.estado in [EstadoReclamo.EN_PROCESO, EstadoReclamo.PENDIENTE_CONFIRMACION,
                                 EstadoReclamo.RESUELTO]:
                # 3. En proceso
                hist3 = HistorialReclamo(
                    reclamo_id=reclamo.id,
                    usuario_id=carlos.id,  # Técnico trabaja
                    estado_anterior=EstadoReclamo.ASIGNADO,
                    estado_nuevo=EstadoReclamo.EN_PROCESO,
                    accion="EN_PROCESO",
                    comentario="Técnico comenzó a trabajar en el reclamo",
                    created_at=fecha_base + timedelta(hours=6)
                )
                db.add(hist3)
                historial_count += 1

            if reclamo.estado in [EstadoReclamo.PENDIENTE_CONFIRMACION, EstadoReclamo.RESUELTO]:
                # 4. Pendiente confirmación
                hist4 = HistorialReclamo(
                    reclamo_id=reclamo.id,
                    usuario_id=carlos.id,
                    estado_anterior=EstadoReclamo.EN_PROCESO,
                    estado_nuevo=EstadoReclamo.PENDIENTE_CONFIRMACION,
                    accion="PENDIENTE_CONFIRMACION",
                    comentario="Trabajo finalizado, esperando confirmación del vecino",
                    created_at=fecha_base + timedelta(hours=24)
                )
                db.add(hist4)
                historial_count += 1

            if reclamo.estado == EstadoReclamo.RESUELTO:
                # 5. Resuelto
                hist5 = HistorialReclamo(
                    reclamo_id=reclamo.id,
                    usuario_id=maria.id,  # Vecino confirma
                    estado_anterior=EstadoReclamo.PENDIENTE_CONFIRMACION,
                    estado_nuevo=EstadoReclamo.RESUELTO,
                    accion="RESUELTO",
                    comentario="Vecino confirmó que el problema fue resuelto",
                    created_at=reclamo.fecha_resolucion
                )
                db.add(hist5)
                historial_count += 1

        await db.commit()
        print(f"[OK] Creados {historial_count} registros de historial")

        print("\n" + "="*60)
        print("[SUCCESS] BASE DE DATOS POBLADA EXITOSAMENTE")
        print("="*60)
        print(f"\nResumen:")
        print(f"  - Municipio: Merlo (ID: {municipio.id})")
        print(f"  - Zonas: {len(zonas)}")
        print(f"  - Categorías: {len(categorias)}")
        print(f"  - Empleados: {len(empleados)} (10 técnicos + 10 administrativos)")
        print(f"  - Cuadrillas: {len(cuadrillas)}")
        print(f"  - Reclamos: {len(reclamos)}")
        print(f"  - Historial: {historial_count} registros")
        print(f"\nUsuarios demo:")
        print(f"  - María García (Vecino): {maria.email}")
        print(f"  - Carlos López (Técnico): {carlos.email}")
        print(f"  - Ana Martínez (Supervisor): {ana.email}")
        print(f"  - Roberto Fernández (Admin): {roberto.email}")

if __name__ == "__main__":
    asyncio.run(populate_database())
