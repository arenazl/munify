# Handoff — el mapa, el modelo geográfico y el catálogo de municipios

> Sesión del 2026-08-17 (madrugada). Todo lo de acá está **decidido con el
> dueño**, salvo lo marcado como abierto. La propuesta visual del mapa está
> publicada aparte: https://claude.ai/code/artifact/fa830f73-84ca-44e6-87c4-81294d4995af

## Lo primero: el propósito de la pantalla

El mapa **no es un mapa**: es un instrumento que contesta preguntas de gestión,
y el dibujo es la evidencia de una frase que ya está escrita arriba. El que lo
usa es un intendente, no un analista: viene a decidir a dónde manda la cuadrilla
el lunes. Cualquier pieza que no conteste algo, sobra.

## Las cuatro capas de datos, y su cobertura REAL

Esto es lo que hace que una demo funcione en cualquier municipio. Medido, no
supuesto:

| Capa | Fuente | Cobertura | Estado |
|---|---|---|---|
| 1 · Que el municipio exista | Catálogos oficiales (georef AR, INE PY) | **100%** | AR 2.082 cargado · PY 263 generado |
| 2 · Límite del municipio | OSM `admin_level=8` | **46% en PY** (122 de 263) | sirve para encuadrar, no se puede depender |
| 3 · Calles y esquinas | OSM | alta, incluso en pueblos chicos | 3.000 esquinas de Asunción cacheadas |
| 4 · Barrios | OSM `admin_level=10` | baja salvo capitales | Asunción 66 con geometría |

**La demo se apoya en la capa 3, nunca en la 4.** Los reclamos se siembran sobre
esquinas REALES del municipio, tenga barrios o no. Si hay barrios oficiales se
usan como zonas; si no, se cargan a mano (interfaz a construir) o por importación
externa. Decisión del dueño.

**Sin verificar:** que un pueblo chico tenga sus calles en OSM. Es el supuesto que
sostiene la capa 3. **Medirlo antes de construir** con un municipio real de la
lista de prospectos.

## El modelo geográfico y operativo

El orden es: **municipio → regiones geográficas → asignación de cuadrillas**.

- **La geografía mide, no reparte.** Las regiones sirven para saber dónde se
  concentra el problema. No hay "sector de la Cuadrilla B".
- **El perfil de la cuadrilla es fijo y por oficio** (Eléctrica_01, Bacheo_02):
  las herramientas y la gente no cambian todos los días.
- **Su asignación geográfica es dinámica**: el municipio decide con el mapa a la
  vista qué cuadrilla entra a qué sector, y lo revisa cuando la demanda se mueve.
  Es un despacho temporal, no una propiedad.
- **El criterio es el volumen DE ESE OFICIO en ese sector**, no el volumen total.
  Mandar bacheo a un sector cargado de cloacas es mover gente hacia un número que
  no puede bajar.
- **La zona recomendada puede existir** (conocimiento del terreno) pero NO filtra
  candidatas: entra sólo en el último desempate, junto a la distancia. Hay que
  medir cuántas asignaciones salen de ella — si nunca salen, se volvió una regla
  encubierta.

Criterios de asignación, en orden: **especialidad** (filtro duro) → urgencia →
acumulación → capacidad libre → distancia (sólo desempata). La distancia va
última a propósito: si pesa de más, el modelo territorial vuelve por la ventana.

## Hallazgos verificados contra QA (muni 146, Asunción)

- **1365 reclamos**, ago 2025 – ago 2026. 95% georreferenciados. 1333 con zona.
- **La semilla NO era el problema.** Lo que falla es la pantalla.
- **Los KPIs mienten mientras carga**: el mapa trae los reclamos de a lotes de
  100 y los indicadores se pintan con el primer lote. De ahí el "0 de 18 barrios"
  y el "todo dentro del SLA" conviviendo con "162 atrasados". Es el arreglo más
  barato y el de mayor riesgo si lo ve un cliente.
- **Las zonas actuales son barrios disfrazados.** Las 18 "zonas" se llaman
  Microcentro, Tacumbú, Villa Morra. Asunción tiene oficialmente **6 distritos**
  (Santísima Trinidad, La Recoleta, San Roque, La Encarnación, La Catedral,
  Santa María) que agrupan **68 barrios**: la jerarquía que buscábamos ya existe
  y es oficial. No hace falta IA para agrupar ciudades grandes.
- **Casi la mitad de la demanda no tiene cuadrilla.** 12 oficios entran, 4
  cuadrillas existen: Higiene urbana (138), Agua y cloacas (109), Tránsito (86),
  Arbolado (84) y otros ~222 reclamos no los cubre nadie. Ese número no aparece
  en ninguna pantalla y es probablemente el dato más accionable del sistema.
- **`cuadrilla_categorias` ya existe** (con `es_principal`): el modelo soporta que
  una cuadrilla cubra varios oficios. Hoy sin usar — la especialidad es texto
  libre que no cruza con nada.
- **El recorrido corre en falso** en las preguntas sin período: el filtro temporal
  está desactivado a propósito pero la animación quedó prendida, así que el
  cursor avanza y ningún pin se mueve. Y el "+2600%" compara datos filtrados
  contra sin filtrar.

## El catálogo de municipios

Generado y sin commitear en `backend/scripts/datos/`:

- `municipios_py.json` — **263 intendencias**, 18 departamentos, 19 con alias de
  búsqueda, 215 con código del INE.
- `generar_municipios_py.py` — lo reconstruye desde las fuentes.
- `intendencias_paraguay.md` (listado del dueño, 255) y `distritos_py_ine.json`
  (INE censo 2012, 250).

Los 8 que faltaban para 263: Itacuá (Concepción); San José del Rosario, San
Vicente Pancholo, Villa del Rosario, Yrybucuá (San Pedro); Laurel (Canindeyú);
José Falcón, Nueva Asunción (Presidente Hayes). Varios son distritos creados
entre 2020 y 2021, por eso no están en el censo 2012.

**Los alias son cobertura de búsqueda, no basura**: quien crea la demo escribe
"Campo 9", no "Doctor J. Eulogio Estigarribia". El buscador matchea por ambos.

**Abierto:** la tabla de reconciliación daba "Zanja Pytã" como alias de General
Francisco Caballero Álvarez (Canindeyú), pero Zanja Pytá es municipio propio de
Amambay. NO se cargó como alias — fusionaría dos municipios distintos.

## Lo que falta construir

1. **Catálogo multi-país**: columnas `pais`, `osm_id` y `alias`; cargar los 263;
   endpoint con parámetro de país; **tres banderas SVG** (Argentina por defecto,
   Uruguay y Paraguay) en el alta de demo. Sin emoji: SVG. Uruguay quedó fuera
   del alcance por ahora — se midió y OSM lo tiene granular (628 localidades).
2. **Servicio de importar regiones**, con dos consumidores: el botón del ABM de
   Zonas (se muestra durante la demo) y la semilla. Requiere `osm_id` y
   `poligono` en `zonas` — hoy sólo guarda un punto.
3. **Los KPIs que no mientan mientras cargan.**
4. **El recorrido como narración**: paradas en los momentos que importan, quietas
   el tiempo de leerlas, métricas del tramo al costado y una frase que diga qué
   cambió. Se caen los controles 1x/2x/4x.
5. **Cuadrillas por oficio** cableadas con `cuadrilla_categorias`, y reparto de
   los reclamos.

## Reglas de trabajo que salieron de esta sesión

- **Un solo deploy por bloque terminado.** Salieron 6 deploys en una madrugada y
  dos se pisaron entre sí. Se acumula en commits locales y se sube una vez.
- **Nada de dominios nuevos para demos.** `munify.com.ar/py` le diría a un
  intendente paraguayo que entra a un sistema argentino. La identidad paraguaya
  va por host propio cuando el cliente se formalice.
- **Overpass no se consulta en vivo.** En veinte minutos devolvió un 504 y un
  429. Todo lo de OSM se baja una vez y se persiste.

## Deuda que sigue viva

- **React #310 latente en `Tesoreria.tsx` de producción**: el `return` por rol
  está antes de la mitad de los hooks (24 de sus 31 errores de ESLint). En `qa`
  ya está resuelto con `esGestor`; en prod no.
- **Fase 3 del ABM mobile sin commitear** en el working tree
  (`FilterBar`, `ListToolbar`, `abmv2.css`). Ver
  `docs/design-sync/abm-mobile/HANDOFF.md`.

## Pendiente inmediato: selección de barrios/distritos en el mapa

Pedido del dueño al cierre de la sesión. La base ya tiene todo lo necesario:
6 distritos (zonas), 51 barrios colgando de ellos y 1.056 reclamos repartidos.

**Qué tiene que hacer:** el usuario elige un barrio o un distrito y el mapa lo
marca — lo resalta y recorta los datos a esa selección.

**Cómo lo armaría:**

1. **Se dibujan siempre los barrios**, nunca los distritos por separado. Cada
   barrio se pinta con el color de su distrito, así los seis se leen igual y
   además se puede bajar al detalle sin pedir más datos. No hace falta fusionar
   geometrías (ni `geopandas` ni `shapely`): visualmente da el mismo resultado.
2. **Elegir un distrito** resalta sus barrios como un bloque. **Elegir un
   barrio** resalta sólo ese. Un clic en el mapa y el combo de arriba tienen que
   quedar sincronizados: son la misma selección vista de dos formas.
3. **La selección recorta todo lo demás** — KPIs, listado y titular. Si el
   titular sigue hablando del municipio entero mientras el mapa muestra un
   barrio, vuelve el problema de que la pantalla afirma una cosa y dibuja otra.
4. **Los 17 barrios sin distrito** se dibujan en gris neutro, seleccionables
   igual. No se los pinta con el color de un distrito al que no sabemos si
   pertenecen.

**Lo que falta antes:** cargar los contornos a la base con
`scripts/cargar_regiones_municipio.py` (no toca la red, copia lo ya bajado). La
bajada de OSM quedó en ~34 de 66 contornos y se completa corriendo de nuevo
`services/osm_regiones.descargar_regiones(..., forzar=True)`, que ahora es
incremental y ya no pisa lo bueno.

---

# CÓMO RETOMAR (operativo)

## Estado exacto de la base — QA, municipio 146 (Asunción)

Medido al cerrar la sesión:

| Qué | Cuánto |
|---|---|
| Reclamos | 1365 (ago 2025 – ago 2026) · 67 sin coordenada |
| Zonas activas = **distritos** | **6** (las 18 viejas quedaron con `activo = 0`) |
| Barrios | 68 · **51 con distrito** · 17 sin |
| Reclamos con distrito | **1056** · 281 sin |
| Contornos en la BASE | **0** — bajados pero NO cargados todavía |
| Catálogo de municipios | AR 2.082 · PY 263 |

Reparto por distrito: La Recoleta 252 · La Encarnación 216 · San Roque 205 ·
Santísima Trinidad 181 · La Catedral 139 · Santa María 91.

## Los comandos, en orden

Todos desde `backend/`, con el entorno cargado:

```bash
set -a && . ./.env && set +a     # DATABASE_URL apunta a sugerenciasmun-qa
```

**1. Completar los contornos de Asunción** (quedó en ~34 de 66). Es incremental:
cada corrida completa lo que la anterior no pudo, y ya NO pisa lo bueno.

```bash
python -c "from services.osm_regiones import descargar_regiones; \
  print(descargar_regiones('relation/3654543','Asuncion',forzar=True))"
```
Repetir hasta que no suba el número. Tarda ~3-5 min por corrida.

**2. Cargar los contornos a la base** (NO toca la red, copia el cache):

```bash
python scripts/cargar_regiones_municipio.py --muni 146 --cache asuncion
```

**3. Re-asignar distritos si cambia el mapeo** (idempotente):

```bash
python scripts/cargar_distritos_asuncion.py
```

**4. Re-vincular reclamos a su distrito** — el distrito se DERIVA del barrio:

```sql
UPDATE reclamos r JOIN barrios b ON b.id = r.barrio_id
SET r.zona_id = b.zona_id
WHERE r.municipio_id = 146 AND b.zona_id IS NOT NULL;
```

## Qué hace cada archivo nuevo

| Archivo | Para qué |
|---|---|
| `services/osm_regiones.py` | baja regiones de OSM. Cachea en `scripts/semillas/datos/osm_<muni>_regiones.json` |
| `scripts/cargar_regiones_municipio.py` | del cache a la base. Simplifica la geometría a 200 puntos |
| `scripts/cargar_distritos_asuncion.py` | los 6 distritos + mapeo barrio→distrito |
| `scripts/migrate_catalogo_municipios.py` | renombre a `municipios_catalogo` + `pais`/`osm_id`/`alias` + carga PY |
| `scripts/migrate_jerarquia_geografica.py` | `barrios.zona_id`, `osm_id` y `poligono` en zonas y barrios |
| `scripts/datos/generar_municipios_py.py` | reconstruye las 263 intendencias desde las fuentes |
| `components/ui/BanderaPais.tsx` | banderas SVG (AR/PY/UY) — no emoji |

## Gotchas de Overpass que ya costaron horas

1. **Dos pasos SIEMPRE.** Con filtro de área, Overpass devuelve la relación pero
   NO expande sus miembros: el contorno llega vacío. Y pedir lista + geometría
   junto hace timeout. Primero `out tags center`, después `out geom` por lotes
   de 12.
2. **Nunca guardar un resultado peor que el cacheado.** Ya pasó: una corrida con
   mala suerte pisó el cache y se perdieron 46 contornos. El fix está puesto,
   no lo saques.
3. **Un `ref` en los tags = número oficial del barrio.** Obrero 9, Tacumbú 10,
   General Díaz 17. Sirve para cruzar con el CSV del DGEEC sin ambigüedad de
   nombres.
4. Los mirrors están en `MIRRORS`; si uno tira 429, prueba el otro solo.

## Lo que NO hay que volver a intentar (ya se descartó con evidencia)

- **Buscar los 6 distritos en OSM** — 3 consultas exitosas, cero resultados en
  `admin_level=9`. No están.
- **Buscarlos en Wikidata** — la propiedad P131 de cada barrio apunta a Asunción
  directo, se saltea el distrito.
- **Buscarlos en GADM** — llega a municipio, no baja a subdivisión interna.
- **Wikipedia** — dice "6 distritos, 68 barrios" pero no los agrupa.
- **El registro del DGEEC** (`Barrios_Localidades_Paraguay_Codigos_DGEEC.csv`,
  8.337 filas) — lista los barrios SIN nivel intermedio. De hecho "La Catedral"
  y "La Encarnación" figuran ahí como BARRIOS, no como distritos.

Conclusión: la división en 6 distritos es tradicional/catastral y sólo está en
el mapa catastral de la Municipalidad, publicado como PDF. **El mapeo lo tiene
que dar una persona.**

- **NO sumar `geopandas`/`shapely`** para fusionar polígonos. Pintar cada barrio
  con el color de su distrito da el mismo resultado visual, y agrupar para los
  KPIs es un `GROUP BY` sobre `barrios.zona_id`.
- **NO asignar barrios a un distrito "por parecido"**. Un barrio en el distrito
  equivocado ensucia todo gráfico que agrupe por distrito y no hay forma de
  detectarlo después. Los 17 sin mapear se quedan sin distrito.

## Los 17 barrios sin distrito

Ocho son variantes de escritura de barrios que SÍ están en el mapeo y se
resuelven afinando `emparejar()` en `cargar_distritos_asuncion.py`:
Ycuá Satí=Ykua Sati · Nazareth=Nazaret · Madame Elisa Alicia Linch=Madame Lynch ·
Luis Alberto de Herrera=Herrera · Gral. Bernardino Caballero=General Caballero ·
Gral. José Eduvigis Díaz=General Díaz · Ytay=Ityay ·
Obrero Intendente B. Guggiari=Barrio Obrero.

Los otros nueve **no están en ninguna de las seis listas** y hay que
preguntarlos: Bella Vista, Cañada del Ybyray, De la Residenta, Dr. Gaspar
Rodríguez de Francia, Jukyty, Mbocayaty, San Cayetano, Ñu Guazú, Mariscal
Francisco Solano López.

## Commits de la sesión (locales, SIN pushear)

| Commit | Qué |
|---|---|
| `f895f16` | especificación de la selección en el mapa |
| `dd06b54` | los 6 distritos con sus barrios + fix del cache |
| `6fdbd61` | catálogo multi-país, banderas, jerarquía, servicio de regiones |
| `24370c0` | color por área en los pines |
| `733f9ff` | pantalla completa del mapa |
| `d16909d` | logs de diagnóstico del mapa (se apagan con `localStorage.mapaDebug='0'`) |

**No pushear suelto**: el criterio acordado es un solo deploy con el bloque
terminado.
