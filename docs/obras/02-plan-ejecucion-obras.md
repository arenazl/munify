# Gestión de obras — plan de ejecución (2026-09-12)

> Sigue al análisis `01-idea-gestion-de-obras.md` (2026-09-10). El dueño confirmó hoy el
> rumbo por voz: obras con seguimiento de etapas y de gastos, muy asociado a Tesorería, y
> una interfaz con "efecto wow": un botón de reproducir, como el del tablero, que cuente
> la obra de forma dinámica ("en estos dos meses tuvimos tantos gastos"). Este doc baja eso
> a entregas concretas y las cruza con la consolidación de Personas
> (`../tesoreria/03-revision-fable-y-plan-contingencia.md`).

## 1. Un dato que cambia el punto de partida

San Pedro Norte **ya usa Proyectos como obras**, sin que nadie se lo pidiera. Medido hoy
en QA (copia de prod), sobre 37 proyectos y 126 imputaciones:

| Proyecto de SPN | Gastos imputados | Plata imputada |
|---|---|---|
| Predio municipal | 21 | $71,0 M |
| Vivienda Semilla | 36 | $30,7 M |
| Salón de actos | 32 | $21,1 M |
| Balneario | 2 | $5,1 M |
| Día del Trabajador 2026 (esto es un programa, no una obra) | 9 | $4,8 M |

Consecuencias:

- **Obra = tipo de Proyecto** deja de ser una decisión de diseño y pasa a ser la lectura
  de los datos: SPN tiene obras y programas mezclados en la misma tabla, y funciona.
- **La película arranca con datos reales el día uno.** No hay que inventar una demo: el
  "Predio municipal" tiene 21 gastos con fecha y monto; eso ya es una línea de tiempo.
- Ninguno tiene presupuesto, avance ni etapas cargados: el módulo tiene que ser útil **sin**
  esos datos (la película de la plata) y mejorar cuando se cargan (etapas y desvío).

## 2. Decisiones que se dan por tomadas (del `01`, confirmadas hoy por voz)

1. Módulo propio `obras`, en gestión interna, gateado como los demás.
2. Obra es un `tipo` de Proyecto; una sola tabla, SPN no se toca.
3. La plata se carga desde la obra pero **cae en `gastos`**: sin libro paralelo.
4. Pantalla nueva sobre el kit v3; `TesoreriaProyectos.tsx` (ABMPage legacy) se reemplaza.

Quedan dos para el "dale" explícito: si los **certificados** entran en la segunda entrega
(recomendado: es como se paga una obra por contrato y usa el circuito de órdenes de pago
que ya existe) y si la película se **publica al vecino** en "Obras en tu ciudad"
(recomendado: es la noticia del intendente, y el interruptor `publico` ya existe).

## 3. Cruce con Personas (consolidación de Tesorería)

El contratista de una obra es una Persona de tipo proveedor o contratista. La columna se
llama `contratista_persona_id` y apunta a `contactos(id)`, igual que las tres columnas de
enganche de la Parte A: cuando la tabla pase a llamarse `personas`, la clave la sigue
sola. **Obras no espera a la migración de Personas ni la bloquea**; comparte la libreta.

Lo único que sí conviene ordenar: la pantalla de Obras es la **primera pantalla nueva que
elige una persona por tipo** (contratista). Ese combo se hace una vez, tonto y polimórfico
(píldoras por tipo, combo cuando no entran), y lo reutiliza Personas después.

## 4. La película (el "efecto wow")

Lo que el dueño describe ya existe en tres piezas del repo, y se recombinan:

| Pieza | Dónde | Qué aporta |
|---|---|---|
| Presentación con diapositivas y reproducir/pausar | `components/PresentacionLive.tsx` (interfaz `Slide` con `Component`) | el reproductor: avanzar, pausar, ir a la diapositiva |
| Tablero en vivo con números que cuentan | `components/DashboardLive.tsx` + `hooks/useCountUp` | los montos que suben mientras se mira |
| Banda de tiempo del mapa | `components/mapa/MapaTimelapseBanda.tsx` | la barra de meses con el cursor que avanza |

**Diseño de la película.** Un botón "Reproducir" en la ficha de la obra abre una vista a
pantalla completa (mismo portal que la presentación). Cada **mes** es un cuadro:

- arriba, el mes y la etapa que estaba en curso;
- en el centro, el **acumulado gastado** contando hacia arriba, y el gasto del mes al lado;
- abajo, los tres o cuatro gastos más grandes del mes ("a quién se le pagó qué");
- una barra de avance real si la obra tiene etapas, y la foto de la bitácora si la hay;
- la banda de meses abajo, con el cursor avanzando; se puede arrastrar.

Al final, el cuadro de cierre: presupuesto vigente, ejecutado, comprometido y el veredicto
(en plazo y en plata; atrasada; con desvío). Sin etapas ni presupuesto la película igual
existe: es la película de la plata, que es lo que SPN tiene hoy.

**Backend: un solo endpoint.** `GET /obras/{id}/pelicula` devuelve los cuadros ya armados
(mes, gasto del mes, acumulado, etapa vigente, avance, top de gastos, novedades públicas).
El front reproduce; no calcula. Así la misma película sirve para el vecino (se filtra lo
que no se publica) y para el reporte.

## 5. Entregas, en orden

| Entrega | Qué incluye | Qué se ve |
|---|---|---|
| **O1 Esquema y ficha** | `proyectos.tipo` (`obra`/`programa`), `modalidad`, `contratista_persona_id`, `expediente`, `fuente_financiamiento`, `monto_contrato`, fechas reales, `barrio_id`; tabla `obra_etapas` con incidencia y avance derivado; `gasto_proyectos.etapa_id`; modelos, migración ad-hoc idempotente, semilla con historia para demos | Pantalla **Obras** (kit v3): hero con 5 KPIs (en ejecución, atrasadas, con desvío, sin novedades hace 30 días, publicadas), tres vistas, ficha en `SideModal` con pestañas Etapas / Plata / Bitácora / Vecino. Módulo `obras` en la nav y en el super admin. Se borra `TesoreriaProyectos.tsx` |
| **O2 Película** | endpoint `/pelicula`; vista reproducible sobre `PresentacionLive` y `useCountUp`; banda de meses | El botón Reproducir en la ficha. Con SPN se ve el "Predio municipal" contado mes a mes |
| **O3 Plata desde la obra** | `CrearGastoWizard` con imputación fija por props (obra y etapa, paso 5 salteado); certificados → orden de pago con `proyecto_id`/`etapa_id` → gasto imputado; hero con presupuesto / ejecutado / comprometido | La pestaña Plata carga y muestra; el desvío aparece en el hero |
| **O4 Vecino y campo** | bitácora con fotos y línea de tiempo pública; avisos por hito; `ordenes_trabajo.proyecto_id`; reclamos → obra | La película, filtrada, en "Obras en tu ciudad" |

Cada entrega cierra con captura propia y prueba en QA con el tenant de SPN (lectura) y
el sandbox de Merlo (escritura). O1 y O2 son el bloque que el dueño quiere ver; O3 y O4
se abren después de verlo.

## 6. Diseño primero

Es pantalla nueva: bloque en el canvas de Munify antes de codear, con dos artboards:
la pantalla Obras (hero, vista lista, ficha) y un cuadro de la película. Se pide
aprobación sobre el dibujo y recién después se toca código.

## 7. Riesgos y cómo se evitan

- **Mezclar programas con obras en los KPIs.** El hero de Obras cuenta sólo `tipo=obra`;
  los programas siguen en Proyectos dentro de Tesorería, con la misma tabla.
- **Clasificar los 37 proyectos de SPN.** No se adivina: nacen como `programa` y el
  municipio marca cuáles son obras. Para la demo del dueño se marcan a mano en QA los
  cuatro evidentes (Predio, Vivienda Semilla, Salón de actos, Balneario).
- **Que la película muestre algo que no se publica.** El endpoint público filtra por
  `publico` y `mostrar_monto`; el interno no. Mismo cuadro, dos filtros.
