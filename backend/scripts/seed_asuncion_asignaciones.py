import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import os

# Obtener URL de base de datos de QA o local
DATABASE_URL = os.environ.get("DATABASE_URL_QA") or os.environ.get("DATABASE_URL") or "sqlite:///./sgm.db"

async def run():
    print(f"Conectando a {DATABASE_URL[:30]}...")
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        # 1. Asegurar municipio Asunción (146)
        res = await conn.execute(text("SELECT id FROM municipios WHERE id = 146 OR codigo = 'asuncion'"))
        muni = res.fetchone()
        muni_id = muni[0] if muni else 146

        print(f"Municipio ID: {muni_id}")

        # 2. Insertar/verificar dependencias clave para Asunción
        deps_data = [
            ("Sec. de Obras Públicas", "OBRAS", "RECLAMO", "#3B82F6", "Wrench"),
            ("Sec. de Servicios Públicos y Ambiente", "SERVICIOS", "AMBOS", "#00B37E", "Trees"),
            ("Dir. de Tránsito y Seguridad Vial", "TRANSITO", "AMBOS", "#F59E0B", "Car"),
            ("Sec. de Seguridad", "SEGURIDAD", "RECLAMO", "#E5484D", "Shield"),
        ]

        dep_ids = {}
        for nombre, codigo, tipo, color, icono in deps_data:
            check = await conn.execute(text(
                "SELECT id FROM municipio_dependencias WHERE municipio_id = :m AND (codigo = :c OR nombre = :n)"
            ), {"m": muni_id, "c": codigo, "n": nombre})
            row = check.fetchone()
            if row:
                dep_ids[codigo] = row[0]
            else:
                ins = await conn.execute(text("""
                    INSERT INTO municipio_dependencias (municipio_id, nombre, codigo, tipo_gestion, activo, orden, color, icono)
                    VALUES (:m, :n, :c, :t, true, 1, :col, :ico)
                """), {"m": muni_id, "n": nombre, "c": codigo, "t": tipo, "col": color, "ico": icono})
                dep_ids[codigo] = ins.lastrowid
                print(f"Dependencia creada: {nombre}")

        # 3. Asignaciones de muestra para Asunción
        # Asignar algunas categorías a dependencias
        cats_res = await conn.execute(text("SELECT id, nombre FROM categorias_reclamo LIMIT 20"))
        cats = cats_res.fetchall()

        for c_id, c_nombre in cats:
            nom = c_nombre.lower()
            target_dep = None
            if any(k in nom for k in ['bache', 'agua', 'cloaca', 'vereda', 'obra']):
                target_dep = dep_ids.get('OBRAS')
            elif any(k in nom for k in ['luz', 'alumbrado', 'basura', 'higiene', 'arbol', 'plaza']):
                target_dep = dep_ids.get('SERVICIOS')
            elif any(k in nom for k in ['transito', 'vehiculo', 'estacionamiento']):
                target_dep = dep_ids.get('TRANSITO')
            elif any(k in nom for k in ['ruido', 'seguridad', 'cableado']):
                target_dep = dep_ids.get('SEGURIDAD')

            if target_dep:
                # Insertar en tabla de asignacion si existe
                try:
                    await conn.execute(text("""
                        INSERT IGNORE INTO municipio_dependencia_categorias (municipio_dependencia_id, categoria_id)
                        VALUES (:d, :c)
                    """), {"d": target_dep, "c": c_id})
                except Exception:
                    pass

        print("Poblado de asignaciones finalizado con éxito.")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(run())
