# DOCUMENTO DE CREDENCIALES

## Instrucciones

Este documento contiene las credenciales de los servicios externos necesarios para el proyecto.
Una vez completadas, la IA puede generar automáticamente los archivos `.env`.

**IMPORTANTE:** No commitear este archivo con credenciales reales a repositorios públicos.

---

## 1. Aiven (Base de Datos MySQL)

Obtener desde: https://console.aiven.io → Tu Servicio → Overview → Connection Information

```
DB_HOST=mysql-aiven-arenazl.e.aivencloud.com
DB_PORT=23108
DB_USER=avnadmin
DB_PASSWORD=AVNS_Fqe0qsChCHnqSnVsvoi
DB_NAME=sugerenciasmun
```

---

## 2. Cloudinary (Storage de Imágenes)

Obtener desde: https://cloudinary.com/console → Dashboard → Account Details

```
CLOUDINARY_CLOUD_NAME=[COMPLETAR]
CLOUDINARY_API_KEY=[COMPLETAR]
CLOUDINARY_API_SECRET=[COMPLETAR]
```

**Ejemplo completado:**
```
CLOUDINARY_CLOUD_NAME=di39tigkf
CLOUDINARY_API_KEY=986738179528233
CLOUDINARY_API_SECRET=k1cxARGZPqw9oxn09scf8N16_oM
```

---

## 3. Heroku (Backend)

Obtener después de crear la app con `heroku create`

```
HEROKU_APP_NAME=[COMPLETAR]
BACKEND_URL=[COMPLETAR]
```

**Ejemplo completado:**
```
HEROKU_APP_NAME=reclamos-muni-api
BACKEND_URL=https://reclamos-muni-api.herokuapp.com
```

---

## 4. Netlify (Frontend)

Obtener después de crear el site con `netlify sites:create`

```
NETLIFY_SITE_NAME=[COMPLETAR]
NETLIFY_SITE_ID=[COMPLETAR]
FRONTEND_URL=[COMPLETAR]
```

**Ejemplo completado:**
```
NETLIFY_SITE_NAME=reclamos-muni
NETLIFY_SITE_ID=edff37c1-2c43-4c01-ba71-d6c59f5cdc85
FRONTEND_URL=relative z-10 border-b h-16
```

---

## 5. Seguridad

Generar una clave secreta segura (mínimo 32 caracteres):

```
SECRET_KEY=[COMPLETAR]
```

**Para generar una clave segura:**
```bash
# Python
python -c "import secrets; print(secrets.token_urlsafe(32))"

# OpenSSL
openssl rand -base64 32
```

**Ejemplo completado:**
```
SECRET_KEY=mK9x_Lp3nQ7vR2sT8wY1zA4cF6hJ0kM5oP8qU3xV6yB9
```

---

## 6. Configuración de App

```
APP_NAME=[COMPLETAR]
APP_VERSION=1.0.0
APP_DEBUG=False
```

**Ejemplo completado:**
```
APP_NAME=ReclamosMunicipales
APP_VERSION=1.0.0
APP_DEBUG=False
```

---

## 7. Groq (Chat IA con Llama - GRATIS)

Obtener desde: https://console.groq.com/keys

**Pasos para obtener API Key:**
1. Ir a https://console.groq.com
2. Crear cuenta (gratis)
3. Ir a "API Keys" en el menú
4. Click en "Create API Key"
5. Copiar la key generada

```
GROQ_API_KEY=[COMPLETAR]
```

**Ejemplo completado:**
```
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Modelos disponibles (todos gratis):**
| Modelo | Tokens/min | Descripción |
|--------|------------|-------------|
| `llama-3.1-70b-versatile` | 6,000 | Mejor calidad, recomendado |
| `llama-3.1-8b-instant` | 30,000 | Más rápido, menor calidad |
| `mixtral-8x7b-32768` | 5,000 | Alternativa |

**Límites del tier gratuito:**
- 14,400 requests/día
- 6,000 tokens/minuto (llama-70b)
- Sin tarjeta de crédito requerida

**Uso en el código:**
```python
# Backend - routers/chat.py
from groq import Groq

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
response = client.chat.completions.create(
    model="llama-3.1-70b-versatile",
    messages=[{"role": "user", "content": mensaje}]
)
```

---

## 8. Grok AI (xAI) - Alternativa a Groq

Obtener desde: https://console.x.ai/

**Pasos para obtener API Key:**
1. Ir a https://console.x.ai
2. Crear cuenta
3. Ir a "API Keys"
4. Crear nueva key

```
GROK_API_KEY=[COMPLETAR]
GROK_MODEL=grok-3-mini
```

**Modelos disponibles:**
| Modelo | Descripción |
|--------|-------------|
| `grok-3-mini` | Modelo rápido y económico |
| `grok-3` | Modelo completo |

---

## 9. Gemini (Google - Gratis con límites)

Obtener desde: https://aistudio.google.com/apikey

**Pasos para obtener API Key:**
1. Ir a https://aistudio.google.com/apikey
2. Loguearse con cuenta Google
3. Click en "Create API Key"
4. Copiar la key generada

```
GEMINI_API_KEY=AIzaSyB1IOm-070frWwhpJOcWSh6yNt4wHCM4Wk
GEMINI_MODEL=gemini-2.5-flash
```

**Modelos disponibles:**
| Modelo | Descripción |
|--------|-------------|
| `gemini-2.5-flash` | Rápido con "thinking" (recomendado, requiere maxOutputTokens: 1000+) |
| `gemini-2.0-flash` | Rápido y económico |
| `gemini-2.5-pro` | Mayor calidad, más lento |

**Límites tier gratuito:**
- 15 RPM (requests por minuto)
- 1 millón de tokens/día
- Sin tarjeta de crédito

---

## 10. Mapas (Leaflet + OpenStreetMap - Sin API Key)

Leaflet usa OpenStreetMap que es **100% gratuito y sin límites**.

**No requiere configuración de credenciales.**

```bash
# Instalar en frontend
npm install leaflet react-leaflet @types/leaflet
```

**Alternativas de tiles (todas gratuitas):**

| Provider | URL | Uso |
|----------|-----|-----|
| OpenStreetMap | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` | General |
| CartoDB Positron | `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png` | Tema claro |
| CartoDB Dark | `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png` | Tema oscuro |

**Coordenadas por defecto Argentina:**
```typescript
// Buenos Aires
const BUENOS_AIRES = { lat: -34.6037, lng: -58.3816 };

// Córdoba
const CORDOBA = { lat: -31.4201, lng: -64.1888 };

// Rosario
const ROSARIO = { lat: -32.9468, lng: -60.6393 };
```

---

## Prompt para Generar .env

Una vez completadas todas las credenciales arriba, usar este prompt:

```
Lee el archivo 04_CREDENCIALES.md y genera:
1. backend/.env con todas las variables configuradas
2. frontend/.env con VITE_API_URL
3. Los comandos heroku config:set para configurar Heroku
```

---

## Checklist de Credenciales

**Base de datos y storage:**
- [ ] Cuenta de Aiven creada y servicio MySQL activo
- [ ] Credenciales de Aiven copiadas
- [ ] Cuenta de Cloudinary creada
- [ ] Credenciales de Cloudinary copiadas

**Deploy:**
- [ ] App de Heroku creada
- [ ] Site de Netlify creado

**Seguridad:**
- [ ] Clave secreta generada

**IA (elegir uno o varios):**
- [ ] Groq API Key (gratis, cloud)
- [ ] Grok API Key (xAI)
- [ ] Ollama instalado (local, sin key)

**Mapas:**
- [x] Leaflet + OpenStreetMap (sin API key, listo para usar)

**Final:**
- [ ] Archivos .env generados
