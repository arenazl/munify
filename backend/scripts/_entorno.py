"""
_entorno — de dónde saca la base un script, y por qué no puede equivocarse.

REGLA (dueño, 2026-08-03): **ningún script lleva la URL de la base adentro.**
Recibe el ambiente por parámetro, la URL se resuelve del entorno, y antes de
tocar nada se verifica que lo que pediste coincida con lo que se resolvió.

Nace de un hallazgo concreto: ocho scripts tenían la credencial de Aiven
escrita en el código y los ocho hacían INSERT/UPDATE/ALTER. Correr cualquiera
por costumbre escribía en producción sin preguntar nada.

Un flag `--env` solo no alcanza —alguien tipea `prod` de memoria—, así que hay
cuatro capas y cada una tapa un agujero distinto:

  1. `--env qa|prod` OBLIGATORIO. Sin default: un default es una trampa.
  2. La URL sale del entorno (`DATABASE_URL_QA` / `DATABASE_URL_PROD`, o
     `DATABASE_URL` si coincide con el ambiente pedido). Nunca del código.
  3. GUARD DE COHERENCIA: con `--env qa` la base tiene que terminar en `-qa`;
     con `--env prod` NO puede terminar en `-qa`. Esto agarra el caso real —el
     flag dice una cosa y la variable de entorno apunta a otra— que es
     justamente el que ningún flag detecta solo.
  4. Contra prod hay que escribir el nombre de la base a mano. En QA no
     molesta a nadie.

Y para los que escriben: `--aplicar`. Sin ese flag corren en seco.

Uso:

    from _entorno import resolver_db, aplicar_o_seco

    cfg = resolver_db()                  # aborta si algo no cuadra
    engine = create_async_engine(cfg.url)
    if aplicar_o_seco():
        ...  # escribe de verdad

Cómo se pasa la URL desde afuera (sin escribirla en ningún lado):

    DATABASE_URL_QA="$(gcloud secrets versions access latest \\
        --secret=DATABASE_URL_QA --project=munify-api)" \\
        python scripts/mi_script.py --env qa --aplicar
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass

AMBIENTES = ("qa", "prod")

# Nombre de la base por ambiente. La regla de oro del proyecto: QA SIEMPRE
# termina en `-qa`; producción, nunca.
SUFIJO_QA = "-qa"


@dataclass(frozen=True)
class Entorno:
    """Lo que un script necesita saber de dónde va a escribir."""

    ambiente: str
    url: str
    base: str

    @property
    def es_prod(self) -> bool:
        return self.ambiente == "prod"


def _nombre_base(url: str) -> str:
    """Última parte del path de la URL, sin querystring."""
    sin_query = url.split("?", 1)[0]
    return sin_query.rsplit("/", 1)[-1]


def _tapar(url: str) -> str:
    """URL sin la contraseña, para poder loguearla."""
    return re.sub(r"(://[^:/@]+:)[^@]*@", r"\1***@", url)


def _url_del_entorno(ambiente: str) -> str:
    """Busca la URL en variables de entorno. Nunca en el código."""
    especifica = os.environ.get(f"DATABASE_URL_{ambiente.upper()}")
    if especifica:
        return especifica

    generica = os.environ.get("DATABASE_URL")
    if generica:
        return generica

    sys.exit(
        f"\nNo hay URL para el ambiente '{ambiente}'.\n"
        f"Pasala por entorno (no se escribe en el código):\n\n"
        f'  DATABASE_URL_{ambiente.upper()}="$(gcloud secrets versions access latest '
        f'--secret=DATABASE_URL_{ambiente.upper()} --project=munify-api)" \\\n'
        f"    python {sys.argv[0]} --env {ambiente}\n"
    )


def _validar_coherencia(ambiente: str, url: str) -> str:
    """El guard que importa: ¿la base es la del ambiente que pediste?"""
    base = _nombre_base(url)
    termina_en_qa = base.endswith(SUFIJO_QA)

    if ambiente == "qa" and not termina_en_qa:
        sys.exit(
            f"\nABORTADO — pediste --env qa pero la base es '{base}', que no "
            f"termina en '{SUFIJO_QA}'.\n"
            f"URL resuelta: {_tapar(url)}\n"
            "Revisá qué variable de entorno estás pasando.\n"
        )

    if ambiente == "prod" and termina_en_qa:
        sys.exit(
            f"\nABORTADO — pediste --env prod pero la base es '{base}', que es "
            f"de QA.\nURL resuelta: {_tapar(url)}\n"
        )

    return base


def _confirmar_prod(base: str) -> None:
    """Fricción a propósito: sólo en prod, y escribiendo el nombre a mano."""
    print(f"\n{'=' * 60}")
    print("  ESTÁS POR ESCRIBIR EN PRODUCCIÓN")
    print(f"  Base: {base}")
    print(f"{'=' * 60}\n")
    # Sin TTY (CI, un pipe) NO se pide confirmación: se aborta. Un input que
    # lee EOF respondería vacío y pasaría de largo. La única salida sin
    # terminal es `PURGA_CONFIRMO=<nombre exacto de la base>` en el ambiente:
    # es la misma confirmación (el nombre escrito por un humano), sólo que la
    # sesión de Infra —el operador real— no tiene TTY (MSG-20260902-2357-01).
    if not sys.stdin.isatty():
        por_env = (os.environ.get("PURGA_CONFIRMO") or "").strip()
        if por_env and por_env == base:
            print(f"  Confirmación por PURGA_CONFIRMO={base} (sin TTY).\n")
            return
        sys.exit("ABORTADO — prod necesita confirmación interactiva "
                 "(o PURGA_CONFIRMO con el nombre exacto de la base).\n")
    tipeado = input(f"Escribí el nombre de la base para seguir ({base}): ").strip()
    if tipeado != base:
        sys.exit("ABORTADO — el nombre no coincide.\n")


def parser_base(descripcion: str = "") -> argparse.ArgumentParser:
    """Parser con los flags comunes. Un script con flags propios lo extiende."""
    p = argparse.ArgumentParser(description=descripcion)
    p.add_argument(
        "--env",
        required=True,
        choices=AMBIENTES,
        help="Ambiente contra el que corre. Obligatorio, sin default.",
    )
    p.add_argument(
        "--aplicar",
        action="store_true",
        help="Escribe de verdad. Sin este flag, corre en seco.",
    )
    return p


def resolver_db(args: argparse.Namespace | None = None, descripcion: str = "") -> Entorno:
    """Resuelve el ambiente, valida coherencia y confirma si es prod."""
    if args is None:
        args, _ = parser_base(descripcion).parse_known_args()

    ambiente = args.env
    url = _url_del_entorno(ambiente)
    base = _validar_coherencia(ambiente, url)

    if ambiente == "prod" and getattr(args, "aplicar", False):
        _confirmar_prod(base)

    modo = "APLICA" if getattr(args, "aplicar", False) else "EN SECO"
    print(f"[{ambiente.upper()} · {base} · {modo}] {_tapar(url)}")
    return Entorno(ambiente=ambiente, url=url, base=base)


def aplicar_o_seco(args: argparse.Namespace | None = None) -> bool:
    """True si hay que escribir de verdad."""
    if args is None:
        args, _ = parser_base().parse_known_args()
    return bool(getattr(args, "aplicar", False))


def params_mysql(entorno: Entorno) -> dict:
    """La misma URL, partida para `pymysql.connect` / `aiomysql.connect`.

    Existe porque tres de los scripts migrados hablan con el driver directo y
    no con SQLAlchemy. Antes cada uno parseaba la URL a mano con `split(":")`
    —que además rompe si la contraseña tiene ':'— o repetía host, usuario y
    contraseña en literales.
    """
    from urllib.parse import unquote, urlparse

    u = urlparse(entorno.url.split("+", 1)[0] + "://" + entorno.url.split("://", 1)[1])
    return {
        "host": u.hostname or "",
        "port": u.port or 3306,
        "user": unquote(u.username or ""),
        "password": unquote(u.password or ""),
        "db": entorno.base,
    }


def agregar_scripts_al_path() -> None:
    """Para los scripts que viven en `backend/` y no en `backend/scripts/`."""
    from pathlib import Path

    carpeta = str(Path(__file__).resolve().parent)
    if carpeta not in sys.path:
        sys.path.insert(0, carpeta)
