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

---

## 4. Las tres etapas

### Etapa 1 · Avisos

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

### Etapa 2 · Obras

Las obras ya existen como **proyectos de Tesorería** con sus gastos imputados.
Esta etapa las publica: el vecino ve qué se está haciendo, dónde y cómo viene.

- Se agrega al proyecto lo que le falta para ser público: `publico` (sí/no),
  `estado_obra`, `avance` (%), `foto_url`, `lat`/`lng`.
- El vecino las ve en su home y en el mapa que ya existe.
- Sin inventar plata: se muestra avance y fotos, no el gasto, salvo que el
  municipio lo prenda.

### Etapa 3 · Cronogramas y segmentación

- Avisos **recurrentes** (recolección, poda, barrido) que se repiten solos, con
  el mismo motor de recurrencia que ya usa la agenda de pagos.
- **Barrio del vecino**: darle barrio a la ficha del vecino (declarado por él o
  detectado con `barrio_detector.py` al cargar su dirección) y recién ahí
  segmentar los avisos por barrio o zona.

---

## 5. Ambiente

Todo se desarrolla contra el **branch `qa`** y la base **`sugerenciasmun-ensayo`**
(el clon de producción del 2026-08-28, que desde hoy es la base de QA: la
`sugerenciasmun-qa` vieja queda fuera de uso). Los ALTER se aplican ahí, nunca
en producción — a prod llega con la promoción, con su script idempotente.
