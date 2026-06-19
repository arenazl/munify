"""Servicio de envío de emails"""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Optional
import os
from core.logger import get_logger

logger = get_logger("email_service")


class EmailService:
    """Servicio para enviar emails"""

    def __init__(self):
        self.smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER", "")
        self.smtp_password = os.getenv("SMTP_PASSWORD", "")
        self.from_email = os.getenv("SMTP_FROM", "noreply@municipalidad.gob.ar")
        self.from_name = os.getenv("SMTP_FROM_NAME", "Sistema de Reclamos Municipal")

    def _get_connection(self):
        """Crear conexión SMTP"""
        if not self.smtp_user or not self.smtp_password:
            logger.warning("Credenciales SMTP no configuradas")
            return None

        try:
            server = smtplib.SMTP(self.smtp_host, self.smtp_port)
            server.starttls()
            server.login(self.smtp_user, self.smtp_password)
            return server
        except Exception as e:
            logger.error(f"Error conectando a SMTP: {e}")
            return None

    async def send_email(
        self,
        to_email: str,
        subject: str,
        body_html: str,
        body_text: Optional[str] = None
    ) -> bool:
        """Enviar un email"""
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email

            # Texto plano
            if body_text:
                msg.attach(MIMEText(body_text, 'plain'))

            # HTML
            msg.attach(MIMEText(body_html, 'html'))

            server = self._get_connection()
            if not server:
                logger.warning(f"Email no enviado (SMTP no configurado): {subject} -> {to_email}")
                return False

            server.sendmail(self.from_email, to_email, msg.as_string())
            server.quit()

            logger.info(f"Email enviado: {subject} -> {to_email}")
            return True

        except Exception as e:
            logger.error(f"Error enviando email: {e}")
            return False

    async def send_bulk_email(
        self,
        to_emails: List[str],
        subject: str,
        body_html: str,
        body_text: Optional[str] = None
    ) -> dict:
        """Enviar email a múltiples destinatarios"""
        results = {"sent": 0, "failed": 0, "errors": []}

        for email in to_emails:
            success = await self.send_email(email, subject, body_html, body_text)
            if success:
                results["sent"] += 1
            else:
                results["failed"] += 1
                results["errors"].append(email)

        return results


# Templates de email
class EmailTemplates:
    """Templates HTML para emails"""

    @staticmethod
    def base_template(content: str, title: str = "Sistema de Reclamos Municipal") -> str:
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>{title}</title>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }}
                .footer {{ background: #333; color: #999; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }}
                .button {{ display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }}
                .status {{ display: inline-block; padding: 5px 10px; border-radius: 15px; font-size: 12px; font-weight: bold; }}
                .status-nuevo {{ background: #e3f2fd; color: #1976d2; }}
                .status-asignado {{ background: #fff3e0; color: #f57c00; }}
                .status-proceso {{ background: #e8f5e9; color: #388e3c; }}
                .status-resuelto {{ background: #e8f5e9; color: #2e7d32; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🏛️ Sistema de Reclamos Municipal</h1>
                </div>
                <div class="content">
                    {content}
                </div>
                <div class="footer">
                    <p>Este es un mensaje automático. Por favor no responda a este email.</p>
                    <p>© 2024 Municipalidad - Sistema de Gestión de Reclamos</p>
                </div>
            </div>
        </body>
        </html>
        """

    @staticmethod
    def reclamo_creado(reclamo_titulo: str, reclamo_id: int, categoria: str, descripcion: str = None, creador_nombre: str = None) -> str:
        descripcion_html = ""
        if descripcion:
            descripcion_preview = descripcion[:300] + "..." if len(descripcion) > 300 else descripcion
            descripcion_html = f"""
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #667eea;">
                <p style="margin: 0 0 5px 0; font-weight: bold; color: #667eea;">Descripción:</p>
                <p style="margin: 0; font-size: 14px; color: #333;">{descripcion_preview}</p>
            </div>
            """

        creador_html = f"<p><strong>Vecino:</strong> {creador_nombre}</p>" if creador_nombre else ""

        content = f"""
        <h2>✅ Reclamo Registrado</h2>
        <p>Su reclamo ha sido registrado exitosamente en nuestro sistema.</p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Número de reclamo:</strong> #{reclamo_id}</p>
            <p><strong>Título:</strong> {reclamo_titulo}</p>
            <p><strong>Categoría:</strong> {categoria}</p>
            {creador_html}
            <p><strong>Estado:</strong> <span class="status status-nuevo">NUEVO</span></p>
        </div>

        {descripcion_html}

        <p>Puede hacer seguimiento de su reclamo ingresando a nuestra plataforma.</p>
        <p>Le notificaremos cuando haya actualizaciones sobre su reclamo.</p>
        """
        return EmailTemplates.base_template(content)

    @staticmethod
    def reclamo_asignado(reclamo_titulo: str, reclamo_id: int, cuadrilla: str, fecha_programada: Optional[str] = None) -> str:
        fecha_info = f"<p><strong>Fecha programada:</strong> {fecha_programada}</p>" if fecha_programada else ""
        content = f"""
        <h2>👷 Reclamo Asignado</h2>
        <p>Su reclamo ha sido asignado a un equipo de trabajo.</p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Número de reclamo:</strong> #{reclamo_id}</p>
            <p><strong>Título:</strong> {reclamo_titulo}</p>
            <p><strong>Asignado a:</strong> {cuadrilla}</p>
            {fecha_info}
            <p><strong>Estado:</strong> <span class="status status-asignado">ASIGNADO</span></p>
        </div>

        <p>Pronto comenzaremos a trabajar en la solución de su reclamo.</p>
        """
        return EmailTemplates.base_template(content)

    @staticmethod
    def reclamo_en_proceso(reclamo_titulo: str, reclamo_id: int) -> str:
        content = f"""
        <h2>🔧 Trabajo en Proceso</h2>
        <p>El equipo asignado ha comenzado a trabajar en su reclamo.</p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Número de reclamo:</strong> #{reclamo_id}</p>
            <p><strong>Título:</strong> {reclamo_titulo}</p>
            <p><strong>Estado:</strong> <span class="status status-proceso">EN PROCESO</span></p>
        </div>

        <p>Le notificaremos cuando el trabajo haya sido completado.</p>
        """
        return EmailTemplates.base_template(content)

    @staticmethod
    def reclamo_resuelto(reclamo_titulo: str, reclamo_id: int, resolucion: str) -> str:
        content = f"""
        <h2>🎉 Reclamo Resuelto</h2>
        <p>Nos complace informarle que su reclamo ha sido resuelto.</p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Número de reclamo:</strong> #{reclamo_id}</p>
            <p><strong>Título:</strong> {reclamo_titulo}</p>
            <p><strong>Estado:</strong> <span class="status status-resuelto">RESUELTO</span></p>
            <p><strong>Resolución:</strong></p>
            <p style="background: #f5f5f5; padding: 10px; border-radius: 5px;">{resolucion}</p>
        </div>

        <h3>📝 ¡Su opinión es importante!</h3>
        <p>Por favor califique la atención recibida para ayudarnos a mejorar nuestro servicio.</p>
        <a href="#" class="button">Calificar Atención</a>
        """
        return EmailTemplates.base_template(content)

    @staticmethod
    def alerta_escalado(reclamo_titulo: str, reclamo_id: int, tipo_escalado: str, horas_transcurridas: int) -> str:
        content = f"""
        <h2>⚠️ Alerta de Escalado</h2>
        <p>Un reclamo requiere atención urgente.</p>

        <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; border: 1px solid #ffc107;">
            <p><strong>Número de reclamo:</strong> #{reclamo_id}</p>
            <p><strong>Título:</strong> {reclamo_titulo}</p>
            <p><strong>Motivo:</strong> {tipo_escalado.replace('_', ' ').title()}</p>
            <p><strong>Tiempo transcurrido:</strong> {horas_transcurridas} horas</p>
        </div>

        <p>Por favor tome las acciones necesarias para atender este reclamo.</p>
        <a href="#" class="button">Ver Reclamo</a>
        """
        return EmailTemplates.base_template(content, "Alerta - Sistema de Reclamos")

    @staticmethod
    def resumen_diario(stats: dict) -> str:
        content = f"""
        <h2>📊 Resumen Diario de Reclamos</h2>
        <p>Aquí está el resumen de actividad del día:</p>

        <div style="display: flex; flex-wrap: wrap; gap: 10px; margin: 15px 0;">
            <div style="background: #e3f2fd; padding: 15px; border-radius: 5px; flex: 1; min-width: 120px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #1976d2;">{stats.get('nuevos', 0)}</div>
                <div style="color: #666;">Nuevos</div>
            </div>
            <div style="background: #fff3e0; padding: 15px; border-radius: 5px; flex: 1; min-width: 120px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #f57c00;">{stats.get('asignados', 0)}</div>
                <div style="color: #666;">Asignados</div>
            </div>
            <div style="background: #e8f5e9; padding: 15px; border-radius: 5px; flex: 1; min-width: 120px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #388e3c;">{stats.get('resueltos', 0)}</div>
                <div style="color: #666;">Resueltos</div>
            </div>
        </div>

        <h3>📈 Métricas del día</h3>
        <ul>
            <li>Total de reclamos activos: {stats.get('total_activos', 0)}</li>
            <li>Tiempo promedio de resolución: {stats.get('tiempo_promedio', 'N/A')} horas</li>
            <li>Reclamos próximos a vencer SLA: {stats.get('proximos_vencer', 0)}</li>
        </ul>
        """
        return EmailTemplates.base_template(content, "Resumen Diario - Reclamos")

    @staticmethod
    def validacion_email(nombre: str, codigo: str, nuevo_email: str) -> str:
        content = f"""
        <h2>🔐 Validación de Email</h2>
        <p>Hola {nombre},</p>
        <p>Recibimos una solicitud para cambiar el email de tu cuenta a <strong>{nuevo_email}</strong>.</p>

        <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center;">
            <p style="font-size: 14px; color: #666; margin-bottom: 10px;">Tu código de validación es:</p>
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-size: 36px; font-weight: bold; letter-spacing: 8px; padding: 20px; border-radius: 8px; font-family: monospace;">
                {codigo}
            </div>
            <p style="font-size: 12px; color: #999; margin-top: 10px;">Este código expira en 15 minutos</p>
        </div>

        <p>Si no solicitaste este cambio, por favor ignora este email. Tu email actual seguirá siendo el mismo.</p>

        <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ffc107;">
            <p style="margin: 0; font-size: 13px;"><strong>Importante:</strong> Nunca compartas este código con nadie. Nuestro equipo nunca te pedirá este código por teléfono o email.</p>
        </div>
        """
        return EmailTemplates.base_template(content, "Validación de Email - Sistema Municipal")

    @staticmethod
    def nuevo_comentario(reclamo_titulo: str, reclamo_id: int, autor_nombre: str, comentario: str) -> str:
        # Truncar comentario si es muy largo
        comentario_preview = comentario[:200] + "..." if len(comentario) > 200 else comentario
        content = f"""
        <h2>💬 Nuevo Comentario en tu Reclamo</h2>
        <p><strong>{autor_nombre}</strong> ha dejado un comentario en tu reclamo.</p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Número de reclamo:</strong> #{reclamo_id}</p>
            <p><strong>Título:</strong> {reclamo_titulo}</p>
        </div>

        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #667eea;">
            <p style="margin: 0; font-size: 14px; color: #333;">{comentario_preview}</p>
        </div>

        <p>Ingresá a la plataforma para ver el comentario completo y responder.</p>
        """
        return EmailTemplates.base_template(content, "Nuevo Comentario - Sistema Municipal")

    # ============================================
    # Templates para TRÁMITES/SOLICITUDES
    # ============================================

    @staticmethod
    def solicitud_creada(
        numero_tramite: str,
        tramite_nombre: str,
        asunto: str,
        descripcion: str = None,
        solicitante_nombre: str = None
    ) -> str:
        descripcion_html = ""
        if descripcion:
            descripcion_preview = descripcion[:300] + "..." if len(descripcion) > 300 else descripcion
            descripcion_html = f"""
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #667eea;">
                <p style="margin: 0 0 5px 0; font-weight: bold; color: #667eea;">Descripción:</p>
                <p style="margin: 0; font-size: 14px; color: #333;">{descripcion_preview}</p>
            </div>
            """

        solicitante_html = f"<p><strong>Solicitante:</strong> {solicitante_nombre}</p>" if solicitante_nombre else ""

        content = f"""
        <h2>📄 Trámite Registrado</h2>
        <p>Su trámite ha sido registrado exitosamente en nuestro sistema.</p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Número de trámite:</strong> #{numero_tramite}</p>
            <p><strong>Tipo:</strong> {tramite_nombre}</p>
            <p><strong>Asunto:</strong> {asunto}</p>
            {solicitante_html}
            <p><strong>Estado:</strong> <span class="status status-nuevo">RECIBIDO</span></p>
        </div>

        {descripcion_html}

        <p>Puede hacer seguimiento de su trámite ingresando a nuestra plataforma.</p>
        <p>Le notificaremos cuando haya actualizaciones sobre su trámite.</p>
        """
        return EmailTemplates.base_template(content, "Trámite Registrado - Sistema Municipal")

    @staticmethod
    def solicitud_cambio_estado(numero_tramite: str, estado_nuevo: str, mensaje: str) -> str:
        # Determinar color según estado
        estado_class = "status-proceso"
        emoji = "📋"
        if estado_nuevo.lower() in ["finalizado", "aprobado"]:
            estado_class = "status-resuelto"
            emoji = "🎉"
        elif estado_nuevo.lower() == "rechazado":
            estado_class = "status-nuevo"  # rojo
            emoji = "❌"
        elif estado_nuevo.lower() == "en proceso":
            emoji = "🔄"

        content = f"""
        <h2>{emoji} Estado de Trámite Actualizado</h2>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Número de trámite:</strong> #{numero_tramite}</p>
            <p><strong>Nuevo estado:</strong> <span class="status {estado_class}">{estado_nuevo.upper()}</span></p>
        </div>

        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #667eea;">
            <p style="margin: 0; font-size: 14px; color: #333;">{mensaje}</p>
        </div>

        <p>Puede hacer seguimiento de su trámite ingresando a nuestra plataforma.</p>
        """
        return EmailTemplates.base_template(content, "Actualización de Trámite - Sistema Municipal")

    @staticmethod
    def solicitud_finalizada(numero_tramite: str, tramite_nombre: str, respuesta: str = None) -> str:
        respuesta_html = ""
        if respuesta:
            respuesta_html = f"""
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #388e3c;">
                <p style="margin: 0 0 5px 0; font-weight: bold; color: #388e3c;">Resolución:</p>
                <p style="margin: 0; font-size: 14px; color: #333;">{respuesta}</p>
            </div>
            """

        content = f"""
        <h2>🎉 Trámite Finalizado</h2>
        <p>Nos complace informarle que su trámite ha sido completado exitosamente.</p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Número de trámite:</strong> #{numero_tramite}</p>
            <p><strong>Tipo:</strong> {tramite_nombre}</p>
            <p><strong>Estado:</strong> <span class="status status-resuelto">FINALIZADO</span></p>
        </div>

        {respuesta_html}

        <p>Gracias por utilizar nuestro sistema de trámites.</p>
        """
        return EmailTemplates.base_template(content, "Trámite Finalizado - Sistema Municipal")

    @staticmethod
    def solicitud_rechazada(numero_tramite: str, tramite_nombre: str, motivo: str = None) -> str:
        motivo_html = ""
        if motivo:
            motivo_html = f"""
            <div style="background: #ffebee; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ef4444;">
                <p style="margin: 0 0 5px 0; font-weight: bold; color: #ef4444;">Motivo del rechazo:</p>
                <p style="margin: 0; font-size: 14px; color: #333;">{motivo}</p>
            </div>
            """

        content = f"""
        <h2>❌ Trámite Rechazado</h2>
        <p>Lamentamos informarle que su trámite ha sido rechazado.</p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Número de trámite:</strong> #{numero_tramite}</p>
            <p><strong>Tipo:</strong> {tramite_nombre}</p>
            <p><strong>Estado:</strong> <span style="background: #ffebee; color: #ef4444; padding: 5px 10px; border-radius: 15px; font-size: 12px; font-weight: bold;">RECHAZADO</span></p>
        </div>

        {motivo_html}

        <p>Si tiene dudas o desea más información, puede contactarse con nosotros.</p>
        """
        return EmailTemplates.base_template(content, "Trámite Rechazado - Sistema Municipal")

    @staticmethod
    def bienvenida_municipio(
        nombre: str,
        municipio: str,
        url: str,
        email_login: str,
        password: str,
    ) -> str:
        """
        Correo de bienvenida / entrega de credenciales a un municipio productivo.
        Diseño alineado a la landing (header crema con lockup Munify, hero marino,
        tipografía Manrope en los headers). SIN emojis.
        """
        iso = "https://munify.com.ar/images/munify_logo_no_text%20(1).png"
        header_font = "'Manrope','Segoe UI',Helvetica,Arial,sans-serif"
        wordmark = (
            f"color:#2a2620;font-size:21px;font-weight:500;letter-spacing:-0.2px;"
            f"font-family:{header_font};"
        )

        def fila(label: str, val: str, mono: bool = False, last: bool = False) -> str:
            borde = "" if last else "border-bottom:1px solid #ece6d9;"
            mono_css = "font-family:Consolas,Menlo,monospace;letter-spacing:0.5px;" if mono else ""
            return (
                f'<tr><td style="padding:12px 16px;{borde}">'
                f'<div style="color:#6b6557;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:700;margin-bottom:3px;">{label}</div>'
                f'<div style="color:#2a2620;font-size:15px;font-weight:600;{mono_css}">{val}</div>'
                f'</td></tr>'
            )

        url_visible = url.replace("https://", "").replace("http://", "")
        return f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bienvenido a Munify</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#faf7f1;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f1;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffdf9;border:1px solid #ece6d9;border-radius:16px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;box-shadow:0 8px 30px rgba(10,27,72,0.10);">
    <tr><td style="height:4px;background:#112a6c;background:linear-gradient(90deg,#112a6c 0%,#3f6ac8 70%,#7aa0ec 100%);font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="background:#faf7f1;padding:18px 32px;border-bottom:1px solid #ece6d9;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;"><img src="{iso}" alt="Munify" height="32" style="display:block;height:32px;border:0;"></td>
        <td style="vertical-align:middle;padding-left:11px;"><span style="{wordmark}">Munify</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#0a1531;background:radial-gradient(circle at 85% 14%,rgba(63,106,200,0.40) 0%,rgba(63,106,200,0) 55%),linear-gradient(158deg,#16224e 0%,#101d42 58%,#0a1531 100%);padding:30px 32px;">
      <div style="color:#9fb3e6;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;font-family:{header_font};">Acceso al sistema</div>
      <h1 style="margin:8px 0 0;color:#ffffff;font-size:26px;line-height:1.25;font-weight:600;font-family:{header_font};">Tu municipio ya está en Munify</h1>
      <div style="margin:8px 0 0;color:#c2cadc;font-size:14px;">{municipio}</div>
    </td></tr>
    <tr><td style="padding:30px 32px;background:#fffdf9;">
      <p style="margin:0 0 14px;color:#2a2620;font-size:15px;">Hola <strong>{nombre}</strong>,</p>
      <p style="margin:0 0 24px;color:#3a342c;font-size:14px;line-height:1.65;">La cuenta de administración de <strong>{municipio}</strong> ya está activa. Con estos datos podés ingresar a gestionar reclamos, trámites, tesorería y la configuración del municipio.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f2e8;border:1px solid #ece6d9;border-radius:12px;margin-bottom:26px;">
        {fila("Municipio", municipio)}
        {fila("Dirección de acceso", f'<a href="{url}" style="color:#112a6c;text-decoration:none;">{url_visible}</a>')}
        {fila("Usuario", email_login, mono=True)}
        {fila("Contraseña", password, mono=True, last=True)}
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#112a6c;">
        <a href="{url}" style="display:inline-block;padding:14px 30px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;">Ingresar a Munify</a>
      </td></tr></table>
    </td></tr>
    <tr><td style="background:#0a1b48;padding:22px 32px;text-align:center;">
      <div style="color:#c2cadc;font-size:13px;">¿Consultas o preguntas? Escribinos a <a href="mailto:info@munify.com.ar" style="color:#9fb3e6;text-decoration:none;font-weight:600;">info@munify.com.ar</a></div>
      <div style="margin:10px 0 0;color:#5b6a93;font-size:11px;">Munify — Plataforma de gestión municipal · Mensaje automático</div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>"""


# Singleton
email_service = EmailService()
