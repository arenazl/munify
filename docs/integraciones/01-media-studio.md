# Media Studio — Spec técnica

> Documento único. Todos los datos corresponden al estado real del repositorio
> `d:\Code\media-studio` verificado al 2026-06-14.
> Media Studio es una app standalone (React + Vite), **sin backend propio en producción**.
> El backend local (`server/index.mjs`) corre en tu máquina para desarrollo y pipeline local.

---

## Qué es

**Media Studio** es un estudio de creación de contenido audiovisual para reels de Munify.
Tiene cinco módulos navegables por tabs:

| Tab | Función |
|-----|---------|
| **Audio** | Editor de voz tipo DAW — genera MP3 vía ElevenLabs (TTS en la nube) |
| **Reel** | Prompt-builder para slides animados 9:16 (Claude headless local) |
| **Videos** | Galería de MP4/MOV locales + streaming |
| **Montaje** | Intercalado slides + videos (Claude headless) |
| **Export** | Unificación final en MP4 (Claude headless) |

---

## Arranque

```bash
cd d:\Code\media-studio
npm install

npm run dev       # solo frontend en http://localhost:5180
npm run server    # solo backend local en http://localhost:5301
npm run studio    # ambos en paralelo (concurrently)
npm run build     # build estático para Netlify
```

**Variables de entorno del backend local** (opcionales, tienen defaults):
- `STUDIO_PORT` — puerto del backend local (default: `5301`)
- `VIDEOS_DIR` — carpeta de videos (default: `D:/Code/sugerenciasMun/reels/videos`)
- `STUDIO_CWD` — directorio base de Claude headless (default: `D:/Code`)

---

## Modo embed (iframe desde Munify)

Media Studio es **inyectable como iframe**. Munify lo usa para integrar el estudio de voz
dentro de la pantalla de reels sin redirigir al user.

```
http://localhost:5180?embed=1
```

Con `?embed=1` se muestra **solo el VoiceStudio** (sin header ni navegación de tabs).

Para pre-cargar un texto en el editor al abrir el iframe:

```
http://localhost:5180?embed=1&text=Tu+municipio+al+día
```

También se puede inyectar configuración completa (fuentes, tracks, guiones) por `postMessage`:

```js
iframe.contentWindow.postMessage(
  { type: 'mediastudio:config', payload: { sourceTitle: 'MIS GUIONES', files: [...], tracks: [...] } },
  '*'
);
```

---

## Servicio TTS (externo, en la nube)

El editor de voz **no llama a ElevenLabs directo** — delega a un servicio Cloud Run intermediario.

- **URL**: `https://tts-service-1060106389361.southamerica-east1.run.app`
- **Proveedor final**: ElevenLabs (modelo `eleven_v3`)
- **Auth**: la API key de ElevenLabs vive en el Cloud Run, no se expone al frontend

El frontend llama a `POST {TTS_SERVICE_URL}/tts` con el texto + parámetros de voz y recibe el MP3.

---

## Voces y presets

El servicio devuelve la lista de voces disponibles desde ElevenLabs.
Voz default activa: `yA5jrK1S9cpCAojBYyMu` (configurable en VoiceStudio).

Presets de voz baked:

| Preset | stability | similarity | style | speed |
|--------|-----------|-----------|-------|-------|
| Natural | 0.5 | 0.75 | 0.15 | 1.0 |
| Conversacional | 0.4 | 0.80 | 0.35 | 1.0 |
| Enérgico | 0.3 | 0.80 | 0.60 | 1.05 |
| Locución | 0.7 | 0.85 | 0.10 | 0.95 |

---

## Guiones baked (caso Munify/standalone)

Cinco guiones precargados en `src/data/narrationText.ts`. Otra app que inyecte el estudio
puede sobreescribirlos por config (postMessage o `window.MEDIASTUDIO_CONFIG`).

| key | Label |
|-----|-------|
| `tour` | Tour general |
| `vecino` | Vecino |
| `intendente` | Intendente |
| `tesoreria` | Tesorería |
| `ia` | IA / WhatsApp |

---

## Marcadores inline (editor de voz)

El editor soporta marcadores de énfasis, pausa y tono directamente en el texto:

| Sintaxis | Efecto |
|----------|--------|
| `MAYUSCULAS` | Énfasis fuerte en esa palabra |
| `[excited]` | Tono eufórico |
| `[serious]` | Tono serio |
| `[whispers]` | Susurro |

---

## Backend local — endpoints

**Base**: `http://localhost:5301`  
**Auth**: ninguna (solo local, no se deploya a producción)

### `GET /api/health`
Estado del servidor local.
```json
{ "ok": true, "videosDir": "D:/Code/sugerenciasMun/reels/videos", "repoCwd": "D:/Code", "db": "<path>/studio.db" }
```

### `GET /api/videos`
Lista los archivos MP4/MOV/WEBM de `VIDEOS_DIR`, ordenados por fecha de modificación (más nuevo primero).
```json
{
  "dir": "D:/Code/sugerenciasMun/reels/videos",
  "videos": [
    { "name": "bache.mp4", "size": 14532048, "mtime": 1718300000000, "url": "/api/videos/file/bache.mp4" }
  ]
}
```

### `GET /api/videos/file/{name}`
Stream del video con soporte de `Range` headers (requerido por `<video>` del browser).
- `206 Partial Content` si el cliente envía `Range: bytes=X-Y`
- `200` si descarga completa
- `404` si el archivo no existe

### `POST /api/claude`
Ejecuta Claude Code en modo headless local (pipeline de reels/montaje/export).

**Body:**
```json
{
  "prompt": "Generá 6 slides para el reel de Munify en estética dark+naranja...",
  "cwd": "D:/Code",
  "allowedTools": "Read,Grep,Glob,Bash,Edit,Write"
}
```

**Respuesta:**
```json
{ "text": "...(output de Claude)...", "cost": 0.0042, "tools": ["Read", "Edit"] }
```

> Requiere que el CLI `claude` esté instalado y autenticado en la máquina.
> Timeout: 900 segundos (15 min). El servidor elimina la variable `CLAUDECODE` del env
> para evitar el guard de nested session.

### `GET /api/projects`
Lista proyectos guardados (persistencia SQLite local).
```json
{ "projects": [{ "id": "proj-001", "name": "Reel Municipio SPN", "updated_at": "2026-06-14T..." }] }
```

### `POST /api/projects`
Guarda (crea o actualiza) un proyecto.
**Body:** `{ "id": "proj-001", "name": "Reel Municipio SPN", "data": { ...cualquier JSON... } }`
```json
{ "project": { "id": "proj-001", "name": "Reel Municipio SPN", "updated_at": "..." } }
```

### `GET /api/projects/{id}`
Obtiene un proyecto por id.
- `404` si no existe

### `DELETE /api/projects/{id}`
Elimina un proyecto.
```json
{ "ok": true }
```

---

## Música de fondo

Los tracks de música son MP3 estáticos servidos desde el CDN de Munify:

```
https://app.munify.com.ar/reels-audio/{id}.mp3
```

Tracks disponibles: `pop`, `electro`, `funk`, `inspiradora`, `calida`, `indie`, `cine`, `epica`.

---

## Notas de arquitectura

- **Sin backend en producción**: el frontend compilado (`npm run build`) es estático (Netlify).
  El `server/index.mjs` es **solo para pipeline local** (Reel/Montaje/Export vía Claude headless).
- **TTS siempre en la nube**: el tab Audio funciona en producción sin el backend local;
  llama directo al `TTS_SERVICE_URL` (Cloud Run) desde el browser.
- **Claude headless requiere backend local**: los tabs Reel, Montaje y Export necesitan
  que `npm run server` esté corriendo (lanzan Claude CLI en la máquina del usuario).
- **Multi-app**: el diseño es agnóstico de Munify. Cualquier app puede inyectar el estudio
  por iframe pasando su propia config (`sourceTitle`, `files`, `tracks`).
