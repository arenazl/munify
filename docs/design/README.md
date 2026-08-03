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

## Lo mínimo que hay que saber

- **Fuente de verdad: el canvas**, proyecto `46976e44-b6dc-4395-b1fe-15aa2a8f9584`.
  Figura con el nombre *"Rediseño de sidebar, banner y botones"*, que es con el
  que se creó — **su alcance es el rediseño de TODA la app**.
- **Los `.dc.html` son especificación visual, NO código a copiar.** Se leen y se
  implementan en React componible con tokens `--pl-*`. Ver §"Regla dura" en
  `01-circuito-y-fuentes.md`.
- **Las copias en `design/handoff-v2/references/` son caché**, no fuente. Antes
  de implementar, bajar el `.dc` fresco.
