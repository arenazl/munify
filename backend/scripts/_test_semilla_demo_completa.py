"""Prueba integral LOCAL de la semilla demo completa (pipeline de /crear-demo).

Crea un muni demo de prueba ("Baradero") contra la BD real replicando los
pasos del endpoint, verifica counts de TODOS los modulos (turnero, OTs,
reclamos, tasas, tesoreria, flags) y lo borra con el mismo cascade del
endpoint DELETE. Si algo falla, imprime el error y deja el muni para
inspeccion (borrarlo con DELETE /api/municipios/demo/{codigo}).
"""
import asyncio
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402

NOMBRE = "Baradero"


async def main():
    from models.municipio import Municipio
    from models.user import User
    from models.enums import RolUsuario
    from sqlalchemy import select
    from services.categorias_default import crear_categorias_default
    from services.seed_demo import seed_demo_completo, seed_turnero_demo

    # No se importa api.municipios: el paquete api revienta con el pydantic
    # local (incompatibilidad de version, solo local). Se replican las dos
    # piezas necesarias: _normalizar_codigo y el cascade delete del endpoint.
    def _normalizar_codigo(nombre: str) -> str:
        import unicodedata
        import re
        s = unicodedata.normalize("NFD", nombre.lower())
        s = "".join(c for c in s if unicodedata.category(c) != "Mn")
        s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
        return s

    async def eliminar_municipio_demo(codigo_del: str, db):
        # Replica del cascade del endpoint DELETE /municipios/demo/{codigo}
        # (mantener en sync con api/municipios.py)
        r = await db.execute(select(Municipio).where(Municipio.codigo == codigo_del))
        m = r.scalar_one_or_none()
        if not m:
            return {"message": "no encontrado"}
        mid_del = m.id
        await db.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        for join_sql in [
            "DELETE hr FROM historial_reclamos hr JOIN reclamos r ON hr.reclamo_id = r.id WHERE r.municipio_id = :mid",
            "DELETE hs FROM historial_solicitudes hs JOIN solicitudes s ON hs.solicitud_id = s.id WHERE s.municipio_id = :mid",
            "DELETE td FROM tramite_documentos_requeridos td JOIN tramites t ON td.tramite_id = t.id WHERE t.municipio_id = :mid",
            "DELETE sv FROM sla_violaciones sv JOIN reclamos r ON sv.reclamo_id = r.id WHERE r.municipio_id = :mid",
            "DELETE ec FROM empleado_cuadrillas ec JOIN empleados e ON ec.empleado_id = e.id WHERE e.municipio_id = :mid",
            "DELETE ec FROM empleado_categorias ec JOIN empleados e ON ec.empleado_id = e.id WHERE e.municipio_id = :mid",
            "DELETE ea FROM empleado_ausencias ea JOIN empleados e ON ea.empleado_id = e.id WHERE e.municipio_id = :mid",
            "DELETE eh FROM empleado_horarios eh JOIN empleados e ON eh.empleado_id = e.id WHERE e.municipio_id = :mid",
            "DELETE em FROM empleado_metricas em JOIN empleados e ON em.empleado_id = e.id WHERE e.municipio_id = :mid",
            "DELETE ec FROM empleado_capacitaciones ec JOIN empleados e ON ec.empleado_id = e.id WHERE e.municipio_id = :mid",
            "DELETE cc FROM cuadrilla_categorias cc JOIN cuadrillas c ON cc.cuadrilla_id = c.id WHERE c.municipio_id = :mid",
            "DELETE otr FROM orden_trabajo_reclamos otr JOIN ordenes_trabajo ot ON otr.orden_trabajo_id = ot.id WHERE ot.municipio_id = :mid",
            "DELETE mdt FROM municipio_dependencia_tramites mdt JOIN municipio_dependencias md ON mdt.municipio_dependencia_id = md.id WHERE md.municipio_id = :mid",
            "DELETE d FROM tasas_deudas d JOIN tasas_partidas p ON d.partida_id = p.id WHERE p.municipio_id = :mid",
            "DELETE tp FROM tasas_pagos tp JOIN tasas_partidas p ON tp.partida_id = p.id WHERE p.municipio_id = :mid",
            "DELETE gc FROM gastos_cuotas gc JOIN gastos g ON gc.gasto_id = g.id WHERE g.municipio_id = :mid",
        ]:
            try:
                await db.execute(text(join_sql), {"mid": mid_del})
            except Exception:
                pass
        for t in [
            "historial_reclamos", "reclamo_personas", "historial_solicitudes",
            "solicitudes", "reclamos", "tramite_documentos_requeridos",
            "tramites", "categorias_reclamo", "categorias_tramite",
            "municipio_dependencia_categorias", "municipio_dependencias",
            "notificaciones", "push_subscriptions", "barrios", "zonas",
            "badges_usuarios", "puntos_usuarios", "historial_puntos",
            "email_validations",
            "cuadrillas", "empleados", "sla_config",
            "turnos", "ordenes_trabajo", "municipio_modulos",
            "tasas_partidas",
            "tesoreria_movimientos_caja", "tesoreria_pagos_programados",
            "tesoreria_premios", "tesoreria_cajas", "tesoreria_parajes",
            "tesoreria_conceptos", "tesoreria_tipos_concepto", "tesoreria_tipos_empleado",
            "gasto_proyectos", "gastos", "contactos", "ordenes_pago",
            "salesbot_configs", "configuraciones",
        ]:
            try:
                await db.execute(text(f"DELETE FROM {t} WHERE municipio_id = :mid"), {"mid": mid_del})
            except Exception:
                pass
        await db.execute(text("DELETE FROM usuarios WHERE municipio_id = :mid"), {"mid": mid_del})
        await db.execute(text("DELETE FROM municipios WHERE id = :mid"), {"mid": mid_del})
        await db.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
        await db.commit()
        return {"message": f"demo '{codigo_del}' eliminado"}

    async with AsyncSessionLocal() as db:
        # --- creacion (replica del endpoint) ---
        base = _normalizar_codigo(NOMBRE)
        codigo = base
        i = 1
        while (await db.execute(select(Municipio).where(Municipio.codigo == codigo))).scalar_one_or_none():
            i += 1
            codigo = f"{base}-{i}"

        # Geocodificar como el endpoint
        lat, lng = -34.603722, -58.381592
        try:
            import httpx
            async with httpx.AsyncClient(timeout=8.0) as hc:
                r = await hc.get("https://nominatim.openstreetmap.org/search",
                                 params={"q": f"{NOMBRE}, Argentina", "format": "json",
                                         "limit": 1, "countrycodes": "ar"},
                                 headers={"User-Agent": "Munify/1.0 (test seed)"})
                if r.status_code == 200 and r.json():
                    lat, lng = float(r.json()[0]["lat"]), float(r.json()[0]["lon"])
        except Exception as e:
            print(f"nominatim fallo (uso fallback): {e}")

        muni = Municipio(nombre=NOMBRE, codigo=codigo, latitud=lat, longitud=lng,
                         radio_km=10.0, color_primario="#0088cc", color_secundario="#005fa3",
                         zoom_mapa_default=13, activo=True, abm_en_sidebar=False)
        db.add(muni)
        await db.flush()
        await crear_categorias_default(db, muni.id)
        await db.flush()
        seed_info = await seed_demo_completo(db, muni.id, codigo)
        await db.commit()
        print(f"[1] seed base: {seed_info}")

        try:
            from scripts.seed_10_demos import seed_municipio
            await seed_municipio(db, muni.id, muni.nombre)
            await db.commit()
            print("[2] seed 10+10 OK")
        except Exception as e:
            print(f"[2] seed 10+10 FALLO: {e}")
            await db.rollback()

        turnero = await seed_turnero_demo(db, muni.id)
        await db.commit()
        print(f"[3] turnero: {turnero}")

        try:
            from scripts.seed_tasas_completo import seed_para_municipio as seed_tasas
            await seed_tasas(muni.id, limpiar=False)
            print("[4] tasas OK")
        except Exception as e:
            print(f"[4] tasas FALLO (best-effort): {e}")

        try:
            from services.seed_demo_tesoreria import seed_tesoreria_demo
            admin = (await db.execute(select(User).where(
                User.municipio_id == muni.id, User.rol == RolUsuario.ADMIN).limit(1))).scalar_one_or_none()
            t_counts = await seed_tesoreria_demo(db, muni.id, admin.id)
            await db.commit()
            print(f"[5] tesoreria: {t_counts}")
        except Exception as e:
            print(f"[5] tesoreria FALLO (best-effort): {e}")
            await db.rollback()

        # --- verificacion ---
        mid = muni.id
        print(f"\n=== VERIFICACION muni {mid} ({codigo}) lat={lat:.4f} lng={lng:.4f} ===")
        checks = [
            ("tramites por modo", "SELECT modo_atencion, COUNT(*) FROM tramites WHERE municipio_id=:m GROUP BY modo_atencion"),
            ("tramites con KYC", "SELECT COUNT(*) FROM tramites WHERE municipio_id=:m AND requiere_kyc=1"),
            ("mapeos tramite→dep", """SELECT COUNT(*) FROM municipio_dependencia_tramites mdt
                JOIN municipio_dependencias md ON md.id=mdt.municipio_dependencia_id WHERE md.municipio_id=:m"""),
            ("turnos por estado", "SELECT estado, COUNT(*) FROM turnos WHERE municipio_id=:m GROUP BY estado"),
            ("OTs por estado", "SELECT estado, COUNT(*) FROM ordenes_trabajo WHERE municipio_id=:m GROUP BY estado"),
            ("OT-reclamo vinculos", """SELECT COUNT(*) FROM orden_trabajo_reclamos otr
                JOIN ordenes_trabajo ot ON ot.id=otr.orden_trabajo_id WHERE ot.municipio_id=:m"""),
            ("reclamos por canal", "SELECT canal, COUNT(*) FROM reclamos WHERE municipio_id=:m GROUP BY canal"),
            ("reclamos por estado", "SELECT estado, COUNT(*) FROM reclamos WHERE municipio_id=:m GROUP BY estado"),
            ("solicitudes", "SELECT COUNT(*) FROM solicitudes WHERE municipio_id=:m"),
            ("flags modulos", "SELECT modulo, activo FROM municipio_modulos WHERE municipio_id=:m"),
            ("partidas tasas", "SELECT COUNT(*) FROM tasas_partidas WHERE municipio_id=:m"),
            ("cajas", "SELECT COUNT(*) FROM tesoreria_cajas WHERE municipio_id=:m"),
            ("contactos", "SELECT COUNT(*) FROM contactos WHERE municipio_id=:m"),
            ("gastos", "SELECT COUNT(*) FROM gastos WHERE municipio_id=:m"),
            ("pagos programados", "SELECT COUNT(*) FROM tesoreria_pagos_programados WHERE municipio_id=:m"),
            ("empleados/cuadrillas", "SELECT (SELECT COUNT(*) FROM empleados WHERE municipio_id=:m), (SELECT COUNT(*) FROM cuadrillas WHERE municipio_id=:m)"),
        ]
        for label, q in checks:
            try:
                rows = (await db.execute(text(q), {"m": mid})).fetchall()
                val = rows[0] if len(rows) == 1 and len(rows[0]) <= 2 and label not in (
                    "tramites por modo", "turnos por estado", "OTs por estado",
                    "reclamos por canal", "reclamos por estado", "flags modulos") else rows
                print(f"  {label}: {val}")
            except Exception as e:
                print(f"  {label}: ERROR {str(e)[:70]}")

        # --- borrado con el cascade del endpoint ---
        print("\n=== BORRADO ===")
        res = await eliminar_municipio_demo(codigo, db)
        print(f"  {res}")

        # --- huerfanos post-borrado ---
        huerfanos = []
        for tabla in ("turnos", "ordenes_trabajo", "tramites", "reclamos", "gastos",
                      "contactos", "tesoreria_cajas", "tasas_partidas", "municipio_modulos",
                      "tesoreria_pagos_programados", "usuarios"):
            try:
                n = (await db.execute(text(
                    f"SELECT COUNT(*) FROM {tabla} WHERE municipio_id=:m"), {"m": mid})).scalar()
                if n:
                    huerfanos.append(f"{tabla}={n}")
            except Exception:
                pass
        print(f"  huerfanos: {huerfanos if huerfanos else 'NINGUNO — cascade limpio'}")

        # Limpiar restos de corridas previas del test (si las hubo)
        for cod_viejo in (base,) + tuple(f"{base}-{k}" for k in range(2, i)):
            if cod_viejo != codigo:
                res = await eliminar_municipio_demo(cod_viejo, db)
                print(f"  limpieza previa {cod_viejo}: {res}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
