"""Calls: la curacion pasa a la base — crudos, procesados y el enganche por codigo INDEC

Hasta hoy todo lo que sabemos de los 2.244 municipios vive en archivos JSON del
repo `munify-calls`. Funciono mientras la curacion era una foto que se rehacia
entera. Dejo de alcanzar el dia que la pantalla empezo a ESCRIBIR: el vendedor
toca un boton, el sistema le busca el telefono, y ese dato hay que guardarlo en
el momento. Con dos que escriben el mismo archivo el ultimo gana y el otro
pierde sin enterarse.

Desde aca el JSON es un archivo DE PASO --lo que entra al build y lo que sale--;
la base es donde vive el dato.

Lo que agrega esta migracion:

  * el enganche: `calls_municipio.codigo_indec`, que es el `id` de
    `municipios_catalogo`. Enganche BLANDO (columna indexada, sin constraint):
    el 87,6% de nuestras fichas matchea, y las que no son municipios que
    nosotros tenemos y la app todavia no. Un FK duro las rechazaria -- y son
    justamente los prospectos, o sea lo unico que esta tabla existe para
    guardar.

  * lo CRUDO, que nunca se pisa: `calls_relatos` (el texto tal cual lo devolvio
    el modelo), `calls_paginas` (lo que leyo el crawler, hoy se tira) y
    `calls_fuentes` (cada URL que cito alguien).

  * lo PROCESADO, versionado y no sobrescrito: `calls_hechos` (un hecho por
    fila, con su fuente), `calls_ponderacion` (la foto del calculo cada vez que
    corre) con `calls_aportes` (que sumo cada regla, una fila por aporte) y
    `calls_tags_propuestos` (conceptos que nombro un modelo y todavia no son
    del vocabulario).

  * lo que era un JSON adentro de una columna y ahora es tabla:
    `calls_capacidades` (que sabe hacer su web) y `calls_telefonos` (uno por
    fila, con si atendio). Un array en una columna no se puede consultar ni
    anotar, y las dos cosas hacen falta.

Por que guardar el crudo: los tres errores que costaron datos el 2026-09-08 --el
filtro que descartaba WordPress entero, el +4 que mentia y el recorte que
mostraba el parrafo equivocado-- se encontraron los tres comparando el crudo
contra lo que la pantalla mostraba. Sin el crudo ninguno era visible. Y tiene un
segundo efecto practico: cuando cambie el vocabulario se reprocesan las 2.244
gratis, en vez de volver a recorrer 700 sitios y pagar las busquedas de nuevo.

El prefijo `calls_` no es decorativo: Infra lo EXCLUYE cuando refresca QA
clonando produccion, porque es data comercial del dueno y no data de municipios.

AMBIENTE: esto se queda en QA. La promocion qa->prod es de Infra, y este
circuito comercial no tiene por que subir.

Revision ID: 20260908_curacion
Revises: 20260905_mot_pausa
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "20260908_curacion"
down_revision: Union[str, None] = "20260905_mot_pausa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# El texto de una pagina municipal pasa comodo los 64 KB que aguanta un TEXT de
# MySQL, y el truncado no avisa: guarda lo que entra y descarta el resto. Los
# campos de texto largo van LONGTEXT a proposito.
LARGO = sa.Text().with_variant(mysql.LONGTEXT(), "mysql")


def upgrade() -> None:
    # --- el enganche con el catalogo de la app -------------------------------
    op.add_column("calls_municipio", sa.Column("codigo_indec", sa.String(length=20), nullable=True))
    op.create_index("ix_calls_municipio_indec", "calls_municipio", ["codigo_indec"])

    # False = no es un municipio (una comuna, un paraje, una entrada duplicada).
    # Se descubrio llamando: hay fichas que ni siquiera son un gobierno local, y
    # arrancar la llamada con "Municipalidad de" arranca mal.
    op.add_column("calls_municipio", sa.Column("es_municipio", sa.Boolean(), nullable=True))
    # Sacado de la rueda de llamados, con el motivo. No se borra: vuelve a la
    # cola de trabajo del que cura.
    op.add_column("calls_municipio", sa.Column("oculto", sa.Boolean(), nullable=False, server_default=sa.text("0")))
    op.add_column("calls_municipio", sa.Column("motivo_oculto", sa.String(length=200), nullable=True))
    op.add_column("calls_municipio", sa.Column("curado_en", sa.DateTime(), nullable=True))
    op.add_column("calls_municipio", sa.Column("curado_por", sa.String(length=60), nullable=True))

    # --- LO CRUDO ------------------------------------------------------------
    op.create_table(
        "calls_fuentes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("codigo_indec", sa.String(length=20), nullable=True),
        sa.Column("muni_key", sa.String(length=80), nullable=True),
        sa.Column("provincia", sa.String(length=80), nullable=True),
        # el dominio va aparte de la URL a proposito: la alarma "esto no es la
        # web de un municipio, es un directorio provincial" es un COUNT por
        # dominio+provincia, y eso no se puede hacer sobre la URL entera.
        sa.Column("dominio", sa.String(length=200), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("de_donde", sa.String(length=30), nullable=False),
        sa.Column("buscando", sa.String(length=40), nullable=True),
        # OJO: que una URL de 404 NO significa que el dato sea falso. Comprobado
        # el 2026-09-08: `casares.gob.ar/compras/` no existe y el municipio SI
        # publica sus compras, en `gobabierto.ar/carloscasares/compras/`. El
        # modelo arma mal la ruta, no inventa el hecho. Esta columna es
        # informativa: no descarta nada.
        sa.Column("responde", sa.Boolean(), nullable=True),
        sa.Column("creado", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calls_fuentes_indec", "calls_fuentes", ["codigo_indec"])
    op.create_index("ix_calls_fuentes_muni", "calls_fuentes", ["muni_key"])
    op.create_index("ix_calls_fuentes_dominio", "calls_fuentes", ["dominio"])
    op.create_index("ix_calls_fuentes_de_donde", "calls_fuentes", ["de_donde"])
    op.create_index("ix_calls_fuentes_creado", "calls_fuentes", ["creado"])
    op.create_index("ix_calls_fuentes_dom_prov", "calls_fuentes", ["dominio", "provincia"])

    op.create_table(
        "calls_relatos",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("codigo_indec", sa.String(length=20), nullable=True),
        sa.Column("muni_key", sa.String(length=80), nullable=False),
        sa.Column("motor", sa.String(length=30), nullable=False),
        sa.Column("modelo", sa.String(length=60), nullable=True),
        # que variante de prompt se uso: sirve para saber cual rinde mas sin
        # volver a probarlas todas.
        sa.Column("variante", sa.String(length=40), nullable=True),
        sa.Column("texto", LARGO, nullable=False),
        sa.Column("costo_usd", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("busquedas", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("creado", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calls_relatos_indec", "calls_relatos", ["codigo_indec"])
    op.create_index("ix_calls_relatos_muni", "calls_relatos", ["muni_key"])
    op.create_index("ix_calls_relatos_creado", "calls_relatos", ["creado"])

    op.create_table(
        "calls_paginas",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("codigo_indec", sa.String(length=20), nullable=True),
        sa.Column("muni_key", sa.String(length=80), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("titulo", sa.String(length=300), nullable=True),
        sa.Column("de", sa.String(length=20), nullable=True),
        sa.Column("texto", LARGO, nullable=True),
        sa.Column("creado", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calls_paginas_indec", "calls_paginas", ["codigo_indec"])
    op.create_index("ix_calls_paginas_muni", "calls_paginas", ["muni_key"])
    op.create_index("ix_calls_paginas_muni_creado", "calls_paginas", ["muni_key", "creado"])

    # --- LO PROCESADO --------------------------------------------------------
    op.create_table(
        "calls_hechos",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("codigo_indec", sa.String(length=20), nullable=True),
        sa.Column("muni_key", sa.String(length=80), nullable=False),
        sa.Column("tag", sa.String(length=80), nullable=False),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("fuente_url", sa.Text(), nullable=True),
        sa.Column("de_donde", sa.String(length=30), nullable=False),
        sa.Column("universo", sa.String(length=20), nullable=True),
        sa.Column("peso", sa.Integer(), nullable=False, server_default=sa.text("0")),
        # False = el tag lo propuso un modelo y el dueno todavia no lo aprobo.
        # Entra a la ficha igual --si no, se paga la busqueda para que el dato no
        # aparezca en ningun lado-- pero con el peso topeado, para no desplazar a
        # un dolor verificado.
        sa.Column("curado", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        # de que relato o pagina salio, para poder volver al crudo
        sa.Column("relato_id", sa.Integer(), nullable=True),
        sa.Column("pagina_id", sa.Integer(), nullable=True),
        sa.Column("creado", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calls_hechos_indec", "calls_hechos", ["codigo_indec"])
    op.create_index("ix_calls_hechos_muni", "calls_hechos", ["muni_key"])
    op.create_index("ix_calls_hechos_tag", "calls_hechos", ["tag"])
    op.create_index("ix_calls_hechos_curado", "calls_hechos", ["curado"])
    op.create_index("ix_calls_hechos_creado", "calls_hechos", ["creado"])
    op.create_index("ix_calls_hechos_muni_tag", "calls_hechos", ["muni_key", "tag"])

    op.create_table(
        "calls_ponderacion",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("codigo_indec", sa.String(length=20), nullable=True),
        sa.Column("muni_key", sa.String(length=80), nullable=False),
        sa.Column("universo", sa.String(length=20), nullable=False),
        sa.Column("score_vecino", sa.Integer(), nullable=True),
        sa.Column("score_plata", sa.Integer(), nullable=True),
        sa.Column("score_operacion", sa.Integer(), nullable=True),
        sa.Column("margen", sa.Integer(), nullable=True),
        sa.Column("fuerza", sa.String(length=20), nullable=True),
        # el angulo con el que se decidio abrir la llamada, en texto
        sa.Column("angulo", sa.String(length=160), nullable=True),
        # EL CRITERIO DE QUE VA EN JSON Y QUE VA EN TABLA: aca queda solo lo que
        # se lee ENTERO al abrir una ficha (el `abrir_con` y el `por_que`, que
        # son prosa). Lo que se consulta a traves de muchos municipios es tabla:
        # el desglose de puntos esta en `calls_aportes`, porque "que regla esta
        # inflando el reparto" es un GROUP BY. Y lo derivado --la botonera, el
        # ranking, lo que quedo afuera-- no se guarda: se recalcula.
        sa.Column("detalle", LARGO, nullable=True),
        # con que version del vocabulario y de los pesos se calculo. Sin esto,
        # comparar dos fotos no dice si cambio el dato o cambio la regla.
        sa.Column("version_reglas", sa.String(length=40), nullable=True),
        sa.Column("creado", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calls_pond_indec", "calls_ponderacion", ["codigo_indec"])
    op.create_index("ix_calls_pond_muni", "calls_ponderacion", ["muni_key"])
    op.create_index("ix_calls_pond_creado", "calls_ponderacion", ["creado"])
    op.create_index("ix_calls_pond_muni_creado", "calls_ponderacion", ["muni_key", "creado"])

    # El DESGLOSE del calculo, una fila por aporte. Era un JSON adentro de una
    # columna y estaba mal: esta es justamente la tabla que contesta la pregunta
    # que hoy no tiene respuesta --"que regla esta inflando el reparto"-- y esa
    # pregunta es un GROUP BY, no se puede hacer sobre un JSON.
    op.create_table(
        "calls_aportes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("ponderacion_id", sa.Integer(), nullable=False),
        sa.Column("muni_key", sa.String(length=80), nullable=False),
        sa.Column("universo", sa.String(length=20), nullable=False),
        # "caminos_rurales", "su sitio publica operacion:agua", "su menu tiene boletin_oficial"
        sa.Column("concepto", sa.String(length=160), nullable=False),
        sa.Column("puntos", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("creado", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calls_aportes_pond", "calls_aportes", ["ponderacion_id"])
    op.create_index("ix_calls_aportes_muni", "calls_aportes", ["muni_key"])
    op.create_index("ix_calls_aportes_concepto", "calls_aportes", ["concepto"])
    op.create_index("ix_calls_aportes_uni_conc", "calls_aportes", ["universo", "concepto"])

    # QUE SABE HACER SU WEB HOY. Tabla y no seis columnas booleanas porque la
    # lista crece: arranco con cinco, hoy son seis y `turnos_online` aparecio
    # despues. Cada capacidad nueva seria una migracion.
    op.create_table(
        "calls_capacidades",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("codigo_indec", sa.String(length=20), nullable=True),
        sa.Column("muni_key", sa.String(length=80), nullable=False),
        # 'tramites_online' | 'reclamos_online' | 'pagos_online' | ...
        sa.Column("capacidad", sa.String(length=60), nullable=False),
        sa.Column("tiene", sa.Boolean(), nullable=False),
        # 'crawler' (lo vio en el menu) | 'gemini' | 'declarado'
        sa.Column("de_donde", sa.String(length=30), nullable=False),
        sa.Column("creado", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calls_caps_muni", "calls_capacidades", ["muni_key"])
    op.create_index("ix_calls_caps_cap", "calls_capacidades", ["capacidad"])
    op.create_index("ix_calls_caps_muni_cap", "calls_capacidades", ["muni_key", "capacidad"])

    # LOS TELEFONOS, uno por fila. Era un array JSON y no se podia anotar lo
    # unico que importa de un telefono: si atendio. `atiende` NULL = no se
    # probo; False = se llamo y no atiende, que es un dato caro de conseguir y
    # hasta hoy se perdia.
    op.create_table(
        "calls_telefonos",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("codigo_indec", sa.String(length=20), nullable=True),
        sa.Column("muni_key", sa.String(length=80), nullable=False),
        sa.Column("numero", sa.String(length=40), nullable=False),
        # 0 = el principal, el que la pantalla muestra primero
        sa.Column("orden", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("de_donde", sa.String(length=30), nullable=False),
        sa.Column("atiende", sa.Boolean(), nullable=True),
        sa.Column("creado", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calls_tel_muni", "calls_telefonos", ["muni_key"])
    op.create_index("ix_calls_tel_indec", "calls_telefonos", ["codigo_indec"])
    op.create_index("ix_calls_tel_muni_num", "calls_telefonos", ["muni_key", "numero"])

    op.create_table(
        "calls_tags_propuestos",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tag", sa.String(length=80), nullable=False),
        sa.Column("tema", sa.String(length=120), nullable=True),
        sa.Column("frase", sa.Text(), nullable=True),
        sa.Column("sirve_para", sa.Text(), nullable=True),
        sa.Column("peso", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("universo", sa.String(length=20), nullable=True),
        sa.Column("muni_key", sa.String(length=80), nullable=True),
        # cuando se consolida, aca queda a que concepto del vocabulario se mapeo
        sa.Column("aprobado_como", sa.String(length=80), nullable=True),
        sa.Column("aprobado_por", sa.String(length=60), nullable=True),
        sa.Column("aprobado_en", sa.DateTime(), nullable=True),
        sa.Column("creado", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calls_tagsprop_tag", "calls_tags_propuestos", ["tag"])
    op.create_index("ix_calls_tagsprop_muni", "calls_tags_propuestos", ["muni_key"])
    op.create_index("ix_calls_tagsprop_aprob", "calls_tags_propuestos", ["aprobado_como"])
    op.create_index("ix_calls_tagsprop_creado", "calls_tags_propuestos", ["creado"])


def downgrade() -> None:
    op.drop_table("calls_tags_propuestos")
    op.drop_table("calls_telefonos")
    op.drop_table("calls_capacidades")
    op.drop_table("calls_aportes")
    op.drop_table("calls_ponderacion")
    op.drop_table("calls_hechos")
    op.drop_table("calls_paginas")
    op.drop_table("calls_relatos")
    op.drop_table("calls_fuentes")
    op.drop_column("calls_municipio", "curado_por")
    op.drop_column("calls_municipio", "curado_en")
    op.drop_column("calls_municipio", "motivo_oculto")
    op.drop_column("calls_municipio", "oculto")
    op.drop_column("calls_municipio", "es_municipio")
    op.drop_index("ix_calls_municipio_indec", table_name="calls_municipio")
    op.drop_column("calls_municipio", "codigo_indec")
