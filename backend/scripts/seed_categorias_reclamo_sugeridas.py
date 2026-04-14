"""
Crea la tabla `categorias_reclamo_sugeridas` si no existe y la puebla con
~20 categorías típicas de municipios argentinos.

Cross-municipio — no depende de ningún municipio. Solo es knowledge base
para el autocomplete del admin en `/gestion/categorias-reclamo`.

Ejecutar:
    cd backend && python -m scripts.seed_categorias_reclamo_sugeridas
    cd backend && python -m scripts.seed_categorias_reclamo_sugeridas --reset
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from core.config import settings


# Formato: (nombre, descripcion, icono, color, tiempo_horas, prioridad, rubro)
CATALOGO = [
    # Infraestructura urbana
    ("Iluminación Pública",
     "Problemas con alumbrado público: luminarias apagadas, intermitentes, postes caídos, cables sueltos o zonas sin cobertura.",
     "Lightbulb", "#f59e0b", 48, 3, "Infraestructura"),

    ("Baches y Calzadas",
     "Deterioro de calles, pavimento y asfalto: baches, hundimientos, pozos profundos, rotura de badenes.",
     "Construction", "#78716c", 72, 3, "Infraestructura"),

    ("Veredas y Baldíos",
     "Problemas en veredas (baldosas rotas, levantadas) y terrenos baldíos (malezas, basura, cerramiento).",
     "Footprints", "#a855f7", 120, 4, "Infraestructura"),

    ("Semáforos y Señalización Vial",
     "Semáforos apagados o con fallas, carteles caídos, señalización borrosa o faltante, demarcación horizontal.",
     "TrafficCone", "#ef4444", 6, 1, "Infraestructura"),

    ("Obras en Vía Pública",
     "Obras municipales o privadas con problemas: demoras, ocupaciones indebidas, escombros, falta de señalización.",
     "HardHat", "#f97316", 48, 3, "Infraestructura"),

    # Servicios públicos
    ("Recolección de Residuos",
     "Fallas en el servicio de recolección: basura no retirada, contenedores desbordados o rotos, basurales clandestinos.",
     "Trash2", "#10b981", 48, 3, "Servicios"),

    ("Limpieza Urbana",
     "Barrido de calles, limpieza de desagües pluviales, retiro de graffitis, cartelería ilegal.",
     "Brush", "#22c55e", 120, 5, "Servicios"),

    ("Agua y Cloacas",
     "Pérdidas de agua en vía pública, cortes de suministro, cloacas desbordadas, tapas faltantes, baja presión.",
     "Droplets", "#0ea5e9", 6, 1, "Servicios"),

    ("Espacios Verdes",
     "Mantenimiento de plazas y parques: pasto alto, juegos infantiles rotos, bancos dañados, riego defectuoso.",
     "Trees", "#22c55e", 168, 5, "Servicios"),

    # Medio ambiente
    ("Arbolado y Poda",
     "Árboles caídos, ramas en la vía pública, solicitudes de poda, árboles secos, raíces que rompen veredas.",
     "TreeDeciduous", "#84cc16", 24, 2, "Ambiente"),

    ("Plagas y Fumigación",
     "Plagas de roedores, insectos, palomas o cualquier situación que requiera fumigación o control.",
     "Bug", "#a855f7", 48, 3, "Ambiente"),

    ("Salud Ambiental",
     "Focos insalubres, olores fuertes, humedad, condiciones ambientales que afectan la salud pública.",
     "HeartPulse", "#ec4899", 72, 3, "Ambiente"),

    ("Ruidos Molestos",
     "Ruidos excesivos provenientes de viviendas, comercios, obras o vehículos que afecten la convivencia.",
     "Volume2", "#8b5cf6", 24, 3, "Ambiente"),

    # Tránsito
    ("Tránsito y Transporte",
     "Autos abandonados, ocupaciones indebidas de calle, problemas con líneas de colectivos urbanos.",
     "Car", "#3b82f6", 72, 4, "Tránsito"),

    # Convivencia
    ("Zoonosis y Animales",
     "Perros sueltos, animales heridos o muertos en vía pública, maltrato animal, control sanitario.",
     "Dog", "#f59e0b", 24, 3, "Convivencia"),

    ("Seguridad Urbana",
     "Zonas oscuras, lugares abandonados, situaciones que generen sensación de inseguridad y requieran intervención preventiva.",
     "ShieldCheck", "#ef4444", 48, 2, "Convivencia"),

    # Otros servicios municipales
    ("Cementerios",
     "Problemas con parcelas, mantenimiento de cementerios municipales, trámites asociados.",
     "Cross", "#64748b", 168, 5, "Servicios"),

    ("Comercio e Inspecciones",
     "Denuncias de comercios que operan sin habilitación, vendedores ambulantes, problemas con actividad comercial.",
     "Store", "#f59e0b", 120, 4, "Otros"),

    ("Obras Públicas",
     "Reclamos sobre obras municipales en ejecución o ya finalizadas: calidad, demoras, roturas posteriores.",
     "Building2", "#6366f1", 240, 4, "Otros"),

    ("Otros Reclamos",
     "Reclamos que no encuadran claramente en las categorías anteriores pero requieren atención municipal.",
     "FileText", "#94a3b8", 120, 4, "Otros"),
]


async def run(reset: bool = False) -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        # 1. Crear tabla
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS categorias_reclamo_sugeridas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                descripcion TEXT,
                icono VARCHAR(50),
                color VARCHAR(20),
                tiempo_resolucion_estimado INT,
                prioridad_default INT,
                rubro VARCHAR(100),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_crs_nombre (nombre),
                INDEX idx_crs_rubro (rubro)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))

        if reset:
            await conn.execute(text("DELETE FROM categorias_reclamo_sugeridas"))
            print("[RESET] tabla vaciada")

        r = await conn.execute(text("SELECT COUNT(*) FROM categorias_reclamo_sugeridas"))
        existentes = r.scalar() or 0
        if existentes > 0 and not reset:
            print(f"[SKIP] ya hay {existentes} filas. Usar --reset para rehacer.")
            await engine.dispose()
            return

        total = 0
        for nombre, desc, icono, color, tiempo, prio, rubro in CATALOGO:
            await conn.execute(
                text("""
                    INSERT INTO categorias_reclamo_sugeridas
                        (nombre, descripcion, icono, color, tiempo_resolucion_estimado, prioridad_default, rubro)
                    VALUES (:nombre, :desc, :icono, :color, :tiempo, :prio, :rubro)
                """),
                {
                    "nombre": nombre,
                    "desc": desc,
                    "icono": icono,
                    "color": color,
                    "tiempo": tiempo,
                    "prio": prio,
                    "rubro": rubro,
                },
            )
            total += 1

        print(f"[OK] sembradas {total} categorías de reclamo sugeridas")

    await engine.dispose()


if __name__ == "__main__":
    reset = "--reset" in sys.argv
    asyncio.run(run(reset=reset))
