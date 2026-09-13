# Gestión de obras — análisis para decidir (2026-09-10)

> Estado: **ANÁLISIS, sin implementar.** El dueño lo pidió la noche del 2026-09-10 para
> retomarlo al día siguiente: "por ahora es sólo análisis". Este doc junta lo verificado en el
> repo (branch `qa`), la decisión de dónde vive el módulo, dónde se carga la plata de una obra
> y cómo se cruza con cada módulo de Munify. Nada está acordado todavía.

## 1. Qué pidió el dueño (resumido de los mensajes de voz)

- Que los municipios **carguen obras con etapas**, y que las etapas se **crucen con gastos**.
  Hoy eso existe "de forma lateral" en tesorería.
- Mirar **la película y no la foto**: todo Munify. Primero decidir si obras es módulo propio o
  va dentro de uno existente. Después, cómo se **interconecta con el resto**, porque quiere
  que todos los módulos se hablen.
- Tiene que estar **superrelacionado con gastos**: los gastos ahora se van a asignar a una
  obra. Pero obras tiene **inteligencia propia** (etapas, fases, hitos intermedios). Duda: ¿la
  pantalla de Gastos es donde se suman los gastos de una obra, o la obra necesita algo similar
  pero pensado para la obra?
- Hoy tesorería registra gastos por concepto y **no existe la entidad obra**; lo más parecido
  es **Proyectos**, que recibe imputaciones de gastos. "Quizás proyectos tenga que evolucionar a
  obras o ser una variante de un proyecto, y ahí hacés el enganche."
- Contexto mayor: la app se divide en **dos universos**: *de cara al vecino* (trámites,
  reclamos, comunicación) y *gestión interna* (tesorería, empleados, etc.). Obras es interna.

## 2. Qué existe hoy (verificado en `qa`, 2026-09-10)

| Pieza | Dónde | Qué hace |
|---|---|---|
| `Proyecto` | `backend/models/proyecto.py` | nombre, descripción, presupuesto, fecha inicio/fin, estado contable (`activo/pausado/finalizado`) |
| Campos "Obras a la vista" (Comunicación E2, 2026-08-29) | mismo modelo | `publico`, `estado_obra`, `avance` (real) y `avance_publicado` (vecino), `foto_url`, `latitud/longitud`, `mostrar_monto` |
| `gasto_proyectos` | mismo archivo | N:M gasto ↔ proyecto con `monto_asignado`; un gasto se reparte entre proyectos |
| Imputación en el alta de gasto | `CrearGastoWizard.tsx`, paso 5 "Proyectos (opcional)" | elegís proyecto y monto, valida que la suma no supere el gasto |
| Orden de pago (Contaduría) | `backend/models/orden_pago.py` | `pendiente → autorizada → pagada`; **al pagarla crea el Gasto automáticamente** con cuota y movimiento de caja; tiene proveedor (`destino_contacto_id`), factura, retenciones |
| API | `backend/api/proyectos.py` en `/tesoreria/proyectos` | CRUD + `GET /publicas` sin token |
| Pantalla | `frontend/src/pages/TesoreriaProyectos.tsx` (381 líneas, **ABMPage legacy**) | ruta `tesoreria/proyectos`, embebida en `ConfiguracionTesoreria.tsx`; **sin ítem en el sidebar** |
| Vecino | `DashboardVecino.tsx`, "Obras en tu ciudad" | barra de avance publicada, foto, estado |
| Órdenes de trabajo (Campo) | `backend/models/orden_trabajo.py` | vínculos a reclamos (N:M), cuadrilla, empleado, POI, categoría. **No conoce a proyectos** |
| Compras (Patrimonio) | `backend/models/inventario.py` | órdenes de compra y movimientos de stock. **No generan gastos**: hoy compras y tesorería no se hablan |
| Dashboard | `pages/Dashboard/registry.tsx` | secciones declarativas gateadas por módulo (`esActivo(modulo)`) |
| Gate de módulos en la nav | `navigation.ts` | `tesoreria`, `contaduria`, `patrimonio`, `ordenes_trabajo`, `presentismo`, `reservas`, `sueldos`, `tasas`, `comunicacion` |

Lo que **no** existe: etapas, contratista, expediente, fuente de financiamiento, certificados,
bitácora, vínculo OT ↔ obra, vínculo reclamo ↔ obra, vínculo compra ↔ obra.

Decisiones ya tomadas que se respetan (`docs/comunicacion/01-modulo-comunicacion.md`): publicar
es deliberado, el monto publicado es un interruptor aparte, y **el avance son dos campos**
(real y publicado). Lo que derive de etapas alimenta el real, nunca el publicado.

## 3. Por qué vale la pena (el negocio, municipios de 2.000 a 50.000 habitantes)

- La obra pública es **la** noticia del intendente: pavimento, cordón cuneta, agua, cloacas,
  luminarias, la plaza, el SUM. Es lo que muestra y lo que le reclaman.
- Se lleva en un Excel del secretario de obras y otro del tesorero, que nunca coinciden. Nadie
  sabe "cuánto llevamos gastado en la obra X" sin llamar por teléfono.
- Dos modalidades reales y distintas:
  - **Por contrato**: un contratista presenta **certificados** de avance (mensuales), el
    municipio los aprueba y paga. La plata sale por contaduría y tesorería.
  - **Por administración**: la cuadrilla propia con materiales del depósito. La plata no es "un
    gasto": son materiales (inventario), jornales (sueldos) y algún gasto directo.
- La plata casi nunca es toda del municipio: aportes provinciales o nacionales por tramos.
- Munify ya tiene las patas sueltas (gastos, OP, OT, inventario, comunicación al vecino,
  reclamos). Obras es el módulo que las **une**. Es más integración que código nuevo.

## 4. Decisión 1: dónde vive. Módulo propio, y Obra = variante de Proyecto

**Módulo propio `obras`, en gestión interna.** No dentro de tesorería. Razones:

1. **El actor es otro.** El que gestiona una obra es el secretario de obras o el inspector,
   no el tesorero. Tesorería mira plata; obras mira avance, etapas, plazos, contratista.
2. **Por administración no pasa por tesorería.** Una obra que hace la cuadrilla propia se cruza
   con OT, inventario y empleados. Si vive en tesorería, esa mitad queda sin casa.
3. **Los módulos son facturación.** Un municipio chico puede querer Obras sin Contaduría, o
   Tesorería sin Obras. El gate por módulo ya existe en la nav y en el dashboard.
4. **Alcance del vecino.** Obras es el único módulo interno con ventana pública ("Obras en tu
   ciudad"). Esa ventana la administra Comunicación, y conviene que el dueño de la ficha sea
   un módulo con nombre propio.

**Obra = variante de Proyecto, no otra tabla.** Tomo la segunda opción del dueño:

- `proyectos` suma `tipo` (`obra` | `programa`). Un proyecto es un centro de costo (sirve para
  "Fiesta patronal" o "Programa de becas"); una obra es un proyecto con ejecución física. Las
  tablas propias de obra (etapas, certificados, novedades) cuelgan de `proyecto_id` y aplican
  sólo a `tipo = obra`.
- SPN no se rompe: sus proyectos actuales con gastos imputados siguen iguales; los que son
  obras se marcan `tipo = obra` y ganan etapas cuando el municipio las cargue.
- El paso 5 del wizard de gasto sigue existiendo para los dos tipos.
- El nombre en la UI es **Obras** (sidebar de una palabra). "Proyecto" queda como nombre
  técnico de la tabla y como tipo para lo que no es obra.

## 5. Decisión 2: dónde se carga la plata de una obra

Es la duda central del dueño. La respuesta tiene dos mitades.

**El gasto se registra UNA vez y en UN solo libro: `gastos`, de tesorería.** Obras no tiene
un "libro de gastos" paralelo. Si hubiera dos, el tesorero y el secretario de obras vuelven a
tener dos Excel, que es exactamente el problema que se quiere matar.

**Pero la obra es el punto de entrada natural, con su contexto.** Igual que el reclamo crea la
OT aunque la OT viva en Campo: la ficha de la obra tiene una pestaña **Plata** desde donde se
carga, y lo que se carga cae en el circuito de tesorería/contaduría que ya existe.

| Desde dónde | Qué se crea | Qué cambia respecto de hoy |
|---|---|---|
| Ficha de la obra, pestaña Plata, "Cargar gasto" | el **mismo** `CrearGastoWizard`, con obra y etapa **preimputadas** y el paso 5 saltado | el wizard acepta una imputación fija por props |
| Ficha de la obra, "Cargar certificado" (sólo contrato) | un **certificado** que al aprobarse genera una **orden de pago** en Contaduría con `proyecto_id` y `etapa_id`; al pagarse, la OP crea el gasto (flujo existente) **ya imputado** | la OP gana `proyecto_id`/`etapa_id`; el alta automática de gasto propaga la imputación |
| Gastos (tesorería), como hoy | un gasto con imputación libre a N proyectos | nada: sigue sirviendo para el gasto que se reparte |
| OT de la obra que consume materiales | costo de materiales de la obra (por administración) | la OT gana `proyecto_id`; el costo se calcula, no se carga |

La "inteligencia propia" de obras vive en el módulo obras: **etapas con incidencia, avance
derivado, hitos, desvío plata vs avance, certificados, bitácora.** Tesorería sólo sabe que un
gasto está imputado a un proyecto y una etapa. Contaduría sólo sabe que una OP nació de un
certificado. Nadie más cambia de rol.

Tres números que la obra narra en el hero: **presupuesto vigente** (contrato + adicionales),
**ejecutado** (imputaciones pagadas), **comprometido** (certificados aprobados sin pagar).
Desvío = ejecutado vs (presupuesto × avance). Una obra al 40 % de avance con el 70 % de la plata
gastada es el veredicto rojo.

## 6. Mapa de interconexión, módulo por módulo

| Módulo | Qué le da obras | Qué recibe obras | Qué toca | Etapa |
|---|---|---|---|---|
| **Tesorería (Gastos)** | imputación por obra + etapa; "ejecutado" | el gasto como fuente única de plata | `gasto_proyectos.etapa_id`; wizard con imputación fija | E1/E2 |
| **Contaduría (OP)** | la OP nace de un certificado | el pago cierra el certificado y crea el gasto imputado | `ordenes_pago.proyecto_id/etapa_id`; alta automática de gasto propaga | E2 |
| **Personas / Contactos** | el contratista es una Persona tipo proveedor (plan de consolidación de tesorería, 2026-09-06) | proveedor con historial de obras | `proyectos.contratista_persona_id` | E1 |
| **Campo (OT)** | una OT puede ser "de la obra X, etapa Y"; obra por administración = N OT | cierre de OT puede mover el avance de la etapa; historial de OT alimenta la bitácora | `ordenes_trabajo.proyecto_id/etapa_id` | E3 |
| **Patrimonio (Inventario, Compras)** | materiales consumidos por OT de la obra = costo de materiales; orden de compra con obra destino | hoy compras no generan gastos: **primer cruce compra → gasto**, la obra lo justifica | `ordenes_compra.proyecto_id`; movimiento de stock heredado de la OT | E3 |
| **Recursos (empleados, cuadrillas, presentismo)** | horas de cuadrilla sobre OT de obra = costo de mano de obra | cuadrilla asignada a la obra | sin cambio de modelo al principio; después jornada ↔ OT | E3+ |
| **Reclamos (+ Planificación)** | "20 baches en calle X" se agrupan en una obra de repavimentación; al terminar la obra, los reclamos vinculados se cierran y el vecino se entera | reclamos como origen de obras | `reclamos.proyecto_id`; acción en Planificación "convertir en obra" | E4 |
| **Comunicación** | novedades públicas de la bitácora = línea de tiempo con fotos en "Obras en tu ciudad"; avisos automáticos por hito (inicio, corte de calle, fin) | el interruptor `publico`, `avance_publicado` y `mostrar_monto` siguen siendo de Comunicación | `obra_novedades.publica`; avisos por evento | E4 |
| **Mapa / Territorio** | obra como punto hoy, traza (línea/polígono) después; barrio del catálogo | POI: una obra terminada puede dar de alta o actualizar un punto de interés (plaza, SUM) | `proyectos.barrio_id`; `traza_geojson` | E4 |
| **Dashboard** | secciones `hero-obras` y `obras-atrasadas` en el registry | gate por módulo `obras` | `registry.tsx` | E1 |
| **Tasas / Cobros** | **contribución de mejoras**: la obra terminada (cordón cuneta, pavimento) genera la tasa a los frentistas del tramo. Así financian los municipios chicos | plan de pagos por frentista | idea, no diseñada | E5 (idea) |
| **Super admin** | módulo `obras` habilitable por municipio | facturación | catálogo de módulos | E1 |
| **Demos / Semilla** | 3 a 5 obras por municipio con etapas, gastos y novedades retrodatadas | "demos con historia" | semilla | E1 |
| **Trámites** | sin cruce natural hoy (un permiso de obra privada es otra cosa) | | | no |

## 7. Modelo propuesto (resumen, para la migración cuando toque)

- `proyectos` +: `tipo`, `tipo_obra` (catálogo por muni), `modalidad` (`contrato`/`administracion`),
  `contratista_persona_id`, `expediente`, `fuente_financiamiento` + `programa`, `monto_contrato`,
  `plazo_dias`, `fecha_inicio_real`, `fecha_fin_real`, `inspector_usuario_id`, `barrio_id`.
- `obra_etapas`: `proyecto_id`, `orden`, `nombre`, `incidencia_pct` (suma 100 por obra),
  fechas previstas y reales, `avance_pct`, `estado` (`pendiente/en_curso/terminada/parada`).
  **Avance real de la obra = suma de (avance × incidencia) / 100**; sin etapas, sigue manual.
- `gasto_proyectos` + `etapa_id` nullable.
- `obra_certificados`: `numero`, `periodo`, `avance_acumulado_pct`, `monto`, `estado`
  (`presentado/aprobado/pagado`), `orden_pago_id`.
- `obra_novedades`: `fecha`, `tipo` (`avance/paralizacion/reinicio/inspeccion/nota`), `texto`,
  `fotos` (json), `etapa_id`, `publica`.
- FKs nullables hacia `proyectos` en `ordenes_pago`, `ordenes_trabajo`, `ordenes_compra`, `reclamos`.

## 8. Pantalla (kit v3, obligatorio)

- Sidebar **`Obras`** en gestión interna, gateado por `obras`.
- `SemanticAbmPage`: hero con 5 KPIs con veredicto (en ejecución, atrasadas, con desvío de
  plata, sin novedades hace 30 días, publicadas al vecino), tres vistas, ficha en `SideModal`
  con pestañas **Etapas / Plata / Bitácora / Vecino**.
- **`TesoreriaProyectos.tsx` se reemplaza** (ABMPage legacy, regla 6.ter). El contador baja a 27.
- Diseño primero: bloque en el canvas de Munify antes de codear.

## 9. Roadmap atómico (una etapa por vez)

| Etapa | Entrega |
|---|---|
| **E1 Ficha + etapas** | `tipo` en proyectos, campos de obra, etapas con incidencia, avance derivado, pantalla Obras, módulo `obras`, semilla con historia |
| **E2 Plata** | imputación por etapa, wizard con imputación fija desde la obra, certificados → OP → gasto imputado, hero con presupuesto/ejecutado/comprometido |
| **E3 Por administración** | OT y compras con obra destino, costo de materiales |
| **E4 Vecino y reclamos** | bitácora con fotos y línea de tiempo pública, avisos por hito, reclamos → obra, traza en el mapa |
| **E5 (idea)** | contribución de mejoras a frentistas desde Tasas |

Fuera de alcance a propósito: licitaciones como proceso, redeterminaciones de precios formales,
contabilidad presupuestaria por partidas (RAFAM). No es para este mercado.

## 10. Los dos universos (nota aparte, más grande que obras)

Es un cambio de **`navigation.ts`** (módulo central: proponer, esperar "dale"). Categorías hoy:
Mi Área, Principal, Reclamos, Trabajos, Patrimonio, Campo, Trámites, Atención al vecino,
Tesorería, Contaduría, Recursos, Comunicación, Configuración, Mi cuenta, Super Admin.

- **De cara al vecino**: Reclamos, Trámites (Agenda, Horarios), Atención al vecino (Tasas,
  Cobros), Comunicación, Mapa.
- **Gestión interna**: Tesorería, Contaduría, **Obras**, Patrimonio, Campo/Trabajos, Recursos
  (empleados, presentismo, reservas), Sueldos.

Pendiente previo (memoria `project_rollout_v2_canvas`): el análisis operacional-vs-catálogos
antes de tocar la navegación. Conviene hacer las dos cosas en la misma pasada.

## 11. Preguntas para el dueño (de a una)

1. ¿Confirmás **módulo propio `obras`** y **Obra como tipo de Proyecto**? (§4)
2. ¿Confirmás que la plata se carga **desde la obra pero cae en gastos**, sin libro paralelo? (§5)
3. ¿Certificados de obra ya en E2, o alcanza con imputar gastos por etapa? (recomiendo
   certificados: es como se paga en la realidad y aprovecha el circuito de OP que ya existe)
4. ¿El split en dos universos es sólo el sidebar, o también cambia dashboard y roles?
