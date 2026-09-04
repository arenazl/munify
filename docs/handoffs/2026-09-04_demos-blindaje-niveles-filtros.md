# Demos: blindaje, 4 niveles de integridad, filtros y sin PIN en QA (2026-09-04)

> Estado: **en `qa`** (commits `64732399` y `609957b8`). Nada en prod. Lo que
> Infra tiene que repetir al promover está en
> `base-compartida/munify/PROMOCION-BLINDAJE-DEMOS.md`.

## Qué pidió el dueño (2026-09-03, sesión por dictado)

1. **Blindar la demo de Paraguay** (`asuncion`): "no es borrable por ningún
   proceso, ni por acá sin pregunta explícita, ni por ninguna UX de QA ni de
   prod". Y la otra "más completa", la del E2E: `merlo` (la de muestra).
2. Entender por qué la auditoría marcaba **"Íntegra" con "Contorno: Falta"**.
3. **Tres o cuatro niveles** de integridad, no dos; "íntegro es con todo".
4. Filtros por **país (default Argentina) y provincia**, y **tildes aditivas**
   (una no saca la otra): sin barrios, sin contorno, barrios sin polígono…
5. La **cobertura del catálogo** por país, en la pantalla, no en el chat.
6. **Sacar el PIN numérico en QA.**
7. Las **pistas** (hint de arriba): cerrada una vez, no vuelve.

## Diagnóstico del "Contorno: Falta"

- La columna leía `municipios.limites_geojson`, que **ningún proceso escribe**:
  22/22 demos en QA y 6/6 en prod daban "Falta". Los 15 puntos del score
  eran inalcanzables.
- El contorno real (forma del municipio ENTERO) lo copia la semilla desde
  `municipios_catalogo.poligono` al **polígono de la zona única**. Los
  polígonos de los barrios salen de `catalogo_barrios`.
- Vocabulario que quedó en la pantalla: **contorno** = municipio entero;
  **polígono** = cada barrio (o zona).
- Catálogo: Argentina 2.082/2.082 municipios con contorno (100 %); UY 100 %,
  CL 97 %, PY 93 %, BO 90 %, PE 88 %.
- Fix: `con_contorno = limites_geojson OR alguna zona con polígono`. Con eso
  18 de 22 demos de QA tienen contorno; las 4 sin él (General Cabrera,
  Rafaela, Rafaela-3, La Paz) son anteriores a que la semilla copiara el
  polígono — el catálogo lo tiene, se les puede volcar.

## Lo que quedó

### Blindaje (tres capas + una regla mía)
| Capa | Dónde |
|---|---|
| Código, un solo embudo | `services/demo_borrado.py`: `CODIGOS_INTOCABLES = {asuncion, merlo}` + SPN (id 80); `es_intocable()` se chequea ADENTRO de `borrar_municipio` (lo usan el DELETE público, la purga super admin y `scripts/purgar_demos.py`), en `DELETE /municipios/{id}` (soft) y en la purga con motivo "blindada" |
| Base | trigger `municipios_blindaje` BEFORE DELETE (migración `20260904_provincia_blindaje.py`). **Verificado en QA**: `DELETE FROM municipios WHERE codigo='asuncion'` → error 1644 "Municipio blindado" |
| Pantalla | filas `intocable` o de muestra sin tacho, chip "Blindada"/"Muestra", excluidas de "Eliminar estas N" |
| Memoria | `project_demos_blindaje_niveles`: yo tampoco las borro sin preguntar |

`alembic_version` está **vacía en QA y prod**: la migración se aplicó en QA
con `scripts/aplicar_20260904_blindaje.py` (idempotente; importa los SQL del
archivo Alembic). Infra corre el mismo script contra prod.

### Auditoría (`/gestion/admin/demos`, `frontend/src/pages/DemosListado.tsx`)
- **Niveles por el eslabón más débil** (`evaluar()`), sin score ponderado:
  - Íntegra: contorno + zona con polígono + 100 % barrios con polígono +
    catálogos + usuarios + reclamos + trámites + noticias.
  - Casi íntegra: ídem con ≥ 80 % de barrios con polígono, o sólo faltan noticias.
  - A medias: se entra y opera, pero sin contorno, < 80 % o sin barrios, o
    falta un seed operativo.
  - Rota: sin usuarios, sin catálogos, sin reclamos ni trámites, o sin
    contorno y sin un barrio dibujado.
  - Con los datos de QA del 2026-09-04: 0 íntegras, 2 casi (Lanús 98 %,
    Ciudad del Este 86 %), 16 a medias, 4 rotas.
- Columnas: Demo · Marcas (Blindada/Muestra/Con PIN/Inactiva) · Contorno ·
  Zona (con/sin polígono) · Barrios (total, con polígono, %) · Catálogos ·
  Datos vivos · Integridad (nivel + qué falta).
- Filtros: País (default AR) → Provincia (cascada, `disabled` hasta elegir
  país, kit v3.3). Tildes aditivas (kit v3.4, ver abajo). Tabs por nivel.
  Orden: nivel / barrios / % polígono.
- Hero por ámbito: frase con los 4 niveles + frase de cobertura del catálogo;
  5 KPIs (4 niveles + "Catálogo con contorno").
- Endpoint `GET /demos/auditoria` ahora devuelve `{ demos, catalogo }` con
  `provincia`, `con_pin`, `de_muestra`, `intocable`, `created_at`.
- `municipios.provincia` (nueva, VARCHAR 150): la escribe `crear-demo`
  (`data.provincia`) y se rellenó desde `demo_seed_logs` (19 de 22 en QA;
  sin dato: la-matanza, asuncion, villa-maria).

### Kit abmv2 v3.4 (portado a `APP_GUIDE/components/v2/abmv2`)
- `TildesAditivas.tsx` + `TildeSpec`/`TildesSpec` + prop `tildes` en
  `SemanticAbmPage` → `FilterBar` (desktop después de los selects; en angosto
  dentro del panel). CSS `.av2-tilde*` en `styles/abmv2.css`.
- `pistas.ts`: persistencia del cierre de `HintBanner` con adaptador
  (default localStorage). La app enchufa la POR USUARIO en
  `lib/pistasUsuario.ts` desde `AuthContext` → `usuarios.preferencias`
  (JSON que ya existía sin uso) vía `PATCH /auth/me/preferencias`.

### QA sin PIN
- `core/ambiente.py` (`es_qa(db)` por nombre de base). `crear-demo` ignora
  `demo_pin` en QA. `scripts/qa_demos_sin_pin.py` (se niega fuera de QA)
  desprotegió 9 demos y dejó 153 usuarios demo con `demo123`.

## Gates
- Backend: pyflakes limpio en lo mío (los avisos de `auth.py`/`municipios.py`
  son preexistentes). Front: `npm run build` OK (`tsc -b` + vite; el FATAL
  final es el generador del proxy, que exige `BACKEND_ORIGIN` del CD). ESLint
  limpio en todo lo nuevo; los 3 errores de `AuthContext.tsx` son de líneas
  preexistentes.
- Verificación en vivo en QA (2026-09-04, 23:35 ART, con sesión de super admin
  por API, sin navegador): auditoría devuelve `{demos, catalogo}` con 22 demos,
  18 con contorno, 19 con provincia, 0 con PIN; `asuncion` y `merlo` vienen
  `intocable=true`; la purga de ambas responde "blindada" y el DELETE público
  403; `public/lanus` ya sin PIN; `PATCH /auth/me/preferencias` persiste y
  `/auth/me` lo devuelve; el front de QA sirve el bundle nuevo
  (`index-7DDSE12R.js`, con "Casi íntegra", tildes y pista).
- GOTCHA de deploy: la respuesta de `/demos/auditoria` cambió de lista a
  objeto y, durante los minutos entre el deploy del backend y el del front, la
  pantalla vieja rompió con "e.map is not a function". La próxima vez que se
  cambie la forma de una respuesta, dejarla compatible un deploy (campo nuevo
  al lado del viejo) o desplegar el front primero.

## Pendiente / ideas que NO se hicieron
- Volcar el contorno del catálogo a las 4 demos viejas sin zona con polígono.
- Las tildes son single-page; si otra pantalla las necesita multi-criterio
  con OR, agregar `modo: 'or'` al `TildesSpec`.
