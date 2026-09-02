# -*- coding: utf-8 -*-
"""El paso a paso de la creacion de una demo, para poder ver DONDE fallo.

QUE RESUELVE
------------
Hasta hoy, si una demo salia mal --- sin barrios reales, sin turnos, sin
tesoreria --- no habia forma de saber por que: los pasos best-effort del alta
imprimen a stdout y ese stdout vive en los logs de Cloud Run, mezclado con todo
lo demas y sin estructura. El super admin no tenia donde mirar.

Esto graba cada etapa con: nombre, estado (ok / degradado / fallo), lo que
produjo (counts y, cuando aplica, los NOMBRES reales usados) y cuanto tardo.

LAS DOS COSAS QUE LO HACEN UTIL
-------------------------------
1. **DEGRADADO no es OK ni es FALLO.** Un paso que corrio pero produjo menos de
   lo que deberia --- barrios que salieron de calles porque OSM no tenia places,
   tesoreria que se salteo --- es justo lo que hay que ver, y con dos estados se
   escondia adentro de "ok". El motivo textual es obligatorio para degradar.

2. **Se guarda SIEMPRE, tambien cuando el alta revienta a mitad.** Se escribe en
   una sesion PROPIA (`AsyncSessionLocal` nueva) y no en la del alta: si la
   transaccion del alta se revierte, el log NO se va con ella. Es literalmente
   el caso que hay que poder mirar.

USO
---
    log = SeedLog("Lujan", codigo="lujan", pais="AR")
    with log.paso("categorias") as p:
        n = await crear_categorias(...)
        p.ok(categorias=n)
    ...
    await log.guardar(municipio_id=muni.id)

Si el bloque de un paso levanta, el paso queda marcado `fallo` con la excepcion
y la excepcion sigue subiendo: esto registra, no traga errores.
"""
from __future__ import annotations

import time
import traceback
from typing import Any, Optional


class Paso:
    """Una etapa del pipeline. Se cierra sola al salir del `with`."""

    def __init__(self, nombre: str):
        self.nombre = nombre
        self.estado = "ok"
        self.motivo: Optional[str] = None
        self.detalle: dict[str, Any] = {}
        self._t0 = time.perf_counter()
        self.duracion_ms = 0

    # --- lo que llama el codigo del pipeline ---
    def ok(self, **detalle):
        self.estado = "ok"
        self.detalle.update(detalle)

    def degradado(self, motivo: str, **detalle):
        """Corrio, pero produjo menos de lo que deberia. El motivo es obligatorio."""
        self.estado = "degradado"
        self.motivo = motivo
        self.detalle.update(detalle)

    def fallo(self, motivo: str, **detalle):
        self.estado = "fallo"
        self.motivo = motivo
        self.detalle.update(detalle)

    # --- context manager ---
    def __enter__(self) -> "Paso":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        self.duracion_ms = int((time.perf_counter() - self._t0) * 1000)
        if exc is not None:
            self.estado = "fallo"
            self.motivo = f"{exc_type.__name__}: {str(exc)[:400]}"
        return False  # nunca se traga la excepcion

    def a_dict(self) -> dict:
        d = {"nombre": self.nombre, "estado": self.estado,
             "duracion_ms": self.duracion_ms}
        if self.motivo:
            d["motivo"] = self.motivo
        if self.detalle:
            d["detalle"] = self.detalle
        return d


class SeedLog:
    """Acumula los pasos de una creacion y los persiste en `demo_seed_logs`."""

    def __init__(self, municipio_nombre: str, codigo: Optional[str] = None,
                 pais: Optional[str] = None, provincia: Optional[str] = None,
                 origen: str = "endpoint"):
        self.municipio_nombre = municipio_nombre
        self.codigo = codigo
        self.pais = pais
        self.provincia = provincia
        self.origen = origen
        self.pasos: list[Paso] = []
        self.error_message: Optional[str] = None
        self._t0 = time.perf_counter()
        self._t_marca = self._t0

    def paso(self, nombre: str) -> Paso:
        p = Paso(nombre)
        self._t_marca = time.perf_counter()
        self.pasos.append(p)
        return p

    def hito(self, nombre: str, motivo: Optional[str] = None,
             estado: str = "ok", **detalle) -> Paso:
        """Registra un paso YA terminado, midiendo desde la marca anterior.

        Es para los bloques largos del pipeline que ya existen escritos de
        corrido: envolverlos en un `with` obligaria a re-indentar cientos de
        lineas de la semilla para no ganar nada. `hito` los anota igual, con la
        duracion contada desde que termino el bloque anterior.
        """
        p = Paso(nombre)
        p._t0 = getattr(self, "_t_marca", self._t0)
        p.__exit__(None, None, None)
        self._t_marca = time.perf_counter()
        p.estado = estado
        p.motivo = motivo
        p.detalle.update(detalle)
        self.pasos.append(p)
        return p

    def error(self, exc: BaseException):
        """Marca el alta entera como fallida con el traceback recortado."""
        self.error_message = "".join(
            traceback.format_exception_only(type(exc), exc)).strip()[:1000]

    # --- lecturas ---
    @property
    def estado(self) -> str:
        if self.error_message or any(p.estado == "fallo" for p in self.pasos):
            return "fallo"
        if any(p.estado == "degradado" for p in self.pasos):
            return "degradado"
        return "ok"

    def resumen(self) -> dict:
        """Lo que el panel muestra sin abrir el detalle."""
        geo = next((p for p in self.pasos if p.nombre == "geo:puntos"), None)
        det = geo.detalle if geo else {}
        return {
            "pasos_total": len(self.pasos),
            "pasos_ok": sum(1 for p in self.pasos if p.estado == "ok"),
            "pasos_degradados": sum(1 for p in self.pasos if p.estado == "degradado"),
            "pasos_fallidos": sum(1 for p in self.pasos if p.estado == "fallo"),
            # Los NOMBRES reales: es lo unico que delata si la demo habla de la
            # ciudad del cliente o de zonas genericas.
            "zonas": det.get("nombres_zonas") or [],
            "barrios": det.get("nombres_barrios") or [],
            "calles_ejemplo": det.get("calles_ejemplo") or [],
            "degradaciones": [
                {"paso": p.nombre, "motivo": p.motivo}
                for p in self.pasos if p.estado in ("degradado", "fallo")
            ],
        }

    def a_dict(self) -> dict:
        return {
            "municipio_nombre": self.municipio_nombre,
            "codigo": self.codigo,
            "pais": self.pais,
            "provincia": self.provincia,
            "origen": self.origen,
            "estado": self.estado,
            "duracion_ms": int((time.perf_counter() - self._t0) * 1000),
            "pasos": [p.a_dict() for p in self.pasos],
            "resumen": self.resumen(),
            "error_message": self.error_message,
        }

    async def guardar(self, municipio_id: Optional[int] = None) -> Optional[int]:
        """Persiste en su PROPIA sesion, para sobrevivir al rollback del alta.

        Best-effort de verdad: si guardar el log falla, no puede tumbar una demo
        que por lo demas se creo bien. Se avisa por stdout y sigue.
        """
        from core.database import AsyncSessionLocal
        from models.demo_seed_log import DemoSeedLog

        datos = self.a_dict()
        try:
            async with AsyncSessionLocal() as db:
                fila = DemoSeedLog(municipio_id=municipio_id, **datos)
                db.add(fila)
                await db.commit()
                return fila.id
        except Exception as e:  # noqa: BLE001
            print(f"[SEED LOG] no se pudo guardar el log de "
                  f"{self.municipio_nombre}: {type(e).__name__}: {e}")
            return None
