"""
Agregar campo requiere_validacion_dni a tramites
y marcar algunos trámites que lo requieren
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "mysql+aiomysql://avnadmin:AVNS_Fqe0qsChCHnqSnVsvoi@mysql-aiven-arenazl.e.aivencloud.com:23108/sugerenciasmun"

# Tramites que requieren validacion de DNI (fotos frente/dorso)
# Por lo general son los mismos que requieren validacion facial,
# mas algunos trámites que requieren verificar identidad pero no necesariamente facial
tramites_con_validacion_dni = [
    9,   # Licencia de Conducir - Primera vez
    10,  # Renovacion de Licencia
    22,  # Certificado de Domicilio
    23,  # Certificado de Supervivencia
    24,  # Subsidio por Emergencia Habitacional
    25,  # Inscripcion Tarjeta Alimentaria
    27,  # Certificado Socioeconomico
    28,  # Inscripcion Programa de Vivienda
    # Adicionales que pueden requerir DNI pero no facial:
    # (agregar según necesidad)
]

async def migrate():
    engine = create_async_engine(DATABASE_URL)

    async with engine.begin() as conn:
        # 1. Agregar columna si no existe
        try:
            await conn.execute(text(
                "ALTER TABLE tramites ADD COLUMN requiere_validacion_dni BOOLEAN DEFAULT FALSE"
            ))
            print("[OK] Columna requiere_validacion_dni agregada")
        except Exception as e:
            if "Duplicate column" in str(e):
                print("[INFO] Columna requiere_validacion_dni ya existe")
            else:
                raise e

        # 2. Actualizar tramites que requieren validacion DNI
        for tramite_id in tramites_con_validacion_dni:
            await conn.execute(
                text("UPDATE tramites SET requiere_validacion_dni = TRUE WHERE id = :id"),
                {"id": tramite_id}
            )
        print(f"[OK] {len(tramites_con_validacion_dni)} tramites marcados con validacion DNI")

        # 3. Mostrar estado actual de validaciones
        result = await conn.execute(text("""
            SELECT id, nombre, requiere_validacion_dni, requiere_validacion_facial
            FROM tramites
            WHERE requiere_validacion_dni = TRUE OR requiere_validacion_facial = TRUE
            ORDER BY id
        """))
        rows = result.fetchall()
        print("\n[INFO] Trámites con validación de identidad:")
        print("-" * 80)
        print(f"{'ID':<4} {'Nombre':<40} {'DNI':<6} {'Facial':<6}")
        print("-" * 80)
        for row in rows:
            print(f"{row[0]:<4} {row[1][:40]:<40} {'Sí' if row[2] else 'No':<6} {'Sí' if row[3] else 'No':<6}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate())
