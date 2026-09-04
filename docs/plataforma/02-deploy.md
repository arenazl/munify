# Deploy · Munify

Pipeline canónico de deploy. **Reglas duras en [`CLAUDE.md`](../../CLAUDE.md) §15** — esto
es la versión expandida. Todo lo de acá está **verificado contra los triggers reales**
(`gcloud builds triggers describe`, 2026-09-03), no contra memoria.

> **Dos plataformas muertas para este proyecto — no existen más:**
> - **HEROKU.** Nunca `git push heroku`. Si ves un `Procfile` o el remote `heroku`, es legacy.
> - **NETLIFY** (dueño, 2026-09-03). Todos los fronts están en **Cloudflare Pages**.
>   Cualquier mención a `munify-qa.netlify.app`, `paraguay-limpio.netlify.app`,
>   `netlify.toml`, `netlify deploy` o a site IDs de Netlify es legacy.

## Arquitectura real

```
  repo munify           Cloud Build (munify-api, us-east4)        destino
  -----------           ---------------------------------        -------
  push a qa     --+-->  deploy-munify-front-qa (frontend/**) -->  Pages munify-qa
                  +-->  deploy-munify-api-qa   (backend/**)  -->  Cloud Run munify-api-qa
  push a master --+-->  deploy-munify-front    (frontend/**) -->  Pages munify
                  +-->  deploy-munify-api-us   (backend/**)  -->  Cloud Run munify-api

  repo landing
  push a qa/master  -->  deploy-munify-landing[-qa]  -->  Pages munify-landing[-qa]

  repo munify-calls
  push a main       -->  deploy-munify-calls         -->  Pages munify-calls
```

| Trigger | Repo | Branch | Sólo si cambia | Publica en |
|---|---|---|---|---|
| `deploy-munify-front` | `munify` | `master` | `frontend/**` | Pages `munify` → **app.munify.com.ar** |
| `deploy-munify-front-qa` | `munify` | `qa` | `frontend/**` | Pages `munify-qa` → **app-qa.munify.com.ar** |
| `deploy-munify-api-us` | `munify` | `master` | `backend/**` | Cloud Run `munify-api` |
| `deploy-munify-api-qa` | `munify` | `qa` | `backend/**` | Cloud Run `munify-api-qa` |
| `deploy-munify-landing` | `landing` | `master` | — | Pages `munify-landing` → munify.com.ar |
| `deploy-munify-landing-qa` | `landing` | `qa` | — | Pages `munify-landing-qa` |
| `deploy-munify-calls` | **`munify-calls`** | `main` | — | Pages `munify-calls` → **calls.munify.com.ar** |

Base de datos: **Aiven MySQL** — `munify_prod` (prod) y `sugerenciasmun-qa` (QA).

Notas que evitan diagnósticos errados:

- **El filtro de archivos importa.** Un commit que sólo toca `backend/` NO republica el
  front, y uno que sólo toca `docs/` no dispara nada. Que no haya build **no** significa
  que el CD esté roto.
- **El front NO usa `VITE_API_URL`.** Pega a `/api` same-origin y el proxy lo hace una
  **Pages Function** (`functions/_middleware.js`) contra la variable `BACKEND_ORIGIN` que
  el trigger inyecta en el build: prod `https://munify-api-vmpxsxe7ra-uk.a.run.app`,
  QA `https://munify-api-qa-vmpxsxe7ra-uk.a.run.app`. Un ambiente que setea `VITE_API_URL`
  a una URL sin `/api` rompe TODO el front.
- **Región única `us-east4`.** No existe más `southamerica-east1` (Brasil/São Paulo, dada
  de baja). Cualquier URL `*.southamerica-east1.run.app` en docs o código es legacy.
- **OJO con el `gcloud config` default:** suele estar parado en `tasar-prod` (OTRA app del
  user). Por eso **todo comando lleva `--project=munify-api` explícito**.
- **`calls` es OTRO repo.** La página de `calls.munify.com.ar` vive en
  `github.com/arenazl/munify-calls` (branch único `main`), con su propio
  `CLAUDE.md`. De este repo se borró toda su copia el 2026-09-04
  (`scripts/calls/`, `frontend/public/calls/`, `docs/calls/`): estaba
  desactualizada y confundía. Acá queda **sólo el backend** que la página
  consume (`backend/api/calls*.py`, `backend/models/calls*.py`).

## Frontend

### 1. Antes de pushear — build local (sin excepciones)

```bash
cd frontend && npm run build
```

Si `tsc -b` falla, el build de Cloud Build también falla y queda publicado el bundle
viejo *silenciosamente*.

### 2. Push

```bash
git push origin qa       # dispara deploy-munify-front-qa
```

`master` es exclusivo de Infra. El workflow `.github/workflows/cd.yml` está roto/legacy:
el CD **no** pasa por GitHub Actions.

### 3. Verificar (no asumir desde el commit)

```bash
# que build corrio y con que SHA
gcloud builds list --project=munify-api --region=us-east4 \
  --filter="substitutions.TRIGGER_NAME=deploy-munify-front-qa" --limit=3 \
  --format="table(status,createTime,substitutions.SHORT_SHA)"

# que bundle esta vivo
curl -s https://app-qa.munify.com.ar/ | grep -oE "index-[A-Za-z0-9_-]+\.js"
```

## Backend

**Claude NO deploya backend.** El CD lo gestiona Infra: el push a `qa` dispara
`deploy-munify-api-qa`, que corre `gcloud run deploy munify-api-qa --source backend`.
Nunca correr `gcloud builds submit`, `gcloud run deploy` ni `gcloud run services update`
a mano.

### Verificar que llegó

```bash
gcloud builds list --project=munify-api --region=us-east4 \
  --filter="substitutions.TRIGGER_NAME=deploy-munify-api-qa" --limit=3 \
  --format="table(status,createTime,substitutions.SHORT_SHA)"

gcloud run revisions list --service=munify-api-qa --region=us-east4 --project=munify-api

curl -s https://munify-api-qa-vmpxsxe7ra-uk.a.run.app/openapi.json | head -c 400
```

## Variables de entorno

- **Públicas del backend:** van en el propio trigger (`--set-env-vars`), no en un archivo
  del repo. Ahí viven `ENVIRONMENT`, `FRONTEND_URL`, `CORS_ORIGINS`, `AI_PROVIDER_ORDER`,
  `GEMINI_MODEL`, `GROQ_MODEL`, `CLOUDINARY_CLOUD_NAME`/`API_KEY`, `SMTP_*`, `VAPID_PUBLIC_KEY`.
- **Secretas:** Google **Secret Manager** (proyecto `munify-api`), inyectadas con
  `--set-secrets`. QA usa las variantes `*_QA` para `DATABASE_URL` y `SECRET_KEY`.
  - Leer: `gcloud secrets versions access latest --secret=NOMBRE --project=munify-api`
  - Nueva versión: `gcloud secrets versions add NOMBRE --data-file=- --project=munify-api`
- **Reparto:** los secretos **de la app** (Gemini, Groq, Brevo, client IDs) los carga la
  app; los de **acceso a datos** (`DATABASE_URL`, `SECRET_KEY`) y las credenciales de
  **cuenta** (token de Cloudflare, SA de GCP) son de Infra. Detalle:
  `base-compartida/20-REPARTO-SECRETOS-Y-PLATAFORMA.md`.
- **Nunca** pegar valores literales en docs ni código.

## Lo que NO hay que hacer

| Anti-patrón | Por qué |
|---|---|
| `git push heroku` | Heroku está MUERTO. No deploya nada y da falsa sensación de deploy. |
| `netlify deploy` / buscar el dashboard de Netlify | Netlify no se usa más. Los fronts están en Cloudflare Pages. |
| `wrangler pages deploy` a mano | Rompe la trazabilidad commit → deploy. El CD lo hace solo con el push. |
| `gcloud run deploy` / `gcloud builds submit` a mano | El CD del backend es de Infra. |
| Pushear sin `npm run build` local | El error de TS rompe el build y queda publicado el bundle viejo. |
| Deducir "no se publicó" de que no hubo build | Puede ser el filtro `frontend/**` / `backend/**`. Mirar el filtro antes. |
| Buscar la página de calls en este repo | No está: se fue entera a `munify-calls`. Acá sólo vive su backend. |
| Confiar en el `gcloud` default | Suele estar en `tasar-prod` (otra app). Siempre `--project=munify-api`. |

## Troubleshooting

### Un push no publicó nada

1. ¿El commit tocó archivos que el trigger filtra? (`frontend/**` / `backend/**`)
2. ¿Hay build?
   ```bash
   gcloud builds list --project=munify-api --region=us-east4 --limit=10 \
     --format="table(status,createTime,substitutions.TRIGGER_NAME,substitutions.SHORT_SHA)"
   ```
3. ¿Falló? `gcloud builds log <BUILD_ID> --project=munify-api --region=us-east4`

### Backend: logs y estado

```bash
gcloud run services logs read munify-api-qa --region=us-east4 --project=munify-api --limit=50
gcloud run services describe munify-api-qa --region=us-east4 --project=munify-api
```

## Landing (repo separado)

Vive en su propio repo (`d:/Code/sugerenciasMun/landing/` → `github.com/arenazl/landing`,
ignorado por el git de este repo). Mismo mecanismo: push a `qa` dispara
`deploy-munify-landing-qa`; `master` lo publica Infra. **Un push desde la raíz de este
repo NO sube la landing** — hay que pushear cada uno por su lado.
