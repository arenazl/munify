# Deploy · Munify

Pipeline canónico de deploy. **Reglas duras en [`CLAUDE.md`](../CLAUDE.md) §15** — esto es la versión expandida.

> **HEROKU ESTÁ MUERTO.** No existe más para este proyecto. Nunca `git push heroku`.
> El backend vive en **Google Cloud Run**. Si ves `Procfile` o el remote `heroku`, es legacy.

## Arquitectura de prod

```
┌──────────────────┐       ┌────────────────────────┐       ┌──────────────────┐
│     Netlify      │──────▶│   Google Cloud Run     │──────▶│   Aiven MySQL    │
│  app.munify...   │       │  proyecto: munify-api  │       │  (cloud-managed) │
│  (frontend)      │       │  servicio: munify-api  │       │                  │
└──────────────────┘       └────────────────────────┘       └──────────────────┘
        │                            │
        └── git push origin ─────────┴── gcloud builds submit + gcloud run deploy
```

| Componente | Producto | URL / id | Cómo deploya |
|---|---|---|---|
| App frontend | Netlify | `app.munify.com.ar` | `git push origin master` → auto-build |
| Landing | Netlify (otro site) | `munify.com.ar` | `master` del repo separado `landing/` |
| Backend API | **Google Cloud Run** | proyecto `munify-api`, región `southamerica-east1`, servicio `munify-api` | `gcloud builds submit` + `gcloud run deploy` |
| Base de datos | Aiven MySQL | (privada) | — |

- **URL del backend que usa el frontend:** `https://munify-api-1060106389361.southamerica-east1.run.app/api`
- Site IDs Netlify: App `edff37c1-2c43-4c01-ba71-d6c59f5cdc85` · Landing `522eac1f-fa1f-43d1-86ca-128e5467a27d`
- **OJO:** el `gcloud config` default suele estar parado en `tasar-prod` (OTRA app del user). Por eso **todo comando lleva `--project=munify-api` explícito**.

## Frontend (Netlify)

### 1. Antes de pushear — build local
```bash
cd frontend && npm run build
```
Si `tsc -b` falla, **Netlify también falla** y prod queda con el bundle viejo *silenciosamente*. **Sin excepciones.**

### 2. Push
```bash
git push origin master    # Netlify rebuildea automático (integración nativa de GitHub, NO el workflow CI roto/legacy)
```

### 3. Verificar
```bash
curl -s https://app.munify.com.ar/ | grep -oE 'index-\w+\.js'   # comparar contra frontend/dist/index.html local
```

## Backend (Google Cloud Run)

El user hace ~10 deploys/día con su flujo. **Claude NO deploya backend sin "dale" explícito** (es prod, outward-facing).

Pipeline real (desde `backend/`):
```bash
# 1. Build de la imagen en Cloud Build → Artifact Registry
gcloud builds submit --region=southamerica-east1 \
  --tag=southamerica-east1-docker.pkg.dev/munify-api/munify/api:latest \
  --project=munify-api .

# 2. Deploy a Cloud Run
gcloud run deploy munify-api \
  --image=southamerica-east1-docker.pkg.dev/munify-api/munify/api:latest \
  --region=southamerica-east1 --allow-unauthenticated --port=8080 \
  --memory=512Mi --cpu=1 --min-instances=0 --max-instances=10 --timeout=300 \
  --env-vars-file=env.yaml \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,SECRET_KEY=SECRET_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,GROK_API_KEY=GROK_API_KEY:latest,SMTP_PASSWORD=SMTP_PASSWORD:latest,CLOUDINARY_API_SECRET=CLOUDINARY_API_SECRET:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,DIDIT_API_KEY=DIDIT_API_KEY:latest,VAPID_PRIVATE_KEY=VAPID_PRIVATE_KEY:latest \
  --project=munify-api
```

### Verificar que llegó (NO asumir desde commits)
Un `git push origin master` versiona pero **NO deploya el backend**. Para saber qué está realmente vivo:
```bash
curl -s https://munify-api-1060106389361.southamerica-east1.run.app/openapi.json | python -m json.tool | grep -i "ruta o schema que esperás"
```
Que un commit exista en master **no** significa que esté deployado en Cloud Run.

## Variables de entorno

### Backend
- **Públicas:** `backend/env.yaml` (ENVIRONMENT, FRONTEND_URL, CORS_ORIGINS, GEMINI_MODEL, CLOUDINARY_CLOUD_NAME/API_KEY, SMTP_HOST/PORT/USER, VAPID_PUBLIC_KEY, etc.).
- **Secretas:** Google **Secret Manager** (proyecto `munify-api`), inyectadas con `--set-secrets`. Las 9:
  `DATABASE_URL`, `SECRET_KEY`, `GEMINI_API_KEY`, `GROK_API_KEY`, `SMTP_PASSWORD`, `CLOUDINARY_API_SECRET`, `GOOGLE_CLIENT_SECRET`, `DIDIT_API_KEY`, `VAPID_PRIVATE_KEY`.
  - Ver/actualizar: `gcloud secrets versions access latest --secret=NOMBRE --project=munify-api` / `gcloud secrets versions add NOMBRE --data-file=- --project=munify-api`.
- **Nunca** pegar valores literales en docs ni código. Valores de referencia en `d:/Code/APP_GUIDE/.env.master`.

### Frontend (Netlify — Site settings → Environment variables)
| Variable | Para qué |
|---|---|
| `VITE_API_URL` | URL del backend en Cloud Run (`https://munify-api-1060106389361.southamerica-east1.run.app/api`) |

## Lo que NO hay que hacer

| Anti-patrón | Por qué |
|---|---|
| `git push heroku` | Heroku está MUERTO. No deploya nada, da falsa sensación de deploy. Causó un desastre real. |
| `netlify deploy --prod --dir dist` desde CLI | Rompe trazabilidad (deploy sin commit). Pipeline es `git push` → auto-build. |
| Pushear sin `npm run build` local | El error de TS te lo come Netlify y prod queda con bundle viejo. |
| Asumir deploy de backend desde un push a git | El push NO deploya Cloud Run; verificar el OpenAPI vivo. |
| Confiar en el `gcloud` default | Suele estar en `tasar-prod` (otra app). Siempre `--project=munify-api`. |

## Troubleshooting

### Backend: ver logs / estado
```bash
gcloud run services logs read munify-api --region=southamerica-east1 --project=munify-api --limit=50
gcloud run services describe munify-api --region=southamerica-east1 --project=munify-api
```

### Bundle viejo en prod después de push (frontend)
El build de Netlify falló silencioso → mirar Netlify dashboard → builds. Arreglar el error de TS local, `npm run build`, push de nuevo.

## Landing (repo separado)

La landing comercial vive en su propio repo (`d:/Code/sugerenciasMun/landing/` → `github.com/arenazl/landing.git`). Mismo pipeline:
```bash
cd landing && git add . && git commit -m "..." && git push origin master
```
Netlify rebuildea sola. **No `netlify deploy --prod` acá tampoco.**
