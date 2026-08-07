# design-sync — los prototipos de Claude Design, tal cual llegan

Acá viven los **HTML autoejecutables** que baja Claude Design (`.dc.html`), con
los dos scripts que necesitan para abrirse solos. Se abren con doble clic: no
hace falta servidor, ni el canvas, ni la sesión del agente que los bajó.

**Por qué existe esta carpeta:** el diseño no puede quedar en el contexto de un
agente. Si vive sólo ahí, el próximo agente —o vos con otra herramienta— no
tiene con qué comparar, y cada uno reimplementa la pantalla a su manera. Es
exactamente lo que pasó con Configuración.

| Archivo | Qué es |
|---|---|
| `Configuracion.dc.html` | El prototipo COMPLETO de Configuración: 8 grupos, 40 pantallas, los 17 ABM con sus KPIs, los catálogos, los puentes, el árbol de trámites, la asignación y Apariencia. Navegable: se cambian solapas, se abre el drawer, se alternan estados. |
| `Mostrador.dc.html` | La consola del operador de ventanilla, VIGENTE al 2026-08-07 (reemplaza a los dos `mostrador-*.dc.html` de `docs/design/paquetes/04`, que eran idénticos entre sí). Flujo de 3 pasos: identificar (segmented Buscar vecino / Por celular con QR+RENAPER) → elegir gestión (4 cards con atajos R/T/U/D) → cargar. ALCANCE decidido por el dueño: se implementa HASTA la elección; la carga pasa en los módulos reales (Reclamos/Trámites/Turno) con el vecino precargado — el paso 3 embebido del prototipo se ignora. |
| `support.js` | Runtime de Claude Design (`x-dc`). Sin esto el HTML no renderiza. |
| `image-slot.js` | El componente de las fotos arrastrables del prototipo. |

## Cómo se usa

1. **Abrir**: doble clic en el `.dc.html`. Anda offline.
2. **Comparar**: al lado de la app real. Lo que está en el prototipo es la
   especificación; lo que no coincide, es un desvío a corregir.
3. **Los toggles de arriba del prototipo NO son controles de la app**: son los
   ESTADOS que hay que saber dibujar (validación que sale bien vs. que sale
   mal, densidad cómoda vs. compacta, qué módulos tiene contratado el
   municipio). Sirven para ver los dos casos sin tocar datos.

## Reglas

- **El `.dc` es especificación, no código.** No se copia el markup ni los
  estilos inline: se implementa con los componentes del kit (`components/abmv2`)
  y tokens `--pl-*`. Copiar el HTML ya costó dos días de arreglos.
- **Se copia lo que el diseño decidió** —copy, KPIs, columnas, orden, reglas— y
  no se reinterpreta. Si el criterio propio choca con el diseño, gana el
  diseño y se avisa.
- **Cuando el mockup muestra un dato que el motor no tiene**, no se hardcodea
  el número del prototipo ni se deja el hueco: va otro dato REAL y relevante de
  esa misma sección, en la misma posición y tipografía.
- **Bajar de nuevo**: `DesignSync.get_file` sobre el proyecto
  `46976e44-b6dc-4395-b1fe-15aa2a8f9584` y se pisa el archivo. Los `.dc` del
  canvas cambian: este es el estado al 2026-08-03.

## Qué se implementó de este prototipo

`config/canvasAbmSpec.ts` y `config/canvasConfigSpec.ts` son la traducción a
datos de este HTML (los 17 ABM, el árbol de 40 pantallas, los catálogos y los
puentes). El estado del trabajo está en
`docs/handoffs/2026-08-03_kit-controles-y-migracion-config.md`.
