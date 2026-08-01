# Handoff v2 — paquete de Claude Design (2026-07-31)

Origen: proyecto Claude Design 46976e44-b6dc-4395-b1fe-15aa2a8f9584
(design_handoff_dashboard_municipal/). Bajado con DesignSync.

- STANDARD-SemanticAbmPage.md — anatomia completa del ABM (TopBar/ModuleHero/
  ListToolbar/FilterBar/DataTable/SideModal) + estandar Gastos=Cobros.
- STANDARD-Variaciones-por-props.md — UN componente, kinds: plain|money|schedule|board;
  SideModal mode: detail|create|edit; flujos con steps (Mostrador).
- references/ — 9 pantallas de referencia (.dc.html, inline styles de Design:
  SOLO referencia visual, JAMAS copiar inline).
- tokens.css — tokens del disenador TAL CUAL (con los colores hardcodeados en
  verde). NO se copia literal a la app: ver "Nuestra impronta" abajo.
- Faltan en disco (bajar ON-DEMAND justo antes de implementar esa pantalla, para
  no quemar contexto): reclamo-detalle.dc.html, form-alta-sidemodal.dc.html (sus
  reglas ya estan 100% descriptas en el STANDARD), gasto-detalle.dc.html,
  horarios-oficina.dc.html, components/ (KpiCard.tsx, SemanticHero.tsx + css).

## Como bajar lo que falta

**Los subagentes NO heredan la conexion con Claude Design** — la tool DesignSync
solo existe en la sesion principal. Verificado el 2026-07-31: cuatro agentes en
paralelo fallaron con "No matching deferred tools found" (ninguno invento
contenido, correcto). Hay que bajarlos desde la sesion principal:
DesignSync get_file + Write al path de references/.

## Nuestra impronta (donde NO copiamos al disenador)

El disenador hardcodea la paleta en tokens.css (verde #00B37E y derivados).
Nosotros NO: los tokens de COLOR los computa ThemeContext desde el theme activo
(ver frontend/src/styles/pl-tokens.css + contexts/ThemeContext.tsx). Los tokens
ESTATICOS (tipografia, tracking, espaciado base 4, radios, motion, layout)
coinciden 1:1 con los de el. Esa es la diferencia que hace que el kit sirva para
cualquier app/marca y no solo para Paraguay Limpio.

Implementacion: frontend/src/components/abmv2/ (polimorfico sobre tokens --pl-*).
