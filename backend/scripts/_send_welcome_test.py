import sys, os, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
os.environ["SMTP_FROM_NAME"] = "Munify"
os.environ["SMTP_FROM"] = "info@munify.com.ar"
from services.email_service import email_service

# Isotipo sin texto, igual que el header de la landing
ISO = "https://munify.com.ar/images/munify_logo_no_text%20(1).png"
# Fuente de la landing para HEADERS (wordmark, eyebrow, títulos). El cuerpo va
# en la sans de lectura. Donde el cliente no cargue Manrope, cae al fallback.
HEADER_FONT = "'Manrope','Segoe UI',Helvetica,Arial,sans-serif"
# Wordmark con la fuente de la landing (Manrope), peso medio (no la gruesa 800)
WORDMARK_STYLE = (f"color:#2a2620;font-size:21px;font-weight:500;letter-spacing:-0.2px;"
                  f"font-family:{HEADER_FONT};")

def build_welcome(nombre, municipio, url, email_login, pass_plain):
    fila = lambda label, val, mono=False, last=False: (
        f'<tr><td style="padding:12px 16px;{"" if last else "border-bottom:1px solid #ece6d9;"}">'
        f'<div style="color:#6b6557;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:700;margin-bottom:3px;">{label}</div>'
        f'<div style="color:#2a2620;font-size:15px;font-weight:600;{"font-family:Consolas,Menlo,monospace;letter-spacing:0.5px;" if mono else ""}">{val}</div>'
        f'</td></tr>'
    )
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
        <td style="vertical-align:middle;"><img src="{ISO}" alt="Munify" height="32" style="display:block;height:32px;border:0;"></td>
        <td style="vertical-align:middle;padding-left:11px;"><span style="{WORDMARK_STYLE}">Munify</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#0a1531;background:radial-gradient(circle at 85% 14%,rgba(63,106,200,0.40) 0%,rgba(63,106,200,0) 55%),linear-gradient(158deg,#16224e 0%,#101d42 58%,#0a1531 100%);padding:30px 32px;">
      <div style="color:#9fb3e6;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;font-family:{HEADER_FONT};">Acceso al sistema</div>
      <h1 style="margin:8px 0 0;color:#ffffff;font-size:26px;line-height:1.25;font-weight:600;font-family:{HEADER_FONT};">Tu municipio ya está en Munify</h1>
      <div style="margin:8px 0 0;color:#c2cadc;font-size:14px;">{municipio}</div>
    </td></tr>
    <tr><td style="padding:30px 32px;background:#fffdf9;">
      <p style="margin:0 0 14px;color:#2a2620;font-size:15px;">Hola <strong>{nombre}</strong>,</p>
      <p style="margin:0 0 24px;color:#3a342c;font-size:14px;line-height:1.65;">La cuenta de administración de <strong>{municipio}</strong> ya está activa. Con estos datos podés ingresar a gestionar reclamos, trámites, tesorería y la configuración del municipio.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f2e8;border:1px solid #ece6d9;border-radius:12px;margin-bottom:26px;">
        {fila("Municipio", municipio)}
        {fila("Dirección de acceso", f'<a href="{url}" style="color:#112a6c;text-decoration:none;">{url.replace("https://","")}</a>')}
        {fila("Usuario", email_login, mono=True)}
        {fila("Contraseña", pass_plain, mono=True, last=True)}
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

async def main():
    html = build_welcome(
        nombre="Bartolo",
        municipio="San Pedro Norte",
        url="https://app.munify.com.ar/san-pedro-norte",
        email_login="munisanpedronorte@gmail.com",
        pass_plain="Sanpedronorte26",
    )
    subject = "Bienvenido a Munify - Acceso de San Pedro Norte"
    # Envío final al cliente + copia al operador
    destinatarios = ["munisanpedronorte@gmail.com", "arenazl@gmail.com"]
    for to in destinatarios:
        ok = await email_service.send_email(to_email=to, subject=subject, body_html=html)
        print(f"{'OK ' if ok else 'FALLO'} -> {to}")

asyncio.run(main())
