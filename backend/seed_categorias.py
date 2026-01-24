"""Seed de categorías - Ejecutar con: python seed_categorias.py"""
from sqlalchemy import create_engine, text

engine = create_engine('mysql+pymysql://avnadmin:AVNS_Fqe0qsChCHnqSnVsvoi@mysql-aiven-arenazl.e.aivencloud.com:23108/sugerenciasmun')

categorias = [
    {
        'id': 1,
        'nombre': 'Baches y Calzadas',
        'descripcion': 'Reclamos vinculados al deterioro de calles y calzadas, incluyendo baches, hundimientos, roturas de asfalto, empedrados en mal estado o cualquier daño que dificulte o ponga en riesgo la circulación vehicular o peatonal.',
        'icono': 'construction',
        'color': '#ef4444',
        'tiempo_resolucion_estimado': 48,
        'prioridad_default': 3,
        'activo': True
    },
    {
        'id': 2,
        'nombre': 'Iluminación Pública',
        'descripcion': 'Problemas relacionados con el alumbrado público, como luminarias apagadas, intermitentes, rotas o con bajo nivel de iluminación que afecten la seguridad y visibilidad en calles, plazas, veredas o espacios comunes.',
        'icono': 'lightbulb',
        'color': '#f59e0b',
        'tiempo_resolucion_estimado': 24,
        'prioridad_default': 2,
        'activo': True
    },
    {
        'id': 3,
        'nombre': 'Recolección de Residuos',
        'descripcion': 'Reclamos vinculados al servicio de recolección de residuos, como basura no retirada, contenedores desbordados, acumulación de residuos en la vía pública o incumplimientos en los recorridos habituales.',
        'icono': 'trash',
        'color': '#10b981',
        'tiempo_resolucion_estimado': 12,
        'prioridad_default': 2,
        'activo': True
    },
    {
        'id': 4,
        'nombre': 'Espacios Verdes',
        'descripcion': 'Situaciones relacionadas con el mantenimiento de plazas, parques y espacios verdes, incluyendo pasto alto, juegos rotos, falta de limpieza, árboles en mal estado o cualquier condición que afecte su uso y disfrute.',
        'icono': 'tree',
        'color': '#22c55e',
        'tiempo_resolucion_estimado': 72,
        'prioridad_default': 4,
        'activo': True
    },
    {
        'id': 5,
        'nombre': 'Agua y Cloacas',
        'descripcion': 'Reclamos vinculados a pérdidas de agua, desbordes cloacales, obstrucciones, tapas rotas o situaciones sanitarias que representen un riesgo para la salud o el ambiente en la vía pública.',
        'icono': 'droplet',
        'color': '#3b82f6',
        'tiempo_resolucion_estimado': 24,
        'prioridad_default': 1,
        'activo': True
    },
    {
        'id': 6,
        'nombre': 'Semáforos y Señalización Vial',
        'descripcion': 'Problemas relacionados con semáforos fuera de funcionamiento, señales de tránsito dañadas o faltantes, cartelería ilegible o cualquier elemento de señalización que afecte la seguridad vial.',
        'icono': 'traffic-cone',
        'color': '#f97316',
        'tiempo_resolucion_estimado': 36,
        'prioridad_default': 2,
        'activo': True
    },
    {
        'id': 7,
        'nombre': 'Zoonosis y Animales',
        'descripcion': 'Reclamos relacionados con animales sueltos, heridos o muertos en la vía pública, así como situaciones vinculadas al control sanitario y la convivencia entre animales y vecinos.',
        'icono': 'dog',
        'color': '#8b5cf6',
        'tiempo_resolucion_estimado': 48,
        'prioridad_default': 3,
        'activo': True
    },
    {
        'id': 8,
        'nombre': 'Veredas y Baldíos',
        'descripcion': 'Problemas vinculados al estado de veredas y terrenos baldíos, incluyendo roturas, desniveles, malezas, acumulación de residuos o condiciones que dificulten el paso o generen riesgos para los vecinos.',
        'icono': 'square',
        'color': '#6b7280',
        'tiempo_resolucion_estimado': 120,
        'prioridad_default': 4,
        'activo': True
    },
    {
        'id': 9,
        'nombre': 'Ruidos Molestos',
        'descripcion': 'Reclamos por ruidos excesivos o molestos provenientes de viviendas, comercios, obras, eventos u otras fuentes que afecten el descanso y la convivencia en el entorno urbano.',
        'icono': 'volume-2',
        'color': '#ec4899',
        'tiempo_resolucion_estimado': 12,
        'prioridad_default': 3,
        'activo': True
    },
    {
        'id': 10,
        'nombre': 'Limpieza Urbana',
        'descripcion': 'Situaciones relacionadas con la limpieza general de calles y espacios públicos, como barrido deficiente, acumulación de hojas, tierra u otros residuos que afecten la higiene urbana.',
        'icono': 'broom',
        'color': '#14b8a6',
        'tiempo_resolucion_estimado': 24,
        'prioridad_default': 3,
        'activo': True
    },
    {
        'id': 11,
        'nombre': 'Seguridad Urbana',
        'descripcion': 'Reclamos vinculados a situaciones que generan sensación de inseguridad en el espacio público, como iluminación deficiente, zonas abandonadas o condiciones que requieran intervención preventiva del municipio.',
        'icono': 'alert-triangle',
        'color': '#dc2626',
        'tiempo_resolucion_estimado': 72,
        'prioridad_default': 2,
        'activo': True
    },
    {
        'id': 12,
        'nombre': 'Obras Públicas',
        'descripcion': 'Reclamos relacionados con obras municipales en ejecución o finalizadas, incluyendo trabajos inconclusos, demoras, roturas posteriores o cualquier inconveniente asociado a intervenciones de infraestructura.',
        'icono': 'hammer',
        'color': '#f59e0b',
        'tiempo_resolucion_estimado': 168,
        'prioridad_default': 4,
        'activo': True
    },
    {
        'id': 13,
        'nombre': 'Salud Ambiental',
        'descripcion': 'Reclamos vinculados a condiciones ambientales que puedan afectar la salud, como presencia de plagas, necesidad de fumigación, focos de insalubridad o situaciones que requieran control sanitario.',
        'icono': 'cross',
        'color': '#ef4444',
        'tiempo_resolucion_estimado': 48,
        'prioridad_default': 2,
        'activo': True
    },
    {
        'id': 14,
        'nombre': 'Transporte y Paradas',
        'descripcion': 'Reclamos relacionados con paradas de transporte público, refugios, señalización asociada o condiciones de infraestructura que afecten el uso seguro y adecuado del transporte.',
        'icono': 'bus',
        'color': '#3b82f6',
        'tiempo_resolucion_estimado': 96,
        'prioridad_default': 4,
        'activo': True
    },
    {
        'id': 15,
        'nombre': 'Otros Reclamos',
        'descripcion': 'Reclamos que no encuadran claramente en las categorías anteriores, pero que requieren atención municipal o derivación al área correspondiente para su evaluación y seguimiento.',
        'icono': 'help-circle',
        'color': '#6b7280',
        'tiempo_resolucion_estimado': 72,
        'prioridad_default': 3,
        'activo': True
    }
]

def main():
    with engine.connect() as conn:
        # Deshabilitar FK checks temporalmente
        print('0. Deshabilitando FK checks...')
        conn.execute(text('SET FOREIGN_KEY_CHECKS = 0'))
        conn.commit()
        print('   OK')

        # 1. Limpiar tablas dependientes
        print('1. Limpiando municipio_categorias...')
        conn.execute(text('DELETE FROM municipio_categorias'))
        conn.commit()
        print('   OK')

        print('2. Limpiando empleado_categorias...')
        conn.execute(text('DELETE FROM empleado_categorias'))
        conn.commit()
        print('   OK')

        print('3. Limpiando cuadrilla_categorias...')
        conn.execute(text('DELETE FROM cuadrilla_categorias'))
        conn.commit()
        print('   OK')

        print('4. Limpiando sla_config...')
        conn.execute(text('DELETE FROM sla_config'))
        conn.commit()
        print('   OK')

        # 4b. Limpiar referencia en cuadrillas
        print('4b. Limpiando categoria_principal_id en cuadrillas...')
        conn.execute(text('UPDATE cuadrillas SET categoria_principal_id = NULL'))
        conn.commit()
        print('   OK')

        # 4c. Limpiar referencia en empleados
        print('4c. Limpiando categoria_principal_id en empleados...')
        conn.execute(text('UPDATE empleados SET categoria_principal_id = NULL'))
        conn.commit()
        print('   OK')

        # 5. Limpiar categorias
        print('5. Limpiando categorias...')
        conn.execute(text('DELETE FROM categorias'))
        conn.commit()
        print('   OK')

        # 6. Resetear auto_increment
        print('6. Reseteando auto_increment...')
        conn.execute(text('ALTER TABLE categorias AUTO_INCREMENT = 1'))
        conn.commit()
        print('   OK')

        # 7. Insertar nuevas categorías
        print('7. Insertando nuevas categorías...')
        for cat in categorias:
            conn.execute(text('''
                INSERT INTO categorias (id, nombre, descripcion, icono, color, tiempo_resolucion_estimado, prioridad_default, activo, created_at)
                VALUES (:id, :nombre, :descripcion, :icono, :color, :tiempo, :prioridad, :activo, NOW())
            '''), {
                'id': cat['id'],
                'nombre': cat['nombre'],
                'descripcion': cat['descripcion'],
                'icono': cat['icono'],
                'color': cat['color'],
                'tiempo': cat['tiempo_resolucion_estimado'],
                'prioridad': cat['prioridad_default'],
                'activo': cat['activo']
            })
        conn.commit()
        print(f'   {len(categorias)} categorías insertadas')

        # 8. Asignar todas las categorías al municipio 1 (Merlo)
        print('8. Asignando categorías al municipio 1 (Merlo)...')
        for i, cat in enumerate(categorias):
            conn.execute(text('''
                INSERT INTO municipio_categorias (municipio_id, categoria_id, activo, orden)
                VALUES (1, :cat_id, 1, :orden)
            '''), {'cat_id': cat['id'], 'orden': i})
        conn.commit()
        print(f'   {len(categorias)} categorías asignadas a Merlo')

        # 9. Verificar
        print('\n=== VERIFICACIÓN ===')
        result = conn.execute(text('SELECT id, nombre FROM categorias ORDER BY id'))
        for row in result:
            print(f'  {row[0]:2}: {row[1]}')

        result = conn.execute(text('SELECT COUNT(*) FROM municipio_categorias WHERE municipio_id = 1'))
        count = result.scalar()
        print(f'\nCategorías asignadas a Merlo: {count}')

        # 10. Rehabilitar FK checks
        print('\n10. Rehabilitando FK checks...')
        conn.execute(text('SET FOREIGN_KEY_CHECKS = 1'))
        conn.commit()
        print('   OK')

    print('\n✅ Seed completado exitosamente!')

if __name__ == '__main__':
    main()
