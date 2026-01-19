"""
Script simplificado para poblar datos básicos
Usa SQL directo para evitar conflictos con modelos
"""
import asyncio
from datetime import datetime, timedelta
import random
from sqlalchemy import text, select
from core.database import AsyncSessionLocal

async def populate_simple():
    async with AsyncSessionLocal() as db:
        print("=== POBLANDO BASE DE DATOS ===\n")

        # Get municipio (asumiendo que es ID 1 - Merlo)
        municipio_id = 1

        # =================================================================
        # 1. LIMPIAR DATOS EXISTENTES
        # =================================================================
        print("Limpiando datos existentes...")
        await db.execute(text("DELETE FROM historial_reclamos"))
        await db.execute(text("DELETE FROM reclamos"))
        await db.execute(text("DELETE FROM cuadrillas"))
        await db.execute(text("DELETE FROM empleados"))
        await db.execute(text("DELETE FROM categorias"))
        await db.execute(text("DELETE FROM zonas"))
        await db.commit()
        print("[OK] Datos limpiados\n")

        # =================================================================
        # 2. CREAR ZONAS
        # =================================================================
        print("Creando zonas...")
        zonas_sql = """
        INSERT INTO zonas (municipio_id, nombre, codigo, descripcion, latitud_centro, longitud_centro, activo)
        VALUES
            (1, 'Centro', 'CENTRO', 'Zona céntrica de Merlo', -34.6657, -58.7281, 1),
            (1, 'Norte', 'NORTE', 'Zona norte de Merlo', -34.6500, -58.7300, 1),
            (1, 'Sur', 'SUR', 'Zona sur de Merlo', -34.6800, -58.7260, 1)
        """
        await db.execute(text(zonas_sql))
        await db.commit()
        result = await db.execute(text("SELECT id FROM zonas ORDER BY id"))
        zona_ids = [row[0] for row in result.fetchall()]
        print(f"[OK] Creadas 3 zonas: {zona_ids}\n")

        # =================================================================
        # 3. CREAR CATEGORÍAS
        # =================================================================
        print("Creando categorías...")
        categorias_sql = """
        INSERT INTO categorias (organizacion_id, nombre, descripcion, icono, color, ejemplos_reclamos, tiempo_resolucion_estimado, prioridad_default, orden, activo)
        VALUES
            (1, 'Baches y Calles', 'Reparación de baches, calles rotas', 'construction', '#ef4444', 'Bache profundo, calle rota', 48, 3, 0, 1),
            (1, 'Iluminación Pública', 'Luminarias apagadas o rotas', 'lightbulb', '#f59e0b', 'Poste de luz apagado', 24, 2, 1, 1),
            (1, 'Recolección de Residuos', 'Basura sin recolectar', 'trash', '#10b981', 'Basura acumulada', 12, 2, 2, 1),
            (1, 'Espacios Verdes', 'Plazas, parques, árboles', 'tree', '#22c55e', 'Pasto alto, plaza descuidada', 72, 4, 3, 1),
            (1, 'Agua y Cloacas', 'Pérdidas de agua, cloacas tapadas', 'droplet', '#3b82f6', 'Pérdida de agua', 24, 1, 4, 1),
            (1, 'Semáforos', 'Semáforos rotos, señales faltantes', 'traffic-cone', '#f97316', 'Semáforo sin funcionar', 36, 2, 5, 1),
            (1, 'Animales Sueltos', 'Perros callejeros', 'dog', '#8b5cf6', 'Perros sueltos', 48, 3, 6, 1),
            (1, 'Veredas y Baldíos', 'Veredas rotas, baldíos con maleza', 'square', '#6b7280', 'Vereda rota', 120, 4, 7, 1),
            (1, 'Ruidos Molestos', 'Contaminación sonora', 'volume-2', '#ec4899', 'Música alta', 12, 3, 8, 1),
            (1, 'Limpieza de Calles', 'Barrido, limpieza general', 'broom', '#14b8a6', 'Calle sucia', 24, 3, 9, 1),
            (1, 'Seguridad Vial', 'Cruces peligrosos', 'alert-triangle', '#dc2626', 'Cruce peligroso', 72, 2, 10, 1),
            (1, 'Obras Públicas', 'Construcciones, mejoras', 'hammer', '#f59e0b', 'Obra abandonada', 168, 4, 11, 1),
            (1, 'Salud Pública', 'Fumigación, plagas', 'cross', '#ef4444', 'Fumigación necesaria', 48, 2, 12, 1),
            (1, 'Transporte Público', 'Paradas de colectivo', 'bus', '#3b82f6', 'Parada sin refugio', 96, 4, 13, 1),
            (1, 'Otros', 'Otros reclamos', 'help-circle', '#6b7280', 'Otros problemas', 72, 3, 14, 1)
        """
        await db.execute(text(categorias_sql))
        await db.commit()
        result = await db.execute(text("SELECT id FROM categorias ORDER BY id"))
        cat_ids = [row[0] for row in result.fetchall()]
        print(f"[OK] Creadas 15 categorías: {cat_ids[:5]}... (total: {len(cat_ids)})\n")

        # =================================================================
        # 4. CREAR EMPLEADOS
        # =================================================================
        print("Creando empleados...")

        # 10 Técnicos
        tecnicos = [
            ("Juan", "Pérez", "Técnico en baches y calles", cat_ids[0]),
            ("Diego", "Rodríguez", "Técnico en iluminación", cat_ids[1]),
            ("Pablo", "González", "Técnico en recolección", cat_ids[2]),
            ("Martín", "Sánchez", "Técnico en espacios verdes", cat_ids[3]),
            ("Lucas", "Ramírez", "Técnico en agua y cloacas", cat_ids[4]),
            ("Mateo", "Torres", "Técnico en semáforos", cat_ids[5]),
            ("Nicolás", "Flores", "Técnico general", cat_ids[0]),
            ("Santiago", "Benítez", "Técnico de iluminación", cat_ids[1]),
            ("Tomás", "Romero", "Técnico de limpieza", cat_ids[9]),
            ("Facundo", "Morales", "Técnico de vías públicas", cat_ids[0])
        ]

        empleado_ids = []
        for i, (nombre, apellido, desc, cat_id) in enumerate(tecnicos):
            zona_id = zona_ids[i % 3]
            emp_sql = f"""
            INSERT INTO empleados (municipio_id, nombre, apellido, descripcion, tipo, especialidad,
                                  categoria_principal_id, zona_id, capacidad_maxima, activo,
                                  telefono, hora_entrada, hora_salida)
            VALUES (1, '{nombre}', '{apellido}', '{desc}', 'tecnico', 'Técnico',
                   {cat_id}, {zona_id}, 8, 1, '+54 11 {2000+i}-{3000+i}', '08:00:00', '16:00:00')
            """
            await db.execute(text(emp_sql))

        # 10 Administrativos
        admins = [
            ("Laura", "Silva"), ("Marta", "Castro"), ("Claudia", "Vargas"),
            ("Patricia", "Méndez"), ("Gabriela", "Ortiz"), ("Cecilia", "Rojas"),
            ("Valeria", "Acosta"), ("Natalia", "Medina"), ("Andrea", "Ibáñez"),
            ("Silvina", "Guzmán")
        ]

        for i, (nombre, apellido) in enumerate(admins):
            emp_sql = f"""
            INSERT INTO empleados (municipio_id, nombre, apellido, descripcion, tipo, especialidad,
                                  capacidad_maxima, activo, telefono, hora_entrada, hora_salida)
            VALUES (1, '{nombre}', '{apellido}', 'Personal administrativo', 'administrativo', 'Gestión administrativa',
                   15, 1, '+54 11 {4000+i}-{5000+i}', '09:00:00', '17:00:00')
            """
            await db.execute(text(emp_sql))

        await db.commit()
        result = await db.execute(text("SELECT id FROM empleados ORDER BY id"))
        emp_ids = [row[0] for row in result.fetchall()]
        print(f"[OK] Creados 20 empleados: {emp_ids[:5]}... (total: {len(emp_ids)})\n")

        # =================================================================
        # 5. CREAR CUADRILLAS
        # =================================================================
        print("Creando cuadrillas...")
        cuadrillas_sql = f"""
        INSERT INTO cuadrillas (municipio_id, nombre, descripcion, especialidad, zona_id, categoria_principal_id, capacidad_maxima, activo)
        VALUES
            (1, 'Cuadrilla Centro', 'Equipo zona centro', 'Mantenimiento', {zona_ids[0]}, {cat_ids[0]}, 10, 1),
            (1, 'Cuadrilla Norte', 'Equipo zona norte', 'Iluminación', {zona_ids[1]}, {cat_ids[1]}, 10, 1),
            (1, 'Cuadrilla Sur', 'Equipo zona sur', 'Espacios verdes', {zona_ids[2]}, {cat_ids[3]}, 10, 1)
        """
        await db.execute(text(cuadrillas_sql))
        await db.commit()
        print("[OK] Creadas 3 cuadrillas\n")

        # =================================================================
        # 6. CREAR RECLAMOS
        # =================================================================
        print("Creando reclamos...")

        # Get user IDs
        result = await db.execute(text("SELECT id, email FROM usuarios WHERE email LIKE '%@demo.com' ORDER BY id"))
        usuarios = result.fetchall()
        maria_id = next((u[0] for u in usuarios if 'maria' in u[1]), None)
        ana_id = next((u[0] for u in usuarios if 'ana' in u[1]), None)
        carlos_id = next((u[0] for u in usuarios if 'carlos' in u[1]), None)

        direcciones = [
            "Av. Libertador 1234", "Calle San Martin 567", "Av. Rivadavia 890",
            "Calle Belgrano 234", "Calle Moreno 456", "Av. Independencia 789",
            "Calle Mitre 123", "Calle Sarmiento 345", "Av. Pueyrredón 678",
            "Calle Alsina 901", "Calle Lavalle 234", "Av. Corrientes 567"
        ]

        estados = ["NUEVO", "ASIGNADO", "EN_PROCESO", "PENDIENTE_CONFIRMACION", "RESUELTO"]

        for i in range(50):
            cat_id = cat_ids[i % len(cat_ids)]
            zona_id = zona_ids[i % 3]
            estado = estados[min(i % 5, 4)]
            emp_id = emp_ids[i % 10] if estado != "NUEVO" else "NULL"

            dias_atras = random.randint(0, 30)
            fecha = (datetime.now() - timedelta(days=dias_atras)).strftime('%Y-%m-%d %H:%M:%S')

            reclamo_sql = f"""
            INSERT INTO reclamos (municipio_id, titulo, descripcion, estado, prioridad, direccion,
                                 latitud, longitud, referencia, categoria_id, zona_id, creador_id,
                                 empleado_id, created_at)
            VALUES (1, 'Reclamo {i+1}', 'Descripción del reclamo {i+1}', '{estado}', {(i%5)+1},
                   '{direcciones[i % len(direcciones)]}', -34.666{i%10}, -58.728{i%10},
                   'Referencia {i+1}', {cat_id}, {zona_id}, {maria_id}, {emp_id}, '{fecha}')
            """
            await db.execute(text(reclamo_sql))

            if i % 10 == 0:
                await db.commit()

        await db.commit()
        result = await db.execute(text("SELECT COUNT(*) FROM reclamos"))
        total_reclamos = result.scalar()
        print(f"[OK] Creados {total_reclamos} reclamos\n")

        # =================================================================
        # 7. CREAR HISTORIAL
        # =================================================================
        print("Creando historial de reclamos...")

        result = await db.execute(text("SELECT id, estado, created_at FROM reclamos ORDER BY id"))
        reclamos_data = result.fetchall()

        historial_count = 0
        for reclamo_id, estado, created_at in reclamos_data:
            # Siempre crear registro de creación
            hist_sql = f"""
            INSERT INTO historial_reclamos (reclamo_id, usuario_id, estado_anterior, estado_nuevo,
                                           accion, comentario, created_at)
            VALUES ({reclamo_id}, {maria_id}, NULL, 'NUEVO', 'CREADO',
                   'Reclamo creado por el vecino', '{created_at}')
            """
            await db.execute(text(hist_sql))
            historial_count += 1

            if estado in ["ASIGNADO", "EN_PROCESO", "PENDIENTE_CONFIRMACION", "RESUELTO"]:
                fecha2 = created_at + timedelta(hours=2)
                hist_sql = f"""
                INSERT INTO historial_reclamos (reclamo_id, usuario_id, estado_anterior, estado_nuevo,
                                               accion, comentario, created_at)
                VALUES ({reclamo_id}, {ana_id}, 'NUEVO', 'ASIGNADO', 'ASIGNADO',
                       'Asignado a empleado', '{fecha2}')
                """
                await db.execute(text(hist_sql))
                historial_count += 1

            if estado in ["EN_PROCESO", "PENDIENTE_CONFIRMACION", "RESUELTO"]:
                fecha3 = created_at + timedelta(hours=6)
                hist_sql = f"""
                INSERT INTO historial_reclamos (reclamo_id, usuario_id, estado_anterior, estado_nuevo,
                                               accion, comentario, created_at)
                VALUES ({reclamo_id}, {carlos_id}, 'ASIGNADO', 'EN_PROCESO', 'EN_PROCESO',
                       'Técnico comenzó a trabajar', '{fecha3}')
                """
                await db.execute(text(hist_sql))
                historial_count += 1

            if historial_count % 50 == 0:
                await db.commit()

        await db.commit()
        print(f"[OK] Creados {historial_count} registros de historial\n")

        # =================================================================
        # RESUMEN FINAL
        # =================================================================
        print("\n" + "="*60)
        print("[SUCCESS] BASE DE DATOS POBLADA EXITOSAMENTE")
        print("="*60)

        result = await db.execute(text("SELECT COUNT(*) FROM zonas"))
        print(f"Zonas: {result.scalar()}")

        result = await db.execute(text("SELECT COUNT(*) FROM categorias"))
        print(f"Categorías: {result.scalar()}")

        result = await db.execute(text("SELECT COUNT(*) FROM empleados WHERE tipo='tecnico'"))
        print(f"Empleados técnicos: {result.scalar()}")

        result = await db.execute(text("SELECT COUNT(*) FROM empleados WHERE tipo='administrativo'"))
        print(f"Empleados administrativos: {result.scalar()}")

        result = await db.execute(text("SELECT COUNT(*) FROM cuadrillas"))
        print(f"Cuadrillas: {result.scalar()}")

        result = await db.execute(text("SELECT COUNT(*) FROM reclamos"))
        print(f"Reclamos: {result.scalar()}")

        result = await db.execute(text("SELECT COUNT(*) FROM historial_reclamos"))
        print(f"Historial: {result.scalar()}")

if __name__ == "__main__":
    asyncio.run(populate_simple())
