# AgentFlow WhatsApp Service

Servicio Node.js que conecta [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp Web no oficial) con el backend de AgentFlow.

## Para qué sirve

- Recibe mensajes que entran al número de Beyker → los envía al backend FastAPI (que dispara el bot conversacional y la asignación round-robin).
- Cuando AgentFlow necesita enviar un mensaje (respuesta del bot o de un vendedor desde el Inbox), llama a este servicio que lo envía via Baileys.

## Setup inicial

### Requisitos

- Node.js 20+ instalado en el server (Heroku, VPS, o local).
- Un chip de WhatsApp dedicado a Beyker, instalado en un **celular físico** con WhatsApp Business app.
- El celu tiene que poder escanear un QR durante el primer pareo. Después puede quedar en un cajón cargando.

### Pasos

```bash
cd whatsapp-service
cp .env.example .env
# Editar .env con valores reales (AGENTFLOW_API_URL, WHATSAPP_WEBHOOK_API_KEY)
npm install
node src/index.js
```

Al arrancar por primera vez se imprime un QR ASCII en la terminal. Hay que:

1. Abrir WhatsApp Business app en el celu dedicado de Beyker.
2. Menú (3 puntos) → Dispositivos vinculados → Vincular un dispositivo.
3. Escanear el QR de la terminal.
4. Listo. La sesión queda guardada en `auth_info_baileys/`.

Después de eso el servicio se reconecta solo cuando reinicia y NO pide QR de nuevo (salvo que se elimine `auth_info_baileys/`).

## Endpoints

### `GET /health`
Sin autenticación. Devuelve `{ ok, baileys_ready, user }`.

### `POST /send`
Auth: header `X-API-Key`. Body:
```json
{ "telefono": "+5491155551001", "contenido": "Hola, soy de Beyker" }
```

## Variables de entorno

| Var | Default | Descripción |
|---|---|---|
| `PORT` | `3100` | Puerto del HTTP server |
| `AGENTFLOW_API_URL` | `http://localhost:8200/api` | URL base del backend FastAPI |
| `WHATSAPP_WEBHOOK_API_KEY` | `dev-secret` | Secret compartido con el backend |
| `AUTH_FOLDER` | `./auth_info_baileys` | Donde Baileys guarda la sesión |

## Notas operativas

- **No subir `auth_info_baileys/` al repo.** Está en el `.gitignore`. Si lo subís a un server nuevo, el QR pide reescaneo.
- **El celular físico tiene que tener el chip activo y conexión a WhatsApp** durante el pareo inicial. Después se puede dejar apagado, pero si Meta pide reverificar (raro pero pasa) hay que prenderlo de nuevo.
- **No abrir WhatsApp Web normal con el mismo número** en otro dispositivo mientras Baileys está conectado — se desconectan entre sí.
- **Heroku deploy:** este servicio puede correr en un worker dyno separado. Setear `AGENTFLOW_API_URL` apuntando a la URL pública del backend.

## Flujo completo

```
Cliente manda WhatsApp a +54 9 11 XXXX-XXXX (numero Beyker)
                            ↓
            Baileys (este servicio) recibe el mensaje
                            ↓
       POST {AGENTFLOW_API_URL}/whatsapp/webhook/incoming
                            ↓
            FastAPI procesa: bot conversacional + DB
                            ↓
   Si bot decide responder → POST este servicio /send
                            ↓
                 Baileys envia respuesta
                            ↓
                  Cliente recibe respuesta
```
