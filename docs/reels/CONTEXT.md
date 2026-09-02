# Reels de promoción de Munify — contexto para continuar

> **DOC VIVO — en constante evolución.** Es el **canal entre agentes**. Mantener
> actualizado: narrativas por reel, voz elegida, estado de cada reel, clips Veo y
> aprendizajes nuevos. Si algo cambia, se edita acá primero.
>
> Cubre: estado, arquitectura, cómo regrabar, voces (ElevenLabs) y la dirección de
> **video real con Google Veo/Flow** (con prompts listos).

## 1. Qué son

5 reels verticales **1080×1920 (9:16)** para Facebook/Instagram, ~17–20s c/u,
**60fps**, con música y (en proceso) **voz en off**. Marca = navy `#0E1830` +
Fraunces italic + gold `#C8A24E` (sampleada del banner FB en `design/`).

Reels (id → ángulo):
- `tour` — Tour general (Dashboard→Reclamos→Mapa→Trámites→Tesorería) ~20s
- `vecino` — Foto del bache → IA clasifica → seguimiento → puntos ~17s
- `intendente` — Números en vivo + Dashboard + tasa 87% + mapa ~17s
- `tesoreria` — Pagos→Cajas→Conciliación→Sueldos ~17s
- `ia` — WhatsApp bot → clasifica → turnos → 24/7 ~17s

Página estudio/probador: **`/reels`** (ruta pública, como `/demos`). Los mp4
finales viven en **`design/reels/`** (carpeta que el user renombró de `munify/`).

## 2. Arquitectura (frontend/src/components/reels/)

- `reelBrand.ts` — tokens de marca (navy/gold), fuentes Fraunces+Inter, glow.
- `ReelStage.tsx` — **motor**. Lienzo BASE fijo 1080×1920 escalado con
  `transform: scale` (preview chico = mp4 idéntico). Escenas: `hook | feature |
  stat | split | cta`. Auto-avance + `useCountUp` + barra de progreso + logo
  centrado arriba (mark 148 + "Munify" 128) + footer `munify.com.ar`.
- `ReelMockups.tsx` — **mockups dark + naranja** copiando la app real
  (dashboard LIVE con KPIs/deltas, lista con status pills, wizard con stepper,
  pagos/cajas/sueldos). Capturas de referencia que pasó el user: app es
  **dark mode, acento `#F5A623`**.
- `reelScripts.tsx` — los 5 guiones (escenas + copy + accent por reel).
- `narrators.ts` — catálogo de 14 voces ElevenLabs (es-AR + latinas).

Página: `frontend/src/pages/ReelsStudio.tsx`. Ruta en `frontend/src/routes.tsx`
(`/reels`). El probador tiene: selector de reel, preview en vivo, barra de
**8 temas de música** y grilla de **14 narradores** (cada uno reproduce su sample).

## 3. Pipeline de grabación a mp4 (60fps)

Script: `frontend/_capture.mjs` (NO commiteado — es herramienta local).
Requiere `npm run build` + `npx vite preview --port 4178` corriendo.

Flujo: Playwright abre `/reels?reel=<id>&capture=1&slow=4` → modo captura
(negro hasta `window.__go()`), graba en **cámara lenta 4×** (CSS vía CDP
`Animation.setPlaybackRate(0.25)`, JS vía `setReelTimeScale`), luego **ffmpeg
acelera 4×** (`setpts/4`, `fps=60`) → 60fps reales (no duplicados). `blackdetect`
recorta el arranque. Mezcla el **Funk** de fondo. Output → `design/reels/<id>.mp4`.

Correr: `cd frontend && node _capture.mjs` (tarda ~6 min los 5).

### GOTCHAS (importantes, ya nos mordieron)
- **`page.screenshot` da NEGRO** en headless con tanto blur/filtro. Para
  verificar, **extraer frames del mp4** (`ffmpeg -ss N -i x.mp4 -frames:v 1`),
  NO screenshots de la página.
- Mockups usan **`zoom`** (no `transform: scale`) para que ocupen tamaño real y
  **no tapen el chip** de abajo (PAGOS/CAJAS/etc.).
- `useCountUp` toma el inicio del **reloj de RAF** (no `performance.now`), si no
  la cámara lenta desincroniza y el número sale corrupto (`-6.424` en vez de `1.284`).
- Deploy front: `git push origin master` → Netlify. Prod: `app.munify.com.ar/reels`.
  Ojo **cache del Service Worker** (PWA): probar en incógnito si no actualiza.

## 4. Música y voces

- **Música** (`frontend/public/reels-audio/*.mp3`): 8 temas (pop, electro, funk,
  inspiradora, calida, indie, cine, epica). Kevin MacLeod / incompetech, **CC-BY**
  → crédito de 1 línea al publicar. Recortados a 32s con fade.
- **Narradores (ElevenLabs)**: doc de integración + **API key** en
  `D:\Code\SalesBot\docs\ELEVENLABS_INTEGRATION.md` (model `eleven_flash_v2_5`,
  header `xi-api-key`, `language_code: es`). **La key NUNCA va al front.** Los
  samples se generan **offline** (script python local con la key, ya borrado) y
  se commitea **solo el mp3** estático. Sanitización: `Munify`→`Munifai`,
  `24/7`→`veinticuatro siete`.
  - 14 voces en `public/reels-audio/narrators/<slug>.mp3` (ver `narrators.ts`
    para slug→voiceId). Default: **Lucia** (`yA5jrK1S9cpCAojBYyMu`, argentina,
    cálida, publicidad). El user está **eligiendo voz** en el probador.
  - Para generación EN VIVO (texto libre) haría falta un endpoint **backend**
    proxy con la key como secreto (Secret Manager), nunca en el front.

## 4-bis. NARRATIVAS POR REEL (voz en off) — FUENTE DE VERDAD

> **Este es el canal.** Acá curamos la locución de cada reel. Cada línea va
> alineada a una escena del guión (`reelScripts.tsx`). `estado`: borrador →
> aprobado por el user → grabado.
>
> **Dos formas de entregar la narrativa (ambas válidas, se eligen por reel):**
> - **(a) Voz en off** sobre el reel renderizado (ElevenLabs → ffmpeg, voz
>   adelante + música -18dB). Sanitización TTS: `Munify`→`Munifai`,
>   `24/7`→`veinticuatro siete`, números clave deletreados.
> - **(b) Presentador a cámara** generado con **Veo** (talking head con lip-sync):
>   se pasa la línea como **diálogo** en el prompt de Veo y la persona la dice.
>   Plantilla de prompt:
>   `Medium close-up of a friendly, professional Argentine [man/woman] in their 30s speaking directly to camera in a bright modern municipal office, natural light, warm and confident tone. They say in Rioplatense Spanish: "<LÍNEA>". Photorealistic, vertical 9:16, no on-screen text.`
>   (En este modo, la narrativa NO se sanitiza para TTS — se escribe natural.)

### `tour` — Tour general · estado: **borrador**
| Escena | Voz en off |
|---|---|
| Hook | ¿Tu municipio todavía maneja todo en papel y planillas? |
| Dashboard | Con Munify ves toda tu gestión en vivo, en una sola pantalla. |
| Reclamos | El vecino reclama desde el celular… y vos lo resolvés. |
| Mapa de calor | Mirás en el mapa dónde se concentran los problemas. |
| Trámites | Trámites online, con identidad validada. |
| Tesorería | Y la plata del municipio, por fin ordenada. |
| CTA | Munify. Tu municipio, al día. |

### `vecino` — Para el vecino · estado: **borrador**
| Escena | Voz en off |
|---|---|
| Hook | ¿Un bache, una luz quemada, basura sin recoger? |
| Captura | Sacás la foto desde el celular. En treinta segundos. |
| IA / WhatsApp | La inteligencia artificial lo clasifica y lo manda al área correcta. |
| Seguimiento | Y lo seguís paso a paso, como un envío. |
| Logros | Encima, sumás puntos por mejorar tu barrio. |
| CTA | Munify. Tu ciudad te escucha. |

### `intendente` — Para el intendente · estado: **borrador**
| Escena | Voz en off |
|---|---|
| Hook | ¿Cómo viene tu gestión? En números, no en sensaciones. |
| Stat 1.284 | Mil doscientos ochenta y cuatro reclamos gestionados este año. Sin un papel. |
| Dashboard | Todo en una sola pantalla, que se actualiza sola. |
| Stat 87% | Ochenta y siete por ciento resueltos, en tres días promedio. |
| Mapa | Y mandás las cuadrillas donde más se necesitan. |
| CTA | Munify. Goberná con datos. |

### `tesoreria` — Tesorería · estado: **borrador**
| Escena | Voz en off |
|---|---|
| Hook | ¿La plata del municipio todavía vive en planillas de Excel? |
| Pagos | Cargás cada pago, autorizado y trazado. |
| Cajas | Ves el saldo de cada caja al instante. |
| Conciliación | Importás el extracto y el banco se cuadra solo. |
| Sueldos | Y liquidás sueldos sin dolores de cabeza. |
| CTA | Munify. Adiós, Excel. |

### `ia` — Atención con IA · estado: **borrador**
| Escena | Voz en off |
|---|---|
| Hook | ¿Y si tu municipio atendiera las veinticuatro horas? |
| WhatsApp | Por WhatsApp, por donde tus vecinos ya escriben. |
| Clasifica | La IA crea el reclamo y lo deriva al área correcta. |
| Trámites/Turnos | Da turnos e inicia trámites, sola. |
| Stat 0 | Cero esperas en la fila. El municipio nunca cierra. |
| CTA | Munify. Atención sin esperas. |

**Voz elegida:** _pendiente_ (el user prueba en `/reels`). Default sugerido:
**Lucia** (es-AR, cálida, publicidad).

## 5. Dirección VIDEO REAL con Google Veo / Flow

**Objetivo:** que los reels NO se sientan un "PowerPoint moderno" (mockups+texto).
Meter **b-roll cinematográfico real** generado con Veo (Flow:
`labs.google/fx/es/tools/flow`). Cuenta del user (Lucas, plan PRO).

**Cómo integrar (recomendado): híbrido.**
- Veo para **hook (apertura 2-3s)**, **transiciones** y **cierre** → momentos
  reales/cinematográficos que rompen el powerpoint.
- Mockups dark para **mostrar el producto** (claridad). No reemplazar todo.
- Técnica: **ffmpeg compose** — armar el reel renderizado como ahora y luego
  **concatenar/overlay** los clips Veo en timestamps fijos. Evitar meter `<video>`
  HTML en el ReelStage: la cámara lenta de captura (CDP) desincroniza el playback
  del video. Componer aparte con ffmpeg es determinístico.
- Formato Veo: **vertical 9:16**, ~8s, **sin texto/logos** (overlay propio),
  cálido (golden hour pega con el gold de marca). Veo 3 agrega audio → ignorar
  (usamos música/voz propias).

### PROMPTS listos para Flow (copiar y pegar, uno por clip)

1. **Establecedor del pueblo (hook `tour` / cierre)**
   `Aerial drone shot slowly descending over a small Argentine town at golden hour — low brick houses, a central plaza with palm trees, a church, quiet streets. Warm late-afternoon light, long shadows, smooth cinematic drone movement. Photorealistic, vertical 9:16, no text, no logos.`

2. **El vecino saca la foto (`vecino`)**
   `Close-up over-the-shoulder shot of a young Argentine woman's hands holding a smartphone, photographing a pothole on a residential street. Daytime, natural light, shallow depth of field, phone screen showing the camera viewfinder. Documentary realism, vertical 9:16, no text.`

3. **Cuadrilla resolviendo (`vecino` / `tour`)**
   `Municipal workers in orange high-visibility vests repairing a street and a streetlight in an Argentine neighborhood, mid-morning, a small utility truck nearby. Handheld documentary style, natural light, sense of action and progress. Photorealistic, vertical 9:16, no text.`

4. **Oficina / gestión (`intendente`)**
   `Slow dolly through a modern municipal office: employees at desks working on computers showing dashboards and maps, warm ambient light, plants, clean architecture. Calm, professional, productive mood. Cinematic, shallow depth of field, vertical 9:16, photorealistic, no text.`

5. **Atención por WhatsApp (`ia`)**
   `Close-up of a smiling middle-aged Argentine man looking at his smartphone at a kitchen table with a mate gourd nearby, reading a message, soft morning light through a window. Warm, relatable, documentary realism. Vertical 9:16, photorealistic, no text.`

6. **Trámite online / identidad (`tour` trámites)**
   `Close-up of hands using a smartphone to complete an online form, a generic national ID card (no readable text) resting on a wooden desk, clean modern setting, soft daylight. Crisp, trustworthy mood. Vertical 9:16, photorealistic, no text.`

7. **Tesorería / orden (`tesoreria`)**
   `Top-down shot of an organized desk: a laptop showing a clean financial dashboard, a cup of coffee, neatly stacked folders, a calculator, soft natural light. Calm, orderly, professional, slow rotation. Vertical 9:16, photorealistic, no text.`

8. **Cierre esperanzador (CTA)**
   `Wide cinematic shot of an Argentine town at dusk, streetlights turning on, a calm plaza with a few people walking, warm blue-hour sky. Hopeful, "a city that works" mood, slow push-in. Vertical 9:16, photorealistic, no text, no logos.`

**Naming sugerido al descargar:** `broll-pueblo.mp4`, `broll-foto.mp4`,
`broll-cuadrilla.mp4`, `broll-oficina.mp4`, `broll-whatsapp.mp4`,
`broll-tramite.mp4`, `broll-tesoreria.mp4`, `broll-cierre.mp4`. Dejarlos en
`design/reels/broll/` y desde ahí se componen con ffmpeg.

## 5-bis. TEMPLATE GANADOR — presentador a cámara (Veo 3 / Flow) · validado 2026-06-13

Talking head 9:16: una persona mira a cámara, dice una frase de venta y remata
con euforia. **Validado** con el clip de la chica en la puerta del municipio
(expresión + narrativa aprobadas por el user).

**ESTÁNDAR DE LOOK ACTUAL — "videos más reales" (fijado 2026-06-13):**
- **Gente común, NO modelos:** `an ordinary, real-looking, everyday Argentine [woman/man], natural and relatable, not a model`. Caras reales > caras de publicidad.
- **Tomas profesionales:** `professional cinematic, clean, sharp, well-lit, smooth and steady camera, high production quality`. **Descartado** el look `handheld UGC / grainy / lower quality` que probamos antes (el user lo bajó: gente común sí, calidad casera no).
- **Encuadre:** dolly-out que **arranca en medium (de la cintura para arriba, NO close-up de cara)** y abre a full body.
- Este look **pisa** los descriptores `beautiful / golden-hour / Photorealistic` del prompt patrón de abajo. Mantener la **estructura narrativa** del patrón (dolly-out, pausa actuada, euforia voz+cara, only-once), cambiando solo los descriptores visuales por los de arriba.

**Prompt patrón** (reemplazar `[LOCACIÓN]`, `[LO QUE SE REVELA]`, `[FRASE]`, `[REMATE]`):
```
Continuous dolly-out shot. It begins as a medium close-up of a beautiful young Argentine woman in her late 20s speaking to camera [LOCACIÓN], and the camera smoothly pulls backwards the entire time, ending as a wide full-body shot that reveals [LO QUE SE REVELA]. Warm golden-hour light, cheerful joyful atmosphere. She says in Argentine Rioplatense Spanish: "[FRASE]... ¡[REMATE]!" She delivers the first line in a calm, confident tone with a soft smile, pauses for a beat, then exclaims the final "¡[REMATE]!" with euphoric, excited, high-energy delivery — her voice rising enthusiastically while her face lights up in perfect sync: a big radiant smile, wide bright eyes and raised eyebrows, the facial expression matching the euphoric energy of her voice. Photorealistic, vertical 9:16, natural lip-sync, highly expressive face, no on-screen text, no logos.
```

**Ejemplo validado** (chica, puerta del municipio):
`[LOCACIÓN]` = `standing at the entrance of an Argentine town hall with a classic institutional facade, columns and an Argentine flag`; `[LO QUE SE REVELA]` = `the whole welcoming municipal building entrance with people happily coming and going`; `[FRASE]` = `Munifái es la forma más inteligente de gestionar tu municipio`; `[REMATE]` = `¿qué esperás?`.

**Por qué funciona — las 5 palancas:**
1. **Dolly-out de verdad:** liderar con `Continuous dolly-out shot` + definir encuadre **inicial ≠ final** (`begins as a medium close-up ... ending as a wide full-body shot`). En talking heads Veo ancla el plano fijo para el lip-sync; un simple "zooms out" lo ignora. Definir los dos extremos lo obliga.
2. **Pausa actuada, no muerta:** `...` en el diálogo + `pauses for a beat`.
3. **Euforia = voz + cara juntas:** `¡...!` con exclamación + contraste (`calm confident tone ... then exclaims with euphoric high-energy delivery, voice rising`) + sincronía (`face lights up in perfect sync ... matching the euphoric energy of her voice`).
4. **Marca fonética:** en el diálogo SIEMPRE `Munifái`, JAMÁS `Munify` (Veo la leería en inglés).
5. **Rioplatense:** `says in Argentine Rioplatense Spanish` + voseo (`tenés`, `esperás`).

**GOTCHAS de settings/prompt (aprendidos 2026-06-13):**
- **Formato:** el 9:16 lo manda el **selector de aspect ratio de Flow**, NO el texto del prompt. Con el selector en 16:9 sale horizontal aunque el prompt diga "vertical 9:16" (le pasó al clip de oficina).
- **B-roll sin presentador → que NO hablen:** agregar `No spoken dialogue, no talking; ambient sound only; people may smile and laugh naturally`. Si no, Veo mete diálogo en inglés y el lip-sync se ve raro.
- **Verificar movimiento de cámara:** NO con 3 frames sueltos (engañan — me pasó). Tira equiespaciada:
  `ffmpeg -i x.mp4 -vf "select='not(mod(n\,48))',scale=220:-1,tile=5x1" -frames:v 1 strip.jpg` → mirás si el sujeto cambia de tamaño a lo largo del clip.
- **Veo repite palabras** (salió "tu municipio tu municipio"): cerrar la frase con **punto** antes del remate (`...municipio. ¡¿Qué esperás?!`, NO `...`) y agregar al diálogo `says ... only once and without repeating any words`. Pasa cuando el diálogo es corto y Veo "rellena" los 8s.
- Settings base: **Veo 3, 9:16, 8s, "Texto a video"**.

## 6. Próximos pasos
1. User elige **voz** en el probador → generar la locución del `tour` (offline,
   con la key de SalesBot) y mezclar: voz adelante + música -18dB (ducking).
2. User genera los **clips Veo** con los prompts de arriba → integrarlos
   (hook + transiciones + cierre) vía ffmpeg compose.
3. Regrabar/recomponer los 5 y verificar con **frames del mp4** (no screenshots).
