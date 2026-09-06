# Handoff — rediseño de la pantalla Mapa (2026-09-06)

**Estado:** a mitad de camino. Compila, buildea y hay trabajo sin commitear.
**Última sesión:** larga y con muchas idas y vueltas. Leé "Los errores que cometí"
antes de tocar nada: casi todos son repetibles.

---

## 1. Dónde está todo

| | |
|---|---|
| Branch | `qa` |
| Último commit pusheado y deployado | `406f2257` |
| Deployado en | **`qa.munify.com.ar`** — OJO: **no** `app-qa.munify.com.ar`, que ya no responde |
| Municipio de prueba | Villa Carlos Paz, `municipio_id = 1000196`, slug `villa-carlos-paz` |
| Local | `cd frontend && npm run dev` → `http://localhost:5173/villa-carlos-paz` |
| Login demo | entrar por el slug y elegir **"Administrador"** en la pantalla de acceso |

**El `.env.local` de `frontend/` tiene `DEV_BACKEND_ORIGIN` comentado** para que el
proxy caiga al default (API de QA). Si lo descomentás apunta a `127.0.0.1:8002`, un
uvicorn local: si no lo levantás, la pantalla queda en blanco y el log de Vite tira
`ECONNREFUSED`. Pasó y costó tiempo.

### Sin commitear (compila y buildea)

- `frontend/src/pages/Mapa.tsx`
- `frontend/src/components/mapa/DonutZona.tsx`
- `frontend/src/components/ui/ConsultaGuiada.tsx`
- `frontend/src/styles/abmv2.css`
- `frontend/src/styles/consulta-guiada.css`

Qué traen:

1. **El número del donut sigue a la lente.** "Lo atrasado" muestra la cantidad sin
   cerrar, "Qué resolvimos" y "Dónde no llegamos" muestran un porcentaje.
   `svgDonut` pasó de recibir `total` a recibir `texto` ya redactado.
2. **Botón "Área"** en la barra de la consulta (antes era un panel entero abajo).
3. **La grilla se colapsa** (`av2-mapa-grilla--sola`) cuando no hay lecturas al
   costado: sin eso quedaban 340px en blanco al lado de un mapa achicado.
4. **La oración degrada a combos** por debajo de 1180px (`.cg-texto` se oculta y
   aparece `.cg-combo-label`). **Sin verificar en pantalla.**

---

## 2. Lo que el dueño pidió y NO está hecho

Ordenado por lo que más repitió.

### 2.1 Que entre todo en una pantalla de 1366×768 — **LO MÁS IMPORTANTE**

Medido con Playwright en 1366×768, **con el código del commit**:

```
topbar (tv2)      48px
av2-pagehead     155px
av2-hero-wrap    290px   <- el SemanticHero
consulta         236px
--------------------------------
el mapa arranca en y=762  → FUERA de la pantalla
scrollHeight total: 2272px
```

Textual: *"la gente no tiene monitores de 34 pulgadas"*, *"en una pantalla tiene que
entrar los filtros, el panel y el reproductor abajo"*.

**Lo que probé y funciona** (lo perdí, ver §3, pero está medido):

- Sacar `description` del `PageHeader`: 155 → **100px**. La bajada decía "Elegí una
  pregunta y el mapa te la contesta…", que es exactamente lo que la consulta guiada
  hace abajo.
- Reemplazar el `SemanticHero` por una tira horizontal de KPIs: 290 → **45px**.
  El CSS de esa tira (`.av2-mapa-tira`) **ya está en `abmv2.css`**, sin usar.
  Al sacar el hero quedan sin consumidores `heroFrases`, `timelapseRemate` e
  `irAZonasCalientes`.
- Falta bajar la consulta de 236 a ~120.

Con eso el mapa arrancaría en ~283 y entra.

### 2.2 El panel lateral: 3 cards, no 5

Textual: *"no podemos tener un panel al costado en donde yo tenga que hacer cuatro
veces scroll"*. Hoy `MapaArtefactos` dibuja 5. Deberían ser **el resumen de la lente +
dos gráficos relevantes para ESE enfoque**.

### 2.3 Gráficos, no más cards de texto

Le pasó a esta sesión una galería (`galeria-graficos.html`, proyecto de Claude Design
`5337e129-3f73-4791-ab60-fa4a0e37541b`). Los dos que marcó explícitamente:

- **Lollipop "Lo que más frena"** — días acumulados por motivo, tamaño del punto = cuántos
  trabajos. Su lectura: *"un punto chico muy a la derecha es un caso eterno; un punto
  grande al medio es un problema sistémico"*. **Encaja exacto con `motivo_pausa`.**
- **Heatmap día × hora "Cuándo entran los reclamos"** — dijo textual *"este es hermoso"*.
  Sirve para dimensionar guardias.

Y pidió que **los gráficos se hagan AGNÓSTICOS y vayan a la carpeta compartida**
(`APP_GUIDE/components/v2`), porque *"siempre usamos los mismos gráficos de mierda"*.

### 2.4 Los controles deben salir de la lente

Hoy `capaMapa` y `agruparPorZona` arrancan fijos, sin mirar la pregunta. Deberían
derivarse: "dónde se repiten" → Concentración; "lo atrasado" → Estado agrupado; "qué
resolvimos" no debería ofrecer el filtro de pendientes (siempre da cero).

Además `preguntaConfig.dibujo` quedó **vestigial pero no inerte**: sigue gobernando si
se calcula `burbujasBarrio` y el relleno de los polígonos. Bug concreto: la lista
"Dónde se concentra" se vacía en "Lo atrasado" por una condición que no tiene nada que
ver con ella.

### 2.5 El sticky

Confirmado en el código: **el `SemanticHero` NO está sticky** (está fuera del
`.av2-mapa-consulta--sticky`, que sólo envuelve la consulta). El dueño insistió dos
veces con que sí. Lo que pasa es que el hero mide 290px y al scrollear pasa por detrás
de la barra fija. Si se hace lo de §2.1 el problema desaparece solo.

---

## 3. Los errores que cometí — leer antes de tocar

### 3.1 Un regex de Python se comió 2.879 líneas de `Mapa.tsx`

Estaba borrando `const X = useMemo(...)` con:

```python
re.search(r"const %s = useMemo[\s\S]*?\n  \}, \[[^\]]*\]\);\n" % nombre, s)
```

`[\s\S]*?` es perezoso **pero igual salta hasta el siguiente cierre que matchee**, y si
el memo no termina con esa forma exacta, se lleva medio archivo. Quedó código dentro de
una `interface`. Se recuperó con `git checkout` y se re-aplicaron los cambios a mano.

**No borres bloques de TS con regex.** Cortá por número de línea después de verificar
principio y fin, o usá Edit.

### 3.2 Verifiqué el deploy contra el dominio equivocado toda la sesión

Estuve mirando `app-qa.munify.com.ar` cuando el dominio real es **`qa.munify.com.ar`**.
Varias veces le dije "ya está el bundle X" mirando un host que no era el suyo. Los otros
dos (`app-qa`, `qa-app`) hoy devuelven `http=000`.

### 3.3 Le pasé una URL de localhost sin probarla

El proxy apuntaba a un backend local caído. Su respuesta: *"esa costumbre de nunca
probar un carajo"*. **Probá la página Y la API antes de pasar una URL.**

### 3.4 Inventé componentes en vez de usar los del kit

Hice un `PanelesLaterales` con filas y barras propias. Su respuesta: *"Claude Design usó
nuestro diseño y vos hiciste uno que no sigue ningún patrón de la app"* y después *"todo
debería ser componentizable, debería usar ese componente y no crear uno parecido y mal
copiado"*.

**Los componentes que hay que usar:**

| Para | Componente | Dónde mirar un ejemplo |
|---|---|---|
| Card de pregunta en prosa | `components/ui/KpiSemantico` | `pages/Dashboard/secciones/CircuitoTramites.tsx` |
| Lista rankeada | `components/ui/RankedList` | ya se usa en `Mapa.tsx` |
| KPI compacto | `components/ui/KpiCard`, `components/dashboard/KpiCardV2` | `HeroFinanciero.tsx` |

El patrón del tablero es **armador + componente**: `armadoresTramites.ts` calcula y
`KpiSemantico` dibuja. `MapaArtefactos` ya se convirtió a eso.

### 3.5 Agregué en vez de fusionar

Su frase: *"la onda es fusionarlos, no agregarlos"*. Fui sumando panel lateral, después
columna rotativa, después secciones. **El sistema de lecturas ya existía**
(`MapaArtefactos`). Lo nuevo va adentro de lo que hay.

### 3.6 Bugs que introduje y ya arreglé (no repetirlos)

- **Mapa `position: sticky`** con la consulta también sticky → dos contextos de
  apilamiento, las cards se pintaban encima del mapa al scrollear.
- **`max-height` en `.av2-mapa-columna`** atado al alto del mapa (que calcula JS) → al
  redimensionar cortaba las cards por la mitad.
- **Piso de 420px en el alto del mapa** → en 768 la cuenta daba menos, se forzaba a 420
  y el reproductor caía fuera. El piso ahora es 260 y reserva 148px si el reproductor
  está abierto.
- **`clamp()` con `vh`** para el alto: lo intenté y es **peor** que medir. El JS mide
  `getBoundingClientRect().top` real; una resta fija (`100vh - 330px`) supone cuánto
  miden la topbar y los filtros y se rompe si envuelven. Su comentario: *"o por lo menos
  el javascript se calcula de forma relativa?"* — sí, y estaba bien.
- **Botón sin label** con ícono `Square` → se veía como un checkbox roto.
- **`&check;` literal** en `MapaArtefactos` (ya no existe ese código).

---

## 4. Decisiones tomadas que conviene NO revisar

Costaron varias vueltas.

1. **La mancha de calor mide densidad, no estado.** Va en violeta→magenta, fuera del
   vocabulario de estados. Antes usaba verde/ámbar/rojo, los mismos que los pines: un
   manchón rojo parecía "hay problemas" cuando sólo decía "hay muchos". Son constantes,
   no tokens del theme: si salieran del acento, un municipio con acento rojo vuelve al
   problema.
2. **El color de pines y donuts es el ESTADO, no el área.** *"Nos olvidamos de los
   colores a nivel de dirección de tránsito, para eso están los filtros"*. Sale de
   `estadoColors`, el SSoT visual de la app.
3. **Los reclamos son puntos de 6px, no pines.** El pin mide 42px y se ancla por la
   punta: con 200 en pantalla era *"el tren de Japón a la rush hour"*.
4. **La burbuja/donut se para en el CENTROIDE de sus reclamos**, no en el centro que el
   catálogo le da al barrio. Si no, la mancha queda en un lado y el círculo en otro y se
   leen como dos cosas. Fue un bug real: *"estamos errando el lat lng"*.
5. **El contorno del municipio no es clickeable.** Con "Zona única" cubre todo el
   municipio: siendo interactivo se tragaba todos los clicks y nunca se podía elegir un
   barrio.
6. **Identificar no necesita contorno.** En QA hay 2.028 barrios: 2.026 tienen
   coordenada y sólo 349 tienen contorno. `barrioDelPunto` (en `lib/mapaUtils.ts`)
   responde por contorno (un hecho) o por centro más cercano (una deducción).
   Verificado contra los 50 reclamos reales de Carlos Paz: 100% de acierto.
7. **El zoom no depende del setting del mouse.** `ZoomRuedaDeAUno` aplica un nivel cada
   140ms desde el último zoom aplicado. La ventana de silencio anterior era el bug: se
   reagendaba con cada evento, así que girando sostenido nunca terminaba el gesto.
   Además **todos los `MapContainer` declaran `scrollWheelZoom={false}`**: apagarlo sólo
   desde el efecto no alcanza y los dos handlers actuaban a la vez.
   La rueda sola scrollea la página; el zoom pide Ctrl (a pantalla completa, no).
8. **`motivo_pausa` tipificado.** El estado sigue siendo `pospuesto`; lo que se agregó es
   la razón, como ya hacía `motivo_rechazo`. Ver §5.

---

## 5. Backend: `motivo_pausa` (hecho y deployado)

- Enum `MotivoPausa`: materiales, clima, tercero, otra_obra, personal, sin_acceso,
  presupuesto, otro.
- `reclamos.motivo_pausa` (indexado) y `reclamos.pausado_desde`. **Aplicadas en QA.**
- Migración Alembic `20260905_mot_pausa` para que Infra promueva a prod.
- Al posponer se guarda el motivo; al salir de la pausa se limpia. No pisa el reloj si
  se re-pospone algo ya frenado.
- Las semillas (`services/seed_demo.py` y `scripts/semillas/m_60_mapa_volumen.py`) ya
  siembran el motivo tipificado junto con la frase del historial.
- Verificado en el OpenAPI de `munify-api-qa`.

**El dato que salió de ahí y todavía no se muestra en ningún lado:** ninguna área es
lenta —todas cierran en 10 a 15 días— pero **cada una arrastra una cola de 70 a 130 días
que nadie volvió a mirar**. Zoonosis cierra 29 casos en 13 días promedio y tiene 8
colgados hace 129. Ese es el hallazgo más fuerte de los datos.

---

## 6. Datos de prueba

`backend/scripts/seed_reclamos_carlos_paz.py --env qa --aplicar [--limpiar]`

200 reclamos de enero a hoy, los 10 estados, 41 de 45 barrios, concentración despareja a
propósito, con motivos de pausa e historial (703 movimientos). Marcados con
`referencia = 'seed-demo-cbapaz'`, así que `--limpiar` no toca los originales.

**Hace falta correrlo**: el municipio se recreó y la semilla oficial genera reclamos
recientes, así que "Lo atrasado" da cero y la mitad de las cards no tienen qué decir.

---

## 7. Cómo trabaja el dueño (lo que aprendí a los golpes)

- **Verificá antes de avisar.** Página Y API, y contra el dominio correcto.
- **Nunca inventes un componente.** Buscá el del kit primero.
- **Fusioná, no agregues.** Si ya hay un sistema para eso, lo nuevo va adentro.
- **Medí, no supongas.** Cuando dudó del alto, Playwright en 1366×768 dio la respuesta
  en un minuto; las tres vueltas anteriores fueron a ojo.
- Trabaja en **1366×768**, no en un monitor grande.
- Autorizó explícitamente abrir el browser para verificar (antes estaba vedado).
- Le importa **la altura de cada bloque**: cada píxel arriba es un píxel que le falta al
  mapa.

---

## 8. Lo primero que yo haría

1. Correr el seed de Carlos Paz (§6). Sin datos no se ve nada de lo que sigue.
2. Aplicar §2.1 completo y **medir con Playwright en 1366×768** que el mapa arranque
   antes de y≈300 y que el `scrollHeight` baje de 2272 a ~1000.
3. Bajar el panel a 3 cards (§2.2).
4. Recién ahí los gráficos (§2.3), pidiéndole al dueño que corra **`/design-login`** —
   sin eso no se puede leer `galeria-graficos.html` y se termina adivinando de capturas.
