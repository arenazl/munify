from fastapi import APIRouter
from .auth import router as auth_router
from .users import router as users_router
from .categorias import router as categorias_router
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
from .push import router as push_router
from .empleados_gestion import router as empleados_gestion_router
from .cuadrillas import router as cuadrillas_router
from .planificacion import router as planificacion_router
from .direcciones import router as direcciones_router
from .dependencias import router as dependencias_router

api_router = APIRouter()

api_router.include_router(municipios_router, prefix="/municipios", tags=["Municipios"])
api_router.include_router(auth_router, prefix="/auth", tags=["Autenticación"])
api_router.include_router(users_router, prefix="/users", tags=["Usuarios"])
api_router.include_router(categorias_router, prefix="/categorias", tags=["Categorías"])
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
api_router.include_router(push_router, tags=["Push Notifications"])
api_router.include_router(cuadrillas_router, prefix="/cuadrillas", tags=["Cuadrillas"])
api_router.include_router(planificacion_router, prefix="/planificacion", tags=["Planificación"])
api_router.include_router(direcciones_router, prefix="/direcciones", tags=["Direcciones"])
api_router.include_router(dependencias_router, tags=["Dependencias"])  # Ya tiene prefix /dependencias

# WebSockets
from .ws import router as ws_router
api_router.include_router(ws_router, tags=["WebSocket"])
