from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from core.database import Base


class Municipio(Base):
    """
    Modelo para representar un municipio en el sistema multi-tenant.
    Cada municipio tiene su propia configuracion, usuarios, reclamos, etc.
    """
    __tablename__ = "municipios"

    id = Column(Integer, primary_key=True, index=True)

    # Datos basicos
    nombre = Column(String(200), nullable=False, index=True)
    codigo = Column(String(50), unique=True, nullable=False, index=True)  # Ej: "san-martin", "tigre"
    descripcion = Column(Text, nullable=True)

    # Ubicacion geografica
    latitud = Column(Float, nullable=False)  # Centro del municipio
    longitud = Column(Float, nullable=False)
    radio_km = Column(Float, default=10.0)  # Radio aproximado de cobertura en km

    # Limites geograficos (poligono GeoJSON simplificado)
    limites_geojson = Column(JSON, nullable=True)

    # Configuracion visual
    logo_url = Column(String(500), nullable=True)
    imagen_portada = Column(String(500), nullable=True)  # URL de imagen para header/banner del dashboard
    color_primario = Column(String(7), default="#3B82F6")  # Hex color
    color_secundario = Column(String(7), default="#1E40AF")

    # Configuracion de tema completo (JSON)
    # Estructura: { "theme": "dark", "customPrimary": "#fff", "customSidebar": "#000", ... }
    tema_config = Column(JSON, nullable=True)

    # Contacto
    direccion = Column(String(300), nullable=True)
    telefono = Column(String(50), nullable=True)
    email = Column(String(100), nullable=True)
    sitio_web = Column(String(200), nullable=True)

    # Configuracion del sistema
    zoom_mapa_default = Column(Integer, default=13)
    max_reclamos_dia_vecino = Column(Integer, default=5)

    # Estado
    activo = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    usuarios = relationship("User", back_populates="municipio")
    zonas = relationship("Zona", back_populates="municipio")
    empleados = relationship("Empleado", back_populates="municipio")
    reclamos = relationship("Reclamo", back_populates="municipio")
    whatsapp_config = relationship("WhatsAppConfig", back_populates="municipio", uselist=False)
    solicitudes = relationship("Solicitud", back_populates="municipio")

    # Relaciones con catálogos genéricos (muchos a muchos via tablas intermedias)
    categorias_habilitadas = relationship("MunicipioCategoria", back_populates="municipio")
    tipos_tramites_habilitados = relationship("MunicipioTipoTramite", back_populates="municipio")
    tramites_habilitados = relationship("MunicipioTramite", back_populates="municipio")

    # Consultas guardadas / BI
    consultas_guardadas = relationship("ConsultaGuardada", back_populates="municipio")

    # Pedidos
    pedidos = relationship("Pedido", back_populates="municipio")

    # Compras
    compras = relationship("Compra", back_populates="municipio")

    def __repr__(self):
        return f"<Municipio {self.nombre}>"

    def to_public_dict(self):
        """Devuelve datos publicos del municipio (sin info sensible)"""
        return {
            "id": self.id,
            "nombre": self.nombre,
            "codigo": self.codigo,
            "latitud": self.latitud,
            "longitud": self.longitud,
            "radio_km": self.radio_km,
            "logo_url": self.logo_url,
            "color_primario": self.color_primario,
            "activo": self.activo,
        }
