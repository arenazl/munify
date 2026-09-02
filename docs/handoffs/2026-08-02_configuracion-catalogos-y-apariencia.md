# Handoff · Reordenar Configuración (Catálogos) + acotar Apariencia

**Fecha:** 2026-08-02
**Estado:** ESPECIFICADO, NADA IMPLEMENTADO. No se tocó una línea de código de
producto. Lo único que se hizo en esta sesión fue mover `design/` a
`docs/design/paquetes/` (commit `9d72997`).
**Origen:** pedido del dueño. Dos frentes que salieron de la misma conversación
y se trabajan por separado.

---

## Frente 1 — Reordenar Configuración

### El problema, medido

`frontend/src/pages/Configuracion.tsx:618-699` define 6 pestañas. La pestaña
**Catálogos tiene 15 tarjetas** y es un cajón: adentro conviven un exportador de
CSV (`Exportar Reclamos`), un ABM de super admin (`Municipios`) y un
configurador de UI (`Dashboards`). Ninguno de los tres es un catálogo.

> Palabras del dueño: *"Catálogo se volvió monstruoso, y es la base de la
> aplicación"*.

### El criterio de agrupación: FK real, no parecido semántico

Se verificó el grafo de foreign keys en `backend/models/`. Tres hallazgos
cambiaron la agrupación intuitiva:

1. **`categorias_reclamo` es un hub, no un catálogo suelto.** La referencian
   `sla.categoria_id`, `configuracion_escalado.categoria_id`,
   `cuadrillas.categoria_principal_id` y `empleados.categoria_principal_id`.
2. **`zonas` no es geografía, es criterio de asignación.** La usan
   `cuadrillas.zona_id` y `empleados.zona_id`. Va cerca de Personal, no de mapas.
3. **`ordenes_trabajo` es el verdadero cruce del módulo operativo.** Consume
   `ot_tipos_trabajo` + `poi_id` + `cuadrilla_id` + `empleado_id` +
   `inventario_items`. Tipos de Trabajo, POI e Inventario son **un circuito**,
   no tres catálogos independientes.

### Agrupación propuesta (5 grupos, ninguno de más de 7 ítems)

| Grupo | Entra | Pegamento (FK verificada) |
|---|---|---|
| **Municipio** | Datos del municipio, Zonas, Dependencias, Asignación | base de empleados, trámites y agenda |
| **Personal** | Empleados, Cuadrillas, Ausencias, Tipos de empleado | `empleados` → `zona_id` + `categoria_principal_id` + `municipio_dependencia_id` |
| **Operación** | Categorías Reclamo, SLA, Escalado, Tipos de Trabajo, Tipos de POI, Inventario, Categorías Inventario | `categorias_reclamo` (hub) + `ordenes_trabajo` (cruce) |
| **Trámites** | Categorías Trámite, Tipos de Trámite, Documentos requeridos, Método de cobro, Catálogo de Tasas, Agenda | `categorias_tramite → tramites → solicitudes`, cadena cerrada |
| **Tesorería** | los 7 de hoy | ya estaba bien separada, **no se toca** |

**Fuera de "Catálogos":**
- `Exportar Reclamos` — es una acción, no un catálogo. Va a Reclamos.
- `Dashboards`, `Sidebar`, `IA`, `WhatsApp`, `Municipios`, `Auditoría`,
  `Suscripciones` — van a un grupo **Sistema**.

### Zonas vs Parajes: NO se unifican

Parecen duplicados (dos geografías) pero no lo son, y la razón es de dominio:

- **Zonas** = barrios/áreas con ubicación, sirven para asignar cuadrillas y
  empleados.
- **Parajes** = regiones de campo **sin calle ni ubicación precisa**. Existen
  para poder decir "la casa de don Juan". Por eso `contactos.paraje_id` vive en
  tesorería y no toca `zonas`.

**Decisión pendiente del dueño:** podrían compartir una pantalla con dos tabs
(son dos tipos de zona). Lo definió como "eso lo decido luego". **No avanzar sin
que lo confirme.**

---

## Frente 2 — Acotar Apariencia

### El problema, medido

| Qué | Dónde | Cuánto |
|---|---|---|
| Presets de tema | `frontend/src/config/themePresets.ts` | **40** |
| Variantes por preset | `ThemeVariant = 'clasico' \| 'vintage' \| 'vibrante'` | 3 |
| Combinaciones | | **120** |
| Panel de temas | `frontend/src/components/Layout.tsx:1068-1290` (topbar) | grid de 40 + 3 variantes + 2 sliders de opacidad |
| Bloque de portada | `frontend/src/pages/Configuracion.tsx:976-1313` | 2 sliders de opacidad más |

**Está duplicado en dos pantallas y hay 4 sliders de opacidad repartidos.**

**El defecto de fondo no es la cantidad: es que el acento viene pegado al
preset.** Cada preset trae su color de acento adentro (`palette[3]`), así que
para tener "claro con naranja" hay que buscar cuál de los 40 casualmente es
claro y naranja. Fondo y acento tienen que ser **ejes independientes**.

### El modelo objetivo

El dueño pasó una captura de otra app suya con este sistema. Cuatro bloques,
cada uno una card:

| Bloque | Opciones | Nota |
|---|---|---|
| **Tema de fondo** | **3 oscuros + 3 claros** | La captura mostraba 5 (Oscuro, Gris, Azul, Claro, Marfil); el dueño pidió explícitamente 3 y 3 |
| **Color de acento** | 6 colores | *"Transversal a todos los temas. Pinta botones, activos y detalles."* |
| **Fondo de la barra lateral** | Orgánico · Tinte · Claro | *"Se arma en armonía con el color de acento activo."* |
| **Banner** | el usuario elige la foto | **Nuevo**, no existe hoy |
| **Tips de pantalla** | botón "Reincorporar todos los tips" | Ya existe el concepto de tip por pantalla |

Son ~14 controles en pantalla en vez de 120 cards, y da **más** combinaciones
reales que hoy, no menos.

### Luna y sol en el topbar

Del panel gigante del topbar queda **solo un toggle luna/sol**. No abre menú, no
lista temas:

- El usuario setea en Configuración **cuál es su claro** y **cuál es su oscuro**
  (uno de los 3 de cada familia).
- La luna/sol alterna entre esos dos. Nada más.

### Qué se elimina

- El panel de temas completo del topbar (`Layout.tsx:1068-1290`).
- Los **4 sliders de opacidad** (2 en `Layout.tsx`, 2 en `Configuracion.tsx`).
- Las 3 variantes (`clasico` / `vintage` / `vibrante`).
- 34 de los 40 presets.

### Gotcha de migración (no saltear)

El tema se persiste en `localStorage` **por usuario**:
`ThemeContext.tsx:78-80` lee `userScopedKey(userId, 'themePresetId')` y
`'themeVariant'`. Los usuarios que hoy tengan uno de los 34 presets que se van
quedan sin tema válido. **Hay que mapearlos al claro/oscuro más cercano de los 6
que sobreviven al cargar**, no dejar que caiga al default y les cambie la app de
un día para el otro.

---

## Frente 3 — El canal con Claude Design (contexto, ya resuelto)

Antes de diseñar estas pantallas hay que pasarle un brief a Claude Design.
**El canal es de doble vía y la mitad de subida nunca se usó**: el proyecto
tenía 87 archivos `pasted-*.png` en `uploads/` porque se le explicaba la app
pegando capturas a mano.

- Canvas: `46976e44-b6dc-4395-b1fe-15aa2a8f9584`.
- `DesignSync` **baja** (`get_file`) y **sube** (`finalize_plan` +
  `write_files`).
- **Claude Design no puede iniciar el contacto** — ve archivos aparecer, sin
  saber quién los puso, y no puede avisar cuando produce algo. El turno lo da
  siempre el dueño.
- Detalle completo en `docs/design/01-circuito-y-fuentes.md`.

---

## Cómo retomar

1. **Confirmar con el dueño** la agrupación de 5 grupos y qué pasa con
   zonas/parajes (pantalla única con dos tabs, sí o no).
2. Armar el brief y **subirlo** al canvas con `DesignSync write_files`
   (no capturas): mapa de las entradas de Configuración, el grafo de FKs de
   arriba, y el kit actual (`abmv2/`) en HTML para que diseñe con nuestros
   componentes.
3. El dueño pide variantes en el canvas y elige por número.
4. Bajar el `.dc` elegido a `docs/design/paquetes/05_<fecha>_<nombre>/` e
   implementar en React con tokens `--pl-*`. **El `.dc` es guía visual, jamás se
   copia el markup inline.**

**Los dos frentes son independientes.** Apariencia se puede hacer sin tocar
Catálogos y viceversa.
