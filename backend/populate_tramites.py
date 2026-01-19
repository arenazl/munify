"""
Script para poblar trámites y solicitudes
- Tipos de trámites
- Trámites específicos
- Relaciones municipio-categorías
- Relaciones municipio-trámites
- Solicitudes de ejemplo
"""
import asyncio
from datetime import datetime, timedelta
import random
from sqlalchemy import text
from core.database import AsyncSessionLocal

async def populate_tramites():
    async with AsyncSessionLocal() as db:
        print("=== POBLANDO TRAMITES Y RELACIONES ===\n")

        municipio_id = 1

        # =================================================================
        # 1. RELACION MUNICIPIO-CATEGORIAS
        # =================================================================
        print("1. Creando relaciones municipio-categorías...")

        # Obtener todas las categorías
        result = await db.execute(text("SELECT id FROM categorias ORDER BY id"))
        cat_ids = [row[0] for row in result.fetchall()]

        # Habilitar todas las categorías para el municipio 1
        for orden, cat_id in enumerate(cat_ids):
            sql = f"""
            INSERT INTO municipio_categorias (municipio_id, categoria_id, activo, orden)
            VALUES (1, {cat_id}, 1, {orden})
            """
            await db.execute(text(sql))

        await db.commit()
        print(f"   [OK] Habilitadas {len(cat_ids)} categorías para Merlo\n")

        # =================================================================
        # 2. TIPOS DE TRAMITES
        # =================================================================
        print("2. Creando tipos de trámites...")

        tipos_tramites = [
            ("Habilitaciones Comerciales", "Trámites para habilitar comercios y locales", "habilitaciones", "store", "#3b82f6"),
            ("Obras Privadas", "Permisos y aprobaciones de obras", "obras", "hammer", "#f59e0b"),
            ("Catastro y Planos", "Trámites catastrales y de mensura", "catastro", "map", "#10b981"),
            ("Certificados y Constancias", "Emisión de certificados varios", "certificados", "file-text", "#8b5cf6"),
            ("Licencias de Conducir", "Trámites de licencias", "licencias", "car", "#ef4444"),
            ("Automotor", "Trámites vehiculares", "automotor", "truck", "#06b6d4"),
            ("Seguridad e Higiene", "Habilitaciones y controles", "seguridad", "shield", "#ec4899"),
            ("Exenciones y Beneficios", "Solicitud de beneficios fiscales", "exenciones", "percent", "#84cc16"),
            ("Servicios Sociales", "Trámites de asistencia social", "social", "heart", "#f43f5e"),
            ("Otros Trámites", "Otros trámites municipales", "otros", "file", "#64748b")
        ]

        tipo_ids = []
        for nombre, desc, codigo, icono, color in tipos_tramites:
            sql = f"""
            INSERT INTO tipos_tramites (nombre, descripcion, codigo, icono, color, activo, orden)
            VALUES ('{nombre}', '{desc}', '{codigo}', '{icono}', '{color}', 1, {len(tipo_ids)})
            """
            await db.execute(text(sql))
            await db.commit()

            result = await db.execute(text("SELECT LAST_INSERT_ID()"))
            tipo_id = result.scalar()
            tipo_ids.append(tipo_id)

        print(f"   [OK] Creados {len(tipo_ids)} tipos de trámites\n")

        # =================================================================
        # 3. TRAMITES ESPECIFICOS
        # =================================================================
        print("3. Creando trámites específicos...")

        tramites_data = [
            # Habilitaciones Comerciales
            (tipo_ids[0], "Habilitación Comercial Nueva", "Solicitud de habilitación para nuevo comercio", "Formulario DDJJ, plano, contrato alquiler", 30, 0),
            (tipo_ids[0], "Renovación Habilitación", "Renovación anual de habilitación comercial", "Comprobante pago tasas, certificado bomberos", 15, 0),
            (tipo_ids[0], "Transferencia de Habilitación", "Transferencia de habilitación entre titulares", "Formulario, título propiedad/contrato", 20, 500),

            # Obras Privadas
            (tipo_ids[1], "Permiso de Obra Nueva", "Permiso para construcción nueva", "Planos profesional, título propiedad, libre deuda", 45, 0),
            (tipo_ids[1], "Permiso de Refacción", "Permiso para refacciones y remodelaciones", "Plano refacción, fotos, croquis", 30, 0),
            (tipo_ids[1], "Final de Obra", "Certificado final de obra", "Plano conforme obra, certificación profesional", 20, 0),

            # Catastro
            (tipo_ids[2], "Copia de Plano de Mensura", "Solicitud de copia de plano", "Datos del inmueble, DNI", 10, 200),
            (tipo_ids[2], "Certificado Catastral", "Certificado de datos catastrales", "Partida inmobiliaria, DNI", 7, 150),
            (tipo_ids[2], "Unificación de Parcelas", "Trámite de unificación catastral", "Títulos, planos, escritura", 60, 0),

            # Certificados
            (tipo_ids[3], "Certificado de Domicilio", "Certificación de domicilio real", "DNI, servicio a nombre", 5, 0),
            (tipo_ids[3], "Libre Deuda Municipal", "Certificado libre deuda de tasas", "Partida, últimos comprobantes", 7, 100),
            (tipo_ids[3], "Certificado de Valuación", "Certificado de valuación fiscal", "Partida inmobiliaria", 10, 200),

            # Licencias
            (tipo_ids[4], "Licencia de Conducir Nueva", "Primera licencia de conducir", "DNI, certificado médico, curso", 30, 0),
            (tipo_ids[4], "Renovación de Licencia", "Renovación de licencia vigente", "Licencia anterior, certificado médico", 15, 0),
            (tipo_ids[4], "Duplicado de Licencia", "Duplicado por extravío o robo", "Denuncia policial, DNI", 10, 300),

            # Automotor
            (tipo_ids[5], "Alta de Automotor", "Inscripción de vehículo en municipio", "Título, DNI, cédula verde", 15, 0),
            (tipo_ids[5], "Baja de Automotor", "Baja por venta o desuso", "Comprobante venta, DNI", 10, 0),
            (tipo_ids[5], "Libre deuda Automotor", "Certificado libre deuda patente", "Dominio del vehículo", 7, 150),

            # Seguridad e Higiene
            (tipo_ids[6], "Inspección de Seguridad", "Solicitud de inspección preventiva", "Datos del local, plano", 20, 0),
            (tipo_ids[6], "Certificado de Higiene", "Certificado para manipulación alimentos", "Carnet sanitario, curso", 15, 200),

            # Exenciones
            (tipo_ids[7], "Exención Jubilados", "Solicitud exención tasa jubilados", "Recibo jubilación, DNI, escritura", 30, 0),
            (tipo_ids[7], "Exención Discapacidad", "Exención por discapacidad", "Certificado discapacidad, DNI", 30, 0),

            # Servicios Sociales
            (tipo_ids[8], "Subsidio Municipal", "Solicitud de subsidio por necesidad", "Informe social, documentación", 45, 0),
            (tipo_ids[8], "Plan de Vivienda", "Inscripción plan vivienda social", "Grupo familiar, ingresos, DNI", 60, 0),

            # Otros
            (tipo_ids[9], "Permiso de Eventos", "Permiso para eventos en vía pública", "Nota solicitud, croquis, seguro", 20, 500),
            (tipo_ids[9], "Cementerio", "Trámites cementerio municipal", "Certificado defunción, DNI", 7, 0),
        ]

        tramite_ids = []
        for tipo_id, nombre, desc, docs, dias, costo in tramites_data:
            # Escapar comillas simples
            nombre_sql = nombre.replace("'", "''")
            desc_sql = desc.replace("'", "''")
            docs_sql = docs.replace("'", "''")

            sql = f"""
            INSERT INTO tramites (tipo_tramite_id, nombre, descripcion, documentos_requeridos,
                                 tiempo_estimado_dias, costo, activo, orden)
            VALUES ({tipo_id}, '{nombre_sql}', '{desc_sql}', '{docs_sql}',
                   {dias}, {costo}, 1, {len(tramite_ids)})
            """
            await db.execute(text(sql))
            await db.commit()

            result = await db.execute(text("SELECT LAST_INSERT_ID()"))
            tramite_id = result.scalar()
            tramite_ids.append(tramite_id)

        print(f"   [OK] Creados {len(tramite_ids)} trámites específicos\n")

        # =================================================================
        # 4. RELACION MUNICIPIO-TIPOS DE TRAMITES
        # =================================================================
        print("4. Creando relaciones municipio-tipos de trámites...")

        for orden, tipo_id in enumerate(tipo_ids):
            sql = f"""
            INSERT INTO municipio_tipos_tramites (municipio_id, tipo_tramite_id, activo, orden)
            VALUES (1, {tipo_id}, 1, {orden})
            """
            await db.execute(text(sql))

        await db.commit()
        print(f"   [OK] Habilitados {len(tipo_ids)} tipos de trámites para Merlo\n")

        # =================================================================
        # 5. RELACION MUNICIPIO-TRAMITES
        # =================================================================
        print("5. Creando relaciones municipio-trámites...")

        for orden, tramite_id in enumerate(tramite_ids):
            sql = f"""
            INSERT INTO municipio_tramites (municipio_id, tramite_id, activo, orden)
            VALUES (1, {tramite_id}, 1, {orden})
            """
            await db.execute(text(sql))

        await db.commit()
        print(f"   [OK] Habilitados {len(tramite_ids)} trámites para Merlo\n")

        # =================================================================
        # 6. CREAR SOLICITUDES DE EJEMPLO
        # =================================================================
        print("6. Creando solicitudes de ejemplo...")

        # Obtener usuarios
        result = await db.execute(text("SELECT id, email FROM usuarios WHERE email LIKE '%@demo.com' ORDER BY id"))
        usuarios = result.fetchall()
        maria_id = next((u[0] for u in usuarios if 'maria' in u[1]), None)
        roberto_id = next((u[0] for u in usuarios if 'roberto' in u[1]), None)

        # Obtener empleados administrativos
        result = await db.execute(text("SELECT id FROM empleados WHERE tipo='administrativo' LIMIT 5"))
        emp_admin_ids = [row[0] for row in result.fetchall()]

        estados_solicitud = ["INICIADO", "EN_REVISION", "REQUIERE_DOCUMENTACION", "EN_PROCESO", "APROBADO", "RECHAZADO", "FINALIZADO"]

        solicitud_count = 0
        for i in range(30):
            tramite_id = tramite_ids[i % len(tramite_ids)]
            estado = estados_solicitud[min(i % 7, 6)]

            # Asignar empleado si no está en INICIADO
            emp_id = "NULL" if estado == "INICIADO" else emp_admin_ids[i % len(emp_admin_ids)]

            dias_atras = random.randint(0, 60)
            fecha = (datetime.now() - timedelta(days=dias_atras)).strftime('%Y-%m-%d %H:%M:%S')

            sql = f"""
            INSERT INTO solicitudes (municipio_id, numero_tramite, asunto, descripcion, estado,
                                    solicitante_id, nombre_solicitante, apellido_solicitante,
                                    dni_solicitante, email_solicitante, telefono_solicitante,
                                    empleado_id, prioridad, tramite_id, created_at)
            VALUES (1, 'SOL-2025-{1000+i}', 'Solicitud de trámite {i+1}',
                   'Descripción detallada de la solicitud {i+1}', '{estado}',
                   {maria_id}, 'María', 'García', '12345678', 'maria.garcia@demo.com',
                   '+54 11 1234-5678', {emp_id}, {(i%3)+1}, {tramite_id}, '{fecha}')
            """
            await db.execute(text(sql))
            solicitud_count += 1

            if solicitud_count % 10 == 0:
                await db.commit()

        await db.commit()
        print(f"   [OK] Creadas {solicitud_count} solicitudes\n")

        # =================================================================
        # 7. CREAR HISTORIAL DE SOLICITUDES
        # =================================================================
        print("7. Creando historial de solicitudes...")

        result = await db.execute(text("SELECT id, estado, created_at FROM solicitudes ORDER BY id"))
        solicitudes_data = result.fetchall()

        historial_count = 0
        for sol_id, estado, created_at in solicitudes_data:
            # Registro de inicio
            hist_sql = f"""
            INSERT INTO historial_solicitudes (solicitud_id, usuario_id, estado_anterior, estado_nuevo,
                                              accion, comentario, created_at)
            VALUES ({sol_id}, {maria_id}, NULL, 'INICIADO', 'CREADA',
                   'Solicitud creada por el vecino', '{created_at}')
            """
            await db.execute(text(hist_sql))
            historial_count += 1

            if estado != "INICIADO":
                fecha2 = created_at + timedelta(hours=4)
                hist_sql = f"""
                INSERT INTO historial_solicitudes (solicitud_id, usuario_id, estado_anterior, estado_nuevo,
                                                  accion, comentario, created_at)
                VALUES ({sol_id}, {roberto_id}, 'INICIADO', 'EN_REVISION', 'EN_REVISION',
                       'Solicitud tomada para revisión', '{fecha2}')
                """
                await db.execute(text(hist_sql))
                historial_count += 1

            if historial_count % 50 == 0:
                await db.commit()

        await db.commit()
        print(f"   [OK] Creados {historial_count} registros de historial\n")

        # =================================================================
        # RESUMEN FINAL
        # =================================================================
        print("\n" + "="*60)
        print("[SUCCESS] TRAMITES Y RELACIONES POBLADOS")
        print("="*60)
        print(f"\nResumen:")
        print(f"  - Municipio-Categorías: {len(cat_ids)} relaciones")
        print(f"  - Tipos de Trámites: {len(tipo_ids)}")
        print(f"  - Trámites específicos: {len(tramite_ids)}")
        print(f"  - Municipio-Tipos Trámites: {len(tipo_ids)} relaciones")
        print(f"  - Municipio-Trámites: {len(tramite_ids)} relaciones")
        print(f"  - Solicitudes: {solicitud_count}")
        print(f"  - Historial Solicitudes: {historial_count}")

if __name__ == "__main__":
    asyncio.run(populate_tramites())
