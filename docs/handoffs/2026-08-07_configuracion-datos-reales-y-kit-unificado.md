# Handoff · Configuración: datos reales, kit unificado y lo que quedó roto

> ## ACTUALIZACIÓN 2 — 2026-08-07, ronda "cablear la totalidad" (commits `4bea087`, `15c13fb`, `aad5ea2`)
>
> Mandato del dueño: "cablear la totalidad de la Configuración", súper admin
> AFUERA por ahora, y **Trámites es el gran tema** (unifica las 2 pantallas
> viejas de prod: misma info, UX del canvas).
>
> - **Trámites COMPLETO**: hero semántico real, alta de categoría (sheet
>   propio, `CategoriaTramiteSheet`) y de tipo de trámite (el wizard REAL de
>   prod, extraído a `components/config/tramiteFlows.tsx` — TramitesConfig
>   bajó de 1286 a 325 líneas consumiéndolo), edición con documentos desde el
>   lápiz, "Expandir todo". CTA dice "Nueva categoría de trámite", NO "Nueva
>   dependencia". Verificado con Playwright: los 3 sheets abren con datos
>   reales y la categoría llega preseleccionada desde la rama.
> - **Empleados** cableado (`datosEmpleados`): sin respaldo / sin zona /
>   chips que filtran. **Vecinos e Inventario** = pantalla PUENTE del canvas
>   (`PuenteDeModulo`) con dato real (reclamos totales; bajo el mínimo).
>   **WhatsApp e IA** = puentes a sus pantallas completas (mostraban el form
>   del muni, contenido de otra pestaña).
> - **Catálogo DESACOPLADO de operaciones** (decisión del dueño 2026-08-07:
>   "el catálogo lista, no cuenta"): sin columna "En uso" ni KPIs de uso.
> - **Kit**: `rowKey` acepta índice (homónimos duplicaban keys y React omitía
>   filas — pasó con Contactos); `StatusTab.count` opcional.
> - **Barrido Playwright de las 28 pantallas del tenant: 28/28 sin errores de
>   consola ni requests rotas.** Build + tsc + eslint en verde (los ~90 `any`
>   preexistentes del mock condenado siguen ahí).
> - **PENDIENTE (decisión del dueño)**: QR de cartelería — promete "reclamo ya
>   ubicado" pero el wizard del vecino no acepta ubicación por URL ni hay
>   endpoint de carteles; opciones: deep-link en el wizard (módulo central,
>   pide OK) o dejarlo para otra fase. — Altas de los demás ABM
>   (zonas/cuadrillas/cajas/…): `ALTA_DE_AJUSTE` sigue vacío para esas.
>   — "Sugerir estructura" del canvas: sin backend, no se dibujó.
>   — Portar a APP_GUIDE: `SemanticHero size`, `StatusTab.count?`, `rowKey`
>   con índice.

> ## ACTUALIZACIÓN — 2026-08-07, sesión 2 (commits `b16799d`, `5d30eaa`, `bfa6c69`)
>
> **Todo el §3 quedó RESUELTO y verificado en la app local con Playwright**
> (login Asunción muni 146, consola limpia, 0 requests rotas):
>
> - **§3.1 Trámites**: el fix del slot aplicado + la jerarquía ahora es REAL —
>   dependencia del muni → categoría → trámite (con `include_assignments`),
>   documentos como prerrequisitos. El "Otras Categorías" era ficción: las
>   categorías de trámite NO tienen dependencia; el vínculo real es
>   dependencia→trámite.
> - **§3.2 Asignación**: el `Network Error` NO se reprodujo (era transitorio,
>   probablemente reload de uvicorn con requests en vuelo). El bug REAL era
>   otro: se cruzaba contra el catálogo global (44 deps) por
>   `dependencia_defecto_id`, campo que las categorías NO TIENEN. Ahora cruza
>   por las categorías de cada dependencia del municipio: 6 de 17 asignadas,
>   uso real (`en_uso`).
> - **§3.3 Zonas**: la causa era "la forma del objeto": la API trae `activo`
>   (no `activa`), `reclamos_count` y `cuadrillas_count`, y NO trae barrios ni
>   resueltos. Columnas nuevas (reales): CUADRILLAS · RECLAMOS · DEL TOTAL ·
>   ESTADO. Chips con conteo real que FILTRAN (con/sin cuadrilla).
> - **Chips honestos en todos los ABM**: `StatusTab.count` es opcional; con
>   datos reales los conteos del prototipo se ocultan.
> - **§6.1 DireccionAutocomplete**: RESUELTO — `countrycodes` y contexto salen
>   de `municipios.pais` (AR conserva el comportamiento exacto de prod).
>   Verificado: "Palma 500" da 5 resultados con `py`, 0 con `ar`. Mismo fix en
>   `DependenciasConfig`.
> - **Apariencia**: cableada al motor de temas real (6 fondos, 13 acentos, 3
>   barras, de `themePresets` vía ThemeContext, con persistencia). Pedido del
>   dueño: mostrar TODOS los acentos. El banner "Cambiar foto" sigue sin
>   upload (existe `municipiosApi.updateImagenPortada` para cablearlo).
> - **§3.4 (altas)**: sigue abierto — decisión del dueño en curso.

**Fecha:** 2026-08-07
**Rama:** `qa` · **5 commits locales SIN pushear**
**Build:** verde (`npm run build`, ~48s) · TypeScript en 0 errores
**Supera a:** `2026-08-03_prototipo-configuracion-y-cableado.md` (varias de sus
afirmaciones ya no son ciertas — ver §0)

**Contexto del dueño:** tiene reuniones con contactos todas las semanas y
quiere que las demos salgan con esta versión lo antes posible. La prioridad es
**Paraguay (Asunción, municipio 146)**. Super admin queda para el final: no
entra en la demo.

Los commits, del más viejo al más nuevo:

| SHA | Qué |
|---|---|
| `71beddb` | El build volvió a compilar y las pantallas traen datos reales |
| `e88747f` | Iconos de Asignación + el árbol ya no da de alta dependencias |
| `388ce04` | El panel sigue el tema, y el riel deja de inventar números |
| `9100e47` | El país es del tenant, no está cableado a Argentina |
| `521f995` | Una sola pieza para las 8 pestañas, y el módulo deja de llamarse Mockup |

---

## 0. LO PRIMERO: dos cosas del handoff anterior que ya no valen

### 0.1 — El gate que se venía usando no chequea NADA

```bash
npx tsc --noEmit          # ← MIENTE. Sale verde sin abrir un solo archivo.
```

El `tsconfig.json` raíz tiene `"files": []` y sólo `references` a
`tsconfig.app.json` / `tsconfig.node.json`. Con `--noEmit` y references, no
compila nada.

Los gates que **sí** funcionan:

```bash
npm run build                          # tsc -b && vite build — el de verdad
npx tsc --noEmit -p tsconfig.app.json  # rápido, mismos errores de tipos
npx eslint src/ --ext .ts,.tsx         # reglas de hooks (React #310)
```

Esto no es anecdótico: **dos handoffs seguidos** dijeron "implementado y
compilando" de buena fe mientras `npm run build` fallaba con **20 errores**.
Entre ellos el `ViewKind` inválido que tiraba la pantalla del árbol de trámites
por ErrorBoundary. Un push así deja prod con el bundle viejo en silencio.

### 0.2 — El bug del `StickyPageHeader` ya no existe

El handoff anterior manda arreglar `StickyPageHeader.tsx:152`
(`if (embedded) return null`). **Ya lo arregló el commit `c9074b4`.** Hoy la
línea 180 hace `${embedded ? 'relative' : 'sticky top-0'}` y oculta sólo el
título y el "volver". El bloqueo real de los botones era otro (ver §3.4).

---

## 1. Ambiente

```
localhost:5173 (vite)  ──/api──▶  127.0.0.1:8002 (uvicorn)  ──▶  Aiven `sugerenciasmun-qa`
```

```bash
# backend — sin escribir credenciales en ningún lado
cd backend
DATABASE_URL="$(gcloud secrets versions access latest --secret=DATABASE_URL_QA --project=munify-api)" \
  ENVIRONMENT=development PORT=8002 DB_AUTO_CREATE=false \
  python -m uvicorn main:app --host 127.0.0.1 --port 8002

# frontend
cd frontend && npm run dev
```

**Gotchas del ambiente, todos verificados a los golpes:**

| Cosa | Detalle |
|---|---|
| Puerto de Vite | **5173** (el handoff viejo decía 5175 — ese día había otro server ocupando el puerto) |
| Login por API | `POST /api/auth/login` **form-urlencoded** con campo `username`, NO `email` ni JSON: `username=admin@asuncion.demo.com&password=demo123` |
| Sesión sin pasar por el form | `localStorage` con `token` **Y** `user`. Sin el segundo, `AuthContext` rehidrata vacío y manda a `/bienvenido` |
| Marca por ruta | `localhost:5173/` = Munify · `localhost:5173/asuncion` = Paraguay Limpio (white label) |
| Modelos del backend | **`--reload` NO re-importa `models/*.py`.** Kill + start, o el campo nuevo llega como `None` |
| Playwright | **el binario no está bajado.** Usar `chromium.launch({channel:'chrome'})` con fallback a `'msedge'` |
| `networkidle` | nunca llega (la app mantiene polling). Usar `domcontentloaded` + espera fija |
| Verificar que apunta a QA | `curl -s http://localhost:5173/api/municipios/public` → 56 municipios, el primero Chacabuco |
| Prompt de notificaciones | tapa media pantalla en las capturas: cerrarlo con el botón "Ahora no" |
| Windows | Vite **bloquea la carpeta**: para renombrar un directorio de `src/` hay que bajar el dev server primero |

Usuarios demo: `GET /api/municipios/public/asuncion/demo-users`, contraseña
`demo123`.

---

## 2. Cómo está armado el módulo hoy

### 2.1 — Mapa de archivos

```
pages/Configuracion/                      ← antes ConfiguracionMockup/
├── Configuracion.tsx                     EL CONTENEDOR. Rutea por `tipo` de subpestaña,
│                                         monta EmbedProvider, buscador Ctrl+K, contadores
├── Configuracion.css                     Chrome (hero, tabs, riel, cuerpo) — 100% tokens
├── components/
│   ├── MainTabs.tsx                      Fila de 8 grupos. Botones con role=tab
│   └── SidebarTabs.tsx                   Riel de subpestañas. Se apila arriba <980px
├── data/
│   ├── mockData.ts                       ⚠️ EL ÁRBOL de 8 grupos × 40 pantallas + datos de
│   │                                     muestra. 1400 líneas de JS sin tipos. CONDENADO
│   ├── mockHelpers.ts                    helpers del mock
│   └── datosRealesConfig.ts              cableado de catálogo / asignación / árbol / muni
└── panels/                               cuerpos que NO son ABM
    ├── PanelFormulario.tsx  PanelApariencia.tsx  PanelQr.tsx
    ├── PanelCatalogo.tsx    PanelAsignacion.tsx  PanelArbol.tsx

components/config/                        ← las piezas que traducen spec → kit
├── AbmDeConfiguracion.tsx                LOS 11 ABM. spec + CABLEADO → SemanticAbmPage
├── CatalogoDelCanvas.tsx                 los 7 catálogos simples
├── AsignacionDelCanvas.tsx               qué categoría atiende cada dependencia
├── ArbolDelCanvas.tsx                    categoría → trámite → requisitos
├── PantallaDeAjuste.tsx                  ★ NUEVO. Cáscara de las pestañas que no son listas
├── altasDeAjuste.tsx                     ★ NUEVO. Mapa ajuste → sheet de alta (hoy VACÍO)
├── datosDeAjuste.ts                      ★ EL CABLEADO. 24 entradas en CABLEADO + 8 en
│                                         CABLEADO_CATALOGO
└── CategoriaConfigBase.tsx               base de los catálogos con pantalla propia

config/
├── canvasAbmSpec.ts                      ★ Los 17 ABM tal cual los declara el canvas
└── canvasConfigSpec.ts                   ⚠️ HUÉRFANO — nadie lo importa. El árbol sale de mockData
```

### 2.2 — Flujo de datos de una pantalla ABM

```
Configuracion.tsx
  │  data = ABM_SPEC[hijoId]          ← estructura: columnas, copy, KPIs, reglas
  │  ajusteId = hijoId                ← ESTA es la prop que dispara los datos reales
  ▼
AbmDeConfiguracion
  │  CABLEADO[ajusteId]() ──► API ──► { filas, kpis, frases }
  │  filas = datos?.filas ?? reales?.filas ?? spec.filas
  │                                    ↑ mientras carga, muestra las del prototipo:
  │                                      la pantalla nunca queda en blanco ni cambia de forma
  ▼
SemanticAbmPage → SemanticHero (hero) + FilterBar + DataTable / viewSlots
```

**Las 24 entradas de `CABLEADO`:** cuadrillas, ausencias, sla, dependencias,
zonas, cajas, retenciones, proyectos, tarjetas, contactos, tasas, pagos,
auditoría, conceptos, conceptos-liq (+ alias `tesoreria-*`).
**Las 8 de `CABLEADO_CATALOGO`:** cat-reclamo, cat-tramite, tipos-poi, cat-inv,
y sus alias.

### 2.3 — Qué pieza usa cada tipo de subpestaña (después de unificar)

| `tipo` | Pantallas | Pieza | Hero |
|---|---|---|---|
| `abm` | 11 | `SemanticAbmPage` | `full` (frase + 5 KPIs) |
| `catalogo` | 7 | `SemanticAbmPage` | `full` |
| `arbol` | Trámites | `SemanticAbmPage` + `viewSlots.arbol` | `full` |
| `asignacion` | Asignación | `PantallaDeAjuste` | `simple` |
| `form` | muni, WhatsApp, IA, sidebar | `PantallaDeAjuste` | `simple` |
| `apariencia` | Apariencia | `PantallaDeAjuste` | `simple` |
| `qr` | Cartelería | `PantallaDeAjuste` | `simple` |

---

## 3. QUÉ QUEDÓ ROTO — lo primero que hay que hacer

### 3.1 — Trámites no dibuja el árbol · CAUSA IDENTIFICADA, fix claro

`ArbolDelCanvas` pasa:

```tsx
viewSlots={{ arbol: data ? <PanelArbol tramites={visibles} /> : null }}
```

`SemanticAbmPage` decide con `activeView in viewSlots` — usa `in` **a
propósito**, para respetar un slot `null` explícito ("esta vista no lleva
cuerpo"). Con `data === null` la **clave existe con valor null** ⇒ toma el slot
vacío y nunca cae al loading. Se ve sólo la pista y nada más.

**Fix:** que la clave no exista mientras carga.

```tsx
viewSlots={data ? { arbol: <PanelArbol tramites={visibles} /> } : undefined}
```

Los datos llegan bien: `/api/categorias-tramite` y `/api/tramites` devuelven
10 registros cada uno (verificado por curl).

### 3.2 — Asignación vacía · SIN EXPLICAR

`cargarAsignacionReal()` rechaza con **`AxiosError: Network Error`**, aunque
los dos endpoints que usa respondan **200 por curl**:

```
categorias-reclamo?incluir_inactivas=true   200 en 2,10s
dependencias/catalogo                       200 en 0,59s
```

Reproducido ejecutando la función desde la consola del navegador:

```js
const m = await import('/src/pages/Configuracion/data/datosRealesConfig.ts');
await m.cargarAsignacionReal();   // → AxiosError: Network Error
```

**Pistas, ninguna confirmada — no tomarlas como diagnóstico:**

- `lib/api.ts` tiene un **deduplicador de requests en vuelo** (loguea
  `🔄 [DEDUP] Reutilizando request en vuelo: /...`). Si dos componentes piden
  lo mismo a la vez, el segundo consumidor podría estar recibiendo algo raro.
- En la misma corrida aparece `Error cargando municipios: AxiosError`, así que
  **no es exclusivo de esta pantalla**.
- "Network Error" en axios también aparece cuando la request se **aborta**
  (AbortController al desmontar).

El `catch` ya no se traga el error: antes iba a `console.error` y la pantalla
quedaba en "Cargando asignaciones…" para siempre, que se lee como "tarda" y
era "se rompió".

### 3.3 — Zonas muestra los números del prototipo

El hero dice *"18 zonas cubren los 24 barrios. Seis barrios no están en ninguna
zona"* — sale de `canvasAbmSpec`, no de la base. `datosZonas` **está** en
`CABLEADO` y el endpoint `/api/zonas` responde 200 en 0,89s.

**Por dónde entrar:** comparar con `datosDependencias`, que sí funciona.
La diferencia probablemente esté en que `reales` queda `null` (el `.catch`
sólo loguea) o en la forma del objeto que devuelve.

### 3.4 — Ninguna pantalla tiene botón de alta

**No es un olvido, es el estado del diseño.** `AbmDeConfiguracion` no dibuja
el CTA si no recibe `onNuevo`, y `ALTA_DE_AJUSTE`
(`components/config/altasDeAjuste.tsx`) está **vacío a propósito**: mejor sin
botón que con un botón que no hace nada.

Para enganchar el alta de una entidad: escribir su sheet y sumarlo al mapa. El
CTA aparece solo.

**Dependencias NO va** — ver §4.1.

---

## 4. Decisiones tomadas — NO re-discutir

### 4.1 — El municipio NO crea dependencias

La estructura de secretarías y direcciones es el **estándar del país**, no algo
que cada municipio inventa. Munify mantiene el master; el municipio **habilita**
de ahí y hace ajustes internos (nombre, responsable, color, qué categorías
atiende). Si un intendente necesita una secretaría que no está, **se la pide al
super admin**.

La UI de producción ya hace esto bien: el botón dice **"+ Habilitar"**.

> Se llegó a escribir un `DependenciaSheet` completo (con los dos caminos:
> `POST /catalogo` + habilitar para secretarías, y `POST /municipio-direcciones`
> para direcciones) y **se borró** cuando el dueño confirmó el criterio mirando
> producción. No rehacerlo.

**Agujero abierto, reportado y sin corregir:**
`POST /dependencias/catalogo` tiene el docstring *"Solo superadmin puede crear"*
y un `# TODO: Verificar que sea superadmin` **sin hacer**; el check real es
`rol not in ["admin","supervisor"]`, así que un admin municipal pasa por API.

### 4.2 — Lo que el municipio NO elige son los MÓDULOS (es facturación)

**AGUJERO ABIERTO:** `PUT /modulos/{nombre}` (`api/modulos.py:77`) valida
`current_user.rol != RolUsuario.ADMIN`, y **`admin` ES el rol del admin
municipal**. El super admin se distingue por NO tener `municipio_id`
(`rol === 'admin' && !user.municipio_id`, así lo resuelve `AuthContext`).

Con esa comparación, **hoy un intendente puede prenderse el módulo de trámites
solo** — justo lo que la regla de negocio prohíbe. Reportado al dueño, sin
corregir (super admin va último).

### 4.3 — Cero endpoints nuevos

> "Este rediseño no debería agregar ni un endpoint nuevo. Todo lo demás es sólo
> nueva navegabilidad. Quizás algún filter o array nuevo para mostrar los datos
> de otra forma, pero **la materia prima no cambia para nada**."

Verificado: las pantallas de super admin **ya existen** en `pages/admin/`
(`Suscripciones`, `ModulosMunicipio`, `AuditLogs`, `ConsolaGlobal`), son
idénticas a master y usan endpoints existentes.

**Consecuencia:** los 4 COUNT que pedía el handoff anterior (SLA cumplimiento,
dependencias en cola, último arqueo, recaudado por tasa) **salen de la hoja de
ruta**. Ante un KPI que la API no devuelve: se deriva de lo que ya viene, o va
**otro dato REAL** de esa misma sección en la misma posición. Nunca el número
del mockup.

### 4.4 — Paraguay usa TODA la semilla de Argentina

Dependencias, secretarías, trámites y reclamos. Por eso los prompts de IA que
dicen "municipal argentino" (`api/dependencias.py:828, 1229, 1239`) y el
fallback de organigramas argentinos de la línea 1123 **están bien y no se
tocan** — un prompt no es visible y el conocimiento argentino es el correcto.

Lo que **no puede aparecer** es la palabra "Argentina" en algo que el cliente
vea. Un master por país es para más adelante.

### 4.5 — El tema es 100% localStorage

`ThemeContext` (551 líneas) no tiene **una sola** llamada al backend.
Estrategia vigente: **luna/sol × 6 fondos × acento configurable por settings,
sólo admin**. Los 40 presets viejos "quedaban horrendos y no los usaba nadie".

Consecuencia práctica: un hex fijo no rompe una combinación, rompe **doce**.

### 4.6 — Los KPIs son SEMÁNTICOS

> "Ahora todos los KPIs son semánticos, te explican las cosas. Nada de gráficos
> para estadísticos."

Titular con la **pregunta** ("¿En cuánto resolvemos?"), no con la métrica. Y el
número siempre con su vara ("0 de 3 categorías fuera de meta"). Requisito no
negociable: **la prosa sólo sirve si el dato es cierto**. Una frase que dice
"11 dependencias" cuando hay 5 es peor que una barra, porque se lee como
conclusión.

---

## 5. Qué se hizo, con su verificación

| Cambio | Cómo se verificó |
|---|---|
| Build reparado — 20 errores TS | `npm run build` en verde |
| Datos reales en las ABM | Dependencias: "Mostrando 5 de 5" + llama `/api/dependencias/municipio` |
| Spec desde `canvasAbmSpec` (estaba huérfano) | tipado, sin hex del prototipo |
| Árbol dejó de crashear | pide `/api/categorias-tramite` y `/api/tramites` |
| Iconos de Asignación | consola limpia; heurística centralizada en `abmv2/Glifo` |
| **Chrome al theme** | medido: `--pl-bg` = `#1e1e1e` y el wrapper vale `rgb(30,30,30)` |
| ~340 hex → tokens en los paneles | quedan 8, que son color de ENTIDAD (correcto dejarlos) |
| Marca desde `BRAND.name` | el eyebrow ya no dice "PARAGUAY LIMPIO" a mano |
| Buscador real (Ctrl+K, 8 grupos) | era un `<span>` decorativo |
| Contadores del riel reales | "Dependencias **5**"; sin número donde no se sabe |
| `municipios.pais` (ISO-2) | QA quedó AR=56, PY=1 |
| Las 8 pestañas, misma pieza | `PanelHeader` (hero duplicado a mano) borrado |
| `SemanticHero size="full"/"simple"` | implementada — no existía |
| `ConfiguracionMockup` → `Configuracion` | + se fue `/configuracion-mockup` |
| `sla/resumen`: **33s → 8s** | 4 mediciones antes, 3 después |
| Super Admin oculto para admin municipal | — |
| El panel no crashea con `sub` inválido | 4 URLs inválidas, 0 crashes |

### 5.1 — Los dos hallazgos que más movieron la aguja

**UNA SOLA PROP.** `AbmDeConfiguracion` trae datos reales sólo si recibe
`ajusteId`, y el contenedor no se lo pasaba. Las **24 funciones de `CABLEADO`**
estaban escritas, andando y colgadas de nada. Dependencias mostraba 11 filas
inventadas cuando hay 5.

**`sla/resumen` no era cosmético.** `get_sla_for_reclamo` hace hasta 3 queries
(específica → por categoría → general) y se llamaba **una vez por reclamo**:
244 reclamos × ~130ms contra Aiven ≈ 33 segundos. Como el navegador abre 6
conexiones por host y `useNavBadges` lo pide en **todas** las pantallas, ese
endpoint se comía una conexión del sistema entero durante medio minuto.
Memoizado por request (la config depende sólo de municipio+categoría+prioridad,
y de esas combinaciones hay pocas) bajó a 8s.

### 5.2 — El mapeo de color → token que se usó

| Literal | Token |
|---|---|
| `#FFFFFF` | `--pl-surface` |
| `#FAFBFA` `#F6F8F7` `#F4F7F6` | `--pl-surface-2` |
| `#EDF1EF` `#E8ECEA` `#F3F7F5` `#E3E9E6` | `--pl-surface-3` |
| `#F1F4F2` | `--pl-bg` |
| `#0D1412` | `--pl-text` |
| `#3D4945` `#5B6764` | `--pl-text-2` |
| `#7A8783` | `--pl-text-muted` |
| `#98A3A0` `#9AA5A1` | `--pl-text-faint` |
| `rgba(13,20,18,0.05-0.12)` | `--pl-border` |
| `rgba(13,20,18,0.14+)` | `--pl-border-strong` |
| `#00B37E` / `#00794F` / `#008F63` | `--pl-green` / `-700` / `-600` |
| `#E5484D` `#EF4444` | `--pl-red-700` |
| `#B4560F` `#D97706` | `--pl-amber-strong` |

**Los colores de ENTIDAD no se tocan** (el color propio de una categoría o
dependencia viene de la base: es dato runtime, no tema).

> `--pl-red-700` **sí existe** aunque no aparezca con grep: `ThemeContext` lo
> computa en runtime. Vale `#ec767a` en oscuro. Verificar tokens leyendo
> `getComputedStyle(document.documentElement).getPropertyValue('--pl-...')`,
> no con grep.

---

## 6. Hallazgos que valen para TODA la app

### 6.1 — `DireccionAutocomplete` sólo busca en Argentina · PENDIENTE

Fuerza `countrycodes: 'ar'` en sus **4** intentos y agrega
`", Buenos Aires, Argentina"` a la query. Probado contra el geocoder real con
una calle de Asunción: **0 resultados**. En Paraguay el vecino **no puede
cargar la dirección de su reclamo**, que es el corazón del producto.

Ya existe `municipios.pais` para arreglarlo sin tocar backend:
`countrycodes: (municipioActual?.pais || 'AR').toLowerCase()` y sacar el
", Buenos Aires, Argentina" de la query. Mismo problema en
`DependenciasConfig.tsx:295`.

### 6.2 — 6 dependencias mal cargadas en el catálogo

Se llaman "Dirección de…" pero tienen `tipo_jerarquico = SECRETARIA` y padre
`None`: Atención al Vecino, Tránsito y Seguridad Vial, Zoonosis y Salud Animal,
Rentas, Habilitaciones Comerciales, Bromatología.

En Asunción las 5 habilitadas están **todas planas**. En el catálogo global hay
44 (18 SECRETARIA + 26 DIRECCION, y esas 26 sí tienen padre real, colgando de 7
secretarías).

`tipo_jerarquico` **no lo lee nadie** fuera de la pantalla de dependencias — no
decide nada en el backend. Queda abierta la pregunta de si los dos niveles se
justifican.

### 6.3 — La IA de asignaciones no usa el motor central

`asignar_con_ia` está escrita a mano en `api/dependencias.py` con `httpx`
crudo, duplicando la cascada Groq→Gemini de `services/ia_service.py`:

| | `ia_service.py` | `api/dependencias.py` |
|---|---|---|
| `thinkingConfig: {thinkingBudget: 0}` | **sí** (línea 429) | **no** |
| Fallback sin IA | `clasificar_local()` | ninguno — devuelve `{}` y tira 500 |
| Parseo | del servicio | `re.search(r'\{[\s\S]*\}')` a mano |

### 6.4 — Cosas que NO son problemas (verificadas, no tocar)

- **El heatmap.** Su filtro dice "sólo puntos en Argentina" pero el bounding box
  (`lat<-18, lat>-56, lng<-53, lng>-74`) **incluye todo Paraguay**, Chaco
  incluido. Verificado con 5 ciudades paraguayas.
- **La semilla de Paraguay está bien curada:** 1263 puntos, los 1263 dentro de
  Paraguay, 0 fuera.
- **El país NO se puede deducir de las coordenadas.** Se probó y clasifica mal:
  un bounding box rectangular no distingue Uruguay de Buenos Aires (el Río de la
  Plata los separa, el rectángulo no: La Plata y Lomas de Zamora caían en 'UY')
  ni el Chaco argentino del paraguayo. Encima varios municipios de prueba tienen
  las coords mal cargadas. Por eso `NO_ARGENTINOS` es una **lista explícita** en
  `scripts/migrate_municipio_pais.py`.
- **Los 500 en cascada del backend** (todos los endpoints a la vez) son el DNS
  parpadeando: resuelve por **Tailscale MagicDNS** (`100.100.100.100`) y cuando
  se reconecta, `aiomysql` no puede resolver Aiven. No es el código.

---

## 7. Lo que sigue, en orden

1. **Los cuatro de §3** — Trámites (fix escrito), Asignación (sin explicar),
   Zonas, y decidir qué entidades llevan alta.
2. **`DireccionAutocomplete` por `municipios.pais`** (§6.1). Es el que rompe
   funcionalidad de verdad en la demo de Paraguay.
3. **Adoptar `AdaptiveFilter`** — **YA EXISTE**, no hay que construirlo:
   `components/ui/AdaptiveFilter.tsx`, 1486 líneas, `ResizeObserver`, píldoras
   ⇄ `+K` ⇄ combo, 6 pasos de degradación progresiva. Configuración simplemente
   no lo usa.
4. **Portar `SemanticHero size` al kit canónico** (`APP_GUIDE/components/v2`).
   La prop es agnóstica a propósito — no sabe nada de Munify.
5. **Semilla nueva de Paraguay** (el dueño la va a pedir; debería setear `pais`).
6. **Super admin, al final.** Incluye reemplazar la facturación inventada del
   spec de `suscripciones` (`$ 8.400.000`, vencimientos, planes — nada de eso
   existe en ninguna tabla) por los módulos reales de `municipio_modulos`.

---

## 8. Deuda anotada

- **71 errores de ESLint** en Configuración, casi todos `any` que vienen de
  `mockData.ts` (1400 líneas de JS sin tipos). Ese archivo **está condenado**:
  desaparece cuando todas las pantallas tengan datos reales. No vale la pena
  tokenizarlo ni tiparlo — es trabajo tirado.
- **`canvasConfigSpec.ts` está huérfano.** Nadie lo importa; el árbol sale de
  `mockData.ts`. O el contenedor lo consume, o se borra.
- **Dos tipos `FilaCatalogo` distintos** (`canvasConfigSpec` y `PanelCatalogo`).
  `cargarCatalogoReal` devuelve el del panel. Unificarlos.
- **`SemanticAbmPage` exige 18 props**, incluidas `columns`/`rows`/`kind` que
  una vista de árbol no tiene. `ArbolDelCanvas` las pasa en neutro con un
  comentario. Convendría volverlas opcionales cuando el cuerpo entra por
  `viewSlots`.
- **`sla/resumen` sigue en 8s.** Ya no hay N+1 (`prioridad_ot_map` usa una sola
  query); lo que queda es latencia contra una base en otro continente.
- **8 scripts del backend con la credencial de Aiven hardcodeada**, los 8 con
  escrituras. Heredado de handoffs anteriores, sigue abierto.
