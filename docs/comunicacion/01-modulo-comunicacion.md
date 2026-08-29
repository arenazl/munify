# Módulo Comunicación — lo que el municipio le cuenta al vecino

> **Por qué existe:** Munify hoy REGISTRA (pagos, reclamos, trámites). Todo lo
> que el vecino ve nace de algo que él mismo inició. No hay un canal para que
> el municipio le hable primero: "estamos pavimentando la 9 de Julio", "corte
> de agua mañana en el barrio Centro". Ese canal es este módulo.
>
> **Decisión del dueño (2026-08-28):** ampliar el espectro del producto sin
> meterse con tasas, padrón ni imputación. Dos módulos nuevos: **Comunicación**
> (puertas afuera, este doc) y **Recursos** (puertas adentro, ver
> [`../recursos/01-modulo-recursos.md`](../recursos/01-modulo-recursos.md)).

---

## 1. El hallazgo que ordena todo: el feed existe y está vacío

Antes de diseñar nada se verificó qué hay. La app del vecino **ya tiene la
superficie de novedades**, y nadie la alimenta:

| Pieza | Estado |
|---|---|
| Tabla `noticias` | existe (`backend/models/noticia.py`): `titulo`, `descripcion`, `imagen_url`, `activo`, timestamps |
| API | existe (`backend/api/noticias.py`): `GET /noticias/publico`, `GET`, `POST`, `PATCH /{id}`, `DELETE /{id}` |
| Superficies que la muestran | `DashboardVecino.tsx`, `HomePublic.tsx`, `mobile/MobileHome.tsx` |
| **Pantalla para cargar una noticia** | **NO EXISTE** — el `POST` no lo llama nadie |
| **Filas cargadas** | **0 en toda la base**, ningún municipio |

O sea: hay un canal tendido hasta el celular del vecino con la punta suelta.
El módulo no arranca de cero — arranca conectando lo que ya está.

**Regla de consolidación:** este módulo **extiende `noticias`**, no crea una
tabla paralela. Un "aviso" es una noticia con destinatario, vigencia y envío.
Nada de `avisos` + `noticias` conviviendo (regla DRY del repo).

---

## 2. Qué se reusa (nada de esto se construye de nuevo)

| Necesidad | Pieza que ya existe |
|---|---|
| Mostrar la novedad al vecino | `noticias` + las tres superficies de arriba |
| Notificación al celular | `backend/services/push_service.py` → `send_push_to_users()`, `crear_notificacion_db()` |
| Preferencias de notificación del vecino | `backend/api/push.py` → `/push/preferences` |
| WhatsApp | `backend/api/whatsapp.py` + plantillas por municipio |
| Email | `backend/services/email_service.py` |
| Imagen del aviso | Cloudinary (`services/imagen_service.py`), mismo flujo que las fotos de reclamo |
| Barrios y zonas con polígono | `barrios`, `zonas` (`poligono`, `osm_id`) |
| Gate por municipio | `municipio_modulos` + `lib/enums/modulos.ts` |
| Pantalla de gestión | `ABMPage` + `Sheet` del kit (BUILD_GUIDE §5-§7) |

---

## 3. Un límite honesto que define el alcance de la Etapa 1

**El vecino hoy no tiene barrio ni zona en su ficha.** `usuarios` sólo guarda
`direccion` como texto libre; quien tiene barrio es el *reclamo*, no la
persona.

Consecuencia, sin adornos: **la segmentación por barrio no se puede hacer bien
en la Etapa 1**. Se puede aproximar por los barrios donde el vecino reclamó,
pero eso es una inferencia, no un dato — y este producto no muestra
inferencias como si fueran hechos.

Por eso la Etapa 1 manda **a todo el municipio**, que además cubre el caso
más frecuente (corte de agua, cronograma, alerta). La segmentación fina entra
en la Etapa 3, junto con el trabajo de darle barrio al vecino.

> **Resuelto en la Etapa 3 (2026-08-29), y como estaba dicho:** el vecino
> **declara** su barrio en su perfil. No se infiere de dónde reclamó — eso
> seguiría siendo una inferencia mostrada como dato.

---

## 4. Las tres etapas

### Etapa 1 · Avisos — HECHA (2026-08-29, en qa)

Pantalla **Avisos** (kit v2, categoría Comunicación del sidebar, flag
`comunicacion` opt-in) + `POST /noticias/{id}/enviar` (push + campana,
idempotente). Migración: `backend/scripts/migrate_avisos.py`.
De paso se cerró un leak entre tenants: `update` y `delete` de noticias
buscaban por id **sin filtrar municipio**, y el `POST` tomaba el
`municipio_id` del payload.
Las demos nacen con seis avisos que cubren los cuatro estados y fotos reales
(Openverse/Flickr, licencia comercial, verificadas una por una).


El municipio publica un aviso y le llega al vecino.

**Modelo** — se agregan a `noticias` (ALTER aditivo, nullable, no rompe nada
de lo que ya lee la tabla):

| Campo | Para qué |
|---|---|
| `tipo` | `aviso` / `noticia` / `alerta` — cambia el color y el peso en el feed |
| `fecha_desde`, `fecha_hasta` | vigencia: el aviso del corte de agua se apaga solo |
| `fijado` | lo importante queda arriba del feed |
| `enviado_at`, `enviados_count` | cuándo se notificó y a cuántos (para no re-enviar) |
| `creador_id` | quién lo publicó |

**Backend** (`backend/api/noticias.py`, extendiendo lo que ya está):
- `GET /noticias/publico` pasa a filtrar por vigencia y a ordenar por `fijado`.
- `POST /noticias/{id}/enviar` — dispara el push a los vecinos del municipio
  reusando `send_push_to_users()`, escribe la notificación en la campana y
  sella `enviado_at` + `enviados_count`. Idempotente: si ya se envió, no
  vuelve a mandar (avisa cuántos recibieron).

**Frontend** — `Comunicación` como categoría del sidebar con un item:
**Avisos** (una palabra, regla 10). Pantalla `ABMPage` + `Sheet`, patrón
idéntico al resto de los ABM:
- Lista con estado (borrador / vigente / vencido), fecha, alcance.
- Sheet de edición: título, texto, imagen, tipo, vigencia, fijado.
- Botón **Publicar y avisar** — publica y notifica en un gesto; si ya se
  notificó, el botón lo dice ("Ya avisado a N vecinos").

**Criterio de terminado:** un admin de San Pedro Norte escribe un aviso en QA,
lo publica, y aparece en el feed del vecino y como notificación en el celular.

### Etapa 2 · Obras — HECHA (2026-08-29, en qa)

El proyecto de Tesorería suma `publico`, `estado_obra`, `avance`, `foto_url`,
`latitud`, `longitud` y `mostrar_monto`; `GET /tesoreria/proyectos/publicas`
(sin token) y el bloque **"Obras en tu ciudad"** en el panel del vecino, con
la barra de avance como protagonista. Migración:
`backend/scripts/migrate_obras.py`.
Tres reglas que quedaron en el código: publicar es **deliberado** (default
apagado), el monto es un interruptor **aparte** —publica lo realmente
imputado, nunca el presupuesto— y el **avance son dos campos, no uno**.

**Por qué dos avances** (decisión del dueño, 2026-08-29): `avance` es el real,
el que lleva Tesorería para gestionar; `avance_publicado` es el que ve el
vecino. No tienen por qué coincidir, y cuando el intendente quiere comunicar
otra cosa, publicar **no puede ensuciar el número con el que el municipio se
maneja adentro**. Al marcar la obra como pública, Comunicación precarga el real
como *plantilla* y desde ahí el publicado vive su propia vida. `NULL` en el
publicado = la obra se ve sin barra de avance.
Migración: `backend/scripts/migrate_avance_publicado.py`, con backfill — las
obras ya publicadas heredan su avance actual, para que a nadie se le caiga la
barra por una migración.


Las obras ya existen como **proyectos de Tesorería** con sus gastos imputados.
Esta etapa las publica: el vecino ve qué se está haciendo, dónde y cómo viene.

- Se agrega al proyecto lo que le falta para ser público: `publico` (sí/no),
  `estado_obra`, `avance` (%), `foto_url`, `lat`/`lng`.
- El vecino las ve en su home y en el mapa que ya existe.
- Sin inventar plata: se muestra avance y fotos, no el gasto, salvo que el
  municipio lo prenda.

### Etapa 3 · Cronogramas y segmentación — HECHA (2026-08-29, en qa)

Migración: `backend/scripts/migrate_cronogramas.py` (cuatro columnas nullable).

**El cronograma es UNA publicación, no una serie.** "La recolección pasa los
martes y viernes" no son 104 avisos por año: es un aviso que dice cuándo se
repite. Por eso `recurrencia` (`semanal` / `quincenal` / `mensual`) y
`dias_semana` (`"1,4"` = martes y viernes, 0 = lunes) son campos de la
noticia, y no hay generador de ocurrencias que llenar ni purgar.

La frase la arma **el backend** (`cronograma_texto`, calculado, no una
columna): las tres superficies del vecino leen la misma frase en vez de
traducir `"1,4"` cada una a su manera. En el feed, lo que se repite muestra
*cuándo vuelve a pasar* en lugar de una cuenta regresiva — lo recurrente no
vence.

**Segmentación por barrio.** `usuarios.barrio_id` (lo declara el vecino en su
perfil, no se infiere de la dirección) y `noticias.barrio_id`:

| Publicación | Quién la ve |
|---|---|
| sin barrio | todo el municipio |
| con barrio | sólo los vecinos que declararon ese barrio |
| — | el vecino sin barrio declarado ve únicamente las generales |

`GET /noticias/publico` toma `vecino_id` para resolver el alcance; sin él
(visitante sin sesión) devuelve sólo las generales. Mandarle a alguien el corte
de agua de otro barrio es peor que no mandarle nada: deja de creerle al canal.

**Verificado en QA** (2026-08-29): 20 casos por API (crear, editar, los tres
alcances, el visitante, multi-tenant) y 16 sobre la pantalla real con
Playwright — el ABM, el form, el perfil del vecino y el feed. Dos bugs
salieron sólo de probar el front: `/auth/me` arma el `UserResponse` campo por
campo y no incluía `barrio_id`, y guardar el barrio no refrescaba la sesión,
así que al recargar volvía a "Todo el municipio".

> **Deuda anotada:** los cuatro armados manuales de `UserResponse` en
> `api/auth.py` obligan a acordarse de cuatro lugares por cada columna nueva.
> `model_validate(user)` lo resolvería (el schema ya tiene `from_attributes`).

Las demos nacen con dos cronogramas (recolección los martes y viernes,
vacunación los sábados) y una publicación segmentada a un barrio.

---

## 5. Ambiente

Todo se desarrolla contra el **branch `qa`** y la base **`sugerenciasmun-ensayo`**
(el clon de producción del 2026-08-28, que desde hoy es la base de QA: la
`sugerenciasmun-qa` vieja queda fuera de uso). Los ALTER se aplican ahí, nunca
en producción — a prod llega con la promoción, con su script idempotente.

---

## 6. Lo que cambió alrededor (misma tanda, 2026-08-29)

- **Tasas pasó a OPT-IN** (`lib/enums/modulos.ts`): Munify no cubre el cobro
  de tasas y el módulo aparecía solo en todos los municipios. Salió del
  seeder de demos y las recomendaciones del vecino lo respetan.
- **Panel del vecino**: se borraron los cuatro KPI cards que repetían el hero;
  "Recomendaciones para vos" pasó a ser una **tira de pendientes de una
  línea**; las novedades tienen jerarquía (destacada + tira compacta) y
  muestran tipo y vigencia.
- **"Estadísticas del Municipio" se sacó entero del panel del vecino**
  (2026-08-29). Dos motivos, y el segundo es el grave:
  1. *Mentía.* La línea de tendencia de "Días promedio" era un `path` SVG fijo
     en el código, igual para todos los municipios; y el gráfico de barras del
     modal eran seis números escritos a mano, con meses que ni siquiera eran
     los actuales. Parecían datos.
  2. Los números que **sí** eran reales —40% de tasa de resolución, 3.9 de
     calificación— son las dos peores notas del municipio, publicadas por el
     propio municipio en la primera pantalla que abre el vecino.

  De todo eso, lo único que le sirve al vecino es cuánto tarda una respuesta, y
  ese dato va donde lo necesita: al crear el reclamo ("suelen responderse en 3
  días"), no como panel de estadísticas. **Pendiente**: ponerlo ahí.
