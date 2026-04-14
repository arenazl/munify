"""Benchmark del endpoint /municipios/crear-demo con timestamps por fase."""
import asyncio
import time
import httpx
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

BASE = "http://localhost:8002/api"


async def cleanup_demos():
    """Borrar todos los demos no-chacabuco antes de medir."""
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        for t in [
            "historial_reclamos", "reclamo_personas", "historial_solicitudes",
            "solicitudes", "reclamos", "tramite_documentos_requeridos",
            "tramites", "categorias_reclamo", "categorias_tramite",
            "municipio_dependencia_categorias", "municipio_dependencias",
            "notificaciones", "push_subscriptions", "barrios", "zonas",
            "empleados", "cuadrillas", "sla_config",
        ]:
            try:
                await conn.execute(text(f"DELETE FROM {t} WHERE municipio_id != 7"))
            except Exception:
                pass
        await conn.execute(text("DELETE FROM usuarios WHERE municipio_id != 7 AND municipio_id IS NOT NULL"))
        await conn.execute(text("DELETE FROM municipios WHERE id != 7"))
        await conn.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
    await engine.dispose()


async def bench():
    await cleanup_demos()

    # Hacer 3 corridas para sacar promedio
    print("=" * 60)
    print("BENCHMARK: /municipios/crear-demo (3 corridas)")
    print("=" * 60)

    async with httpx.AsyncClient(timeout=60) as c:
        times = []
        for i in range(3):
            nombre = f"Bench Run {i+1}"
            t0 = time.time()
            r = await c.post(f"{BASE}/municipios/crear-demo", json={"nombre": nombre})
            t1 = time.time()
            dur = t1 - t0
            times.append(dur)
            if r.status_code == 200:
                codigo = r.json()["codigo"]
                print(f"  Corrida {i+1}: {dur:.2f}s -> {codigo}")
            else:
                print(f"  Corrida {i+1}: FALLÓ ({r.status_code}): {r.text[:200]}")
            # Esperar un poco entre corridas
            await asyncio.sleep(0.3)

        if times:
            print()
            print(f"  Min:      {min(times):.2f}s")
            print(f"  Max:      {max(times):.2f}s")
            print(f"  Promedio: {sum(times)/len(times):.2f}s")

    # Cleanup después del bench
    await cleanup_demos()


if __name__ == "__main__":
    asyncio.run(bench())
