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

### 3. Los cuatro tabs — el detalle, cuando enganchan

Debajo de la narración: **Plataforma · Reclamos · Trámites · Comunicación**
(constante `GUION`). Arrancan cerrados —el centro tiene que ser la narración—
y se abre el que el otro pida; el mismo toque lo cierra. No son bullets de
folleto: es texto para leer en voz alta, tal cual.

- **Plataforma** y **Reclamos**: dictados por el dueño.
- **Trámites**: redactado sobre lo que el módulo ya hace (turno online,
  precio y pago, requisitos por WhatsApp). **Falta que el dueño lo valide.**
- **Comunicación**: el dueño dictó la primera mitad (obras y avance); el
  cierre —notificación al celular y medición de alcance— se completó igual.

> **Ojo:** la narración nombra **tesorería** pero no hay tab de tesorería. Si
> el interlocutor pregunta por ahí, no hay guion. El dueño pidió cuatro tabs y
> esos cuatro se hicieron; queda anotado por si conviene un quinto.

### 4. La columna derecha: "Dato de color"

Ocupa el lugar donde estaba **"Recordar"**, y adentro va todo lo que se sabe
**antes** de marcar: quién manda (con el nivel de confianza del dato), cómo
llega el municipio, áreas, digitalización, para romper el hielo y la web.
Se repinta con cada municipio que se abre (`pintarDatoColor`).

La tarjeta **"Qué módulos tienen"** se eliminó: eran viñetas cortas que no
alcanzaban para decir nada por teléfono, y los tabs del centro las reemplazan.
Los tres consejos de **"Recordar"** siguen, debajo del dato de color.

## Verificado

Smoke con Playwright sobre el `index.html` generado: la narración se arma con
el municipio y el intendente reales, los cuatro tabs abren y cierran, el dato
de color trae los seis ítems, y **cero errores de JS** en consola.

## Dónde se toca

Todo en `scripts/calls/plantilla.html` (la ficha se arma en `abrir()`), y
después `python scripts/calls/build_calls.py` para regenerar
`frontend/public/calls/index.html`. **Nunca editar el `index.html` generado.**
