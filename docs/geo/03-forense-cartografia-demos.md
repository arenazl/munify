# Forense: por qué las demos fallan en cartografía — y la hoja de ruta

> 2026-09-02/03, a pedido de Lucas. Datos medidos contra la base real
> (`sugerenciasmun-qa`, que comparte catálogo con `munify_prod` — Infra
> verificó 0 diferencias de schema) y contra la bitácora `demo_seed_logs`.
>
> **Decisión de arquitectura que gobierna todo (Lucas, 2026-09-02):**
> la cartografía NO se busca online durante el alta — nunca funcionó, por
> delays. El camino es CURAR la base y que el alta lea sólo del catálogo.

---

## 1. Qué está precargado hoy, y su calidad (medido)

| capa | tabla | cobertura | calidad |
|---|---|---|---|
| **Contorno del municipio** | `municipios_catalogo` | 5.122 munis en 6 países; AR **2.082/2.082 con polígono** | **MALA en la mitad**: mediana 17 vértices, mínimo 4, **53% con <20 vértices** — cajas groseras, no contornos |
| **Localidades/zonas** | `catalogo_zonas` | 4.011 localidades, **90% con contorno** (3.617) | La curación que "dio bien" — es la capa sana |
| **Barrios** | — | **NO EXISTE capa precargada** (sólo `barrios` operativa: 224 filas ya creadas por demos) | El agujero central |
| **Calles y direcciones** | — | **NO EXISTE** — salen de Overpass EN VIVO en cada alta | Ídem, y son las coords de los reclamos |

**La conclusión estructural:** la directiva "nada online" hoy es imposible de
cumplir para barrios/calles porque esa capa nunca se curó — el alta no tiene
de dónde leerla. Cada demo depende de Overpass en el momento, con todo lo
que eso significó hoy.

## 2. Por qué fallaron las demos (los bugs del 2026-09-02, ya arreglados)

1. **Timeout eterno**: Overpass caído costaba 75s × 2 mirrors = hasta 150s;
   el celular cortaba el fetch y la landing pintaba "falló" (la demo nacía
   igual). → 20s por mirror (`86a5664a`) + la landing verifica y avisa
   (`landing@597e0fc`).
2. **La promoción se comía los barrios** (Rafaela capa 1): en ciudades de una
   sola localidad, los barrios de OSM se promovían a zonas y se vaciaba la
   lista; si encima el padrón imponía sus zonas, quedaban CERO barrios.
   → `armar()` conoce el padrón y no promueve si divide; y al promover, los
   que no entran como zona SIGUEN siendo barrios (`dc382b32`, `27b49690`).
3. **El query no pedía la mitad del dato** (Rafaela capa 2): los barrios de
   varias ciudades están mapeados como **límite administrativo (admin_level
   9/10)**, no como `place=*` — Rafaela: 74 de 86. La consulta ni los pedía.
   → agregados al query con dedup (`27b49690`). Verificado local: Rafaela
   pasó de 0 a **12 zonas + 33 barrios reales**.
4. **La bitácora mentía**: `SEMBRAR_TASAS=False` (decisión de producto) se
   registraba como degradación con motivo falso → ninguna demo llegaba a
   `ok` desde el 29/08 y las alertas reales quedaban enterradas; y los
   `fallo` tenían `error_message` NULL. → arreglado (`24aab87c`, `dc382b32`).

## 3. Lo que FALTA (el forense pedido)

- **F1 — Capa de barrios precargada: no existe.** Sin ella, "nada online" es
  incumplible. Es LA pieza.
- **F2 — Capa de calles/direcciones precargada: no existe.** Los reclamos
  demo necesitan direcciones reales; hoy Overpass en vivo.
- **F3 — Contornos municipales groseros: 53% con <20 vértices.** Un contorno
  de 6 vértices (Rafaela) filtra mal: deja barrios reales afuera y puede
  meter vecinos. Afecta a TODO lo que se filtre por polígono, incluida la
  curación offline futura.
- **F4 — `catalogo_zonas` con 10% sin contorno** (394 localidades): menor,
  la misma pasada de curación lo cierra.

## 4. Hoja de ruta propuesta

**Etapa A — el batch de curación de barrios+calles (la pieza nueva).**
Tablas `catalogo_barrios` y `catalogo_calles` (por municipio del catálogo,
con fuente y fecha de curación). El batch reutiliza EXACTAMENTE el pipeline
ya verificado hoy (`osm_de_ciudad` + `armar` con padrón) — corre offline,
con toda la paciencia del mundo, reintentos y sin usuarios esperando.
Prioridad de corrida: los ~154 municipios del directorio comercial de
`/calls` + los que ya tienen demo; después el resto de AR; después los otros
países.

**Etapa B — el alta deja de salir a la red.** `geo_de_ciudad` lee
`catalogo_barrios`/`catalogo_calles`; si el municipio no está curado, la
demo nace degradada con motivo honesto ("municipio sin curación de barrios —
correr el batch") y NUNCA espera a Overpass. El alta queda en ~10-15s
constantes, sin varianza.

**Etapa C — recurar contornos groseros (F3).** El mismo batch trae el
contorno real de OSM/IGN para los <20 vértices (el cruce por código INDEC ya
está resuelto en `catalogo_localidades.py`). Recurar y re-correr barrios de
esos municipios.

**Etapa D — mantenimiento.** Job mensual de recuración + el panel de
`demo_seed_logs` (ya existe) como tablero de cobertura: qué municipio está
curado, con cuántos barrios, de qué fecha.

## 5. Estado de verificación

- Fixes 1-4: en `qa` hasta `27b49690`; Rafaela verificada EN LOCAL contra la
  fuente (0 → 33 barrios). Verificación end-to-end en QA desplegado: en
  curso (se actualiza acá). Prod: espera la promoción de Infra.
- Este informe: avisado en `CANAL_AGENTES.md` según el acuerdo con Infra
  (archivo = handoff; canal = línea de aviso).
