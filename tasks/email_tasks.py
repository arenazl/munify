"""
Tareas de Celery para envío de emails asíncrono.
"""
from core.celery_app import celery_app
from core.config import settings
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import asyncio


def run_async(coro):
    """Helper para ejecutar coroutines en Celery."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _send_email(to: str, subject: str, body: str, html: str = None):
    """Enviar email usando aiosmtplib."""
    if not settings.SMTP_HOST:
        print(f"[EMAIL] SMTP no configurado. Email a {to} no enviado.")
        return False

    message = MIMEMultipart("alternative")
    message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM}>"
    message["To"] = to
    message["Subject"] = subject

    # Agregar cuerpo de texto
    message.attach(MIMEText(body, "plain"))

    # Agregar HTML si existe
    if html:
        message.attach(MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
        return True
    except Exception as e:
        print(f"[EMAIL] Error enviando a {to}: {e}")
        raise


@celery_app.task(bind=True, max_retries=3)
def send_email_task(self, to: str, subject: str, body: str, html: str = None):
    """
    Tarea de Celery para enviar email.
    Se reintenta hasta 3 veces en caso de error.
    """
    try:
        result = run_async(_send_email(to, subject, body, html))
        return {"success": True, "to": to}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task
def send_reclamo_creado_email(email: str, numero: str, titulo: str):
    """Enviar email cuando se crea un reclamo."""
    subject = f"Reclamo #{numero} creado exitosamente"
    body = f"""
Hola,

Tu reclamo ha sido registrado con éxito.

Número: {numero}
Título: {titulo}

Puedes seguir el estado de tu reclamo ingresando al sistema.

Saludos,
Sistema de Reclamos Municipales
"""
    html = f"""
<h2>Reclamo registrado</h2>
<p>Tu reclamo ha sido registrado con éxito.</p>
<ul>
    <li><strong>Número:</strong> {numero}</li>
    <li><strong>Título:</strong> {titulo}</li>
</ul>
<p>Puedes seguir el estado de tu reclamo ingresando al sistema.</p>
"""
    return send_email_task.delay(email, subject, body, html)


@celery_app.task
def send_reclamo_asignado_email(email: str, numero: str, cuadrilla: str):
    """Enviar email cuando se asigna un reclamo."""
    subject = f"Reclamo #{numero} asignado"
    body = f"""
Hola,

Tu reclamo #{numero} ha sido asignado a la cuadrilla: {cuadrilla}

Pronto se pondrán en contacto o realizarán el trabajo.

Saludos,
Sistema de Reclamos Municipales
"""
    return send_email_task.delay(email, subject, body)


@celery_app.task
def send_reclamo_resuelto_email(email: str, numero: str, resolucion: str):
    """Enviar email cuando se resuelve un reclamo."""
    subject = f"Reclamo #{numero} resuelto"
    body = f"""
Hola,

¡Buenas noticias! Tu reclamo #{numero} ha sido resuelto.

Resolución: {resolucion}

Por favor, ingresa al sistema para calificar la atención recibida.

Saludos,
Sistema de Reclamos Municipales
"""
    return send_email_task.delay(email, subject, body)
