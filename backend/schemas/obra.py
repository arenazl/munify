"""Schemas del módulo Obras (Obra = Proyecto de tipo `obra`, con etapas).

Plan: docs/tesoreria/04-plan-integral-persona-y-obras.md (F2) y docs/obras/02.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

Veredicto = str  # 'bueno' | 'advertencia' | 'malo'


class EtapaIn(BaseModel):
    id: Optional[int] = None
    orden: int = 1
    nombre: str = Field(..., min_length=1, max_length=120)
    descripcion: Optional[str] = None
    incidencia_pct: Decimal = Decimal("0")
    avance_pct: int = Field(0, ge=0, le=100)
    estado: str = "pendiente"          # pendiente | en_curso | terminada | parada
    fecha_inicio_prevista: Optional[date] = None
    fecha_fin_prevista: Optional[date] = None
    fecha_inicio_real: Optional[date] = None
    fecha_fin_real: Optional[date] = None
    monto_previsto: Optional[Decimal] = None


class EtapaOut(EtapaIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ejecutado: Decimal = Decimal("0")
    n_gastos: int = 0
    # cuánto de lo ejecutado fue cada cosa (heurística por tipo de la persona destino)
    contratista: Decimal = Decimal("0")
    materiales: Decimal = Decimal("0")
    mano_de_obra: Decimal = Decimal("0")
    otros: Decimal = Decimal("0")


class PersonaRef(BaseModel):
    id: int
    nombre: str
    tipo: Optional[str] = None


class ObraBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=150)
    descripcion: Optional[str] = None
    tipo: str = "obra"                 # obra | programa
    tipo_obra: Optional[str] = None
    modalidad: Optional[str] = None    # contrato | administracion
    expediente: Optional[str] = None
    fuente_financiamiento: Optional[str] = None
    monto_contrato: Optional[Decimal] = None
    presupuesto: Optional[Decimal] = None
    plazo_dias: Optional[int] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    fecha_inicio_real: Optional[date] = None
    fecha_fin_real: Optional[date] = None
    contratista_persona_id: Optional[int] = None
    inspector_usuario_id: Optional[int] = None
    barrio_id: Optional[int] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    estado: str = "activo"
    estado_obra: Optional[str] = None  # por_empezar | en_ejecucion | terminada
    avance: Optional[int] = Field(None, ge=0, le=100)
    publico: bool = False
    mostrar_monto: bool = False


class ObraCreate(ObraBase):
    etapas: List[EtapaIn] = Field(default_factory=list)


class ObraUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    tipo: Optional[str] = None
    tipo_obra: Optional[str] = None
    modalidad: Optional[str] = None
    expediente: Optional[str] = None
    fuente_financiamiento: Optional[str] = None
    monto_contrato: Optional[Decimal] = None
    presupuesto: Optional[Decimal] = None
    plazo_dias: Optional[int] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    fecha_inicio_real: Optional[date] = None
    fecha_fin_real: Optional[date] = None
    contratista_persona_id: Optional[int] = None
    inspector_usuario_id: Optional[int] = None
    barrio_id: Optional[int] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    estado: Optional[str] = None
    estado_obra: Optional[str] = None
    avance: Optional[int] = Field(None, ge=0, le=100)
    publico: Optional[bool] = None
    mostrar_monto: Optional[bool] = None


class EtapaActual(BaseModel):
    orden: int
    nombre: str
    total: int


class ObraResumen(BaseModel):
    """Una tarjeta / fila de la lista."""
    id: int
    nombre: str
    tipo: str
    tipo_obra: Optional[str] = None
    modalidad: Optional[str] = None
    estado: str
    estado_obra: Optional[str] = None
    publico: bool = False
    contratista: Optional[PersonaRef] = None
    presupuesto_vigente: Optional[Decimal] = None
    ejecutado: Decimal = Decimal("0")
    n_gastos: int = 0
    avance: Optional[int] = None       # derivado de etapas si las hay
    etapa_actual: Optional[EtapaActual] = None
    n_etapas: int = 0
    sin_etapa: int = 0                 # imputaciones sin etapa
    atraso_dias: int = 0
    veredicto: Veredicto = "bueno"
    motivo: str = ""
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    updated_at: Optional[datetime] = None


class ObrasKpis(BaseModel):
    en_ejecucion: int = 0
    atrasadas: int = 0
    con_desvio: int = 0
    sin_etapas: int = 0
    publicadas: int = 0
    total_obras: int = 0
    total_programas: int = 0
    plata_en_ejecucion: Decimal = Decimal("0")


class ObrasListado(BaseModel):
    items: List[ObraResumen]
    kpis: ObrasKpis
    frase: str


class GastoDeObra(BaseModel):
    imputacion_id: int
    gasto_id: int
    fecha: date
    monto: Decimal                     # lo imputado a esta obra
    monto_gasto: Decimal               # el gasto entero
    concepto: str
    descripcion: Optional[str] = None
    destino: Optional[PersonaRef] = None
    rubro: str                         # contratista | materiales | mano_de_obra | otros
    estado_pago: Optional[str] = None
    etapa_id: Optional[int] = None
    origen: str = "manual"
    etapa_propuesta_id: Optional[int] = None   # si no tiene etapa y el sistema propone una


class ProveedorDeObra(BaseModel):
    persona: PersonaRef
    n_gastos: int
    total: Decimal


class MesDeObra(BaseModel):
    mes: str                            # YYYY-MM
    monto: Decimal
    acumulado: Decimal
    programado: bool = False            # gasto con fecha futura (programado, no pagado)


class GenteDeObra(BaseModel):
    ordenes_trabajo: int = 0
    horas: float = 0
    cuadrillas: List[str] = []
    personas_ot: List[str] = []
    sueldos_personas: int = 0
    sueldos_total: Decimal = Decimal("0")


class ObraKpis(BaseModel):
    presupuesto_vigente: Optional[Decimal] = None
    ejecutado: Decimal = Decimal("0")
    comprometido: Decimal = Decimal("0")
    programado: Decimal = Decimal("0")
    avance: Optional[int] = None
    pct_plata: Optional[int] = None
    atraso_dias: int = 0
    sin_etapa: int = 0
    veredicto: Veredicto = "bueno"


class ObraDetalle(BaseModel):
    obra: ObraBase
    id: int
    contratista: Optional[PersonaRef] = None
    inspector: Optional[PersonaRef] = None
    barrio: Optional[str] = None
    kpis: ObraKpis
    frase: str
    etapas: List[EtapaOut]
    gastos: List[GastoDeObra]
    proveedores: List[ProveedorDeObra]
    mes_a_mes: List[MesDeObra]
    gente: GenteDeObra
    linea_desde: Optional[date] = None
    linea_hasta: Optional[date] = None


class ConfirmarImputaciones(BaseModel):
    imputacion_ids: List[int]
    etapa_id: Optional[int] = None     # si no viene, se usa la propuesta de cada una
