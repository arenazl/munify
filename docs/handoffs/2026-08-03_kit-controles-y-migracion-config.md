# Handoff · Controles del kit v2 + migración de Configuración

**Fecha:** 2026-08-03
**Rama:** `qa`
**Estado:** implementado y compilando. **3 commits SIN pushear** (`11295ab`,
`0612ff6`, `d2edc95`) por pedido del dueño: se trabaja en local, sin publicar.
Los dos primeros (`cc328c0`, `f3fc427`) sí se pushearon, antes de esa orden.

Continúa `2026-08-03_configuracion-maestro-detalle.md`, que dejó como pendiente
"migrar al kit v2 las pantallas que usan el `ABMPage` viejo".

---

## 1. La regla que se estableció

> Cuando un diseño traiga un control que no tenemos, **no se maqueta adentro de
> la pantalla**: se componentiza en `components/abmv2/` con props que sirvan en
> otra app, y se documenta en el STANDARD que leen los agentes.

Escrita en `docs/design/paquetes/05_2026-08-03_configuracion/STANDARD-Controles-v2.md`
y resumida en `BUILD_GUIDE.md` §5. Es la respuesta a la consigna del dueño:
*"siempre que nos encontremos con un control interesante que no tenemos, lo
agarramos, lo componentizamos, lo llenamos de propiedades para que sea
polimórfico, y lo agregamos a nuestra colección"*.

## 2. Piezas nuevas del kit

| Pieza | Archivo | De dónde salió |
|---|---|---|
| `Switch` | `abmv2/Controls.tsx` | El interruptor de la fila del canvas. Reemplaza al checkbox nativo. |
| `SegmentedControl` | idem | Estaba maquetado 3 veces por dentro (vistas, estados, orden). |
| `FilterChips` | idem | Chips con contador fuera de una tabla. |
| `MetricCell` | idem | La columna "EN USO" (número + nota). También `kind: 'metric'`. |
| `ScalePicker` | idem | La prioridad 1..5 en cajas, en vez de un combo. |
| `Tile` | idem | El cuadrito de icono teñido que usaban 4 piezas por copia. |
| `useReorder` | `abmv2/useReorder.ts` | Reordenar arrastrando. Hook, no componente: sirve para tabla y tarjetas. |
| `AssignmentPanel` | `abmv2/AssignmentPanel.tsx` | El cuerpo "asignacion" del canvas. |
| `TreeList` | `abmv2/TreeList.tsx` | El cuerpo "arbol" del canvas. |
| `CardGrid` | `abmv2/CardGrid.tsx` | La vista 'cards' — cada pantalla se maquetaba la suya. |
| `IconColorPicker` | `abmv2/IconColorPicker.tsx` | Icono + color con vista previa. |

Además, en el orquestador: `hero` pasó a **opcional** (un catálogo no tiene
veredicto que contar) y `reorder` es pass-through al `DataTable`.

**Decisiones que no conviene re-discutir** (el porqué está en el código):

- El reorden va con **drag nativo de HTML5 + teclado**, sin librería: 20 filas
  no pagan dnd-kit, y sin flechas el orden es inalcanzable sin mouse (en táctil
  el drag de HTML5 no existe).
- El `AssignmentPanel` pinta la **sugerencia punteada**, distinta del valor
  confirmado: un combo relleno con la sugerencia adentro se lee como
  "asignado" y nadie lo vuelve a mirar.
- El panel **esconde la columna de métrica** si ninguna fila la trae. Un
  encabezado "EN USO" sobre una columna vacía promete un dato que no existe.

## 3. Pantallas migradas

| Pantalla | Antes | Ahora |
|---|---|---|
| Categorías de reclamo · de trámite | `CategoriaConfigBase` con `StickyPageHeader` + tarjetas a mano | `SemanticAbmPage` embebida, tabla/tarjetas, switch en la lista, orden por arrastre |
| Asignación de dependencias | tablero de 2 columnas con `@hello-pangea/dnd` y borrador + "Guardar" | `AssignmentPanel`, guardado inmediato optimista, buscador y filtros |
| Catálogo de trámites | tarjetas agrupadas por categoría | `TreeList`: categoría → trámite → requisitos al expandir |
| Tipos de punto de interés | 287 líneas propias | instancia de `CategoriaConfigBase` (~110) |
| Categorías de inventario | 348 líneas propias | instancia de `CategoriaConfigBase` (~115) |

De paso se corrigieron: 3 usos de `confirm()` nativo, 5 emojis en badges de
método de cobro, y 5 errores de eslint preexistentes en `TramitesConfig`.

## 4. Ambiente de desarrollo (cómo quedó)

```
localhost:5175 (vite)  ──/api──▶  127.0.0.1:8002 (uvicorn local)  ──▶  Aiven `sugerenciasmun-qa`
```

- El proxy sale de `DEV_BACKEND_ORIGIN` en `frontend/.env.local`
  (gitignoreado). **Comentando esa línea se vuelve al backend de QA en Cloud
  Run**, que es el default de `vite.config.ts`.
- El backend local se levanta con la URL del secret, sin escribir credenciales:

  ```bash
  cd backend
  DATABASE_URL="$(gcloud secrets versions access latest --secret=DATABASE_URL_QA --project=munify-api)" \
    ENVIRONMENT=development PORT=8002 DB_AUTO_CREATE=false \
    python -m uvicorn main:app --host 127.0.0.1 --port 8002
  ```

  `DB_AUTO_CREATE=false` a propósito: el schema de QA lo gobierna el deploy, no
  un `create_all` desde una máquina de desarrollo.
- Verificación de que apunta a QA y no a otra base:
  `curl -s http://localhost:5175/api/municipios/public` → 56 municipios,
  el primero Chacabuco.

**Bug arreglado para que el backend arranque contra una base vacía:**
`push_subscriptions.endpoint` era `TEXT` con `UNIQUE` y MySQL no acepta índice
sobre TEXT sin longitud de clave (`error 1170`). Ahora es `VARCHAR(500)`. En QA
y prod nunca se vio porque la tabla ya existía; sólo aparece creando el schema
de cero.

## 5. Hallazgo abierto (NO tocado)

**8 scripts tienen la credencial de la DB de Aiven hardcodeada y los 8
escriben** (`INSERT`/`UPDATE`/`ALTER`/`DELETE`):

```
seed_categorias.py            run_migration.py           run_tramites_migration.py
scripts/add_validacion_dni.py scripts/add_validacion_facial.py
scripts/fix_dependencias_simple.py scripts/fix_solicitudes_enum.py
scripts/update_operatorias.py
```

Correr cualquiera por descuido escribe directo en esa base. La corrección
—leer `settings.DATABASE_URL` y abortar si la URL no es la esperada— **no se
hizo**: son ocho archivos fuera del alcance de este trabajo y hay que
decidirlo. Mientras tanto, para sembrar en local se leyeron los datos de
`seed_categorias.py` con `ast` sin ejecutarlo.

## 6. Qué falta

1. **Validación visual** en `localhost:5175`. Las 5 pantallas compilan y el dev
   server las sirve, pero nadie las miró.
2. **Los catálogos que siguen con pantalla propia**: tipos de empleado y
   parajes (hoy tabs de `ConfiguracionTesoreria`). Entran en
   `CategoriaConfigBase` igual que POI e Inventario.
3. **Las pantallas del `ABMPage` viejo** que no son catálogos (Usuarios, Zonas,
   Tesorería*, Suscripciones): funcionan embebidas pero su cabecera no es la
   del canvas.
4. **35 hooks condicionales en 8 pantallas** (`npx eslint src/ --ext .ts,.tsx |
   grep rules-of-hooks`) — heredado del handoff anterior, sigue abierto.
