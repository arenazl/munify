# Rail y topbar — la intendencia arriba, Munify al pie

**Prototipo:** proyecto Claude Design `0128d6c7-91af-46f4-81dd-82d4debafa9a`,
archivo `Munify - Rail y topbar.dc.html`.

> El `.dc` es **especificación, no código**. Se implementa con los componentes
> del kit y los tokens `--pl-*`; jamás se copia el markup ni los estilos inline.

## La idea de fondo

Jerarquía invertida para white-label: **el municipio manda en la cabecera y
Munify baja al pie del rail.** El acento sale del municipio, no de la marca.

## Los cuatro bloques

| bloque | qué muestra | estado |
|---|---|---|
| **6a** | Layout desktop 1440: rail 264px, topbar 60px con la sesión al final | parcial |
| **6b** | El mismo rail con otro municipio — sólo cambian escudo, nombre y acento | parcial |
| **6c** | Rail claro, tres variantes | **no implementado** |
| **6d** | Los 6 temas en dos ejes | **implementado** |

## 6d — lo que se implementó

El cambio que pidió el dueño: *"se mejora y se simplifica la elección de las
apariencias"*. Los temas dejan de ser una lista de seis y pasan a una **matriz**:

```
             neutro      cálido      frío
  oscuro     Grafito     Tabaco      Marino
  claro      Nieve       Marfil      Hielo
```

Son **dos preguntas cortas** —¿claro u oscuro?, ¿neutro, cálido o frío?— en vez
de comparar seis muestras casi iguales. Y resuelve un feedback real del
2026-08-13: *"gris, negro y azul los veo muy similares"* — eran tres neutros
oscuros compitiendo por el mismo casillero.

Qué cambió y por qué, según el diseño:

- **Se va el negro puro** (`#0a0a0a`): sobre negro las tarjetas no se despegan y
  la sombra no existe. El neutro oscuro arranca en `#1b2027`.
- **Se va el blanco puro**: sin blanco roto hay que ponerle borde a todo. El
  neutro claro es `#fafaf9`.
- **Marfil y Ámbar se funden**: eran el mismo tema a un paso de distancia.
- **Aparece Hielo**, el claro frío. Era el hueco real: existía el oscuro frío
  (Marino) y no su equivalente claro.

Archivos: `config/themePresets.ts` (los temas y el eje `temperatura`),
`pages/Configuracion/panels/PanelApariencia.tsx` (la matriz) y
`pages/Configuracion/Configuracion.css` (`.ap-matriz`).

## Lo que el diseño dice y todavía NO está

- **6c — rail claro.** Tres variantes, con una nota que importa: la opción 3
  (rail blanco flotante, activo gris con barra de acento) *"funciona con los 13
  acentos sin excepción"*, mientras que la 2 (rail teñido) se rompe con amarillo
  y lima. Si se toca el rail claro, elegir con ese criterio.
- **Pie del rail con "Munify" + versión.** Es la otra mitad de la jerarquía
  invertida; hoy la cabecera ya es del municipio pero el pie no existe.
- **Contadores por item y badge por grupo** en el rail (15 reclamos, 6 órdenes).
- **La topbar** del diseño es oscura, con breadcrumb a la izquierda y la sesión
  (avatar + nombre + rol) al final.

## Una advertencia del propio diseño, sobre el acento

> *"Dale al municipio una paleta cerrada, no un selector libre. Con color libre
> alguien va a elegir un amarillo y el texto blanco de la píldora activa queda
> ilegible."*

Y si igual se quiere color libre: **calcular el color del texto según el
contraste del acento** en vez de fijarlo en blanco. Es exactamente la regla de
tinta sobre acento que ya está acordada en el proyecto.

## Cómo abrir el prototipo

El `.dc.html` necesita `support.js` e `image-slot.js` al lado. Se bajan del
mismo proyecto de Claude Design; no están versionados acá por peso.
