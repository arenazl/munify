"""Migracion + seed para las 3 features nuevas:
1. tesoreria_tipos_empleado (+ contactos.tipo_empleado_id)
2. tesoreria_cajas + tesoreria_movimientos_caja (+ gastos.caja_id)
3. tesoreria_pagos_programados
"""
import asyncio
import sys
from datetime import date
from decimal import Decimal
from calendar import monthrange
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text, select
from core.config import settings

SQL = [
    # 1. Tipos de empleado
    """
    CREATE TABLE IF NOT EXISTS tesoreria_tipos_empleado (
        id INT NOT NULL AUTO_INCREMENT,
        municipio_id INT NOT NULL,
        nombre VARCHAR(100) NOT NULL,
        descripcion TEXT NULL,
        color VARCHAR(20) NULL,
        icono VARCHAR(60) NULL,
        orden INT NOT NULL DEFAULT 0,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX ix_te_muni (municipio_id),
        CONSTRAINT fk_te_muni FOREIGN KEY (municipio_id) REFERENCES municipios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """,
    # 2. Cajas
    """
    CREATE TABLE IF NOT EXISTS tesoreria_cajas (
        id INT NOT NULL AUTO_INCREMENT,
        municipio_id INT NOT NULL,
        nombre VARCHAR(80) NOT NULL,
        codigo VARCHAR(30) NULL,
        descripcion TEXT NULL,
        color VARCHAR(20) NULL,
        icono VARCHAR(60) NULL,
        saldo_inicial DECIMAL(15,2) NOT NULL DEFAULT 0,
        fecha_apertura DATE NULL,
        orden INT NOT NULL DEFAULT 0,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX ix_caja_muni (municipio_id),
        CONSTRAINT fk_caja_muni FOREIGN KEY (municipio_id) REFERENCES municipios(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """,
    # Movimientos de caja
    """
    CREATE TABLE IF NOT EXISTS tesoreria_movimientos_caja (
        id INT NOT NULL AUTO_INCREMENT,
        municipio_id INT NOT NULL,
        caja_id INT NOT NULL,
        gasto_id INT NULL,
        tipo ENUM('ingreso','egreso') NOT NULL,
        monto DECIMAL(15,2) NOT NULL,
        fecha DATE NOT NULL,
        concepto VARCHAR(150) NOT NULL,
        descripcion TEXT NULL,
        created_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX ix_mov_muni (municipio_id),
        INDEX ix_mov_caja (caja_id),
        INDEX ix_mov_fecha (fecha),
        CONSTRAINT fk_mov_muni FOREIGN KEY (municipio_id) REFERENCES municipios(id),
        CONSTRAINT fk_mov_caja FOREIGN KEY (caja_id) REFERENCES tesoreria_cajas(id) ON DELETE CASCADE,
        CONSTRAINT fk_mov_gasto FOREIGN KEY (gasto_id) REFERENCES gastos(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """,
    # 3. Pagos programados
    """
    CREATE TABLE IF NOT EXISTS tesoreria_pagos_programados (
        id INT NOT NULL AUTO_INCREMENT,
        municipio_id INT NOT NULL,
        contacto_id INT NOT NULL,
        caja_id INT NULL,
        concepto VARCHAR(150) NOT NULL,
        descripcion TEXT NULL,
        monto_pesos DECIMAL(15,2) NOT NULL,
        forma_pago VARCHAR(30) NOT NULL DEFAULT 'transferencia',
        frecuencia ENUM('semanal','quincenal','mensual','bimestral','trimestral','anual') NOT NULL DEFAULT 'mensual',
        dia_del_mes INT NOT NULL DEFAULT 1,
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NULL,
        proximo_pago DATE NOT NULL,
        ultimo_pago DATE NULL,
        notas TEXT NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX ix_pp_muni (municipio_id),
        INDEX ix_pp_proximo (proximo_pago),
        CONSTRAINT fk_pp_muni FOREIGN KEY (municipio_id) REFERENCES municipios(id),
        CONSTRAINT fk_pp_contacto FOREIGN KEY (contacto_id) REFERENCES contactos(id),
        CONSTRAINT fk_pp_caja FOREIGN KEY (caja_id) REFERENCES tesoreria_cajas(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """,
]


async def _column_exists(conn, table: str, column: str) -> bool:
    """Chequea si una columna existe (MySQL no soporta ADD COLUMN IF NOT EXISTS)."""
    r = await conn.execute(text(
        f"SELECT COUNT(*) FROM information_schema.COLUMNS "
        f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{table}' AND COLUMN_NAME = '{column}'"
    ))
    row = r.fetchone()
    return row[0] > 0 if row else False


async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        for i, stmt in enumerate(SQL):
            try:
                await conn.execute(text(stmt))
                print(f"[OK] paso {i+1}/{len(SQL)}")
            except Exception as e:
                msg = str(e)
                if 'Duplicate' in msg or 'already exists' in msg.lower():
                    print(f"[SKIP] paso {i+1} ya aplicado")
                else:
                    raise

        # ALTER manual: contactos.tipo_empleado_id
        if not await _column_exists(conn, 'contactos', 'tipo_empleado_id'):
            await conn.execute(text(
                "ALTER TABLE contactos ADD COLUMN tipo_empleado_id INT NULL"
            ))
            try:
                await conn.execute(text(
                    "ALTER TABLE contactos ADD CONSTRAINT fk_contacto_tipo_empleado "
                    "FOREIGN KEY (tipo_empleado_id) REFERENCES tesoreria_tipos_empleado(id) ON DELETE SET NULL"
                ))
            except Exception as e:
                print(f"  (FK contactos.tipo_empleado_id ya existia o fallo: {e})")
            print("[OK] contactos.tipo_empleado_id agregado")
        else:
            print("[SKIP] contactos.tipo_empleado_id ya existia")

        # ALTER manual: gastos.caja_id
        if not await _column_exists(conn, 'gastos', 'caja_id'):
            await conn.execute(text(
                "ALTER TABLE gastos ADD COLUMN caja_id INT NULL"
            ))
            try:
                await conn.execute(text(
                    "ALTER TABLE gastos ADD CONSTRAINT fk_gasto_caja "
                    "FOREIGN KEY (caja_id) REFERENCES tesoreria_cajas(id) ON DELETE SET NULL"
                ))
            except Exception as e:
                print(f"  (FK gastos.caja_id ya existia o fallo: {e})")
            print("[OK] gastos.caja_id agregado")
        else:
            print("[SKIP] gastos.caja_id ya existia")

    await engine.dispose()


# ============================================================
# Seed para SPN
# ============================================================
SPN = 'san-pedro-norte'

TIPOS_EMPLEADO = [
    {"nombre": "Personal de planta", "color": "#3b82f6", "icono": "Briefcase"},
    {"nombre": "Personal contratado", "color": "#06b6d4", "icono": "FileText"},
    {"nombre": "Personal jornalizado", "color": "#f59e0b", "icono": "Calendar"},
    {"nombre": "Albañil", "color": "#a855f7", "icono": "HardHat"},
    {"nombre": "Maestro mayor de obras", "color": "#8b5cf6", "icono": "HardHat"},
    {"nombre": "Arquitecto", "color": "#ec4899", "icono": "Compass"},
    {"nombre": "Electricista", "color": "#eab308", "icono": "Zap"},
    {"nombre": "Plomero", "color": "#0ea5e9", "icono": "Wrench"},
    {"nombre": "Chofer", "color": "#10b981", "icono": "Truck"},
    {"nombre": "Personal de mantenimiento", "color": "#84cc16", "icono": "Wrench"},
]

CAJAS = [
    {"nombre": "Tesoro propio", "codigo": "TES",
     "descripcion": "Recaudacion propia del municipio (tasas, contribuciones)",
     "color": "#3b82f6", "icono": "Wallet", "saldo_inicial": Decimal(20_000_000), "orden": 0},
    {"nombre": "Coparticipacion provincial", "codigo": "COPA",
     "descripcion": "Coparticipacion que envia la provincia mensualmente",
     "color": "#10b981", "icono": "TrendingUp", "saldo_inicial": Decimal(15_000_000), "orden": 1},
    {"nombre": "FOFINDE", "codigo": "FOFINDE",
     "descripcion": "Fondo de Financiamiento para el Desarrollo (Provincia)",
     "color": "#f59e0b", "icono": "PiggyBank", "saldo_inicial": Decimal(8_000_000), "orden": 2},
    {"nombre": "FODEMEP", "codigo": "FODEMEP",
     "descripcion": "Fondo de Desarrollo Municipal y Pequeñas Obras",
     "color": "#a855f7", "icono": "PiggyBank", "saldo_inicial": Decimal(5_000_000), "orden": 3},
    {"nombre": "FOMEP", "codigo": "FOMEP",
     "descripcion": "Fondo de Obras y Equipamiento Productivo",
     "color": "#0ea5e9", "icono": "PiggyBank", "saldo_inicial": Decimal(3_000_000), "orden": 4},
]


def proximo_dia(d: date, dia: int) -> date:
    last = monthrange(d.year, d.month)[1]
    candidato = date(d.year, d.month, min(dia, last))
    if candidato < d:
        # mes que viene
        m = d.month + 1
        y = d.year + (m - 1) // 12
        m = ((m - 1) % 12) + 1
        last2 = monthrange(y, m)[1]
        return date(y, m, min(dia, last2))
    return candidato


async def seed():
    engine = create_async_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    from models import (
        Municipio, TesoreriaTipoEmpleado, TesoreriaCaja, TesoreriaPagoProgramado,
        Contacto,
    )

    async with SessionLocal() as db:
        muni = (await db.execute(select(Municipio).where(Municipio.codigo == SPN))).scalar_one_or_none()
        if not muni:
            print(f"[!] muni '{SPN}' no existe"); return
        mid = muni.id
        print(f"[*] muni SPN id={mid}")

        # Tipos de empleado
        for i, t in enumerate(TIPOS_EMPLEADO):
            exists = (await db.execute(
                select(TesoreriaTipoEmpleado).where(
                    TesoreriaTipoEmpleado.municipio_id == mid,
                    TesoreriaTipoEmpleado.nombre == t["nombre"],
                )
            )).scalar_one_or_none()
            if exists:
                print(f"  [SKIP tipo empleado] {t['nombre']}")
                continue
            db.add(TesoreriaTipoEmpleado(municipio_id=mid, orden=i, **t))
            print(f"  [OK tipo empleado] {t['nombre']}")

        # Cajas
        for c in CAJAS:
            exists = (await db.execute(
                select(TesoreriaCaja).where(
                    TesoreriaCaja.municipio_id == mid, TesoreriaCaja.nombre == c["nombre"]
                )
            )).scalar_one_or_none()
            if exists:
                print(f"  [SKIP caja] {c['nombre']}")
                continue
            db.add(TesoreriaCaja(municipio_id=mid, fecha_apertura=date(2026, 1, 1), **c))
            print(f"  [OK caja] {c['nombre']}  saldo_inicial=${c['saldo_inicial']:,}")

        await db.commit()

        # Pagos programados de ejemplo: tomamos los primeros 3 empleados del muni
        empleados = (await db.execute(
            select(Contacto).where(Contacto.municipio_id == mid, Contacto.tipo == 'empleado', Contacto.activo == True)  # noqa: E712
            .limit(3)
        )).scalars().all()
        caja_tesoro = (await db.execute(
            select(TesoreriaCaja).where(TesoreriaCaja.municipio_id == mid, TesoreriaCaja.codigo == 'TES')
        )).scalar_one_or_none()

        today = date.today()
        for emp in empleados:
            exists = (await db.execute(
                select(TesoreriaPagoProgramado).where(
                    TesoreriaPagoProgramado.municipio_id == mid,
                    TesoreriaPagoProgramado.contacto_id == emp.id,
                    TesoreriaPagoProgramado.concepto == 'Sueldo mensual',
                )
            )).scalar_one_or_none()
            if exists:
                continue
            inicio = date(today.year, today.month, 1)
            pp = TesoreriaPagoProgramado(
                municipio_id=mid,
                contacto_id=emp.id,
                caja_id=caja_tesoro.id if caja_tesoro else None,
                concepto='Sueldo mensual',
                descripcion='[DEMO] Pago programado de prueba',
                monto_pesos=Decimal(500_000),
                forma_pago='transferencia',
                frecuencia='mensual',
                dia_del_mes=5,
                fecha_inicio=inicio,
                proximo_pago=proximo_dia(today, 5),
                activo=True,
            )
            db.add(pp)
            print(f"  [OK pago programado] {emp.nombre} {emp.apellido or ''} - sueldo $500k mensual")

        await db.commit()

    await engine.dispose()


async def main():
    print("=== MIGRACION ===")
    await migrate()
    print("\n=== SEED ===")
    await seed()
    print("\n[*] Listo")


if __name__ == '__main__':
    asyncio.run(main())
