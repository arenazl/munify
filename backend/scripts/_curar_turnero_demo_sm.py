"""Curado DEMO del turnero para San Martín (muni 120, es_demo=True).

Deja el flujo turno-first demoable de punta a punta:
- modo_atencion realista por trámite (mayoría presencial_con_turno,
  algunos online / orden de llegada)
- requiere_kyc nivel 2 en licencia de conducir (la regla de identidad)
- TODOS los trámites presenciales mapeados a una dependencia
  (round-robin entre las activas si no hay match por afinidad)

SOLO muni 120 (demo). No toca ningún municipio productivo.
"""
import asyncio
import os
import sys
import unicodedata

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.tramite import Tramite  # noqa: E402
from models.municipio_dependencia import MunicipioDependencia  # noqa: E402
from models.municipio_dependencia_tramite import MunicipioDependenciaTramite  # noqa: E402

MUNI = 120

ONLINE_KW = ("libre deuda", "certificado", "constancia", "boleta")
SIN_TURNO_KW = ("denuncia", "reclamo")
KYC_KW = ("licencia", "conducir")


def _n(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


async def main():
    async with AsyncSessionLocal() as db:
        tramites = (await db.execute(
            select(Tramite).where(Tramite.municipio_id == MUNI, Tramite.activo == True)  # noqa: E712
        )).scalars().all()
        deps = (await db.execute(
            select(MunicipioDependencia).where(
                MunicipioDependencia.municipio_id == MUNI,
            )
        )).scalars().all()
        if not deps:
            print("Sin dependencias en el muni 120 — nada que mapear")
            return

        mapeados = set((await db.execute(
            select(MunicipioDependenciaTramite.tramite_id)
            .join(MunicipioDependencia,
                  MunicipioDependencia.id == MunicipioDependenciaTramite.municipio_dependencia_id)
            .where(MunicipioDependencia.municipio_id == MUNI)
        )).scalars().all())

        i = 0
        resumen = {"con_turno": 0, "online": 0, "sin_turno": 0, "kyc": 0, "mapeados_nuevos": 0}
        for t in tramites:
            nom = _n(t.nombre)
            if any(k in nom for k in ONLINE_KW):
                t.modo_atencion = "online"
                resumen["online"] += 1
            elif any(k in nom for k in SIN_TURNO_KW):
                t.modo_atencion = "presencial_sin_turno"
                resumen["sin_turno"] += 1
            else:
                t.modo_atencion = "presencial_con_turno"
                t.duracion_turno_min = t.duracion_turno_min or 30
                resumen["con_turno"] += 1
            if any(k in nom for k in KYC_KW):
                t.requiere_kyc = True
                t.nivel_kyc_minimo = 2
                t.duracion_turno_min = 45
                resumen["kyc"] += 1
            # Mapeo a dependencia si falta (round-robin)
            if t.id not in mapeados and t.modo_atencion != "online":
                dep = deps[i % len(deps)]
                i += 1
                db.add(MunicipioDependenciaTramite(
                    municipio_dependencia_id=dep.id, tramite_id=t.id, activo=True,
                ))
                resumen["mapeados_nuevos"] += 1

        await db.commit()
        print(f"tramites: {len(tramites)} | {resumen}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
