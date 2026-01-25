"""
Migración: Recrear tablas de trámites con campos para IA
"""
import pymysql

conn = pymysql.connect(
    host='mysql-aiven-arenazl.e.aivencloud.com',
    port=23108,
    user='avnadmin',
    password='AVNS_Fqe0qsChCHnqSnVsvoi',
    database='sugerenciasmun',
    ssl={'ssl': {}}
)

print("Conectado a la base de datos")

with conn.cursor() as cur:
    # Deshabilitar foreign keys
    cur.execute("SET FOREIGN_KEY_CHECKS = 0")
    print("Foreign keys deshabilitadas")

    # 1. Eliminar tablas dependientes
    tables_to_drop = [
        "municipio_dependencia_tipos_tramites",
        "direccion_tipos_tramites",
        "municipio_tramites",
        "municipio_tipos_tramites",
    ]

    for table in tables_to_drop:
        try:
            cur.execute(f"DROP TABLE IF EXISTS {table}")
            print(f"- {table} eliminada")
        except Exception as e:
            print(f"! Error eliminando {table}: {e}")

    # 2. Limpiar referencias en solicitudes
    try:
        cur.execute("UPDATE solicitudes SET tramite_id = NULL WHERE tramite_id IS NOT NULL")
        print(f"- solicitudes.tramite_id limpiado ({cur.rowcount} filas)")
    except Exception as e:
        print(f"! Error limpiando solicitudes: {e}")

    # 3. Eliminar tablas principales
    for table in ["tramites", "tipos_tramites"]:
        try:
            cur.execute(f"DROP TABLE IF EXISTS {table}")
            print(f"- {table} eliminada")
        except Exception as e:
            print(f"! Error eliminando {table}: {e}")

    conn.commit()
    print("\nTablas eliminadas. Creando nuevas estructuras...")

    # 4. Crear tabla tipos_tramites
    cur.execute("""
        CREATE TABLE tipos_tramites (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(200) NOT NULL UNIQUE,
            descripcion TEXT,
            codigo VARCHAR(50) UNIQUE,
            icono VARCHAR(50),
            color VARCHAR(20),
            es_certificado BOOLEAN DEFAULT FALSE,
            es_habilitacion BOOLEAN DEFAULT FALSE,
            es_pago BOOLEAN DEFAULT FALSE,
            palabras_clave TEXT,
            activo BOOLEAN DEFAULT TRUE,
            orden INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_tipos_tramites_codigo (codigo),
            INDEX idx_tipos_tramites_activo (activo)
        )
    """)
    print("+ tipos_tramites creada")

    # 5. Crear tabla tramites
    cur.execute("""
        CREATE TABLE tramites (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tipo_tramite_id INT NOT NULL,
            nombre VARCHAR(200) NOT NULL,
            descripcion TEXT,
            icono VARCHAR(50),
            es_certificado BOOLEAN DEFAULT FALSE,
            es_habilitacion BOOLEAN DEFAULT FALSE,
            es_pago BOOLEAN DEFAULT FALSE,
            palabras_clave TEXT,
            requisitos TEXT,
            documentos_requeridos TEXT,
            tiempo_estimado_dias INT DEFAULT 15,
            costo FLOAT,
            url_externa VARCHAR(500),
            activo BOOLEAN DEFAULT TRUE,
            orden INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (tipo_tramite_id) REFERENCES tipos_tramites(id) ON DELETE CASCADE,
            INDEX idx_tramites_tipo (tipo_tramite_id),
            INDEX idx_tramites_activo (activo)
        )
    """)
    print("+ tramites creada")

    # 6. Crear tabla municipio_tipos_tramites
    cur.execute("""
        CREATE TABLE municipio_tipos_tramites (
            id INT AUTO_INCREMENT PRIMARY KEY,
            municipio_id INT NOT NULL,
            tipo_tramite_id INT NOT NULL,
            activo BOOLEAN DEFAULT TRUE,
            orden INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
            FOREIGN KEY (tipo_tramite_id) REFERENCES tipos_tramites(id) ON DELETE CASCADE,
            UNIQUE KEY uq_municipio_tipo_tramite (municipio_id, tipo_tramite_id),
            INDEX idx_mtt_municipio (municipio_id),
            INDEX idx_mtt_tipo (tipo_tramite_id)
        )
    """)
    print("+ municipio_tipos_tramites creada")

    # 7. Crear tabla municipio_tramites
    cur.execute("""
        CREATE TABLE municipio_tramites (
            id INT AUTO_INCREMENT PRIMARY KEY,
            municipio_id INT NOT NULL,
            tramite_id INT NOT NULL,
            activo BOOLEAN DEFAULT TRUE,
            orden INT DEFAULT 0,
            tiempo_estimado_dias INT,
            costo FLOAT,
            requisitos TEXT,
            documentos_requeridos TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
            FOREIGN KEY (tramite_id) REFERENCES tramites(id) ON DELETE CASCADE,
            UNIQUE KEY uq_municipio_tramite (municipio_id, tramite_id),
            INDEX idx_mt_municipio (municipio_id),
            INDEX idx_mt_tramite (tramite_id)
        )
    """)
    print("+ municipio_tramites creada")

    # 8. Crear tabla municipio_dependencia_tipos_tramites
    cur.execute("""
        CREATE TABLE municipio_dependencia_tipos_tramites (
            id INT AUTO_INCREMENT PRIMARY KEY,
            municipio_id INT NOT NULL,
            dependencia_id INT NOT NULL,
            tipo_tramite_id INT NOT NULL,
            municipio_dependencia_id INT,
            activo BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
            FOREIGN KEY (dependencia_id) REFERENCES dependencias(id) ON DELETE CASCADE,
            FOREIGN KEY (tipo_tramite_id) REFERENCES tipos_tramites(id) ON DELETE CASCADE,
            FOREIGN KEY (municipio_dependencia_id) REFERENCES municipio_dependencias(id) ON DELETE CASCADE,
            UNIQUE KEY uq_muni_dep_tipo_tramite (municipio_id, dependencia_id, tipo_tramite_id),
            INDEX idx_mdtt_municipio (municipio_id),
            INDEX idx_mdtt_dependencia (dependencia_id),
            INDEX idx_mdtt_tipo_tramite (tipo_tramite_id)
        )
    """)
    print("+ municipio_dependencia_tipos_tramites creada")

    # Habilitar foreign keys
    cur.execute("SET FOREIGN_KEY_CHECKS = 1")
    print("\nForeign keys habilitadas")

    conn.commit()
    print("\n=== Estructura recreada. Insertando datos seed... ===\n")

    # SEED: Tipos de trámite
    tipos_tramites = [
        ('Obras Privadas', 'OBRAS_PRIVADAS', 'Permisos y habilitaciones para construcciones, ampliaciones y regularizaciones de obra', 'HardHat', '#EF4444', False, True, False, 'obra,construccion,plano,permiso,ampliacion,regularizacion,edificar,construir', 1),
        ('Comercio e Industria', 'COMERCIO_INDUSTRIA', 'Habilitaciones comerciales, industriales y renovaciones', 'Store', '#3B82F6', False, True, False, 'comercio,habilitacion,comercial,negocio,local,rubro,industria,fabrica', 2),
        ('Tránsito y Transporte', 'TRANSITO_TRANSPORTE', 'Licencias de conducir y permisos de estacionamiento', 'Car', '#10B981', True, False, False, 'licencia,conducir,carnet,estacionamiento,transito,vehiculo,auto,moto', 3),
        ('Rentas y Tasas', 'RENTAS_TASAS', 'Pagos, planes de facilidades y certificados de deuda', 'Receipt', '#F59E0B', True, False, True, 'pago,tasa,impuesto,deuda,libre,plan,exencion,rentas,tributo', 4),
        ('Medio Ambiente', 'MEDIO_AMBIENTE', 'Permisos ambientales, poda y extracción de árboles', 'Leaf', '#22C55E', False, False, False, 'arbol,poda,ambiente,verde,extraccion,ambiental,ecologia', 5),
        ('Catastro e Inmuebles', 'CATASTRO', 'Trámites inmobiliarios, mensuras y subdivisiones', 'MapPin', '#8B5CF6', True, False, False, 'catastro,mensura,subdivision,terreno,inmueble,parcela,propiedad,lote', 6),
        ('Salud y Bromatología', 'SALUD_BROMATOLOGIA', 'Carnets de salud, libretas sanitarias y habilitaciones alimentarias', 'Heart', '#EC4899', True, True, False, 'carnet,salud,libreta,sanitaria,bromatologia,alimento,manipulador,higiene', 7),
        ('Desarrollo Social', 'DESARROLLO_SOCIAL', 'Asistencia social, subsidios y programas de ayuda', 'Users', '#6366F1', True, False, False, 'social,subsidio,ayuda,asistencia,programa,beneficio,necesidad', 8),
        ('Cementerio', 'CEMENTERIO', 'Trámites de cementerio, nichos y servicios fúnebres', 'Home', '#78716C', True, False, True, 'cementerio,nicho,sepultura,difunto,funebre,panteon,boveda', 9),
        ('Documentación Personal', 'DOCUMENTACION', 'Certificados, constancias y documentación personal', 'FileText', '#0EA5E9', True, False, False, 'certificado,constancia,domicilio,supervivencia,documento,residencia', 10),
        ('Espacio Público', 'ESPACIO_PUBLICO', 'Permisos de uso de espacio público, eventos y cartelería', 'Flag', '#14B8A6', False, True, False, 'evento,espacio,publico,carteleria,feria,venta,ambulante,ocupacion', 11),
    ]

    for t in tipos_tramites:
        cur.execute("""
            INSERT INTO tipos_tramites
            (nombre, codigo, descripcion, icono, color, es_certificado, es_habilitacion, es_pago, palabras_clave, orden)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, t)
    print(f"+ {len(tipos_tramites)} tipos de trámite insertados")

    # SEED: Trámites específicos
    tramites = [
        # Obras Privadas
        ('OBRAS_PRIVADAS', 'Permiso de Obra Nueva', 'Solicitud de permiso para construcción nueva en terreno propio', 'Building2', False, True, False, 'obra nueva,construir,edificar,permiso construccion', 'Planos aprobados, Título de propiedad, DNI, Pago de derechos', 30, 1),
        ('OBRAS_PRIVADAS', 'Ampliación de Obra', 'Permiso para ampliar construcción existente', 'Maximize', False, True, False, 'ampliar,ampliacion,agrandar,anexo', 'Planos actuales, Planos de ampliación, DNI, Final de obra anterior', 20, 2),
        ('OBRAS_PRIVADAS', 'Regularización de Obra', 'Regularizar construcción sin permiso previo', 'CheckCircle', False, True, False, 'regularizar,sin permiso,clandestina,ilegal', 'Planos relevamiento, Fotos, DNI, Título de propiedad', 45, 3),
        ('OBRAS_PRIVADAS', 'Final de Obra', 'Certificado de finalización de obra', 'Award', True, False, False, 'final,terminacion,certificado obra', 'Planos conforme a obra, Inspección aprobada', 15, 4),
        # Comercio e Industria
        ('COMERCIO_INDUSTRIA', 'Habilitación Comercial', 'Habilitación de nuevo comercio o actividad comercial', 'Store', False, True, False, 'habilitar comercio,abrir local,nuevo negocio', 'Contrato de alquiler o título, CUIT, Plano del local, Libre deuda municipal', 15, 1),
        ('COMERCIO_INDUSTRIA', 'Renovación de Habilitación', 'Renovar habilitación comercial vencida', 'RefreshCw', False, True, False, 'renovar,vencida,actualizar habilitacion', 'Habilitación anterior, CUIT, Libre deuda municipal', 10, 2),
        ('COMERCIO_INDUSTRIA', 'Cambio de Rubro', 'Modificar actividad comercial habilitada', 'ArrowRightLeft', False, True, False, 'cambiar rubro,nueva actividad,modificar', 'Habilitación actual, Descripción nuevo rubro, CUIT', 15, 3),
        ('COMERCIO_INDUSTRIA', 'Baja de Comercio', 'Dar de baja habilitación comercial', 'XCircle', False, False, False, 'cerrar,baja,clausura,fin actividad', 'Habilitación vigente, Libre deuda, DNI titular', 5, 4),
        # Tránsito y Transporte
        ('TRANSITO_TRANSPORTE', 'Licencia de Conducir - Primera vez', 'Obtención de licencia de conducir nueva', 'CreditCard', True, False, False, 'licencia nueva,sacar carnet,primera vez,registro', 'DNI, Certificado de antecedentes, Examen psicofísico, Foto 4x4, Curso vial aprobado', 5, 1),
        ('TRANSITO_TRANSPORTE', 'Renovación de Licencia', 'Renovar licencia de conducir vencida', 'RefreshCw', True, False, False, 'renovar licencia,vencida,carnet vencido', 'DNI, Licencia anterior, Examen psicofísico', 3, 2),
        ('TRANSITO_TRANSPORTE', 'Permiso de Estacionamiento', 'Permiso para estacionamiento medido', 'ParkingCircle', True, False, True, 'estacionar,cochera,medido', 'DNI, Cédula verde, Comprobante de domicilio', 3, 3),
        # Rentas y Tasas
        ('RENTAS_TASAS', 'Plan de Pago', 'Plan de facilidades para deuda municipal', 'Calendar', False, False, True, 'plan pago,cuotas,facilidades,deber', 'DNI, Comprobante de deuda, Datos del inmueble/comercio', 2, 1),
        ('RENTAS_TASAS', 'Libre Deuda Municipal', 'Certificado de libre deuda municipal', 'CheckCircle2', True, False, False, 'libre deuda,certificado,no debe', 'DNI, Datos del inmueble o comercio', 1, 2),
        ('RENTAS_TASAS', 'Exención de Tasas', 'Solicitud de exención por discapacidad, jubilación u otros', 'BadgePercent', False, False, False, 'exencion,descuento,jubilado,discapacidad,no pagar', 'DNI, Certificado de discapacidad o recibo jubilación, Comprobantes', 15, 3),
        # Medio Ambiente
        ('MEDIO_AMBIENTE', 'Permiso de Poda', 'Solicitud de poda de árbol en vereda pública', 'Scissors', False, False, False, 'podar,arbol,vereda,rama', 'DNI, Ubicación del árbol, Fotos', 10, 1),
        ('MEDIO_AMBIENTE', 'Extracción de Árbol', 'Solicitud de extracción de árbol', 'TreeDeciduous', False, False, False, 'sacar arbol,extraer,cortar arbol,raiz', 'DNI, Justificación, Fotos, Ubicación exacta', 20, 2),
        # Catastro e Inmuebles
        ('CATASTRO', 'Plano de Mensura', 'Solicitud de plano de mensura oficial', 'Ruler', True, False, False, 'mensura,medir,agrimensura,plano oficial', 'Título de propiedad, DNI, Plano anterior si existe', 30, 1),
        ('CATASTRO', 'Subdivisión de Terreno', 'División de parcela en lotes', 'Grid3X3', False, False, False, 'subdividir,dividir,lotes,parcela', 'Título, Planos, Proyecto de subdivisión aprobado', 45, 2),
        ('CATASTRO', 'Unificación de Parcelas', 'Unificar dos o más parcelas en una', 'Combine', False, False, False, 'unificar,juntar,union parcelas', 'Títulos de ambas parcelas, Planos, DNI', 30, 3),
        # Salud y Bromatología
        ('SALUD_BROMATOLOGIA', 'Carnet de Manipulador de Alimentos', 'Libreta sanitaria para manipulación de alimentos', 'Utensils', True, False, False, 'carnet,libreta,manipulador,comida,alimentos', 'DNI, Curso de manipulación aprobado, Foto 4x4', 5, 1),
        ('SALUD_BROMATOLOGIA', 'Habilitación de Comercio Gastronómico', 'Habilitación para restaurantes, bares y afines', 'ChefHat', False, True, False, 'restaurante,bar,comida,gastronomico', 'Habilitación comercial, Carnet manipulador, Planos cocina', 20, 2),
        # Documentación Personal
        ('DOCUMENTACION', 'Certificado de Domicilio', 'Constancia de residencia en el municipio', 'Home', True, False, False, 'domicilio,residencia,vivo,certificado', 'DNI, Servicio a nombre del titular', 3, 1),
        ('DOCUMENTACION', 'Certificado de Supervivencia', 'Constancia de que la persona está viva', 'HeartPulse', True, False, False, 'supervivencia,fe de vida,vivo', 'DNI, Presencia del titular', 1, 2),
    ]

    for tr in tramites:
        cur.execute("""
            INSERT INTO tramites
            (tipo_tramite_id, nombre, descripcion, icono, es_certificado, es_habilitacion, es_pago, palabras_clave, requisitos, tiempo_estimado_dias, orden)
            VALUES (
                (SELECT id FROM tipos_tramites WHERE codigo = %s),
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
        """, tr)
    print(f"+ {len(tramites)} trámites insertados")

    conn.commit()

    # Verificar
    cur.execute("SELECT COUNT(*) FROM tipos_tramites")
    count_tipos = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM tramites")
    count_tramites = cur.fetchone()[0]

    print(f"\n=== Migración completada ===")
    print(f"   Tipos de trámite: {count_tipos}")
    print(f"   Trámites: {count_tramites}")

conn.close()
print("\nConexión cerrada. Listo!")
