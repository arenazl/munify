"""
Script para agregar columnas color e icono a dependencias.
Ejecutar: python -m scripts.add_color_dependencias
"""
import asyncio
import sys
sys.path.insert(0, '.')

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from core.config import settings

# Colores variados para las dependencias
COLORES_DEPENDENCIAS = {
    "Dirección de Atención al Vecino": {"color": "#3b82f6", "icono": "Users"},  # Azul
    "Secretaría de Obras Públicas": {"color": "#f97316", "icono": "HardHat"},  # Naranja
    "Secretaría de Servicios Públicos y Ambiente": {"color": "#22c55e", "icono": "Leaf"},  # Verde
    "Dirección de Tránsito y Seguridad Vial": {"color": "#ef4444", "icono": "TrafficCone"},  # Rojo
    "Secretaría de Seguridad": {"color": "#dc2626", "icono": "Shield"},  # Rojo oscuro
    "Dirección de Zoonosis y Salud Animal": {"color": "#8b5cf6", "icono": "Dog"},  # Violeta
    "Dirección de Bromatología": {"color": "#06b6d4", "icono": "UtensilsCrossed"},  # Cyan
    "Juzgado de Faltas": {"color": "#64748b", "icono": "Scale"},  # Gris
    "Defensa Civil": {"color": "#f59e0b", "icono": "AlertTriangle"},  # Amarillo
    "Fiscalización General": {"color": "#84cc16", "icono": "ClipboardCheck"},  # Lima
    "Dirección de Recursos Humanos": {"color": "#ec4899", "icono": "UserCog"},  # Rosa
    "Secretaría de Hacienda": {"color": "#14b8a6", "icono": "Landmark"},  # Teal
    # Agregadas para Chacabuco
    "Dirección de Catastro": {"color": "#0ea5e9", "icono": "Map"},  # Sky
    "Dirección de Habilitaciones Comerciales": {"color": "#a855f7", "icono": "Store"},  # Purple
    "Dirección de Obras Particulares": {"color": "#ea580c", "icono": "Building"},  # Naranja oscuro
    "Dirección de Rentas": {"color": "#059669", "icono": "Receipt"},  # Esmeralda
    "Secretaría de Desarrollo Social": {"color": "#e11d48", "icono": "Heart"},  # Rose
}

# Color por defecto para las que no estén en la lista
DEFAULT_COLOR = "#6366f1"
DEFAULT_ICONO = "Building2"


async def main():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        print("=" * 60)
        print("AGREGANDO COLUMNAS COLOR E ICONO A DEPENDENCIAS")
        print("=" * 60)

        # 1. Verificar si las columnas ya existen
        try:
            await db.execute(text("SELECT color FROM dependencias LIMIT 1"))
            print("\n[OK] Columna 'color' ya existe")
        except Exception:
            print("\n[ADD] Agregando columna 'color'...")
            await db.execute(text("ALTER TABLE dependencias ADD COLUMN color VARCHAR(20) DEFAULT '#6366f1'"))
            await db.commit()
            print("   - Columna 'color' agregada")

        try:
            await db.execute(text("SELECT icono FROM dependencias LIMIT 1"))
            print("[OK] Columna 'icono' ya existe")
        except Exception:
            print("[ADD] Agregando columna 'icono'...")
            await db.execute(text("ALTER TABLE dependencias ADD COLUMN icono VARCHAR(50) DEFAULT 'Building2'"))
            await db.commit()
            print("   - Columna 'icono' agregada")

        # 2. Actualizar colores e iconos
        print("\n[UPDATE] Actualizando colores e iconos...")

        result = await db.execute(text("SELECT id, nombre FROM dependencias"))
        dependencias = result.fetchall()

        for dep in dependencias:
            config = COLORES_DEPENDENCIAS.get(dep.nombre, {"color": DEFAULT_COLOR, "icono": DEFAULT_ICONO})
            await db.execute(
                text("UPDATE dependencias SET color = :color, icono = :icono WHERE id = :id"),
                {"color": config["color"], "icono": config["icono"], "id": dep.id}
            )
            print(f"   [{dep.id}] {dep.nombre} -> {config['color']} / {config['icono']}")

        await db.commit()

        # 3. Mostrar resultado
        print("\n" + "=" * 60)
        print("RESULTADO FINAL")
        print("=" * 60)
        result = await db.execute(text("SELECT id, nombre, color, icono FROM dependencias ORDER BY nombre"))
        for row in result.fetchall():
            print(f"  [{row.id:2}] {row.nombre[:40]:<40} {row.color} / {row.icono}")

    await engine.dispose()
    print("\n[DONE] Colores e iconos configurados")


if __name__ == "__main__":
    asyncio.run(main())
