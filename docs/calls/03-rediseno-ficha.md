# La ficha de llamada de `/calls` — separar lo que se DICE de lo que se SABE

> Estado: **IMPLEMENTADO** el 2026-08-30 en `scripts/calls/plantilla.html`.
> Pedido del dueño en sesión de revisión del flujo.

## El problema

La ficha central era una sola columna con nueve bloques visualmente idénticos
(todos `.box` gris) que mezclaban tres momentos distintos: **preparar**
(intendente, perfil, áreas, digitalización, web), **hablar** (el speech) y
**anotar** (estado, notas, historial).

El speech quedaba **séptimo**, a más de 1.000px de scroll — 731 caracteres,
118 palabras, ~45 segundos de lectura. Cuando el otro atendía, había que
scrollear para encontrar qué decir.

Encima el cartel decía **"Preguntá por Diego Costarelli"** y el speech entraba
directo al pitch, como si el intendente atendiera el teléfono.

## Lo que quedó

### 1. El centro es la narración, y nada más

De arriba a abajo: teléfono → *Ojo* (si el intendente tiene alguna alerta) →
**Lo que decís** → **Si te preguntan por** (los cuatro tabs) → cómo terminó →
qué me dijo → historial. Entra todo en una pantalla, sin scrollear.

### 2. La narración, corta y con el intendente adentro

Tres párrafos que se arman por municipio en `narracion(c, f)`:

1. Ubica la llamada — *"Me estoy comunicando con la Municipalidad de X, ¿verdad?"*
   (Uruguay dice **Intendencia**; el cargo sale de `funcionarios.json`, así que
   en Perú dice *alcalde*.)
2. Pide por el nombre **y da la salida en la misma frase** — *"Me habían dado
   para hablar con Fulano, si puede ser. Y si no está, con algún responsable
   del área de Modernización, o con el secretario del intendente."*
   Sin intendente conocido, arranca *"Quería hablar con el intendente"*.
3. El motivo en dos líneas: una plataforma online para la relación con el
   vecino, y los cuatro ejes nombrados — **reclamos, turnos para trámites,
   tesorería y comunicación**.

El cartel "Preguntá por" **se fue**: el nombre se dice adentro del speech.
El botón copia la narración con los saltos de párrafo.

### 3. Los cuatro tabs — el detalle lo escribe la IA en el momento

Debajo de la narración: **Plataforma · Reclamos · Trámites · Tesorería**
(constante `GUION`). Arrancan cerrados —el centro tiene que ser la narración—
y se abre el que el otro pida; el mismo toque lo cierra.

**El texto no está escrito.** Cada tab lleva su **mini base de datos** (`kb`):
los hechos reales de ese módulo, en crudo. Al tocarlo, esos hechos viajan
junto con la ficha del municipio (`iaContexto`) al endpoint que ya existía,
`/api/public/calls/ia`, y la IA devuelve dos párrafos de hasta 70 palabras
para leer en voz alta. Así la misma explicación suena distinta en un pueblo de
8.000 que en uno de 200.000, y toma en cuenta si ya tienen algo digital.

La regla del prompt es dura: **usar SOLO los hechos de la lista**. Puede
cambiar el énfasis según el municipio, no agregar una función que no exista.

- **Cache** por municipio+módulo en `localStorage`: el endpoint tiene rate
  limit de 40/hora y tocar cuatro tabs en cada llamada lo quema en diez
  municipios. El link **"Otra vuelta"** borra ese cache y pide de nuevo.
- **Paracaídas**: si la IA no contesta (sin red, rate limit, la página abierta
  como archivo local) se muestra el guion `base` escrito a mano, con el aviso
  *"Guión base: la IA no contestó"* y un **Reintentar**. Por teléfono, un
  panel en blanco es peor que un texto genérico.

> **Ojo:** la narración nombra **comunicación** como cuarto eje, pero el cuarto
> tab es **Tesorería** (el dueño lo cambió sobre la marcha). Si preguntan por
> comunicación no hay guion. Sumar un quinto tab es agregar una entrada al
> array `GUION` con su `kb` y su `base`.

### El bug que apareció haciendo esto

El asistente de IA de `/calls` **venía devolviendo respuestas vacías** con
prompts largos, y nadie lo había notado. Groq corre `openai/gpt-oss-120b`, que
razona por default, y **el razonamiento se descuenta de `max_tokens`**: con la
ficha del municipio adelante se gastaba 698 de los 700 tokens pensando y
devolvía `content` vacío con `finish_reason=length`.

Arreglado en `backend/api/calls_ia.py`: `reasoning_effort: "low"` para los
modelos gpt-oss, `max_tokens` a 1500, y un 502 explícito si el contenido viene
vacío (antes se devolvía `""` y el front no podía distinguir "no tengo nada
que decir" de "me quedé sin tokens"). Medido después del fix: 9 tokens de
razonamiento y la respuesta completa. **Esto arregla también el chat del
asistente**, no sólo los tabs.

### 4. La columna derecha: "Dato de color"

Ocupa el lugar donde estaba **"Recordar"**, y adentro va todo lo que se sabe
**antes** de marcar: quién manda (con el nivel de confianza del dato), cómo
llega el municipio, áreas, digitalización, para romper el hielo y la web.
Se repinta con cada municipio que se abre (`pintarDatoColor`).

La tarjeta **"Qué módulos tienen"** se eliminó: eran viñetas cortas que no
alcanzaban para decir nada por teléfono, y los tabs del centro las reemplazan.
Los tres consejos de **"Recordar"** siguen, debajo del dato de color.

## Verificado

Smoke con Playwright sobre el `index.html` generado, servido por HTTP y con
el endpoint interceptado: la narración se arma con el municipio y el
intendente reales; los cuatro tabs abren, cierran y muestran el "Armando lo
que le vas a decir de..."; el prompt que sale lleva la KB del módulo **y** la
ficha del municipio; reabrir un tab no vuelve a pedir (cache) y "Otra vuelta"
sí; con el endpoint en 502 aparece el guion base con su aviso. **Cero errores
de JS.**

Y contra la IA real de QA, los cuatro guiones de Godoy Cruz salieron de 88 a
99 palabras, en dos párrafos, sin inventar nada fuera de la KB.

## Dónde se toca

Todo en `scripts/calls/plantilla.html` (la ficha se arma en `abrir()`), y
después `python scripts/calls/build_calls.py` para regenerar
`frontend/public/calls/index.html`. **Nunca editar el `index.html` generado.**
