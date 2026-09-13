"""El negocio de la obra pública chica, en funciones puras.

La ley del control de obra: TIEMPO, HECHO y PLATA tienen que caminar juntos.
  - plata adelante de lo hecho  → se paga más de lo que se hace (anticipo, sobreprecio, desvío)
  - tiempo adelante de lo hecho → atrasada
  - hecho adelante de la plata  → deuda con el contratista, o salió más barata

La etapa es la obra en chico: los mismos tres relojes. Y lo que el intendente quiere
saber no es el pasado sino el futuro: cuándo termina de verdad y cuánto va a costar
de verdad. Las causas se leen en la plata: una etapa atrasada sin gastos hace tres
semanas está parada; con gastos que siguen, va lenta; programados vencidos sin pagar
es alguien esperando cobrar.

Todo recibe datos ya resueltos (fechas, montos) y devuelve números y frases. Nada de
base ni de request acá: se prueba con un `date` y unos Decimal.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import List, Optional, Tuple

# Márgenes de la ley de los tres relojes, en puntos porcentuales.
HOLGURA_PLATA = 15      # la plata puede ir hasta 15 puntos adelante de lo hecho sin alarma
HOLGURA_TIEMPO = 15     # ídem el tiempo
DIAS_PARADA = 21        # tres semanas sin un gasto pagado = parece parada
AVANCE_MINIMO_PROYECCION = 10   # con menos del 10% hecho la proyección es ruido


def fmt_m(v: Optional[Decimal]) -> str:
    if v is None:
        return "—"
    return f"${(Decimal(v) / Decimal(1_000_000)).quantize(Decimal('0.1'))} M".replace(".", ",")


def fmt_fecha(d: Optional[date]) -> str:
    if not d:
        return "—"
    meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    return f"{d.day} {meses[d.month - 1]}"


def pct(parte: Optional[Decimal], todo: Optional[Decimal]) -> Optional[int]:
    if parte is None or not todo or todo <= 0:
        return None
    return int(round(Decimal(parte) / Decimal(todo) * 100))


def dias_texto(n: int) -> str:
    return f"{abs(n)} día{'s' if abs(n) != 1 else ''}"


# ---------------------------------------------------------------------------
# Los tres relojes
# ---------------------------------------------------------------------------

@dataclass
class Reloj:
    pct: Optional[int]
    valor: str
    sub: Optional[str] = None
    veredicto: str = "bueno"


@dataclass
class Relojes:
    tiempo: Reloj
    hecho: Reloj
    plata: Reloj
    lectura: str
    # crudos, para la proyección
    dias_plazo: Optional[int] = None
    dias_llevados: Optional[int] = None


def relojes_obra(
    hoy: date,
    inicio: Optional[date],
    fin_previsto: Optional[date],
    fin_real: Optional[date],
    avance: Optional[int],
    ejecutado: Decimal,
    presupuesto: Optional[Decimal],
    etapas_terminadas: int = 0,
    etapas_total: int = 0,
) -> Relojes:
    # Tiempo: cuánto del plazo se consumió. Pasa de 100 si se pasó.
    dias_plazo = dias_llevados = None
    pct_tiempo = None
    if inicio and fin_previsto and fin_previsto > inicio:
        dias_plazo = (fin_previsto - inicio).days
        hasta = fin_real or hoy
        dias_llevados = max(0, (hasta - inicio).days)
        pct_tiempo = int(round(dias_llevados / dias_plazo * 100))
        tiempo = Reloj(pct_tiempo, f"{dias_llevados} de {dias_plazo} días",
                       (f"terminó el {fmt_fecha(fin_real)}" if fin_real else f"vence el {fmt_fecha(fin_previsto)}"))
    elif inicio:
        dias_llevados = max(0, ((fin_real or hoy) - inicio).days)
        tiempo = Reloj(None, f"{dias_llevados} días", "sin fin previsto cargado")
    else:
        tiempo = Reloj(None, "—", "sin fechas cargadas")

    # Hecho: el avance físico.
    if avance is not None:
        hecho = Reloj(avance, f"{avance}%", f"{etapas_terminadas} de {etapas_total} etapas terminadas" if etapas_total else "avance cargado a mano")
    else:
        hecho = Reloj(None, "—", "sin avance cargado")

    # Plata: cuánto del presupuesto se pagó.
    pct_plata = pct(ejecutado, presupuesto)
    if pct_plata is not None:
        plata = Reloj(pct_plata, f"{fmt_m(ejecutado)} de {fmt_m(presupuesto)}", f"el {pct_plata}% del presupuesto")
    else:
        plata = Reloj(None, fmt_m(ejecutado), "sin presupuesto cargado")

    # La comparación: quién va adelante de quién.
    partes: List[str] = []
    if avance is not None and pct_plata is not None and pct_plata > avance + HOLGURA_PLATA:
        plata.veredicto = "malo"
        partes.append(f"La plata va {pct_plata - avance} puntos adelante de lo hecho: se está pagando más de lo que se hace.")
    if avance is not None and pct_tiempo is not None and pct_tiempo > avance + HOLGURA_TIEMPO and not fin_real:
        tiempo.veredicto = "advertencia" if pct_tiempo <= 100 else "malo"
        partes.append(f"El tiempo va {pct_tiempo - avance} puntos adelante de lo hecho: va atrasada." if pct_tiempo <= 100
                      else f"Se pasó del plazo con el {avance}% hecho.")
    if avance is not None and pct_plata is not None and avance > pct_plata + HOLGURA_PLATA:
        partes.append(f"Lo hecho va {avance - pct_plata} puntos adelante de la plata: hay trabajo hecho sin pagar, o salió más barata.")
    if not partes:
        if avance is not None and (pct_plata is not None or pct_tiempo is not None):
            partes.append("Los tres relojes caminan juntos: lo que se hizo, lo que se pagó y el tiempo que pasó van parejos.")
        else:
            faltan = [n for n, v in (("fechas", pct_tiempo), ("avance", avance), ("presupuesto", pct_plata)) if v is None]
            partes.append(f"Sin {' ni '.join(faltan)} no se puede comparar: cargalos y la obra se lee sola.")
    return Relojes(tiempo, hecho, plata, " ".join(partes), dias_plazo, dias_llevados)


# ---------------------------------------------------------------------------
# La proyección
# ---------------------------------------------------------------------------

@dataclass
class Proyeccion:
    fin_previsto: Optional[date] = None
    fin_proyectado: Optional[date] = None
    desvio_dias: Optional[int] = None
    costo_proyectado: Optional[Decimal] = None
    desvio_plata: Optional[Decimal] = None
    base: str = ""


def proyeccion_obra(
    hoy: date,
    fin_previsto: Optional[date],
    fin_real: Optional[date],
    avance: Optional[int],
    dias_llevados: Optional[int],
    ejecutado: Decimal,
    presupuesto: Optional[Decimal],
) -> Proyeccion:
    p = Proyeccion(fin_previsto=fin_previsto)
    if fin_real or (avance is not None and avance >= 100):
        p.fin_proyectado = fin_real or hoy
        p.costo_proyectado = ejecutado
        p.base = "terminada: lo que costó y cuándo terminó"
    elif avance is not None and avance >= AVANCE_MINIMO_PROYECCION and dias_llevados:
        ritmo = avance / dias_llevados                     # puntos por día
        restantes = int(round((100 - avance) / ritmo)) if ritmo > 0 else None
        if restantes is not None and restantes <= 730:
            p.fin_proyectado = hoy + timedelta(days=restantes)
        p.costo_proyectado = (Decimal(ejecutado) / Decimal(avance) * 100).quantize(Decimal("1"))
        p.base = f"al ritmo de hasta hoy: {avance}% en {dias_llevados} días"
    else:
        p.base = "todavía no hay ritmo para proyectar"
    if p.fin_proyectado and fin_previsto:
        p.desvio_dias = (p.fin_proyectado - fin_previsto).days
    if p.costo_proyectado is not None and presupuesto:
        p.desvio_plata = p.costo_proyectado - Decimal(presupuesto)
    return p


# ---------------------------------------------------------------------------
# La etapa: la obra en chico
# ---------------------------------------------------------------------------

@dataclass
class EtapaCrudo:
    id: int
    orden: int
    nombre: str
    estado: str
    incidencia_pct: Decimal
    avance_pct: int
    fecha_inicio_prevista: Optional[date]
    fecha_fin_prevista: Optional[date]
    fecha_inicio_real: Optional[date]
    fecha_fin_real: Optional[date]
    monto_previsto: Optional[Decimal]
    ejecutado: Decimal
    programado: Decimal
    n_gastos: int
    ultimo_gasto: Optional[date]


@dataclass
class DiagEtapa:
    monto_previsto_efectivo: Optional[Decimal]
    pct_plata: Optional[int]
    plazo_dias: Optional[int]
    dias_llevados: Optional[int]
    pct_tiempo: Optional[int]
    desvio_inicio_dias: Optional[int]
    desvio_fin_dias: Optional[int]
    dias_sin_gastos: Optional[int]
    situacion: str
    veredicto: str
    frase: str
    arrastre: Optional[str] = None


def diagnostico_etapa(e: EtapaCrudo, hoy: date, presupuesto_obra: Optional[Decimal]) -> DiagEtapa:
    previsto = e.monto_previsto
    if previsto is None and presupuesto_obra and e.incidencia_pct:
        previsto = (Decimal(presupuesto_obra) * Decimal(e.incidencia_pct) / 100).quantize(Decimal("1"))
    pct_plata = pct(e.ejecutado, previsto)

    ini = e.fecha_inicio_real or e.fecha_inicio_prevista
    plazo = dias_llevados = pct_tiempo = None
    if e.fecha_inicio_prevista and e.fecha_fin_prevista and e.fecha_fin_prevista > e.fecha_inicio_prevista:
        plazo = (e.fecha_fin_prevista - e.fecha_inicio_prevista).days
    if ini and e.estado != "pendiente":
        hasta = e.fecha_fin_real or hoy
        dias_llevados = max(0, (hasta - ini).days)
        if plazo:
            pct_tiempo = int(round(dias_llevados / plazo * 100))
    desvio_inicio = (e.fecha_inicio_real - e.fecha_inicio_prevista).days if e.fecha_inicio_real and e.fecha_inicio_prevista else None
    desvio_fin = None
    if e.fecha_fin_prevista:
        if e.fecha_fin_real:
            desvio_fin = (e.fecha_fin_real - e.fecha_fin_prevista).days
        elif e.estado in ("en_curso", "parada") and hoy > e.fecha_fin_prevista:
            desvio_fin = (hoy - e.fecha_fin_prevista).days
    dias_sin = (hoy - e.ultimo_gasto).days if e.ultimo_gasto else None

    # --- la lectura
    plata_txt = ""
    if not e.ejecutado and not e.programado:
        plata_txt = "Sin gastos imputados todavía" + (f"; previsto {fmt_m(previsto)}." if previsto else ".")
    elif pct_plata is not None:
        if pct_plata > 100 + HOLGURA_PLATA:
            plata_txt = f"Se gastaron {fmt_m(e.ejecutado)}, {pct_plata - 100}% arriba de los {fmt_m(previsto)} previstos."
        elif e.estado == "terminada" and pct_plata > 100:
            plata_txt = f"Costó {fmt_m(e.ejecutado)}, {fmt_m(Decimal(e.ejecutado) - Decimal(previsto))} arriba de los {fmt_m(previsto)} previstos."
        elif e.estado == "terminada":
            plata_txt = f"Costó {fmt_m(e.ejecutado)}, dentro de los {fmt_m(previsto)} previstos."
        else:
            plata_txt = f"Lleva {fmt_m(e.ejecutado)} de {fmt_m(previsto)} previstos ({pct_plata}%)."
    elif e.ejecutado:
        plata_txt = f"Lleva {fmt_m(e.ejecutado)} en {e.n_gastos} gasto{'s' if e.n_gastos != 1 else ''}; sin monto previsto no hay con qué compararlo."
    if e.programado:
        plata_txt += f" Quedan {fmt_m(e.programado)} programados."

    arrastre = None
    if e.estado == "terminada":
        ini_txt = f"Empezó el {fmt_fecha(ini)}" if ini else "Empezó"
        if desvio_inicio:
            ini_txt += f", {dias_texto(desvio_inicio)} {'después' if desvio_inicio > 0 else 'antes'} de lo previsto"
        fin_txt = f"Terminó el {fmt_fecha(e.fecha_fin_real)}" if e.fecha_fin_real else "Terminó"
        if desvio_fin is not None:
            fin_txt += (f", {dias_texto(desvio_fin)} tarde" if desvio_fin > 0 else (f", {dias_texto(desvio_fin)} antes" if desvio_fin < 0 else ", en fecha"))
        frase = f"{ini_txt}. {fin_txt}. {plata_txt}".strip()
        ver = "malo" if (pct_plata or 0) > 100 + HOLGURA_PLATA else ("advertencia" if (desvio_fin or 0) >= 7 else "bueno")
        if desvio_fin and desvio_fin > 0:
            arrastre = f"Arrastra {dias_texto(desvio_fin)} a las etapas que siguen."
        if pct_plata and pct_plata > 100 + HOLGURA_PLATA and previsto:
            extra = fmt_m(Decimal(e.ejecutado) - Decimal(previsto))
            arrastre = (arrastre + " " if arrastre else "") + f"Se comió {extra} del presupuesto de las que siguen."
        return DiagEtapa(previsto, pct_plata, plazo, dias_llevados, pct_tiempo, desvio_inicio, desvio_fin, dias_sin, "terminada", ver, frase, arrastre)

    if e.estado == "pendiente":
        if e.fecha_inicio_prevista and e.fecha_inicio_prevista < hoy:
            atraso = (hoy - e.fecha_inicio_prevista).days
            frase = f"Tenía que empezar el {fmt_fecha(e.fecha_inicio_prevista)} y todavía no arrancó: {dias_texto(atraso)} de atraso antes de empezar."
            if previsto:
                frase += f" Previsto {fmt_m(previsto)}."
            return DiagEtapa(previsto, pct_plata, plazo, dias_llevados, pct_tiempo, desvio_inicio, desvio_fin, dias_sin, "por_empezar_atrasada", "advertencia", frase)
        frase = f"Empieza el {fmt_fecha(e.fecha_inicio_prevista)}" if e.fecha_inicio_prevista else "Sin fecha de inicio"
        if plazo:
            frase += f", {plazo} días de plazo"
        frase += "."
        if previsto:
            frase += f" Previsto {fmt_m(previsto)}."
        if e.ejecutado:
            frase += f" Ya tiene {fmt_m(e.ejecutado)} imputados antes de empezar (anticipo o materiales)."
        return DiagEtapa(previsto, pct_plata, plazo, dias_llevados, pct_tiempo, desvio_inicio, desvio_fin, dias_sin, "por_empezar", "bueno", frase)

    # en_curso o parada
    parada_declarada = e.estado == "parada"
    parada_inferida = dias_sin is not None and dias_sin >= DIAS_PARADA and not e.programado
    if parada_declarada or parada_inferida:
        quien = "Está parada" if parada_declarada else "Figura en curso pero parece parada"
        frase = f"{quien}: sin gastos pagados desde el {fmt_fecha(e.ultimo_gasto)} ({dias_texto(dias_sin)})." if dias_sin is not None else f"{quien}: no tiene gastos pagados."
        frase += f" Lleva el {e.avance_pct}% hecho."
        if desvio_fin and desvio_fin > 0:
            frase += f" Ya va {dias_texto(desvio_fin)} pasada de su fin previsto."
        frase += f" {plata_txt}".rstrip()
        arrastre = "Cada día parada corre el fin de la obra un día." if not e.programado else None
        return DiagEtapa(previsto, pct_plata, plazo, dias_llevados, pct_tiempo, desvio_inicio, desvio_fin, dias_sin, "parada", "malo", frase, arrastre)

    if pct_tiempo is not None and pct_tiempo > e.avance_pct + HOLGURA_TIEMPO:
        frase = f"Consumió el {pct_tiempo}% de su plazo con el {e.avance_pct}% hecho: va lenta."
        if desvio_fin and desvio_fin > 0:
            frase += f" Ya va {dias_texto(desvio_fin)} pasada de su fin previsto."
        frase += f" {plata_txt}".rstrip()
        ver = "malo" if (pct_tiempo > 100 or (pct_plata or 0) > e.avance_pct + HOLGURA_PLATA) else "advertencia"
        arr = None
        if e.avance_pct > 0 and dias_llevados and plazo:
            restantes = int(round((100 - e.avance_pct) / (e.avance_pct / dias_llevados)))
            if restantes > 365:
                arr = "A este ritmo no termina ni el año que viene: hay que cambiar algo."
            else:
                arr = f"A este ritmo termina en {dias_texto(restantes)} más, {dias_texto(dias_llevados + restantes - plazo)} tarde."
        return DiagEtapa(previsto, pct_plata, plazo, dias_llevados, pct_tiempo, desvio_inicio, desvio_fin, dias_sin, "lenta", ver, frase, arr)

    if pct_plata is not None and pct_plata > e.avance_pct + HOLGURA_PLATA:
        frase = f"Gastó el {pct_plata}% de lo previsto con el {e.avance_pct}% hecho: está saliendo cara."
        frase += f" {plata_txt}".rstrip()
        arr = None
        if e.avance_pct >= AVANCE_MINIMO_PROYECCION and previsto:
            costo = Decimal(e.ejecutado) / Decimal(e.avance_pct) * 100
            arr = f"A este ritmo termina costando {fmt_m(costo)}, {fmt_m(costo - Decimal(previsto))} más que lo previsto."
        return DiagEtapa(previsto, pct_plata, plazo, dias_llevados, pct_tiempo, desvio_inicio, desvio_fin, dias_sin, "cara", "malo", frase, arr)

    frase = "Va en ritmo"
    detalles = []
    if pct_tiempo is not None:
        detalles.append(f"{pct_tiempo}% del plazo")
    detalles.append(f"{e.avance_pct}% hecho")
    if pct_plata is not None:
        detalles.append(f"{pct_plata}% de la plata")
    frase += ": " + ", ".join(detalles) + "."
    frase += f" {plata_txt}".rstrip()
    return DiagEtapa(previsto, pct_plata, plazo, dias_llevados, pct_tiempo, desvio_inicio, desvio_fin, dias_sin, "en_ritmo", "bueno", frase)


# ---------------------------------------------------------------------------
# La curva S: plata acumulada semana a semana contra la recta prevista
# ---------------------------------------------------------------------------

@dataclass
class PuntoCurva:
    fecha: date
    real: Decimal
    prevista: Optional[Decimal]
    programado: bool


def curva_inversion(
    hoy: date,
    gastos: List[Tuple[date, Decimal]],
    inicio: Optional[date],
    fin_previsto: Optional[date],
    presupuesto: Optional[Decimal],
    hasta: Optional[date] = None,
) -> List[PuntoCurva]:
    """Un punto por semana (lunes). `real` acumula lo pagado; en semanas futuras acumula lo programado."""
    fechas = [f for f, _ in gastos] + [d for d in (inicio, fin_previsto, hasta, hoy) if d]
    if not fechas:
        return []
    desde = min(fechas)
    desde = desde - timedelta(days=desde.weekday())
    tope = max(fechas)
    puntos: List[PuntoCurva] = []
    acum = Decimal(0)
    i = 0
    ordenados = sorted(gastos)
    semana = desde
    while semana <= tope + timedelta(days=6):
        fin_semana = semana + timedelta(days=6)
        while i < len(ordenados) and ordenados[i][0] <= fin_semana:
            acum += ordenados[i][1]
            i += 1
        prevista = None
        if inicio and fin_previsto and presupuesto and fin_previsto > inicio:
            avance_t = (fin_semana - inicio).days / (fin_previsto - inicio).days
            prevista = (Decimal(presupuesto) * Decimal(min(1, max(0, avance_t)))).quantize(Decimal("1"))
        puntos.append(PuntoCurva(semana, acum, prevista, semana > hoy))
        semana += timedelta(days=7)
    return puntos


# ---------------------------------------------------------------------------
# Pendientes: lo que alguien tiene que resolver
# ---------------------------------------------------------------------------

@dataclass
class Pendiente:
    tipo: str
    titulo: str
    detalle: str
    n: int = 0
    monto: Decimal = field(default_factory=lambda: Decimal(0))
    etapa_id: Optional[int] = None
    veredicto: str = "advertencia"


def frase_obra(
    relojes: Relojes,
    proy: Proyeccion,
    etapa_en_curso: Optional[Tuple[int, int, str, DiagEtapa]],
    pendientes: List[Pendiente],
    n_gastos: int,
    ejecutado: Decimal,
) -> str:
    """La obra en tres o cuatro oraciones: dónde está, cómo vienen los relojes, qué se proyecta, qué la frena."""
    partes: List[str] = []
    if proy.base.startswith("terminada"):
        fin_txt = f"Terminada el {fmt_fecha(proy.fin_proyectado)}"
        if proy.desvio_dias:
            fin_txt += f", {dias_texto(proy.desvio_dias)} {'tarde' if proy.desvio_dias > 0 else 'antes de lo previsto'}"
        elif proy.fin_previsto:
            fin_txt += ", en fecha"
        partes.append(fin_txt + ".")
        if relojes.plata.pct is not None:
            partes.append(f"Costó {fmt_m(ejecutado)}, el {relojes.plata.pct}% del presupuesto.")
        else:
            partes.append(f"Costó {fmt_m(ejecutado)} en {n_gastos} gastos.")
        return " ".join(partes)
    if etapa_en_curso:
        orden, total, nombre, diag = etapa_en_curso
        partes.append(f"Va por la etapa {orden} de {total}, {nombre}.")
    if relojes.hecho.pct is None and relojes.plata.pct is None:
        partes.append(f"Lleva {fmt_m(ejecutado)} en {n_gastos} gastos; {relojes.lectura[0].lower() + relojes.lectura[1:]}")
        return " ".join(partes)
    hecho_txt = f"el {relojes.hecho.pct}% hecho" if relojes.hecho.pct is not None else None
    plata_txt = f"el {relojes.plata.pct}% de la plata" if relojes.plata.pct is not None else None
    if relojes.tiempo.pct is not None:
        resto = " y ".join(t for t in (hecho_txt, plata_txt) if t)
        partes.append(f"Consumió el {relojes.tiempo.pct}% del plazo" + (f" con {resto}." if resto else "."))
    elif hecho_txt and plata_txt:
        partes.append(f"Lleva {hecho_txt} con {plata_txt}.")
    elif hecho_txt or plata_txt:
        partes.append(f"Lleva {hecho_txt or plata_txt}.")
    partes.append(relojes.lectura)
    if proy.fin_proyectado and proy.desvio_dias is not None and proy.base.startswith("al ritmo"):
        cuando = f"A este ritmo termina el {fmt_fecha(proy.fin_proyectado)}"
        cuando += f", {dias_texto(proy.desvio_dias)} {'tarde' if proy.desvio_dias > 0 else 'antes'}" if proy.desvio_dias else ", en fecha"
        if proy.desvio_plata is not None:
            if abs(proy.desvio_plata) < Decimal(500_000):
                cuando += ", y cuesta lo presupuestado."
            else:
                cuando += f", y cuesta {fmt_m(abs(proy.desvio_plata))} {'más' if proy.desvio_plata > 0 else 'menos'} que el presupuesto."
        else:
            cuando += "."
        partes.append(cuando)
    if etapa_en_curso and etapa_en_curso[3].situacion in ("parada", "cara"):
        partes.append(etapa_en_curso[3].frase.split(". ")[0] + ".")
    for p in pendientes[:1]:
        if p.tipo in ("vencidos_sin_pagar", "sin_etapa"):
            partes.append(p.titulo + ".")
    return " ".join(partes)
