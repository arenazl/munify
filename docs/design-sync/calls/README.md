# /calls — referencia visual para Claude Design

**Qué es:** el directorio de llamados a intendentes (154 municipios AR/PY/PE/UY)
que vive en `app-qa.munify.com.ar/calls`. `calls-referencia.html` es la página
COMPLETA con datos reales inyectados: **se abre con doble clic**, sin servidor
ni sesión — es la referencia para diseñar sin pasar capturas.

**Qué es este archivo y qué NO es:**
- Es una COPIA de la salida generada (`frontend/public/calls/index.html`),
  congelada el 2026-08-28 como referencia. **Nadie la edita**: ni Design ni
  ningún agente. Los cambios de diseño se piden **por prompt**, como siempre.
- La FUENTE real es `scripts/calls/plantilla.html` (HTML+CSS+JS autocontenido);
  los datos se inyectan con `python scripts/calls/build_calls.py`, que escribe
  `frontend/public/calls/index.html`. Quien implemente lo que Design decida,
  toca la plantilla y regenera.

**Reglas de la pantalla (para que el diseño no las rompa):**
- Dos vistas con switch: **Hoy** (la meta del día, el siguiente llamado, agenda)
  y **Trabajar** (lista filtrable + ficha por municipio).
- Tema claro/oscuro con el botón de la topbar (`data-tema` en `<html>`).
- Mobile: app-shell FIJO (regla 18 / doc 11 de base-compartida — html/body
  clavados, scrollea sólo `.app-scroll` y los paneles internos), header de UNA
  línea, la ficha entra como slide-over, paneles plegados por defecto.
- El asistente IA no pide key: pega a `/api/public/calls/ia` (server-side).
- Estado local en localStorage (estados de llamada, notas, agenda) — el diseño
  no debe asumir backend para eso.
