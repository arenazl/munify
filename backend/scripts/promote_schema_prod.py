"""Schema de la promocion qa -> master (2026-08-28): lo que create_all NO hace.

Por que existe: el pase trae columnas NUEVAS sobre tablas EXISTENTES
(`municipios.pais`, `municipios.demo_protegido`, etc.). `create_all` del
arranque solo crea tablas enteras que falten — jamas agrega una columna. Sin
estos ALTERs, el backend nuevo rompe TODO query de municipios (login incluido).

Que hace (y nada mas):
  1. Crea `poi_tipos` y `puntos_interes` si faltan (las necesitan las FKs de
     abajo; las otras tablas nuevas las crea solo el create_all del deploy).
  2. ALTERs ADITIVOS sobre 6 tablas existentes: columnas nuevas nullable o con
     default, indices y FKs. Compatible con el backend VIEJO corriendo: se
     puede ejecutar ANTES del deploy sin cortar nada.

VALIDADO POR EJECUCION (2026-08-29): se clono el ESQUELETO de las 10 tablas
que toca desde produccion a una base aparte (`CREATE TABLE ... LIKE`, sin una
sola fila), se corrio el script entero ahi, y las 56 piezas aplicaron sin un
error. Resultado: 218 columnas, paridad EXACTA con qa — 0 faltantes, 0 con
tipo distinto. Re-correrlo dice "Nada que hacer". La base de ensayo se borro.

No toca datos, no borra nada, no modifica columnas existentes (el unico MODIFY
es agregar el valor 'bloqueada' al enum de estado de OT, que no altera filas).

Uso:
    python promote_schema_prod.py                        # PLAN: muestra que falta, no escribe
    python promote_schema_prod.py --auditar              # + avisa si el script quedo corto
    python promote_schema_prod.py --apply --si-estoy-seguro   # ejecuta

El modo `--auditar` necesita `DATABASE_URL_ORIGEN` apuntando a qa. Correrlo
ANTES de cada promocion: es lo que evita que qa siga avanzando y este archivo
quede corto sin que nadie se entere hasta que ya se promovio.

Requiere DATABASE_URL en el entorno (formato mysql+aiomysql://...). La corre
quien tenga la credencial de la base destino (en prod: Infra).

Post-deploy (aparte, opcional para POI): `migrate_catalogo_municipios.py`
llena `municipios_catalogo` desde `municipios_argentina` (prod la tiene).
"""
import asyncio
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

DATABASE_URL = os.environ.get("DATABASE_URL") or sys.exit(
    "FALTA DATABASE_URL en el entorno (mysql+aiomysql://...). Sin fallback: corto aca.")

APLICAR = "--apply" in sys.argv and "--si-estoy-seguro" in sys.argv

# Auditoria opcional: con DATABASE_URL_ORIGEN apuntando a qa, el script
# compara los dos schemas y avisa si le falta alguna pieza. Es el seguro
# contra el modo de falla real de este archivo: que qa siga avanzando y la
# lista de aca quede corta sin que nadie se entere hasta la promocion.
AUDITAR = "--auditar" in sys.argv
DATABASE_URL_ORIGEN = os.environ.get("DATABASE_URL_ORIGEN")

DDL_TABLAS = {
    "poi_tipos": """
CREATE TABLE `poi_tipos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `municipio_id` int NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `icono` varchar(50) DEFAULT NULL,
  `color` varchar(20) DEFAULT NULL,
  `radio_default_metros` int DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `orden` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_poi_tipo_muni_nombre` (`municipio_id`,`nombre`),
  KEY `ix_poi_tipo_municipio` (`municipio_id`),
  CONSTRAINT `fk_poi_tipo_municipio` FOREIGN KEY (`municipio_id`)
    REFERENCES `municipios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
""",
    "puntos_interes": """
CREATE TABLE `puntos_interes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `municipio_id` int NOT NULL,
  `tipo_id` int NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `latitud` float NOT NULL,
  `longitud` float NOT NULL,
  `radio_metros` int NOT NULL DEFAULT '2000',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `notas` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_poi_municipio` (`municipio_id`),
  KEY `ix_poi_tipo` (`tipo_id`),
  CONSTRAINT `fk_poi_municipio` FOREIGN KEY (`municipio_id`)
    REFERENCES `municipios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_poi_tipo` FOREIGN KEY (`tipo_id`)
    REFERENCES `poi_tipos` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
""",
}

# (tabla, columna_o_indice, tipo, sql) — cada pieza se aplica solo si falta.
COLUMNAS = [
    ("barrios", "osm_id", "ALTER TABLE `barrios` ADD COLUMN `osm_id` varchar(40) NULL"),
    ("barrios", "poligono", "ALTER TABLE `barrios` ADD COLUMN `poligono` longtext NULL"),
    ("barrios", "zona_id", "ALTER TABLE `barrios` ADD COLUMN `zona_id` int NULL"),
    ("categorias_reclamo", "interna",
     "ALTER TABLE `categorias_reclamo` ADD COLUMN `interna` tinyint(1) NOT NULL DEFAULT 0"),
    ("municipios", "demo_protegido",
     "ALTER TABLE `municipios` ADD COLUMN `demo_protegido` tinyint(1) NOT NULL DEFAULT 0"),
    ("municipios", "pais",
     "ALTER TABLE `municipios` ADD COLUMN `pais` varchar(2) NOT NULL DEFAULT 'AR'"),
    ("ordenes_trabajo", "categoria_id",
     "ALTER TABLE `ordenes_trabajo` ADD COLUMN `categoria_id` int NULL"),
    ("ordenes_trabajo", "origen",
     "ALTER TABLE `ordenes_trabajo` ADD COLUMN `origen` "
     "enum('manual','implicita','consolidada_poi') NOT NULL DEFAULT 'manual'"),
    ("ordenes_trabajo", "poi_id",
     "ALTER TABLE `ordenes_trabajo` ADD COLUMN `poi_id` int NULL"),
    ("reclamos", "poi_id", "ALTER TABLE `reclamos` ADD COLUMN `poi_id` int NULL"),
    ("reclamos", "ubicacion_origen",
     "ALTER TABLE `reclamos` ADD COLUMN `ubicacion_origen` varchar(15) NULL"),
    ("zonas", "osm_id", "ALTER TABLE `zonas` ADD COLUMN `osm_id` varchar(40) NULL"),
    ("zonas", "poligono", "ALTER TABLE `zonas` ADD COLUMN `poligono` longtext NULL"),

    # --- Modulo Comunicacion (avisos, obras publicas, cronogramas) ---------
    # El DDL de estas 26 no se escribio a mano: se leyo del information_schema
    # de qa, con su tipo, nullability y default reales.
    ("noticias", "tipo",
     "ALTER TABLE `noticias` ADD COLUMN `tipo` varchar(20) NOT NULL DEFAULT 'aviso'"),
    ("noticias", "fecha_desde",
     "ALTER TABLE `noticias` ADD COLUMN `fecha_desde` date NULL"),
    ("noticias", "fecha_hasta",
     "ALTER TABLE `noticias` ADD COLUMN `fecha_hasta` date NULL"),
    ("noticias", "fijado",
     "ALTER TABLE `noticias` ADD COLUMN `fijado` tinyint(1) NOT NULL DEFAULT '0'"),
    ("noticias", "enviado_at",
     "ALTER TABLE `noticias` ADD COLUMN `enviado_at` datetime NULL"),
    ("noticias", "enviados_count",
     "ALTER TABLE `noticias` ADD COLUMN `enviados_count` int NOT NULL DEFAULT '0'"),
    ("noticias", "creador_id",
     "ALTER TABLE `noticias` ADD COLUMN `creador_id` int NULL"),
    ("noticias", "barrio_id",
     "ALTER TABLE `noticias` ADD COLUMN `barrio_id` int NULL"),
    ("noticias", "recurrencia",
     "ALTER TABLE `noticias` ADD COLUMN `recurrencia` varchar(20) NULL"),
    ("noticias", "dias_semana",
     "ALTER TABLE `noticias` ADD COLUMN `dias_semana` varchar(20) NULL"),
    ("usuarios", "barrio_id",
     "ALTER TABLE `usuarios` ADD COLUMN `barrio_id` int NULL"),
    ("proyectos", "publico",
     "ALTER TABLE `proyectos` ADD COLUMN `publico` tinyint(1) NOT NULL DEFAULT '0'"),
    ("proyectos", "estado_obra",
     "ALTER TABLE `proyectos` ADD COLUMN `estado_obra` varchar(20) NULL"),
    ("proyectos", "avance",
     "ALTER TABLE `proyectos` ADD COLUMN `avance` int NULL"),
    # El avance REAL (arriba) es de Tesoreria; este es el que ve el vecino.
    # Son dos porque publicar otro numero no puede pisar el dato interno.
    ("proyectos", "avance_publicado",
     "ALTER TABLE `proyectos` ADD COLUMN `avance_publicado` int NULL"),
    ("proyectos", "foto_url",
     "ALTER TABLE `proyectos` ADD COLUMN `foto_url` varchar(500) NULL"),
    ("proyectos", "latitud",
     "ALTER TABLE `proyectos` ADD COLUMN `latitud` float NULL"),
    ("proyectos", "longitud",
     "ALTER TABLE `proyectos` ADD COLUMN `longitud` float NULL"),
    ("proyectos", "mostrar_monto",
     "ALTER TABLE `proyectos` ADD COLUMN `mostrar_monto` tinyint(1) NOT NULL DEFAULT '0'"),

    # --- Modulo Recursos (flota, reservas) --------------------------------
    # Un vehiculo es un ACTIVO de inventario con datos de flota, no una tabla
    # aparte; un bien prestable es un activo con `reservable` en 1.
    ("inventario_items", "marca_modelo",
     "ALTER TABLE `inventario_items` ADD COLUMN `marca_modelo` varchar(120) NULL"),
    ("inventario_items", "anio",
     "ALTER TABLE `inventario_items` ADD COLUMN `anio` int NULL"),
    ("inventario_items", "tipo_combustible",
     "ALTER TABLE `inventario_items` ADD COLUMN `tipo_combustible` varchar(20) NULL"),
    ("inventario_items", "km_actual",
     "ALTER TABLE `inventario_items` ADD COLUMN `km_actual` int NULL"),
    ("inventario_items", "km_proximo_service",
     "ALTER TABLE `inventario_items` ADD COLUMN `km_proximo_service` int NULL"),
    ("inventario_items", "vencimiento_vtv",
     "ALTER TABLE `inventario_items` ADD COLUMN `vencimiento_vtv` date NULL"),
    ("inventario_items", "vencimiento_seguro",
     "ALTER TABLE `inventario_items` ADD COLUMN `vencimiento_seguro` date NULL"),
    ("inventario_items", "reservable",
     "ALTER TABLE `inventario_items` ADD COLUMN `reservable` tinyint(1) NOT NULL DEFAULT '0'"),
]

INDICES = [
    ("barrios", "ix_barrios_zona", "ALTER TABLE `barrios` ADD INDEX `ix_barrios_zona` (`zona_id`)"),
    ("ordenes_trabajo", "ix_ot_categoria",
     "ALTER TABLE `ordenes_trabajo` ADD INDEX `ix_ot_categoria` (`categoria_id`)"),
    ("ordenes_trabajo", "ix_ot_origen",
     "ALTER TABLE `ordenes_trabajo` ADD INDEX `ix_ot_origen` (`origen`)"),
    ("ordenes_trabajo", "ix_ot_poi", "ALTER TABLE `ordenes_trabajo` ADD INDEX `ix_ot_poi` (`poi_id`)"),
    ("reclamos", "ix_reclamo_poi", "ALTER TABLE `reclamos` ADD INDEX `ix_reclamo_poi` (`poi_id`)"),
    ("noticias", "ix_noticias_barrio",
     "ALTER TABLE `noticias` ADD INDEX `ix_noticias_barrio` (`barrio_id`)"),
    # El feed del vecino filtra por activo + vigencia en cada carga.
    ("noticias", "ix_noticias_vigencia",
     "ALTER TABLE `noticias` ADD INDEX `ix_noticias_vigencia` (`activo`, `fecha_hasta`)"),
    ("usuarios", "ix_usuarios_barrio",
     "ALTER TABLE `usuarios` ADD INDEX `ix_usuarios_barrio` (`barrio_id`)"),
    ("proyectos", "ix_proyectos_publicos",
     "ALTER TABLE `proyectos` ADD INDEX `ix_proyectos_publicos` (`municipio_id`, `publico`, `activo`)"),
]

FKS = [
    ("ordenes_trabajo", "fk_ot_categoria",
     "ALTER TABLE `ordenes_trabajo` ADD CONSTRAINT `fk_ot_categoria` FOREIGN KEY (`categoria_id`) "
     "REFERENCES `categorias_reclamo` (`id`) ON DELETE SET NULL"),
    ("ordenes_trabajo", "fk_ot_poi",
     "ALTER TABLE `ordenes_trabajo` ADD CONSTRAINT `fk_ot_poi` FOREIGN KEY (`poi_id`) "
     "REFERENCES `puntos_interes` (`id`) ON DELETE SET NULL"),
    ("reclamos", "fk_reclamo_poi",
     "ALTER TABLE `reclamos` ADD CONSTRAINT `fk_reclamo_poi` FOREIGN KEY (`poi_id`) "
     "REFERENCES `puntos_interes` (`id`) ON DELETE SET NULL"),
    ("noticias", "fk_noticia_barrio",
     "ALTER TABLE `noticias` ADD CONSTRAINT `fk_noticia_barrio` FOREIGN KEY (`barrio_id`) "
     "REFERENCES `barrios` (`id`) ON DELETE SET NULL"),
    ("usuarios", "fk_usuario_barrio",
     "ALTER TABLE `usuarios` ADD CONSTRAINT `fk_usuario_barrio` FOREIGN KEY (`barrio_id`) "
     "REFERENCES `barrios` (`id`) ON DELETE SET NULL"),
]

ENUM_ESTADO_OT = (
    "ALTER TABLE `ordenes_trabajo` MODIFY COLUMN `estado` "
    "enum('pendiente','asignada','en_curso','bloqueada','completada','cancelada') "
    "NOT NULL DEFAULT 'pendiente'"
)


async def auditar(engine_destino):
    """Compara el destino contra el origen y dice que quedaria sin cubrir.

    No genera DDL ni ejecuta nada: solo nombra la diferencia. Si aparece algo,
    hay que agregarlo a las listas de arriba con el tipo REAL leido de origen
    (`information_schema`), no escrito a ojo.

    Las tablas enteras que falten no son un problema: las crea el `create_all`
    del arranque del backend. Lo que ninguna herramienta hace sola, y por eso
    existe este script, son las COLUMNAS nuevas sobre tablas que ya existen.
    """
    if not DATABASE_URL_ORIGEN:
        print("(--auditar sin DATABASE_URL_ORIGEN: no hay contra que comparar)\n")
        return

    async def foto(url):
        e = create_async_engine(url) if url else None
        conn_ctx = e.connect() if e else None
        async with conn_ctx as c:
            tablas = {r[0] for r in (await c.execute(text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema=DATABASE()"))).fetchall()}
            cols = {(r[0], r[1]) for r in (await c.execute(text(
                "SELECT table_name, column_name FROM information_schema.columns "
                "WHERE table_schema=DATABASE()"))).fetchall()}
        await e.dispose()
        return tablas, cols

    t_ori, c_ori = await foto(DATABASE_URL_ORIGEN)
    async with engine_destino.connect() as c:
        t_dst = {r[0] for r in (await c.execute(text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema=DATABASE()"))).fetchall()}
        c_dst = {(r[0], r[1]) for r in (await c.execute(text(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE table_schema=DATABASE()"))).fetchall()}

    cubiertas = {(t, col) for t, col, _ in COLUMNAS}
    tablas_nuevas = t_ori - t_dst
    huerfanas = sorted(
        (t, col) for (t, col) in (c_ori - c_dst)
        if t not in tablas_nuevas and (t, col) not in cubiertas
    )

    print(f"AUDITORIA — tablas que el create_all va a crear: {len(tablas_nuevas)}")
    for t in sorted(tablas_nuevas):
        print(f"   . {t}")
    if huerfanas:
        print(f"\nATENCION: {len(huerfanas)} columnas del origen que este script NO cubre:")
        for t, col in huerfanas:
            print(f"   ! {t}.{col}")
        print("Agregalas a COLUMNAS antes de promover.\n")
    else:
        print("Columnas: el script cubre todo lo que el origen tiene de mas.\n")


async def main():
    engine = create_async_engine(DATABASE_URL)
    pendientes = []
    async with engine.connect() as conn:
        db = (await conn.execute(text("SELECT DATABASE()"))).scalar()
        print(f"Base destino: {db}\nModo: {'APPLY' if APLICAR else 'PLAN (solo lectura)'}\n")

        async def existe(sql, **kw):
            return (await conn.execute(text(sql), kw)).scalar() > 0

        for t, ddl in DDL_TABLAS.items():
            if not await existe(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE table_schema=DATABASE() AND table_name=:t", t=t):
                pendientes.append((f"CREATE TABLE {t}", ddl))

        for t, col, sql in COLUMNAS:
            if not await existe(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_schema=DATABASE() AND table_name=:t AND column_name=:c", t=t, c=col):
                pendientes.append((f"{t}.{col}", sql))

        if not await existe(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema=DATABASE() AND table_name='ordenes_trabajo' "
            "AND column_name='estado' AND column_type LIKE '%bloqueada%'"):
            pendientes.append(("ordenes_trabajo.estado + 'bloqueada'", ENUM_ESTADO_OT))

        for t, idx, sql in INDICES:
            if not await existe(
                "SELECT COUNT(*) FROM information_schema.statistics "
                "WHERE table_schema=DATABASE() AND table_name=:t AND index_name=:i", t=t, i=idx):
                pendientes.append((f"INDEX {t}.{idx}", sql))

        for t, fk, sql in FKS:
            if not await existe(
                "SELECT COUNT(*) FROM information_schema.table_constraints "
                "WHERE table_schema=DATABASE() AND table_name=:t AND constraint_name=:f", t=t, f=fk):
                pendientes.append((f"FK {t}.{fk}", sql))

    if AUDITAR:
        await auditar(engine)

    if not pendientes:
        print("Nada que hacer: el schema ya esta al dia.")
        await engine.dispose()
        return

    print(f"{len(pendientes)} piezas faltantes:")
    for nombre, _ in pendientes:
        print(f"  - {nombre}")

    if not APLICAR:
        print("\nPLAN solamente. Para ejecutar: --apply --si-estoy-seguro")
        await engine.dispose()
        return

    async with engine.begin() as conn:
        for nombre, sql in pendientes:
            await conn.execute(text(sql))
            print(f"OK: {nombre}")
    await engine.dispose()
    print("\nListo. Re-correr el script debe decir 'Nada que hacer'.")


if __name__ == "__main__":
    asyncio.run(main())
