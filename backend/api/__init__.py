from fastapi import APIRouter
from .auth import router as auth_router
from .users import router as users_router
from .categorias_reclamo import router as categorias_reclamo_router
from .categorias_reclamo_sugeridas import router as categorias_reclamo_sugeridas_router
from .categorias_tramite import router as categorias_tramite_router
from .zonas import router as zonas_router
from .empleados import router as empleados_router
from .reclamos import router as reclamos_router
from .configuracion import router as configuracion_router
from .notificaciones import router as notificaciones_router
from .dashboard import router as dashboard_router
from .chat import router as chat_router
from .analytics import router as analytics_router
from .sla import router as sla_router
from .exportar import router as exportar_router
from .whatsapp import router as whatsapp_router
from .turnos import router as turnos_router
from .calificaciones import router as calificaciones_router
from .escalado import router as escalado_router
from .emails import router as emails_router
from .portal_publico import router as portal_publico_router
from .municipios import router as municipios_router
from .imagenes import router as imagenes_router
from .gamificacion import router as gamificacion_router
# Temporalmente deshabilitado por error de reportlab en Heroku
# from .reportes import router as reportes_router
from .noticias import router as noticias_router
from .tramites import router as tramites_router
from .tramites_sugeridos import router as tramites_sugeridos_router
from .push import router as push_router
from .empleados_gestion import router as empleados_gestion_router
from .cuadrillas import router as cuadrillas_router
from .planificacion import router as planificacion_router
from .dependencias import router as dependencias_router
from .validacion_identidad import router as validacion_identidad_router
from .geocoding import router as geocoding_router
from .admin_audit import router as admin_audit_router
from .tasas import router as tasas_router
from .pagos import router as pagos_router
from .pagos_contaduria import router as pagos_contaduria_router
from .proveedores_pago import router as proveedores_pago_router
from .vecino import router as vecino_router
from .mock_padron import router as mock_padron_router
from .operador import router as operador_router
from .sidebar_config import admin_router as sidebar_admin_router, public_router as sidebar_public_router

api_router = APIRouter()

api_router.include_router(municipios_router, prefix="/municipios", tags=["Municipios"])
api_router.include_router(auth_router, prefix="/auth", tags=["Autenticación"])
api_router.include_router(users_router, prefix="/users", tags=["Usuarios"])
api_router.include_router(categorias_reclamo_router, prefix="/categorias-reclamo", tags=["Categorías Reclamo"])
api_router.include_router(categorias_reclamo_sugeridas_router, prefix="/categorias-reclamo-sugeridas", tags=["Categorías Reclamo Sugeridas"])
api_router.include_router(categorias_tramite_router, prefix="/categorias-tramite", tags=["Categorías Trámite"])
api_router.include_router(zonas_router, prefix="/zonas", tags=["Zonas"])
api_router.include_router(empleados_router, prefix="/empleados", tags=["Empleados"])
api_router.include_router(empleados_gestion_router, prefix="/empleados-gestion", tags=["Gestion Empleados"])
api_router.include_router(reclamos_router, prefix="/reclamos", tags=["Reclamos"])
api_router.include_router(configuracion_router, prefix="/configuracion", tags=["Configuración"])
api_router.include_router(notificaciones_router, prefix="/notificaciones", tags=["Notificaciones"])
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["Dashboard"])
api_router.include_router(chat_router, prefix="/chat", tags=["Chat IA"])
api_router.include_router(analytics_router, prefix="/analytics", tags=["Analytics"])
api_router.include_router(sla_router, prefix="/sla", tags=["SLA"])
api_router.include_router(exportar_router, prefix="/exportar", tags=["Exportar"])
api_router.include_router(whatsapp_router, prefix="/whatsapp", tags=["WhatsApp"])
api_router.include_router(turnos_router, prefix="/turnos", tags=["Turnos"])
api_router.include_router(calificaciones_router, prefix="/calificaciones", tags=["Calificaciones"])
api_router.include_router(escalado_router, prefix="/escalado", tags=["Auto-Escalado"])
api_router.include_router(emails_router, prefix="/emails", tags=["Emails"])
api_router.include_router(portal_publico_router, prefix="/publico", tags=["Portal Público"])
api_router.include_router(imagenes_router, tags=["Imágenes"])
api_router.include_router(gamificacion_router, prefix="/gamificacion", tags=["Gamificación"])
# api_router.include_router(reportes_router, prefix="/reportes", tags=["Reportes"])
api_router.include_router(noticias_router, prefix="/noticias", tags=["Noticias"])
api_router.include_router(tramites_router, prefix="/tramites", tags=["Trámites"])
api_router.include_router(tramites_sugeridos_router, prefix="/tramites-sugeridos", tags=["Trámites Sugeridos"])
api_router.include_router(push_router, tags=["Push Notifications"])
api_router.include_router(cuadrillas_router, prefix="/cuadrillas", tags=["Cuadrillas"])
api_router.include_router(planificacion_router, prefix="/planificacion", tags=["Planificación"])
api_router.include_router(dependencias_router, tags=["Dependencias"])  # Ya tiene prefix /dependencias
api_router.include_router(validacion_identidad_router)  # Ya tiene prefix /validacion-identidad
api_router.include_router(geocoding_router, prefix="/geocoding", tags=["Geocoding"])
api_router.include_router(admin_audit_router, tags=["Admin Audit"])  # ya tiene prefix /admin
api_router.include_router(tasas_router, tags=["Tasas"])  # ya tiene prefix /tasas
api_router.include_router(pagos_router, tags=["Pagos"])  # ya tiene prefix /pagos
api_router.include_router(pagos_contaduria_router, tags=["Pagos - Contaduria"])  # prefix /pagos/contaduria
api_router.include_router(proveedores_pago_router, prefix="/proveedores-pago", tags=["Proveedores Pago"])
api_router.include_router(vecino_router, tags=["Vecino"])  # ya tiene prefix /vecino
api_router.include_router(mock_padron_router)  # ya tiene prefix /mock
api_router.include_router(operador_router, tags=["Operador Ventanilla"])  # ya tiene prefix /operador
api_router.include_router(sidebar_admin_router)   # ya tiene prefix /admin/sidebar-items
api_router.include_router(sidebar_public_router)  # ya tiene prefix /navigation

# WebSockets
from .ws import router as ws_router
api_router.include_router(ws_router, tags=["WebSocket"])
