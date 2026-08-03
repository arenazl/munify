# Paquete 05 · Configuración (2026-08-03)

Bajada del canvas `46976e44-b6dc-4395-b1fe-15aa2a8f9584`.

| Archivo | Qué es |
|---|---|
| `Configuracion.dc.html` | El diseño. **Especificación visual, NO código a copiar** (ver `../../01-circuito-y-fuentes.md`). |
| `BRIEF-Configuracion.md` | Lo que se le pidió al diseño: estructura de tabs, asimetría 3-vs-10 hijos, qué hay adentro de cada uno. Escrito desde el repo con datos reales. |
| `STANDARD-Controles-v2.md` | **Lo que hay que leer antes de codear.** Inventario de controles del kit v2, la regla de ingreso, y las recetas de cada uno. |

## Qué salió de acá

**Pantalla** (implementada en los commits `adf5a5c`..`619ce9c`): Configuración
dejó de ser 6 pestañas con 15 tarjetas que sacaban al usuario a otra ruta, y
pasó a un maestro-detalle de tres niveles — grupos → riel de ajustes → panel
con la pantalla real embebida. Detalle y decisiones:
`docs/handoffs/2026-08-03_configuracion-maestro-detalle.md`.

**Kit**: el canvas trajo controles que no teníamos y se componentizaron en
`components/abmv2/` en vez de maquetarlos adentro de la pantalla —
reordenamiento por arrastre, panel de asignación, árbol jerárquico, switch,
segmented, chips de filtro, celda de métrica, escala ordinal y picker de
icono+color. El contrato de cada uno está en `STANDARD-Controles-v2.md` y en
`components/abmv2/types.ts`.

## Lo que el canvas define y conviene no re-discutir

- **Tres niveles de navegación**: tabs padre (módulo) → riel de hijos
  (catálogo) → panel. Se eliminó el salto a otra ruta: la pestaña hija ES el
  catálogo.
- **La asimetría es el caso difícil**: *General* tiene 3 hijos y *Tesorería*
  10, y los tabs padre aparecen o no según lo contratado. El riel vertical
  aguanta los dos sin verse vacío ni desbordado (una fila horizontal de 10 no).
- **El cuerpo entra pelado**: el título lo pone el shell, no el componente
  embebido. Resuelto por contexto (`EmbedProvider`), sin tocar las 33 páginas.
- **Cinco tipos de cuerpo**: `catalogo`, `abm`, `asignacion`, `arbol` y los
  propios (`form`, `qr`, `apariencia`).
