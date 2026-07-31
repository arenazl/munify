# Handoff v2 — paquete de Claude Design (2026-07-31)

Origen: proyecto Claude Design 46976e44-b6dc-4395-b1fe-15aa2a8f9584
(design_handoff_dashboard_municipal/). Bajado con DesignSync.

- STANDARD-SemanticAbmPage.md — anatomia completa del ABM (TopBar/ModuleHero/
  ListToolbar/FilterBar/DataTable/SideModal) + estandar Gastos=Cobros.
- STANDARD-Variaciones-por-props.md — UN componente, kinds: plain|money|schedule|board;
  SideModal mode: detail|create|edit; flujos con steps (Mostrador).
- references/ — 10 pantallas de referencia (.dc.html, inline styles de Design:
  SOLO referencia visual, JAMAS copiar inline).
- Faltan en disco (estan en el proyecto Design, bajar con DesignSync si hacen
  falta): gasto-detalle.dc.html, reclamo-detalle.dc.html, form-alta-sidemodal.dc.html
  (sus reglas ya estan 100% descriptas en el STANDARD), tokens.css, components/.

Implementacion: frontend/src/components/abmv2/ (polimorfico sobre tokens --pl-*).
