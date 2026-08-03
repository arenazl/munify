# Design handoff · Munify

Cómo entra el diseño a esta app: de dónde sale, cómo se baja, dónde queda
archivado y en qué estado está cada pantalla.

Existe por una razón concreta: **el diseño vive fuera del repo** (en un canvas de
Claude Design) y sólo entra por una herramienta MCP. Sin esta carpeta, saber qué
pantalla tiene diseño, cuál se implementó y contra qué versión, depende de la
memoria de quien estuvo en la sesión.

| Archivo | Qué tiene |
|---|---|
| [`01-circuito-y-fuentes.md`](01-circuito-y-fuentes.md) | De dónde sale el diseño, cómo se baja, dónde se archiva, y las reglas de trabajo (incluido: el `.dc` NO se copia) |
| [`02-inventario-pantallas.md`](02-inventario-pantallas.md) | Las 21 pantallas del canvas cruzadas contra el código: qué se implementó y qué falta |

## Paquetes bajados del canvas

Cada bajada del canvas queda en su propia carpeta fechada. **Se ordenan por
fecha y el número más alto es el más nuevo** — hubo versiones previas que
después cambiaron en el canvas, y ninguna se pisa: se agrega la nueva.

| Paquete | Fecha | Estado |
|---|---|---|
| [`paquetes/05_2026-08-03_configuracion/`](paquetes/05_2026-08-03_configuracion/) | 2026-08-03 | **VIGENTE** — Configuración maestro-detalle + **STANDARD de los controles del kit** (los que se agregan cuando un diseño trae uno que no tenemos) |
| [`paquetes/04_2026-07-31_handoff-v2/`](paquetes/04_2026-07-31_handoff-v2/) | 2026-07-31 | **VIGENTE** — kit v2: STANDARD del ABM semántico, tokens, 18 `.dc` de referencia |
| [`paquetes/03_2026-07-31_paraguay-limpio/`](paquetes/03_2026-07-31_paraguay-limpio/) | 2026-07-31 | Vigente para la marca Paraguay Limpio (brief, logos, spec del rediseño) |
| [`paquetes/02_2026-06-12_canvas-v1-curado/`](paquetes/02_2026-06-12_canvas-v1-curado/) | 2026-06-12 | Superado por el 04 |
| [`paquetes/01_2026-06-11_canvas-v1/`](paquetes/01_2026-06-11_canvas-v1/) | 2026-06-11 | Superado por el 04 |

`_media/` guarda los binarios pesados de esos paquetes (mp4, zip, capturas
exportadas — ~58 MB). **Está fuera de git** a propósito: no se versiona, no se
borra.

## Lo mínimo que hay que saber

- **Fuente de verdad: el canvas**, proyecto `46976e44-b6dc-4395-b1fe-15aa2a8f9584`.
  Figura con el nombre *"Rediseño de sidebar, banner y botones"*, que es con el
  que se creó — **su alcance es el rediseño de TODA la app**.
- **Los `.dc.html` son especificación visual, NO código a copiar.** Se leen y se
  implementan en React componible con tokens `--pl-*`. Ver §"Regla dura" en
  `01-circuito-y-fuentes.md`.
- **Los paquetes son caché, no fuente.** Antes de implementar una pantalla,
  bajar el `.dc` fresco del canvas y sobrescribir la copia del paquete vigente.
- **El canal es de doble vía.** `DesignSync` baja (`get_file`) y también **sube**
  (`finalize_plan` + `write_files`): se le puede escribir un brief al proyecto en
  vez de pegarle capturas a mano. Ver `01-circuito-y-fuentes.md`.
