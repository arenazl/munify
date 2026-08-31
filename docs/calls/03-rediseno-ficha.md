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

### 3. Los cuatro tabs del speech — DETERMINÍSTICOS

Debajo de la narración: **Plataforma · Reclamos · Trámites · Tesorería**
(constante `GUION`). Arrancan cerrados —el centro tiene que ser la narración—
y se abre el que el otro pida; el mismo toque lo cierra.

**Son texto fijo, escrito, en criollo.** Nada de IA acá: son parte del speech,
y lo que se dice por teléfono no puede cambiar en cada llamada. El asesor
necesita una narrativa que ya conoce, no una sorpresa.

- **Plataforma** y **Reclamos** (con la orden de trabajo adentro): dictados
  por el dueño.
- **Trámites** y **Tesorería**: redactados sobre lo que los módulos ya hacen.
  **Falta que el dueño los valide.**

**El refresh de cada tema.** Arriba a la derecha del panel hay un icono de
refresh: si a la tercera llamada del día ya te aburriste de tu propio libreto,
la IA lo dice **de otra forma**. El prompt le pasa el texto original y le
prohíbe agregar nada que no esté ahí — sólo reordenar, cambiar palabras y
elegir el énfasis según el municipio. Queda marcado *"Dicho de otra forma"* con
un **"volver al mío"** a un clic, y si la IA falla vuelve el original solo.
Verificado contra la IA de QA: reescribió los tres párrafos de Reclamos sin
agregar una sola función que no estuviera en el original.

> **Ojo:** la narración nombra **comunicación** como cuarto eje, pero el cuarto
> tab es **Tesorería**. Si preguntan por comunicación no hay tab (sí está el
> panel de la derecha). Sumar un quinto es una entrada más en `GUION`.

### 4. Los paneles de la derecha — ahí sí, IA con botón

Vuelve **"Qué módulos tienen"** arriba de la columna derecha, con los cinco
módulos plegables: Reclamos, Trámites, Cobros y tesorería, Comunicaciones,
Campo y personal. Cada uno muestra sus bullets fijos —lo que el módulo hace— y
un botón **"Contame más de X"**.

Ese botón manda a la IA la **mini base de datos** de ese módulo (`kb`: los
hechos en crudo) junto con la ficha del municipio, y devuelve **el ángulo de
ese módulo para ese lugar**: por qué le sirve a ellos, con qué enganchar. Dos
párrafos, tope duro de 55 palabras — es una columna angosta y se lee en plena
llamada.

*Why:* los bullets solos eran, en palabras del dueño, un mazacote que no
alcanzaba. La consulta del asesor mientras habla es otra cosa que el speech.

La regla del prompt es dura y explícita: **cada función que mencione tiene que
estar en la lista de hechos; si no está, no existe**. Prohibido traer funciones
de otros módulos (si la lista no habla de fotos, no hay fotos), inventar cifras,
plazos o casos de éxito. Del municipio puede usar el contexto —tamaño, áreas,
si ya tienen algo digital— para elegir el énfasis, nunca para agregar una
función. *Why:* un dato inventado dicho por teléfono a un intendente es un
papelón irreparable.

- **Cache** por municipio+módulo en `localStorage` (el endpoint tiene rate
  limit de 40/hora). El link **"Otra vuelta"** borra ese cache y pide de nuevo;
  con el texto a la vista, el botón de abajo se esconde.
- Si la IA falla: *"No pude generarlo ahora"* + **Reintentar**. Los bullets
  fijos siguen ahí, así que el panel nunca queda vacío.

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

### 5. La columna derecha: "Dato de color"

Debajo de los paneles de módulos va lo que se sabe **antes** de marcar: quién
manda (con el nivel de confianza del dato), cómo llega el municipio, áreas, qué
usan hoy, para romper el hielo y la web. Se repinta con cada municipio que se
abre (`pintarDatoColor`).

Era un ladrillo de texto corrido — *"un membrete del Clarín del 80"* (dueño,
2026-08-30). Ahora **cada dato es su propio panel con su icono**, y lo largo se
recorta a seis líneas con un **"más"** que lo abre en el lugar: en esa columna
hay que barrer de un vistazo, no leer.

Y **"Qué usan hoy" se dibuja**, que es el dato que decide la conversación:

- un **veredicto** de un vistazo, con su color — *Ya tienen app propia* (rojo,
  competimos), *Tienen web, no app* (ámbar), *Terreno virgen* (verde), *Sin
  relevar* (gris);
- los **canales** que ya tienen como chips con icono: App, Web, Teléfono,
  WhatsApp, Redes, Presencial.

Los dos salen de **leer el texto del relevamiento** (`investigacion.digital`),
no de un dato nuevo: si el texto no nombra un canal, el chip no aparece. Es una
lectura por palabras clave y puede errar en un caso raro — el párrafo completo
queda debajo, siempre.

**"Recordar" se eliminó entero** (dueño, 2026-08-30): los tres consejos
genéricos, la rotación, el `TIPS` de los datos y su parte en `build_calls.py`.
Con eso se fue también el consejo *"La última vez"*, que repetía lo anotado en
la llamada anterior — eso ya vive en el Historial de la ficha.

## Verificado

Smoke con Playwright sobre el `index.html` generado, servido por HTTP y con el
endpoint interceptado:

- la narración se arma con el municipio y el intendente reales;
- los cuatro tabs del centro abren con su texto fijo y **cero llamadas a la
  IA** (determinístico, como tiene que ser);
- en la derecha, el botón de cada módulo muestra "Buscando el ángulo para
  ...", el prompt que sale lleva la KB de ese módulo **y** la ficha del
  municipio, reabrir el panel no vuelve a pedir (cache) y "Otra vuelta" sí;
- con el endpoint en 502 aparece "No pude generarlo ahora" + Reintentar, con
  los bullets fijos intactos;
- **cero errores de JS.**

Contra la IA real (Groq, con el fix del backend): los ángulos de Godoy Cruz y
Luque salieron de 50 palabras cada uno, en dos párrafos, tomando en cuenta que
Godoy Cruz ya tiene app de reclamos propia — y sin inventar nada fuera de la
KB.

## Dónde se toca

Todo en `scripts/calls/plantilla.html` (la ficha se arma en `abrir()`), y
después `python scripts/calls/build_calls.py` para regenerar
`frontend/public/calls/index.html`. **Nunca editar el `index.html` generado.**
