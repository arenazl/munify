"""Detector de inconsistencias de contactos/empleados/tipos del muni 80 (SPN).

Genera docs/clientes/spn/reporte-inconsistencias-contactos.md para pasarle al cliente.
Read-only: NO modifica nada.

Reglas (calibradas con datos reales para evitar falsos positivos):
  B. Empleado con gastos de obra/proveeduria y NINGUN gasto laboral -> posible proveedor.
  C. Empleado activo sin tipo_empleado_id (sin clasificar en el catalogo).
  D. No-empleado con gasto de SUELDO real (excluye cajones "honorarios" y
     "sueldos y jornales") -> posible empleado.
  E. (verificacion) Empleado con subtipo != nombre del tipo de la FK (debe ser 0).
  F. Catalogo de tipos: modalidad mezclada con oficio / inactivos / sin uso.

Nota descartada: comparar tipo vs `categoria=` de Bartolo da 148 diffs, pero es
la diferencia natural entre la inferencia automatica de la importacion y la
clasificacion curada despues -> ruido, no se reporta.
"""
import asyncio
import sys
import os
from collections import defaultdict

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select, func  # noqa: E402
from core.database import AsyncSessionLocal, engine  # noqa: E402
from models.contacto import Contacto  # noqa: E402
from models import Gasto  # noqa: E402
from models.tesoreria_extra import TesoreriaTipoEmpleado  # noqa: E402

MUNI = 80
OUT = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "..", "docs", "clientes", "spn",
    "reporte-inconsistencias-contactos.md",
))

# Indicios de relacion laboral (para B: "tiene algun gasto de sueldo").
LABORAL_KW = ("sueldo", "salario", "aguinaldo", "haber", "jornal", "presentismo",
              "incentivo", "sac", "plus", "liquidacion")
# Gastos de obra/proveeduria.
OBRA_KW = ("obra", "construc", "material", "insumo", "proveedur", "compra",
           "alquiler", "combustible", "flete", "repuesto", "ferret",
           "corralon", "arido", "hormig", "mercaderia")


def _kw(text, kws):
    t = (text or "").lower()
    return any(k in t for k in kws)


def _es_sueldo_real(concepto):
    """Sueldo de empleado de verdad. Excluye 'Pago de sueldos y jornales'
    (cajon contable de concejales) y 'honorarios' (profesionales/proveedores)."""
    cl = (concepto or "").lower()
    if "jornales" in cl or "honorario" in cl:
        return False
    return "sueldo" in cl or "aguinaldo" in cl or "salario" in cl or "haberes" in cl


def _norm(s):
    return (s or "").strip().lower()


MODALIDAD_TIPOS = {"en blanco", "pasantes", "jubilado", "personal jornalizado"}


async def main():
    async with AsyncSessionLocal() as db:
        contactos = (await db.execute(
            select(Contacto).where(Contacto.municipio_id == MUNI, Contacto.activo == True)  # noqa: E712
        )).scalars().all()

        tipos = (await db.execute(
            select(TesoreriaTipoEmpleado).where(TesoreriaTipoEmpleado.municipio_id == MUNI)
        )).scalars().all()
        nombre_por_id = {t.id: t.nombre for t in tipos}

        grows = (await db.execute(
            select(Gasto.destino_contacto_id, Gasto.concepto, func.count(Gasto.id),
                   func.coalesce(func.sum(Gasto.monto_pesos), 0))
            .where(Gasto.municipio_id == MUNI, Gasto.activo == True,  # noqa: E712
                   Gasto.destino_contacto_id.isnot(None))
            .group_by(Gasto.destino_contacto_id, Gasto.concepto)
        )).all()
        gastos = defaultdict(list)
        for cid, concepto, cnt, suma in grows:
            gastos[cid].append((concepto, cnt, float(suma)))

        def nombre(c):
            return f"{c.apellido or ''} {c.nombre}".strip()

        # B
        regB = []
        for c in contactos:
            if c.tipo.value != "empleado":
                continue
            gs = gastos.get(c.id, [])
            if not gs:
                continue
            tiene_laboral = any(_kw(con, LABORAL_KW) for con, _, _ in gs)
            tiene_obra = any(_kw(con, OBRA_KW) for con, _, _ in gs)
            if tiene_obra and not tiene_laboral:
                regB.append((c, gs))

        # C
        regC = [c for c in contactos if c.tipo.value == "empleado" and not c.tipo_empleado_id]

        # D
        regD = []
        for c in contactos:
            if c.tipo.value == "empleado":
                continue
            gs = gastos.get(c.id, [])
            sueldos = [con for con, _, _ in gs if _es_sueldo_real(con)]
            if sueldos:
                regD.append((c, sueldos))

        # E
        regE = []
        for c in contactos:
            if c.tipo.value != "empleado" or not c.tipo_empleado_id:
                continue
            esperado = nombre_por_id.get(c.tipo_empleado_id)
            if (c.subtipo or "") != (esperado or ""):
                regE.append((c, esperado))

        # F
        uso = defaultdict(int)
        for c in contactos:
            if c.tipo.value == "empleado" and c.tipo_empleado_id:
                uso[c.tipo_empleado_id] += 1
        tipos_inactivos = [t for t in tipos if not t.activo]
        tipos_activos_sin_uso = [t for t in tipos if t.activo and uso.get(t.id, 0) == 0]
        tipos_modalidad = [t for t in tipos if t.activo and _norm(t.nombre) in MODALIDAD_TIPOS]

        # ============ REPORTE ============
        L = []
        L.append("# Inconsistencias de contactos — San Pedro Norte (muni 80)\n")
        L.append("Read-only: este reporte NO modifica datos. Cada caso es para revisar a mano.\n")
        L.append(f"Universo: {len(contactos)} contactos activos.\n")

        L.append("\n## B. Empleados con gastos de obra/proveeduria y ningun gasto de sueldo (¿proveedores mal clasificados?)\n")
        if regB:
            L.append("| id | nombre | tipo empleado | conceptos de gasto |")
            L.append("|----|--------|---------------|--------------------|")
            for c, gs in sorted(regB, key=lambda x: nombre(x[0])):
                conceptos = ", ".join(sorted({con for con, _, _ in gs}))[:90]
                te = nombre_por_id.get(c.tipo_empleado_id, "(sin tipo)")
                L.append(f"| {c.id} | {nombre(c)} | {te} | {conceptos} |")
        else:
            L.append("_Sin casos._")

        L.append("\n## C. Empleados sin tipo de empleado asignado\n")
        if regC:
            L.append("| id | nombre |")
            L.append("|----|--------|")
            for c in sorted(regC, key=nombre):
                L.append(f"| {c.id} | {nombre(c)} |")
        else:
            L.append("_Sin casos (todos los empleados tienen tipo)._")

        L.append("\n## D. Contactos NO-empleados con gasto de 'Sueldo' (¿empleados mal clasificados?)\n")
        if regD:
            L.append("| id | nombre | tipo actual | conceptos de sueldo |")
            L.append("|----|--------|-------------|---------------------|")
            for c, sueldos in sorted(regD, key=lambda x: nombre(x[0])):
                L.append(f"| {c.id} | {nombre(c)} | {c.tipo.value} | {', '.join(sorted(set(sueldos)))[:60]} |")
        else:
            L.append("_Sin casos._")

        L.append("\n## E. (Verificacion) Empleados con subtipo desalineado de su tipo\n")
        L.append("_Coherente: 0 casos._" if not regE else
                 "\n".join([f"- {c.id} {nombre(c)}: subtipo={c.subtipo!r} vs FK={esp!r}" for c, esp in regE]))

        L.append("\n## F. Catalogo de tipos de empleado (deuda de diseño)\n")
        L.append("- **Mezclan modalidad/situacion con oficio** (deberian ser 'forma de pago', no 'tipo'): "
                 + (", ".join(f"{t.nombre} ({uso.get(t.id,0)} emp)" for t in tipos_modalidad) or "ninguno"))
        L.append("- **Activos sin ningun empleado**: "
                 + (", ".join(t.nombre for t in tipos_activos_sin_uso) or "ninguno"))
        L.append("- **Inactivos** (candidatos a borrar): "
                 + (", ".join(t.nombre for t in tipos_inactivos) or "ninguno"))

        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "w", encoding="utf-8") as f:
            f.write("\n".join(L) + "\n")

        print(f"Reporte: {OUT}\n")
        print(f"B. empleados con gastos de obra (posibles proveedores): {len(regB)}")
        for c, gs in sorted(regB, key=lambda x: nombre(x[0])):
            print(f"    {c.id}  {nombre(c)}  [{nombre_por_id.get(c.tipo_empleado_id,'?')}]  ::  "
                  + ", ".join(sorted({con for con, _, _ in gs}))[:70])
        print(f"\nC. empleados sin tipo: {len(regC)}")
        print(f"\nD. no-empleados con sueldo real (posibles empleados): {len(regD)}")
        for c, sueldos in sorted(regD, key=lambda x: nombre(x[0])):
            print(f"    {c.id}  {nombre(c)}  [{c.tipo.value}]  ::  {', '.join(sorted(set(sueldos)))[:50]}")
        print(f"\nE. subtipo desalineado: {len(regE)}")
        print(f"F. modalidad={len(tipos_modalidad)} activos-sin-uso={len(tipos_activos_sin_uso)} inactivos={len(tipos_inactivos)}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
