# Antigravity · archivo histórico

Artefactos que dejó **Antigravity** trabajando la pantalla de Configuración
(agosto 2026). La herramienta **se da de baja**: esto queda como historial, no
como material vivo. Estaban sueltos en la raíz del repo y en `frontend/`, donde
confundían con código del proyecto.

**El código que produjo NO está acá** — sigue en su lugar y es trabajo en curso:
`frontend/src/pages/ConfiguracionMockup/`, `frontend/src/components/config/`
(`ArbolDelCanvas`, `AsignacionDelCanvas`) y `frontend/src/components/abmv2/AccordionTree.tsx`.

## Qué hay

### `scripts/`

Cómo pasó del prototipo del canvas al código, en orden de uso:

| Archivo | Qué hace | ¿Sirve? |
|---|---|---|
| `extract_scripts.cjs`, `extract_scripts2.cjs` | Sacan los bloques `<script>` de `design-sync/Configuracion.dc.html` | Descartable — one-liners de extracción |
| `extract_tabs.cjs` | Lista los `id` de los paneles (`entrar-panel`) del prototipo | Descartable |
| **`extracted_data.js`** | **El `<script type="text/x-dc">` completo del prototipo, 1492 líneas**: la clase `Component`, el estado (`padre`, `hijo`, `filtro`, `vista`, `orden`…) y **la estructura del brief con el `tipo` que decide qué cuerpo entra en cada tab hijo** | **SÍ, es la referencia útil** — es la lógica y los datos del mockup en crudo |
| `patch_mock_data.cjs` | Vuelca lo anterior a `ConfiguracionMockup/data/mockData.ts` | Referencia de cómo se generó el mock |
| `fix_ts_again.js` | Reemplaza a fuerza bruta `(c, cIdx)` por `(c: any, cIdx: number)` en los `.tsx` | **NO usar.** Es de dónde salen los `any` y parte de los errores de tipos que hay que limpiar |
| `test-routing.js` | Smoke de rutas con Playwright (cuenta las que fallan) | Reutilizable si se adapta |

### `capturas/`

13 PNG de pantallas de la app (bento, cola, concentración, dashboard de
verificación, empleado, layout, lista móvil, mi área, verificación móvil, qa
deployado, rotación, sheet, vecino). Referencia visual de cómo se veían las
pantallas en ese momento.

## Por qué se archiva

El prototipo contra el que hay que comparar es
[`../design-sync/Configuracion.dc.html`](../design-sync/), que se abre con doble
clic y es la especificación real. Estos scripts fueron el andamio para copiarlo,
no la fuente de verdad — y el `.dc` es **especificación, no código**: se
implementa con los componentes del kit y los tokens, nunca copiando el markup
(regla global 22).
