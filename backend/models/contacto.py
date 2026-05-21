import enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base


class TipoContacto(str, enum.Enum):
    """Clasificacion del contacto. Sirve para agrupar/filtrar gastos sin
    necesidad de una tabla de categorias adicional.

    Los valores son los grupos reales que aparecen en el Excel del intendente:
    Concejales, Empleados municipales, Profesionales y publicidad, etc.
    """
    CONCEJAL = "concejal"
    EMPLEADO = "empleado"
    PROFESIONAL = "profesional"   # abogado, contador, ingeniero, doctor, etc.
    PROVEEDOR = "proveedor"
    CONTRATISTA = "contratista"
    BENEFICIARIO = "beneficiario"  # destinatario de prestamos / aportes
    OTRO = "otro"


class Contacto(Base):
    """
    Agenda de personas fisicas con las que el municipio (intendente)
    tiene relacion economica: empleados, concejales, profesionales,
    proveedores, beneficiarios de prestamos, etc.

    NO se confunde con `User`/`Vecino`: los contactos no tienen login.
    Es solo informacion administrativa para el modulo Tesoreria.

    Importable desde:
      - Excel formato matriz del intendente (sheets Concejales / Empleados / ...)
      - KMZ con placemarks geolocalizados (matching por nombre)
    """
    __tablename__ = "contactos"

    id = Column(Integer, primary_key=True, index=True)

    # Multi-tenant
    municipio_id = Column(Integer, ForeignKey("municipios.id"), nullable=False, index=True)
    municipio = relationship("Municipio")

    # Datos basicos
    nombre = Column(String(100), nullable=False, index=True)
    apellido = Column(String(100), nullable=True)
    dni = Column(String(20), nullable=True, index=True)

    # Datos fiscales (para OP impresa y comprobantes contables)
    cuit = Column(String(20), nullable=True, index=True)
    iibb = Column(String(20), nullable=True)
    condicion_iva = Column(String(50), nullable=True)        # "Resp. Inscripto" | "Monotributo" | "Exento"
    codigo_tributario = Column(String(20), nullable=True)    # codigo interno del muni para el contacto

    # Contacto
    telefono = Column(String(30), nullable=True)
    email = Column(String(150), nullable=True)

    # Direccion + geolocalizacion (viene del KMZ del intendente)
    direccion = Column(String(255), nullable=True)
    latitud = Column(Float, nullable=True)
    longitud = Column(Float, nullable=True)

    # Alias de transferencia (MercadoPago / CVU). Ejemplos reales del Excel:
    #   "CARRANZAGUADI.mp" (alias MP)
    #   "720246188000036000000*" (CVU/CBU)
    alias_pago = Column(String(60), nullable=True)

    # Clasificacion del contacto
    tipo = Column(
        Enum(TipoContacto, values_callable=lambda x: [e.value for e in x]),
        default=TipoContacto.BENEFICIARIO,
        nullable=False,
        index=True,
    )

    # Subtipo / especialidad (para profesionales: "abogado", "contador", etc.)
    subtipo = Column(String(50), nullable=True)

    # Para empleados: FK al catalogo de tipos de empleado (opcional)
    tipo_empleado_id = Column(Integer, ForeignKey("tesoreria_tipos_empleado.id", ondelete="SET NULL"), nullable=True)
    # Paraje opcional: alternativa a direccion exacta
    paraje_id = Column(Integer, ForeignKey("tesoreria_parajes.id", ondelete="SET NULL"), nullable=True)

    notas = Column(Text, nullable=True)

    activo = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relacion inversa
    gastos = relationship("Gasto", back_populates="contacto", foreign_keys="Gasto.destino_contacto_id")

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombre} {self.apellido or ''}".strip()

    def __repr__(self):
        return f"<Contacto {self.id} {self.nombre_completo} ({self.tipo.value})>"
