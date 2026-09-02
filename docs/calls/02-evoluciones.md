# `/calls` — qué le falta y por dónde seguir

Estado al **2026-08-27**. La app está en `munify-qa.netlify.app/calls` y funciona:
154 municipios con teléfono, el intendente de cada uno, el speech por país,
lo investigado de los 45 más grandes, dos vistas (Hoy / Trabajar) y el
asistente de IA en la ficha.

Esto es lo que sigue, **ordenado por lo que más devuelve**. No es una hoja de
ruta comprometida: es la lista para elegir cuando haya ganas.

---

## Las dos que más rinden

### 1. Enganchar el generador de demos desde la ficha

**Por qué.** El propio truco de venta del dueño, escrito en el speech, es:
*"pasame el nombre de tu municipio, te armo una demo en 10 segundos con los
datos reales de tu ejido y te mando un video de un minuto"*. Hoy eso hay que
hacerlo a mano, en otra pantalla, después de cortar.

**Qué sería.** Un botón en la ficha: **"Armar la demo de este municipio"**.
Llama a `POST /api/municipios/crear-demo` con el nombre, la provincia y el
país que ya están en la ficha, y devuelve el link listo para mandar por
WhatsApp. Todo lo necesario ya existe:

- el catálogo `municipios_catalogo` tiene el polígono de 5.122 municipios de
  6 países (y el generador ya elige la ciudad de ahí),
- la semilla arma la geografía real de esa ciudad (barrios y calles de OSM),
- el endpoint de creación es **público**, así que la app estática puede
  llamarlo sin auth.

**Lo que hay que resolver.** Que el municipio de la lista matchee con el del
catálogo (nombre + provincia + país); si no matchea, avisar en vez de crear
una demo sin geografía. Y qué hacer si la demo de esa ciudad ya existe.

---

### 2. El seguimiento después de la llamada

**Por qué.** Hoy la app termina cuando cortás. La venta no: se pierde en el
"quedé en mandarle el dossier" que nadie mandó, o en el "dijo que lo veía la
semana que viene" que pasó hace tres semanas.

**Qué sería.** En la ficha, un par de casillas: *mandé el mail*, *mandé la
demo*, *mandé el video*. Y en la vista **Hoy**, un bloque nuevo:
*"prometiste mandar y no mandaste"* + *"hace N días que no hay respuesta"*.
Es el mismo mecanismo de la agenda que ya existe (`proximo`), aplicado a
compromisos propios en vez de fechas de rellamado.

---

## Las otras cuatro

### 3. Que los datos sigan al usuario entre dispositivos

Hoy todo lo que se anota vive en el `localStorage` **del navegador donde se
llamó**. Arrancar en la compu y seguir en el celular son dos historiales
distintos; el puente son los botones *Bajar copia* / *Restaurar*.

Para que se sincronice solo hace falta backend: una tabla
(`municipio_id`, `estado`, `notas`, `proximo`, `hist`) y dos endpoints
(leer / guardar). **No está hecho a propósito**: la app tiene que abrir sin
login en medio de una llamada. Si se hace, que sea opcional — que funcione
igual sin conexión y sincronice cuando puede.

### 4. Que la IA pueda buscar de verdad

`groq/compound` es el único modelo de Groq con búsqueda web, pero **no entra
en el límite de 8.000 tokens/minuto del free tier** (rebota con
`request_too_large`). Con un tier pago se destraba y el asistente podría
traer novedades frescas antes de llamar: *"¿pasó algo en Río Tercero este mes
que me sirva para arrancar?"*.

Alternativa sin pagar: seguir haciendo la búsqueda web desde Claude Code
(como se hizo con los 154 intendentes) y volcarla a
`scripts/calls/datos/investigacion.json`. Más lento, pero gratis y verificado.

### 5. WhatsApp además del teléfono

Buena parte de estos municipios contesta más rápido por WhatsApp que por
conmutador. Un botón `wa.me/<numero>` al lado del de llamar, con el mensaje
ya redactado por la IA para ese municipio.

**Ojo con los números:** los del directorio son de conmutador, no de celular
— muchos no van a tener WhatsApp. Habría que agregar una columna aparte, no
asumir que el mismo número sirve.

### 6. Métricas de la campaña

Qué provincia contesta más, a qué hora conviene llamar, cuántas llamadas
hacen falta para un interesado. Con 154 municipios recién empieza a haber
muestra, pero en un mes de trabajo dice dónde poner el esfuerzo. Los datos ya
se están guardando (cada llamada queda con su hora en el historial): falta
leerlos.

---

## Cosas chicas que quedaron a mano

- **El asistente está al final de la ficha** y cuesta encontrarlo la primera
  vez. Un botón de IA arriba, al lado de *Llamar*, y otro en la tarjeta
  grande de **Hoy** para preparar la llamada sin entrar a Trabajar.
- **Los 109 municipios sin investigar** (sólo los 45 más grandes tienen
  secretarías, digitalización y dato de color). Se completan con otra pasada
  de búsqueda web.
- **Dos fichas con fuentes contradictorias**, marcadas `confianza: "baja"`:
  Cañete y Talara (Perú). Y **Guayaybí** (Paraguay) viene de una sola mención
  de prensa: confirmar antes de usarlo.
- **Un repaso obligado**: Paraguay y Perú votaron el **4 de octubre de 2026**.
  Todo ese padrón de intendentes cambia — ver
  [`01-actualizar-directorio.md`](01-actualizar-directorio.md).

---

## Lo que NO conviene hacer

- **Meter la API key en el código.** `/calls` es una página pública en
  Netlify: la key quedaría a la vista de cualquiera. Vive en el navegador del
  usuario, o entra por link una vez (`?k=...`).
- **Dejar que la IA traiga datos duros.** No tiene búsqueda web y los
  inventaría. El prompt se lo prohíbe explícitamente y el modelo se porta
  bien (contesta "no dispongo de información actualizada"), pero la regla es
  del sistema, no del modelo: los nombres y las cifras salen del
  relevamiento, no del chat.
- **Editar `frontend/public/calls/index.html` a mano.** Es salida generada:
  el próximo `build_calls.py` lo pisa. Lo visual va en
  `scripts/calls/plantilla.html`.
