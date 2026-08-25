# Dashboard modular por módulos — diseño cerrado + WOs

> Diseño de Fable (2026-08-24/25), validado con el dueño en sesión. Entrada:
> [`handoffs/2026-08-25_dashboard-modular-por-modulos.md`](../handoffs/2026-08-25_dashboard-modular-por-modulos.md)
> (radiografía con archivo:línea — NO re-relevar). Prototipo navegable de los 4 perfiles:
> https://claude.ai/code/artifact/fb3d1322-262e-4d0e-afff-2953dfabb1b5
> Implementa **Opus** por WO, sobre branch `qa`, commits locales (sin push).

## 1. Principios (decisiones del dueño, NO negociables)

1. **El tablero HABLA.** Filosofía v2: pantalla narrativa en el idioma del intendente
   (pueblos chicos del interior), no del estadista. Con 1, 2 o 14 módulos activos,
   ninguna combinación puede degenerar en una pila de números.
2. **Cinta de conteos.** Los contadores crudos (total / hoy / esta semana / resolución
   promedio) viven en UNA línea finita por pantalla, con chip de dominio. Las filas de
   KpiCardV2 del dashboard MUEREN. Las tarjetas quedan reservadas para preguntas con
   respuesta y su porqué (KpiSemantico).
3. **Regla del cero.** Un cero jamás se enuncia ("Hoy entraron 0 gestiones" está
   PROHIBIDO). El copy pivotea a lo que sí hubo ("Hoy no entró ninguno; en el año llevás
   862, el pico fue mayo") o el segmento se omite. Gramática correcta en todas las ramas
   (singular/plural/cero). Precedente en código: frase de reclamos del monolito
   (`Dashboard.tsx` ~:596 "un cero no se enuncia así"); la frase de trámites HOY lo viola.
4. **Visibilidad = módulo activo Y con historia.** `moduloEfectivo()` decide activo;
   además, si el dominio tiene **total histórico = 0** es un "módulo prototipo" y sus
   secciones NO se muestran ni fetchean. Módulo OFF mata todo aunque haya datos viejos
   (caso real: SPN tiene 14 reclamos históricos con `reclamos=OFF`).
5. **Orden dinámico por actividad.** Los BLOQUES de dominio se ordenan por actividad de
   los últimos 30 días, desc (un foreach, no una red neuronal). Dentro del dominio el
   orden interno es fijo. Empate → orden canónico. El mismo número prioriza el strip del
   hero y las frases del carrusel. Se decide UNA vez al cargar (la pantalla no baila).
6. **Variante completa/resumen por convivencia.** Un dominio solo (ej. SPN financiero)
   muestra su versión completa (hero 5 KPIs + colas + tendencia). Cuando conviven
   dominios, los no-primarios entran en variante RESUMEN (3 preguntas semánticas, cero
   grillas). Declarativo en el registry, no ifs en JSX. (Refinamiento F4 opcional: si un
   dominio explica >70% de la actividad, va completo aunque conviva.)
7. **Hero fijo adaptativo.** `HeroBannerV2` (foto + nombre del muni) va SIEMPRE, en todos
   los perfiles. Su strip de 4 KPIs y las frases del `SemanticHero` se eligen por módulos
   activos + actividad (pool etiquetado por módulo).
8. Reglas duras de siempre: piezas bobas del kit (la inteligencia de copy vive en
   armadores en `lib/`), cero hex inline, sin emojis, multi-tenant por `municipio_id`.

## 2. Arquitectura

```
frontend/src/pages/Dashboard/
  index.tsx          orquestador: módulos → actividad → visibles → orden → grilla
                     + hero fijo + modales (DashboardLive/PresentacionLive) + PullToRefresh
  registry.tsx       SECCIONES: la condición de cada una vive acá, UNA vez
  datos/
    useModulosActivos.ts   modulosApi.list() + moduloEfectivo() → Record<key, boolean>
    useActividad.ts        GET /api/dashboard/actividad (F2)
    useDatosReclamos.ts    stats, metricasAccion, metricasDetalle, porCategoria, porZona,
                           tendencias, recurrentes, heatmap, cobertura, tiempoResolucion, calif
    useDatosTramites.ts    tramitesStats
    useDatosFinanzas.ts    (F3) gastos, cajas, agenda, OP, conciliación
  secciones/         componentes bobos que componen piezas del kit
```

- **Hooks por dominio, no fetch por sección**: los datos son compartidos entre secciones
  (stats lo usan 4 bloques) — fetch por sección duplicaría llamadas. Cada hook recibe
  `enabled: boolean` (siempre se llama — cero riesgo React #310; con `enabled=false` no
  dispara nada). SPN no ejecuta NINGÚN request de reclamos/trámites.
- **Contrato de sección** (registry):

```ts
interface SeccionDashboard {
  id: string;
  requiere: string[];               // módulos, semántica moduloEfectivo; AND
  dominios: DominioDatos[];         // qué hooks necesita montados
  layout: 'full' | 'media';         // dos 'media' consecutivas visibles comparten fila
  variante?: 'completa' | 'resumen';// para pares completa/resumen del mismo dominio:
  soloSiDominioSolo?: boolean;      //   completa ⇔ su dominio está solo; resumen ⇔ convive
  Componente: React.FC<{ datos: DatosDashboard; ctx: DashboardCtx }>;
}
interface DashboardCtx { depId?: number; municipio: Municipio; refreshKey: number }
```

- **Loading/error por sección**: cada hook expone `{ datos, cargando }`; cada sección
  dibuja su skeleton y tolera vacío (patrón TendenciaMeses: sin 2 meses → null). Ninguna
  sección puede tirar la página.
- **GATE DE PÁGINA — trampa crítica**: el monolito hace `if (!stats) return null`
  (`Dashboard.tsx:796`). En SPN stats nunca se fetchea → pantalla en blanco. El gate
  nuevo es `modulosResueltos && dependenciasLoaded`, JAMÁS un dato de un dominio.
- `DashboardLive` (modo televisor) es reclamos-céntrico: se gatea con el dominio
  reclamos (SPN no ve "Pulso del día"). No se generaliza en este alcance.
- `TendenciaMeses` se generaliza con `modo: 'flujo' | 'monto'` (default 'flujo' = uso
  actual intacto). 'monto': una serie en dinero, `formatoValor`, veredictos de gasto
  ("Se gastó $X, un 12% más que julio"), umbral 5% anti-ruido.

## 3. Banco de pruebas (datos REALES verificados en DB QA, 2026-08-24)

| | Merlo (muni 153) | San Pedro Norte (muni 80) |
|---|---|---|
| Acceso | `munify-qa.netlify.app/merlo` → Acceso Directo, PIN 1680 | `/san-pedro-norte`, ídem |
| Módulos | FULL (5 opt-in ON con fila + opt-out sin fila) | dashboard+tesoreria+sueldos ON, resto OFF explícito |
| Actividad | reclamos 65 (56/30d), turnos 62, OT 35, gastos 50, trámites 13 | gastos 7.781, pagos prog. 244, reclamos 0/30d, trámites 0/30d |
| Rol | perfil full: orden = Reclamos → Trámites/Campo → Finanzas | perfil financiero puro: Finanzas completa, único bloque |

Toggles de módulos: `munify-qa.netlify.app/super` → Configuración (respeta destilde
desde `cc797ae`). Escrituras a QA: libres. A prod: JAMÁS.

## 4. Fases / WOs (implementa Opus; verifica quien NO escribió el código)

### WO-F1 — Registry + extracción mecánica (SIN cambios visuales)
Crear la estructura de §2 con los dominios reclamos/trámites. Mover fetches del monolito
a los hooks (`enabled` = módulo activo), derivados y JSX a las secciones:
`KpisReclamos`, `KpisTramites`, `ColaReclamos`, `MapaTendencia`, `AnaliticaReclamos`,
`VozVecino`. Hero (banner + frases + filtro de dependencia) queda en el orquestador.
Orden fijo actual. `pages/Dashboard.tsx` → `pages/Dashboard/index.tsx` (la ruta resuelve
sola). **Criterio:** Merlo pixel-idéntico (mismo orden DOM y clases CSS); con un módulo
destildado en `/super`, sus secciones desaparecen y sus fetches NO se disparan (Network).
SPN no queda en blanco (gate de §2).

### WO-F2 — Cinta + orden dinámico + regla del cero
Backend: `GET /api/dashboard/actividad` → `{ modulo: { total, ultimos30 } }` (COUNTs
baratos, multi-tenant). Front: visible = activo AND total>0; orden de bloques por
`ultimos30` desc; **cinta de conteos** reemplaza las dos filas de KpiCardV2; strip y
frases del hero priorizados por actividad; auditoría de la regla del cero en TODOS los
armadores de copy (la frase de trámites hoy dice "entraron 0 gestiones" — arreglarla).
**Criterio:** capturas Merlo (cinta + orden por actividad) y checklist count=0 por armador.

### WO-F3 — Perfil financiero
`useDatosFinanzas` (gastos, cajas, agenda, OP, conciliación — endpoints existen, ver
pasamanos §2). Secciones: `HeroFinanciero` (pool 5 KPIs etiquetado por módulo: sin
contaduría entra "pagos vencidos", con contaduría "OP por autorizar"), `ColasPagos`
(TarjetaCola ×3; 3.ª = sueldos u OP según módulos), `TendenciaGastos` (modo 'monto';
verificar si falta endpoint de serie diaria de gastos — si falta, agregarlo:
SUM(monto) GROUP BY fecha, 90 días). Par completa/resumen según convivencia (§1.6).
**Criterio:** SPN muestra SUS datos reales (7.781 gastos, 244 pagos); Merlo ve el
resumen de 3 preguntas al final.

### WO-F4 — El barro + Bienvenida
Endpoints de agregación nuevos: cuellos de trámites (por estado/dependencia), turnos
presentados/cancelados, OTs por estado + trabas de materiales + cobertura de stock,
reaperturas de reclamos. Secciones `CampoOT` ("¿Salieron las cuadrillas?"...) y
`CircuitoTramites` ("¿Dónde se traban?"...), pregunta "¿Resolvemos a la primera?" en
analítica. `Bienvenida` (todo en cero → pasa por canvas de diseño con el dueño).

### Gates de TODOS los WOs
`npx tsc -p tsconfig.app.json` + `npx eslint src/ --ext .ts,.tsx` (baseline por archivo)
+ `npm run build`. Backend: pyflakes. El E2E no cubre dashboard: verificación VISUAL por
perfil (Merlo vs SPN en QA) con capturas — cierre verificado (regla 21). Commit local lo
hace el director tras verificar; push sólo si el dueño lo pide.
