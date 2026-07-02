"""Exploratorio para calibrar el detector: ver valores reales de
`categoria=` de Bartolo y los conceptos que disparan la regla D."""
import asyncio
import re
import sys
import os
from collections import Counter

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select, func  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.contacto import Contacto, TipoContacto  # noqa: E402
from models import Gasto  # noqa: E402

MUNI = 80
ENUM_VALS = {e.value for e in TipoContacto}
SUELDO_KW = ("sueldo", "aguinaldo", "salario", "haber", "jornal", "presentismo",
             "incentivo", "sac", "liquidacion", "plus", "viatico", "bonific",
             "antiguedad", "dieta", "honorario")


async def main():
    async with AsyncSessionLocal() as db:
        contactos = (await db.execute(
            select(Contacto).where(Contacto.municipio_id == MUNI, Contacto.activo == True)  # noqa: E712
        )).scalars().all()

        # categorias Bartolo
        cat_counter = Counter()
        cat_vs_tipo = Counter()
        cat_en_enum_difiere = 0
        for c in contactos:
            m = re.search(r"categoria=([a-záéíóúñ]+)", (c.notas or "").lower())
            if m:
                cat = m.group(1)
                cat_counter[cat] += 1
                cat_vs_tipo[(cat, c.tipo.value)] += 1
                if cat in ENUM_VALS and cat != c.tipo.value:
                    cat_en_enum_difiere += 1

        print("=== Valores de `categoria=` en notas Bartolo (muni 80) ===")
        for cat, n in cat_counter.most_common():
            in_enum = "  <-- es valor de TipoContacto" if cat in ENUM_VALS else ""
            print(f"  {n:>4}  categoria={cat}{in_enum}")

        print(f"\n  -> Casos donde cat ES del enum Y difiere del tipo: {cat_en_enum_difiere}")
        print("     (esos son los REALES; el resto son categorias que no mapean al enum = ruido)")

        # conceptos que disparan D (no-empleado con keyword sueldo)
        print("\n=== Regla D: conceptos de gasto que matchean SUELDO_KW en no-empleados ===")
        grows = (await db.execute(
            select(Contacto.tipo, Gasto.concepto, func.count(Gasto.id))
            .join(Gasto, Gasto.destino_contacto_id == Contacto.id)
            .where(Contacto.municipio_id == MUNI, Contacto.activo == True,  # noqa: E712
                   Gasto.activo == True, Contacto.tipo != 'empleado')  # noqa: E712
            .group_by(Contacto.tipo, Gasto.concepto)
        )).all()
        kw_hits = Counter()
        for tipo, concepto, cnt in grows:
            cl = (concepto or "").lower()
            for k in SUELDO_KW:
                if k in cl:
                    kw_hits[(k, concepto, tipo.value if hasattr(tipo, 'value') else tipo)] += cnt
        for (k, concepto, tipo), n in kw_hits.most_common():
            print(f"  kw={k:<12} tipo={tipo:<12} x{n:<4} concepto={concepto!r}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
