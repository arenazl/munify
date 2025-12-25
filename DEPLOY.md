# Deployment Guide

## Arquitectura de Producción

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Netlify      │────▶│     Heroku      │────▶│   Aiven MySQL   │
│   (Frontend)    │     │    (Backend)    │     │   (Database)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Backend (Heroku)

### 1. Crear app en Heroku
```bash
heroku create tu-app-backend
```

### 2. Configurar variables de entorno
```bash
# Database
heroku config:set DATABASE_URL="mysql+aiomysql://user:pass@host:port/db"

# JWT
heroku config:set SECRET_KEY="tu_secret_key_generado"
heroku config:set ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Cloudinary
heroku config:set CLOUDINARY_CLOUD_NAME="xxx"
heroku config:set CLOUDINARY_API_KEY="xxx"
heroku config:set CLOUDINARY_API_SECRET="xxx"

# App
heroku config:set ENVIRONMENT="production"
heroku config:set FRONTEND_URL="https://tu-app.netlify.app"

# AI (Gemini)
heroku config:set GEMINI_API_KEY="xxx"

# WhatsApp
heroku config:set WHATSAPP_PHONE_NUMBER_ID="xxx"
heroku config:set WHATSAPP_ACCESS_TOKEN="xxx"
heroku config:set WHATSAPP_BUSINESS_ACCOUNT_ID="xxx"

# CORS (importante!)
heroku config:set CORS_ORIGINS="https://tu-app.netlify.app"
```

### 3. Deploy
```bash
cd backend
git subtree push --prefix backend heroku main
```

O configurar el repo para deploy automático desde GitHub.

---

## Frontend (Netlify)

### 1. Conectar repositorio
- Ir a Netlify > New site from Git
- Seleccionar repositorio
- Configurar:
  - **Base directory:** `frontend`
  - **Build command:** `npm run build`
  - **Publish directory:** `frontend/dist`

### 2. Configurar variables de entorno
En Netlify > Site settings > Environment variables:

```
VITE_API_URL=https://tu-app-backend.herokuapp.com/api
```

### 3. Deploy
El deploy es automático con cada push a `main`.

---

## Variables de Entorno - Resumen

### Backend (Heroku)
| Variable | Descripción | Ejemplo Producción |
|----------|-------------|-------------------|
| `DATABASE_URL` | URL de la base de datos | `mysql+aiomysql://...` |
| `SECRET_KEY` | JWT secret (generar aleatorio) | `openssl rand -hex 32` |
| `ENVIRONMENT` | Entorno actual | `production` |
| `FRONTEND_URL` | URL del frontend (para WhatsApp) | `https://tu-app.netlify.app` |
| `CORS_ORIGINS` | Orígenes permitidos | `https://tu-app.netlify.app` |
| `CLOUDINARY_*` | Credenciales Cloudinary | - |
| `GEMINI_API_KEY` | API Key de Google AI | - |
| `WHATSAPP_*` | Credenciales Meta WhatsApp | - |

### Frontend (Netlify)
| Variable | Descripción | Ejemplo Producción |
|----------|-------------|-------------------|
| `VITE_API_URL` | URL del backend | `https://tu-app-backend.herokuapp.com/api` |

---

## Checklist Pre-Deploy

- [ ] `.env` NO está en el repo (verificar `.gitignore`)
- [ ] `FRONTEND_URL` apunta a Netlify
- [ ] `CORS_ORIGINS` incluye el dominio de Netlify
- [ ] `ENVIRONMENT=production` en Heroku
- [ ] Credenciales de WhatsApp actualizadas
- [ ] Base de datos accesible desde Heroku

---

## Troubleshooting

### CORS Errors
Si ves errores de CORS en producción:
1. Verificar que `CORS_ORIGINS` tenga la URL exacta de Netlify
2. No incluir `/` al final de la URL
3. Reiniciar el dyno: `heroku restart`

### WhatsApp no envía mensajes
1. Verificar que `FRONTEND_URL` sea la URL de producción
2. Verificar credenciales de WhatsApp en Heroku
3. Revisar logs: `heroku logs --tail`

### Database connection
Si hay errores de conexión:
1. Verificar que la IP de Heroku esté en whitelist de Aiven
2. Probar conexión: `heroku run python -c "from core.database import engine; print(engine)"`
