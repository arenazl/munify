# Persona y Obras: un solo trabajo, por fases (2026-09-12)

> Análisis integral pedido por el dueño: la consolidación de Tesorería (un objeto base
> Persona del que se desprenden empleados, proveedores y el resto) y el módulo de Obras
> (etapas, gastos asignados solos, estadísticas de plata y de personal) son **el mismo
> trabajo**, con un orden fijo: primero el modelo sin tocar a San Pedro Norte, se prueba;
> después la migración de SPN al modelo nuevo, se prueba; recién ahí producción.
> Sólo análisis. Nada de esto está codeado. Docs previos: `02` (modelo destino Persona),
> `03` (revisión y contingencia), `../obras/01` y `../obras/02`.

## 1. La película del sistema, en una pantalla

Hoy la plata y el trabajo no se cruzan porque **la gente está partida en dos**: el que
cobra es un `contacto` (Tesorería) y el que trabaja es un `empleado` (Campo). Son dos
registros que no saben que son la misma persona. Por eso hoy es imposible contestar "en
la obra del Predio, quién trabajó y cuánto costó": las horas están en un lado y los sueldos
en el otro.

```
                       PERSONA  (una vez por ser humano o empresa)
                       nombre · documento · contacto · datos fiscales · alias de pago
                         │
        ┌────────────────┼──────────────────┐
   qué es (varios)   ficha laboral       login
   empleado          zona · cuadrilla    usuario
   proveedor         horarios · jornadas
   contratista       (sólo si trabaja)
   concejal · ...
                         │                              │
                    ─────┴──────── PLATA ───────────────┴──── TRABAJO ─────
                    GASTO  (un solo libro)               ORDEN DE TRABAJO
                    destino = Persona                    empleado / cuadrilla = Personas
                    imputado a → OBRA + ETAPA            de la → OBRA + ETAPA
                                   │                                │
                                   └──────────── OBRA ──────────────┘
                                   (= Proyecto de tipo obra, con etapas)
                                   plata por etapa · quién trabajó · avance · película
```

Lo que cambia respecto de hoy es poco y es estructural:

1. **Persona** es la libreta única (la tabla `contactos` evolucionada, según el `02`).
2. `empleados` deja de ser identidad y pasa a ser **ficha laboral** colgada de Persona.
3. **Obra** es un Proyecto con `tipo = obra` y una tabla de **etapas**.
4. El **gasto** gana etapa en su imputación, y la imputación se propone sola.
5. La **orden de trabajo** gana obra y etapa.

Con eso, la obra junta las dos mitades: los gastos imputados (plata) y las órdenes de
trabajo cerradas (gente y horas). **Por eso el personal entra en este trabajo**: sin
Persona, la ficha de la obra no puede decir quién trabajó porque el empleado de la OT y
el que cobró el sueldo son dos registros distintos.

## 2. Cómo convive Obras con Proyectos

**Misma tabla, dos tipos, una pantalla.** `proyectos` suma `tipo` (`obra` | `programa`).

| | Obra | Programa |
|---|---|---|
| Ejemplos de SPN | Predio municipal ($71M), Vivienda Semilla ($30,7M), Salón de actos ($21,1M), Balneario | Día del Trabajador 2026, Liga de Fútbol, Día del Niño |
| Qué es | ejecución física: etapas, avance, contratista, plazo | centro de costo: junta gastos y nada más |
| Etapas | sí | no (o una sola, implícita) |
| Dónde se ve | pantalla **Obras** | la misma pantalla, filtro "Programas" |
| Imputación desde el gasto (paso 5 del wizard) | sí | sí, como hoy |

- `TesoreriaProyectos.tsx` (legacy, sin ítem en el sidebar, embebido en Configuración)
  **desaparece**: la pantalla Obras lo absorbe con un filtro. Un municipio sin módulo
  `obras` ve la misma pantalla como "Proyectos", sin las secciones de obra. Es la regla de
  variaciones por props, no por pantallas.
- Los 37 proyectos de SPN nacen `programa`; el municipio marca cuáles son obras. Para la
  demo se marcan los cuatro evidentes en QA. **Ningún gasto ni imputación se mueve.**
- El `paso 5` del wizard de gasto sigue igual. Lo que se agrega es la etapa, y se propone sola.

## 3. Gastos asignados a etapas "de forma automática": reglas

Principio: **el sistema propone, la persona confirma con un click, y siempre queda claro
qué se propuso y qué se confirmó.** Nunca se inventa una imputación en silencio: eso
volvería a dejar dos verdades, la del tesorero y la del secretario de obras.

`gasto_proyectos` gana `etapa_id` y `origen` (`manual` | `automatica` | `sugerida`).

| Situación | Qué hace el sistema | Origen |
|---|---|---|
| El gasto se carga **desde la ficha de la obra** | obra fija; etapa = la que está en curso a la fecha del gasto (o la que se eligió al abrir) | `automatica` |
| El gasto ya está imputado a la obra pero sin etapa (los 126 de SPN) | etapa = la que estaba en curso a la fecha del gasto, si hay una sola en curso | `automatica` |
| Dos etapas en curso a la vez en esa fecha | propone la de mayor incidencia; queda en la bandeja "a confirmar" de la obra | `sugerida` |
| El gasto **no está imputado** a ninguna obra | propone obra si hay señales: el destino es el contratista de una obra activa, la descripción o el concepto nombra la obra, o la orden de pago nació de un certificado | `sugerida` |
| Orden de pago nacida de un certificado | obra y etapa vienen del certificado; al pagarse, el gasto nace imputado | `automatica` |
| La persona corrige | lo que sea | `manual` |

La ficha de la obra tiene una **bandeja "sin etapa / a confirmar"** con un botón de
aceptar todo. Con la obra bien cargada (etapas con fechas), la bandeja está vacía casi
siempre. Sin etapas cargadas, la obra tiene una sola etapa implícita ("Ejecución") y todo
cae ahí: la película de la plata funciona igual.

## 4. La pantalla de Obras: una buena, no veinte

Dos superficies, y nada más:

**A. Obras** (lista, kit v3). Hero con cinco veredictos: en ejecución · atrasadas · con
desvío de plata (gastado por encima del avance) · sin novedades hace 30 días · publicadas
al vecino. Tres vistas: tarjetas con barra de avance y plata, tabla, y **mapa** (las obras
ya tienen latitud y longitud). Filtros por tipo de obra, estado y contratista.

**B. La ficha de una obra** (`SideModal` ancho, o pantalla completa al reproducir), con
cuatro secciones que contestan las cuatro preguntas del dueño:

| Sección | Pregunta que contesta | De dónde sale |
|---|---|---|
| **Plata** | dónde se fue la plata: por etapa, por rubro (concepto del gasto), por proveedor, mes a mes; presupuesto vs ejecutado vs comprometido | `gasto_proyectos` con etapa; certificados aprobados sin pagar |
| **Gente** | quién trabajó: cuadrillas y personas con órdenes de trabajo en la obra, horas reales; y cuánto costó el personal: sueldos e incentivos imputados a la obra | OT con `proyecto_id` (horas) + gastos a Personas de tipo empleado imputados (plata). **Requiere Persona** para que sean las mismas personas |
| **Etapas** | cómo va: incidencia, fechas previstas y reales, avance derivado, desvío | `obra_etapas` |
| **Película** | contarlo: reproducir mes a mes acumulado, etapa vigente, a quién se le pagó, quién trabajó, fotos | endpoint `/pelicula`, sobre `PresentacionLive` + `useCountUp` |

La sección Gente es lo que nadie tiene hoy y lo que el intendente quiere mostrar:
"la obra la hizo la cuadrilla de Pérez en 40 jornadas, con $12M de materiales de Corralón
Norte". Con SPN hoy sale la mitad (plata: sueldos imputados); la otra mitad (horas) sale
cuando el municipio use órdenes de trabajo. SPN no las usa todavía; los demos sí (840 OT).

## 5. Personas: la otra pantalla única

Una pantalla, tipo como filtro (píldoras que pasan a combo), ficha con las secciones que
esa persona tiene: identidad siempre; laboral si es del personal; económica si cobra;
acceso si tiene login; **obras** si participó en alguna (como contratista, proveedor o
trabajador). Reemplaza tres listados: Contactos de Tesorería, Empleados y Sueldos
(lista). Las pantallas de Bartolo (Contactos, Gastos, Agenda) **no se tocan**: siguen con
los mismos endpoints, leyendo del modelo unificado, y el gate lo demuestra.

Balance de pantallas: se agregan 2 (Personas, Obras), se retiran 4 (Contactos de
Tesorería, Empleados como listado, Sueldos lista, Proyectos). Menos que hoy.

## 6. Fases, en el orden que pidió el dueño

Cada fase termina con algo visible y una prueba concreta. Ninguna toca a SPN hasta la F3,
y producción recién en la F5.

| Fase | Qué se construye | SPN | Cómo se prueba | Qué se ve |
|---|---|---|---|---|
| **F0 Modelo** | modelos SQLAlchemy de `persona_tipos`, `persona_roles` y las columnas de enganche; sembrado del catálogo en el alta de municipio y de demo; lectura dual (endpoints viejos siguen leyendo el enum); `proyectos.tipo`, `obra_etapas`, `gasto_proyectos.etapa_id + origen`, `ordenes_trabajo.proyecto_id/etapa_id`, `contratista_persona_id`; harness con paginación y contra Cloud Run QA | no se toca (todo aditivo) | gate de paridad en **cero** contra QA en Cloud Run | nada nuevo en pantalla; la base y el código ya coinciden |
| **F1 Personas en los demos** | Parte B2 **sólo demos** (bandera `--sin-spn`): empleados y usuarios de planta enganchados a su Persona; endpoint y pantalla Personas; combo "elegir persona por tipo" del kit | no se toca | Merlo sandbox: un "Juan Pérez" que hoy es dos registros pasa a ser uno con dos secciones; smoke de Contactos/Gastos/Agenda en QA | la pantalla Personas, con demos |
| **F2 Obras núcleo** | pantalla Obras con hero, tres vistas y ficha (Plata, Etapas, Película); asignación automática y bandeja; endpoint `/pelicula`; semilla con historia para demos; módulo `obras` en nav y super admin; se retira `TesoreriaProyectos` | sólo lectura: las 4 obras evidentes marcadas en QA para la demo | la película del "Predio municipal" con sus 21 gastos reales; Merlo con obras sembradas y etapas | **el efecto wow**, con datos reales de SPN |
| **F3 SPN al modelo nuevo, en QA** | Parte B2 para SPN (7 semilla respaldados y borrados, personal con login enganchado, `''` a NULL); curación de los 83 "otro" con Bartolo (10 renglones = 84% de la plata); Parte B1 (renombre a `personas`) coordinada código + base; sección Gente de la obra con sueldos imputados | **sí, en QA** | gate contra el patrón recapturado: sólo las diferencias buscadas; smoke como Bartolo en `qa.munify.com.ar`; recorrido completo de páginas de gastos y contactos | Contactos, Gastos y Agenda idénticos; Personas y Obras con SPN entero |
| **F4 Obras completa** | certificados → orden de pago → gasto imputado; wizard con imputación fija desde la obra; OT con obra (Gente con horas); bitácora con fotos y línea de tiempo pública; película filtrada al vecino | en QA | demos con OT; SPN con certificados de prueba en QA | la obra por contrato y por administración, de punta a punta |
| **F5 Producción** | ventana nocturna con Infra: backup + fork + revisión retenida; A, B2, deploy, B1; gate contra prod; smoke; Plan C armado 30 días (ver `03`) | **sí, en prod** | gate cero salvo lo buscado; Bartolo carga un gasto y una liquidación al día siguiente | SPN en el modelo nuevo; Obras habilitable por municipio |

Dependencias reales, para no forzar el orden donde no hace falta:

- F2 depende sólo de F0 (obras usa `proyectos` y `gastos`, que no cambian). **Puede ir en
  paralelo con F1.** Es lo primero que el dueño quiere ver, y no espera a Persona.
- La sección **Gente** de la obra (mitad plata en F3, mitad horas en F4) sí depende de
  Persona: es el motivo por el que los dos trabajos son uno.
- Obras puede llegar a producción **antes** de la ventana de F5 si el dueño quiere: es
  aditivo y gateado por módulo. La ventana es sólo para Persona.

## 7. Decisiones que necesito del dueño (de a una)

1. Programas y obras en **una sola pantalla** con filtro, y `TesoreriaProyectos` se retira (§2).
2. La asignación automática **propone y se confirma** con un click; nunca imputa en
   silencio salvo cuando el gasto nace desde la obra o de un certificado (§3).
3. F2 (Obras núcleo) **en paralelo** con F1 (Personas en demos), para ver la película primero.
4. Los 7 empleados semilla de SPN: **se borran con respaldo** (orden del 06) o se dejan inactivos.

## 8. Lo que queda fuera a propósito

Licitaciones como proceso, redeterminaciones de precios, contabilidad por partidas,
presentismo por jornada como fuente del costo de mano de obra (hoy `empleado_jornadas`
tiene 0 filas: se usa horas reales de la OT y, cuando haya jornadas, se suma). Y ninguna
pantalla más que las dos de §4 y la de §5.
