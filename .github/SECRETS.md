# Secrets necesarios para CI/CD

Configurar estos secrets en GitHub → Settings → Secrets and variables → Actions

## Para Deploy en Heroku (Backend)

| Secret | Descripción |
|--------|-------------|
| `HEROKU_API_KEY` | API Key de Heroku (Account Settings) |
| `HEROKU_APP_NAME` | Nombre de la app en Heroku |
| `HEROKU_EMAIL` | Email de la cuenta Heroku |

## Para Deploy en Netlify (Frontend)

| Secret | Descripción |
|--------|-------------|
| `NETLIFY_AUTH_TOKEN` | Token de acceso (User Settings → Applications) |
| `NETLIFY_SITE_ID` | ID del sitio (Site Settings → General) |
| `API_URL` | URL del backend (ej: https://mi-app.herokuapp.com/api) |

## Para Docker Hub (opcional)

| Secret | Descripción |
|--------|-------------|
| `DOCKER_USERNAME` | Usuario de Docker Hub |
| `DOCKER_PASSWORD` | Token de acceso de Docker Hub |

## Para Codecov (opcional)

| Secret | Descripción |
|--------|-------------|
| `CODECOV_TOKEN` | Token de Codecov para reportes de cobertura |

---

## Cómo obtener cada secret

### Heroku API Key
1. Ir a https://dashboard.heroku.com/account
2. Scroll hasta "API Key"
3. Click "Reveal" y copiar

### Netlify Auth Token
1. Ir a https://app.netlify.com/user/applications
2. Click "New access token"
3. Copiar el token generado

### Netlify Site ID
1. Ir al sitio en Netlify
2. Site Settings → General → Site details
3. Copiar "Site ID"
