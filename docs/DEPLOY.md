# Deploy · Munify

Pipeline canónico de deploy. **Reglas duras en [`CLAUDE.md`](../CLAUDE.md) §14** — esto es la versión expandida.

## Arquitectura de prod

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│     Netlify      │──────▶│      Heroku      │──────▶│   Aiven MySQL    │
│  app.munify...   │       │ munify-backend   │       │  (cloud-managed) │
└──────────────────┘       └──────────────────┘       └──────────────────┘
        │                            │
        └── git push origin ─────────┴── git push heroku
```

| Componente | Producto | URL | Branch que deploya |
|---|---|---|---|
| App frontend | Netlify | `app.munify.com.ar` | `master` |
| Landing | Netlify (otro site) | `munify.com.ar` | `master` del repo separado `landing/` |
| Backend API | Heroku | `munify-backend.herokuapp.com` (interno) | `main` (push como `master:main`) |
| Base de datos | Aiven MySQL | (privada) | — |

Site IDs Netlify:
- App: `edff37c1-2c43-4c01-ba71-d6c59f5cdc85`
- Landing: `522eac1f-fa1f-43d1-86ca-128e5467a27d`

## Pipeline (USAR SIEMPRE ESTE)

### 1. Antes de pushear front — build local
```bash
cd frontend && npm run build
```

Si `tsc -b` falla, **Netlify también va a fallar** y prod se queda con el bundle viejo *silenciosamente*. **Sin excepciones.**

### 2. Push a git
```bash
git push origin master                  # Netlify rebuildea automático
git push heroku master:main             # SOLO si tocaste backend (Heroku usa rama main)
```

Netlify usa su integración nativa de GitHub (NO el workflow `.github/workflows/cd.yml`, que está roto/legacy).

### 3. Verificar que llegó
```bash
# Hash del bundle en prod vs local
curl -s https://app.munify.com.ar/ | grep -oE 'index-\w+\.js'
# Comparar contra frontend/dist/index.html local. Si difieren, el build falló.
```

## Lo que NO hay que hacer

| Anti-patrón | Por qué |
|---|---|
| `netlify deploy --prod --dir dist` desde CLI | Rompe trazabilidad (deploy sin commit asociado). Pipeline es `git push` → auto-build, punto. |
| Pushear sin correr `npm run build` local | El error de TS te lo come Netlify y prod queda con bundle viejo. Cero error visible salvo mirando el dashboard. |
| Pushear a `main`/`feature/X` esperando que llegue a prod | Netlify production branch es `master`. Otras ramas generan solo previews. |
| Forzar deploy del workflow CI | Está legacy/roto, ignorarlo. |

## Variables de entorno

### Backend (Heroku — usar `heroku config:set`)

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | MySQL Aiven (`mysql+aiomysql://...`) |
| `SECRET_KEY` | JWT (generar con `openssl rand -hex 32`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Default 1440 |
| `ENVIRONMENT` | `production` |
| `FRONTEND_URL` | `https://app.munify.com.ar` (usado en links de WhatsApp y email) |
| `CORS_ORIGINS` | `https://app.munify.com.ar,https://munify.com.ar` |
| `CLOUDINARY_*` | Storage de imágenes (3 vars: name, key, secret) |
| `GEMINI_API_KEY` | IA clasificación reclamos / asistente |
| `BREVO_SMTP_*` | Transactional email |
| `WHATSAPP_*` | Meta Cloud API (phone_number_id, access_token, business_account_id) |
| `RENAPER_*` | Validación biométrica de identidad |

Valores reales en `d:/Code/APP_GUIDE/.env.master` — **nunca pegar valores literales en docs ni código**.

### Frontend (Netlify — Site settings → Environment variables)

| Variable | Para qué |
|---|---|
| `VITE_API_URL` | URL del backend en Heroku |

## Checklist pre-deploy

- [ ] `.env` está en `.gitignore` (verificar `git status --ignored` no lo lista)
- [ ] `FRONTEND_URL` apunta a `app.munify.com.ar`
- [ ] `CORS_ORIGINS` incluye `app.munify.com.ar` y `munify.com.ar` (sin `/` final)
- [ ] `ENVIRONMENT=production` en Heroku
- [ ] Backend builds local sin errores (`uvicorn main:app` arranca limpio)
- [ ] Frontend builds local sin errores (`npm run build`)
- [ ] La IP de Heroku está en whitelist de Aiven (problema típico al cambiar de dyno)

## Troubleshooting

### CORS errors en prod
1. `heroku config:get CORS_ORIGINS` — confirmar que tiene la URL exacta.
2. Sin `/` al final.
3. `heroku restart` para forzar reload del config.

### WhatsApp no envía
1. `heroku config:get FRONTEND_URL` — debe ser la URL de prod.
2. Confirmar credenciales de Meta válidas y dentro del template aprobado.
3. `heroku logs --tail` filtrar por `whatsapp`.

### DB connection
1. IP de Heroku whitelisteada en Aiven.
2. Test: `heroku run python -c "from core.database import engine; print(engine)"`.

### Bundle viejo en prod después de push
- El build de Netlify falló silencioso. Mirar Netlify dashboard → builds.
- Solución: arreglar el error de TS local, `npm run build`, push de nuevo.

## Landing (repo separado)

La landing comercial vive en su propio repo (`d:/Code/sugerenciasMun/landing/` apunta a `github.com/arenazl/landing.git`). Mismo pipeline:

```bash
cd landing
git add . && git commit -m "..." && git push origin master
```

Netlify rebuildea sola. **No `netlify deploy --prod` acá tampoco.**
