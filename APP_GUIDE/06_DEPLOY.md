# DOCUMENTO DE DEPLOY

## 1. Arquitectura de Infraestructura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            INTERNET                                     │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    NETLIFY      │     │     HEROKU      │     │     AIVEN       │
│   (Frontend)    │────►│    (Backend)    │────►│   (Database)    │
│                 │     │                 │     │                 │
│ tu-app.netlify  │     │ tu-api.heroku   │     │ mysql.aiven     │
│     .app        │     │   .com          │     │  cloud.com      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       ▼                       │
        │               ┌─────────────────┐             │
        │               │   CLOUDINARY    │             │
        │               │  (File Storage) │             │
        │               └─────────────────┘             │
        │                                               │
        └───────────────────────────────────────────────┘
```

---

## 2. Aiven - Base de Datos MySQL

### 2.1 Crear Servicio

1. Ir a [https://aiven.io](https://aiven.io)
2. Registrarse/Login
3. Create Service → MySQL
4. Seleccionar:
   - **Plan:** Free (Hobbyist) o superior
   - **Cloud:** Google Cloud / AWS
   - **Region:** La más cercana a usuarios

### 2.2 Obtener Credenciales

Una vez creado el servicio, ir a **Overview** y copiar:

```
Host:     mysql-[proyecto]-[usuario].e.aivencloud.com
Port:     23108
Database: defaultdb (o crear uno nuevo)
User:     avnadmin
Password: [password generado]
```

### 2.3 Crear Base de Datos

Conectarse con cliente MySQL o desde Aiven Console:

```sql
CREATE DATABASE nombre_proyecto CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2.4 Configuración de Conexión SSL

Aiven requiere SSL. Descargar el certificado CA desde la consola:

```
Service Settings → CA Certificate → Download
```

Para SQLAlchemy:
```python
# Si es necesario SSL explícito
DATABASE_URL = f"mysql+aiomysql://{user}:{password}@{host}:{port}/{db}?ssl=true"
```

### 2.5 Variables de Entorno Resultantes

```env
DB_HOST=mysql-[proyecto]-[usuario].e.aivencloud.com
DB_PORT=23108
DB_NAME=nombre_proyecto
DB_USER=avnadmin
DB_PASSWORD=AVNS_xxxxxxxxxxxx
```

---

## 3. Heroku - Backend API

### 3.1 Instalación de Heroku CLI

```bash
# Windows (con npm)
npm install -g heroku

# Mac
brew tap heroku/brew && brew install heroku

# Login
heroku login
```

### 3.2 Crear Aplicación

```bash
cd backend

# Crear app
heroku create nombre-api

# O con nombre específico
heroku create mi-proyecto-api --region us
```

### 3.3 Configurar Git Remote

```bash
# Verificar remote
git remote -v

# Si no existe, agregar
heroku git:remote -a nombre-api
```

### 3.4 Configurar Variables de Entorno

```bash
# Database
heroku config:set DB_HOST=mysql-xxx.aivencloud.com
heroku config:set DB_PORT=23108
heroku config:set DB_NAME=nombre_db
heroku config:set DB_USER=avnadmin
heroku config:set DB_PASSWORD=AVNS_xxxx

# Security
heroku config:set SECRET_KEY=tu-clave-secreta-muy-larga
heroku config:set ALGORITHM=HS256
heroku config:set ACCESS_TOKEN_EXPIRE_MINUTES=1440

# App
heroku config:set APP_NAME=MiApp
heroku config:set APP_VERSION=1.0.0
heroku config:set APP_DEBUG=False

# CORS (importante!)
heroku config:set CORS_ORIGINS='["https://mi-app.netlify.app","http://localhost:5173"]'

# Cloudinary
heroku config:set CLOUDINARY_CLOUD_NAME=xxxxx
heroku config:set CLOUDINARY_API_KEY=xxxxx
heroku config:set CLOUDINARY_API_SECRET=xxxxx

# AI (opcional)
heroku config:set GROK_API_KEY=xxxxx
```

### 3.5 Verificar Variables

```bash
heroku config --app nombre-api
```

### 3.6 Archivos Requeridos

**Procfile:**
```
web: uvicorn main:app --host=0.0.0.0 --port=${PORT:-5000}
```

**runtime.txt:**
```
python-3.11.7
```

O mejor, usar **.python-version** (nuevo formato):
```
3.11
```

### 3.7 Deploy

```bash
# Commit cambios
git add .
git commit -m "Ready for deploy"

# Push a Heroku
git push heroku master

# O si usas main
git push heroku main
```

### 3.8 Verificar Deploy

```bash
# Ver logs
heroku logs --tail --app nombre-api

# Abrir app
heroku open --app nombre-api

# Ejecutar comando
heroku run "python script.py" --app nombre-api
```

### 3.9 Comandos Útiles

```bash
# Reiniciar app
heroku restart --app nombre-api

# Ver estado
heroku ps --app nombre-api

# Escalar dynos
heroku ps:scale web=1 --app nombre-api

# Ver logs específicos
heroku logs -n 100 --app nombre-api
```

---

## 4. Netlify - Frontend

### 4.1 Instalación de Netlify CLI

```bash
npm install -g netlify-cli

# Login
netlify login
```

### 4.2 Crear Sitio

**Opción A - Desde CLI:**
```bash
cd frontend

# Inicializar
netlify init

# O crear nuevo sitio
netlify sites:create --name mi-app
```

**Opción B - Desde Web:**
1. Ir a [https://app.netlify.com](https://app.netlify.com)
2. Add new site → Import from Git
3. Conectar repositorio
4. Configurar build settings

### 4.3 Configuración de Build

**netlify.toml:**
```toml
[build]
  publish = "dist"
  command = "npm run build"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### 4.4 Variables de Entorno

Desde CLI:
```bash
netlify env:set VITE_API_URL https://mi-api.herokuapp.com
```

O desde la web:
1. Site settings → Environment variables
2. Add variable

### 4.5 Deploy Manual

```bash
# Build
npm run build

# Deploy preview
netlify deploy --dir=dist

# Deploy producción
netlify deploy --prod --dir=dist

# Deploy con site específico
netlify deploy --prod --dir=dist --site=site-id
```

### 4.6 Deploy Automático

Con Git conectado, cada push a `main` dispara deploy automático.

### 4.7 Obtener Site ID

```bash
netlify sites:list
```

Output:
```
mi-app - d05be2e9-53e5-47f6-b5d4-a42e179eebb7
  url: https://mi-app.netlify.app
```

### 4.8 Comandos Útiles

```bash
# Estado del sitio
netlify status

# Abrir sitio
netlify open

# Ver deploys
netlify deploys

# Logs de funciones
netlify functions:log
```

---

## 5. Cloudinary - File Storage

### 5.1 Crear Cuenta

1. Ir a [https://cloudinary.com](https://cloudinary.com)
2. Sign up (plan free disponible)
3. Ir a Dashboard

### 5.2 Obtener Credenciales

En el Dashboard encontrar:

```
Cloud Name: di39tigkf
API Key:    986738179528233
API Secret: k1cxARGZPqw9oxn09scf8N16_oM
```

### 5.3 Configurar en Backend

```python
import cloudinary

cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET")
)
```

### 5.4 Límites del Plan Free

- 25 GB storage
- 25 GB bandwidth/mes
- Transformaciones limitadas

---

## 6. Flujo de Deploy Completo

### 6.1 Primera Vez

```bash
# 1. Configurar Aiven
#    - Crear servicio MySQL
#    - Crear base de datos
#    - Obtener credenciales

# 2. Configurar Heroku
cd backend
heroku create mi-api
heroku config:set [todas las variables]
git push heroku master

# 3. Crear tablas en DB
heroku run "python create_tables.py" --app mi-api

# 4. Configurar Netlify
cd frontend
netlify sites:create --name mi-app
netlify env:set VITE_API_URL https://mi-api.herokuapp.com
npm run build
netlify deploy --prod --dir=dist

# 5. Actualizar CORS en Heroku
heroku config:set CORS_ORIGINS='["https://mi-app.netlify.app"]' --app mi-api
```

### 6.2 Deploys Posteriores

```bash
# Backend
cd backend
git add . && git commit -m "changes"
git push heroku master

# Frontend
cd frontend
npm run build
netlify deploy --prod --dir=dist --site=[site-id]
```

### 6.3 Script de Deploy (Opcional)

```bash
#!/bin/bash
# deploy.sh

echo "🚀 Deploying Backend..."
cd backend
git push heroku master

echo "🎨 Building Frontend..."
cd ../frontend
npm run build

echo "📤 Deploying Frontend..."
netlify deploy --prod --dir=dist --site=d05be2e9-53e5-47f6-b5d4-a42e179eebb7

echo "✅ Deploy Complete!"
```

---

## 7. Monitoreo y Logs

### 7.1 Heroku Logs

```bash
# Logs en tiempo real
heroku logs --tail --app mi-api

# Últimas N líneas
heroku logs -n 200 --app mi-api

# Filtrar por tipo
heroku logs --source app --app mi-api
```

### 7.2 Netlify Logs

```bash
# Logs de funciones
netlify functions:log

# Ver en web
# Site → Deploys → Ver deploy logs
```

### 7.3 Aiven Logs

- Desde la consola web
- Service → Logs

---

## 8. Troubleshooting

### 8.1 Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `H10 - App crashed` | Error en código | Ver logs: `heroku logs --tail` |
| `CORS error` | Origins mal configurados | Verificar `CORS_ORIGINS` en Heroku |
| `Connection refused` (DB) | Credenciales incorrectas | Verificar variables de DB |
| `401 Unauthorized` | Token expirado | Verificar `SECRET_KEY` |
| `Build failed` (Netlify) | Error en build | Ver logs de build |

### 8.2 Verificar Conexión a DB

```bash
heroku run "python -c \"from core.database import engine; print('OK')\"" --app mi-api
```

### 8.3 Reiniciar Servicios

```bash
# Heroku
heroku restart --app mi-api

# Netlify - Redeploy desde web o CLI
netlify deploy --prod --dir=dist
```

---

## 9. Checklist de Deploy

### Pre-Deploy
- [ ] Variables de entorno definidas
- [ ] Archivos de configuración creados (Procfile, netlify.toml)
- [ ] Tests pasando
- [ ] Build de frontend exitoso

### Aiven
- [ ] Servicio MySQL creado
- [ ] Base de datos creada
- [ ] Credenciales copiadas

### Heroku
- [ ] App creada
- [ ] Variables configuradas
- [ ] Git remote configurado
- [ ] Deploy exitoso
- [ ] Logs sin errores

### Netlify
- [ ] Site creado
- [ ] Variables de entorno configuradas
- [ ] Build settings correctos
- [ ] Deploy exitoso
- [ ] Redirects funcionando (SPA)

### Post-Deploy
- [ ] API respondiendo (test /docs)
- [ ] Frontend cargando
- [ ] Login funcionando
- [ ] CORS configurado correctamente
- [ ] Uploads funcionando (Cloudinary)

---

## 10. URLs de Referencia

### Consolas de Administración
- **Aiven:** https://console.aiven.io
- **Heroku:** https://dashboard.heroku.com
- **Netlify:** https://app.netlify.com
- **Cloudinary:** https://cloudinary.com/console

### Documentación
- **Heroku Python:** https://devcenter.heroku.com/articles/getting-started-with-python
- **Netlify Docs:** https://docs.netlify.com
- **Aiven MySQL:** https://docs.aiven.io/docs/products/mysql

---

**¡Deploy completado!** Tu aplicación debería estar funcionando en:
- Frontend: `https://tu-app.netlify.app`
- Backend: `https://tu-api.herokuapp.com`
- API Docs: `https://tu-api.herokuapp.com/docs`
