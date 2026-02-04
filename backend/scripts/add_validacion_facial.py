"""
Agregar campo requiere_validacion_facial a tramites
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "mysql+aiomysql://avnadmin:AVNS_Fqe0qsChCHnqSnVsvoi@mysql-aiven-arenazl.e.aivencloud.com:23108/sugerenciasmun"

# Tramites que requieren validacion facial (verificacion de identidad)
tramites_con_validacion = [
    9,   # Licencia de Conducir - Primera vez
    10,  # Renovacion de Licencia
    22,  # Certificado de Domicilio
    23,  # Certificado de Supervivencia (ya dice PERSONALMENTE)
    24,  # Subsidio por Emergencia Habitacional
    25,  # Inscripcion Tarjeta Alimentaria
    27,  # Certificado Socioeconomico
    28,  # Inscripcion Programa de Vivienda
]

async def migrate():
    engine = create_async_engine(DATABASE_URL)
    
    async with engine.begin() as conn:
        # 1. Agregar columna si no existe
        try:
            await conn.execute(text(
                "ALTER TABLE tramites ADD COLUMN requiere_validacion_facial BOOLEAN DEFAULT FALSE"
            ))
            print("[OK] Columna requiere_validacion_facial agregada")
        except Exception as e:
            if "Duplicate column" in str(e):
                print("[INFO] Columna ya existe")
            else:
                raise e
        
        # 2. Actualizar tramites que requieren validacion
        for tramite_id in tramites_con_validacion:
            await conn.execute(
                text("UPDATE tramites SET requiere_validacion_facial = TRUE WHERE id = :id"),
                {"id": tramite_id}
            )
        print(f"[OK] {len(tramites_con_validacion)} tramites marcados con validacion facial")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate())
