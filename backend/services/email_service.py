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
    def reclamo_creado(reclamo_titulo: str, reclamo_id: int, categoria: str) -> str:
        content = f"""
        <h2>✅ Reclamo Registrado</h2>
        <p>Su reclamo ha sido registrado exitosamente en nuestro sistema.</p>

        <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Número de reclamo:</strong> #{reclamo_id}</p>
            <p><strong>Título:</strong> {reclamo_titulo}</p>
            <p><strong>Categoría:</strong> {categoria}</p>
            <p><strong>Estado:</strong> <span class="status status-nuevo">NUEVO</span></p>
        </div>

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


# Singleton
email_service = EmailService()
