# Incidente de producción · Los PDF de Cloudinary dejaron de entregarse (401)

**Fecha:** 2026-08-06 · **Cliente afectado:** San Pedro Norte (muni 80) ·
**Estado:** RESUELTO (quedan 22 archivos viejos con una molestia menor, detalle abajo)

---

## 1. Síntoma

El cliente reportó por WhatsApp (08:17 ART) que había cargado una factura en un
gasto y **no podía verla ni bajarla**. Al hacer clic en "Ver archivo adjunto" se
abría una pestaña con `HTTP ERROR 401`.

```
res.cloudinary.com/di39tigkf/raw/upload/v1786014936/facturas-gasto/muni-80/63b2234f9ea2b32e36d5d468.pdf
-> HTTP ERROR 401
```

Aclaró que **le pasaba con todos**, no con un archivo puntual.

## 2. Qué NO era

Se descartó con datos antes de tocar nada:

| Hipótesis | Verificación | Resultado |
|---|---|---|
| Cuota de Cloudinary agotada | `GET /v1_1/di39tigkf/usage` | 6.17 / 25 créditos (24%) — sana |
| Credenciales mal en prod | env vars de `munify-api` en Cloud Run | correctas, mismo cloud que local |
| Falla de subida | listado de assets por Admin API | los 3 archivos de esa mañana llegaron bien |
| Caché del CDN | mismo archivo con cache-buster | idéntico resultado |
| Problema de la app / Infra | imágenes `.jpg` del mismo cloud | **200 OK** — sólo fallaban los PDF |

## 3. Causa raíz

**Cloudinary tenía deshabilitada la entrega de archivos PDF y ZIP a nivel cuenta.**

Es un setting de seguridad de la consola (*Settings → Security → PDF and ZIP files
delivery → "Allow delivery of PDF and ZIP files"*) que estaba **destildado**.
Bloquea la entrega de cualquier asset PDF, devolviendo `401` con
`Content-Type: application/pdf` y `Content-Length: 0` — la firma del bloqueo.

Se activó entre el **19 y el 22 de junio de 2026**: los assets anteriores a esa
fecha seguían entregándose y los posteriores no.

```
PDF de mayo        -> 200
PDF del 22/06 en adelante -> 401
imágenes (cualquier fecha) -> 200
raw sin extensión  -> 200
```

## 4. Resolución

El dueño de la cuenta tildó **"Allow delivery of PDF and ZIP files"** en la consola
de Cloudinary. **Toma efecto al instante, sin redeploy.**

> Ese setting **no está expuesto en la Admin API** — `GET /config?settings=true`
> sólo devuelve `folder_mode`. Se cambia únicamente desde la consola web con el
> login del dueño. No hay forma de automatizarlo ni de verificarlo por API: se
> verifica indirectamente pidiendo un PDF y mirando el status.

Verificación posterior: **132 de 132** facturas de SPN respondiendo `200`, cero `401`.

## 5. Problema secundario que salió a la luz

Con la entrega destrabada quedó visible que la mayoría de los PDF se servían como
`application/octet-stream`: el navegador los **descarga** en vez de abrirlos en su
visor.

**Por qué:** el código viejo subía los PDF como `raw` **sin extensión** en el
`public_id`. Cloudinary fija el `Content-Type` en el momento del upload según la
extensión — sin extensión quedan `octet-stream` para siempre. El script
`_migrate_facturas_pdf.py` (junio) renombró los `public_id` agregando `.pdf`, pero
**renombrar no toca el `Content-Type`**.

**Cómo se corrigió:** `backend/scripts/_fix_facturas_content_type.py` (no versionado,
ver §7) re-sube el binario al mismo `public_id`, con backup local previo y
validando el magic number `%PDF`. Se corrió el 2026-08-06 sobre `facturas-gasto/`.

### Estado final

| | |
|---|---|
| Facturas de SPN | 132 |
| Entregan `application/pdf` (URL sin versión) | **110** |
| Siguen en `octet-stream` | 22 |

Los 22 restantes **no tienen `.pdf` en el `public_id`** (el rename de junio no los
alcanzó). Arreglarlos exige renombrarlos, lo que **cambia la URL** y obliga a un
`UPDATE` de esas 22 filas en `gastos.factura_url` / `ordenes_pago.factura_url` de
la **base de producción**. Se dejó pendiente a propósito: la molestia es que esos
archivos se bajan en vez de abrirse, y se abren agregándoles `.pdf` a mano.

> **No renombrarlos sin el `UPDATE`.** Hoy al menos se descargan; renombrados sin
> actualizar la DB pasarían a dar `404`.

## 6. Gotchas descubiertos (valen para cualquier trabajo con Cloudinary acá)

1. **QA y prod comparten la MISMA cuenta de Cloudinary** (`di39tigkf` en las env
   vars de `munify-api` y de `munify-api-qa`). **No hay aislamiento de assets por
   ambiente**: tocar un archivo "desde QA" toca el que ve el cliente productivo.
   Lo único que QA aísla es su base. Mejora pendiente: prefijar las carpetas por
   ambiente (`qa/facturas-gasto/…` vs `prod/…`).

2. **Cuidado con los scripts que usan `settings.DATABASE_URL`.** Con el `.env`
   local apuntan a **QA**, pero sus efectos sobre Cloudinary son globales. Eso fue
   exactamente lo que dejó 22 archivos sin renombrar: `_migrate_facturas_pdf.py`
   buscó los candidatos en la base de QA.

3. **La URL con `/vNNNNNNN/` sirve la versión congelada**, con el `Content-Type`
   que tenía cuando se subió — aunque el número de versión no haya cambiado.
   Medido después del saneamiento: `9/132` entregando PDF con la URL con versión,
   contra `110/132` sin el segmento. Por eso el front usa `urlAdjunto()`
   (`frontend/src/lib/adjuntos.ts`), que se lo saca.

4. **Cloudinary deduplica por contenido:** re-subir el mismo binario al mismo
   `public_id` devuelve la versión existente en vez de crear una nueva.

5. **El query string no sirve como cache-buster** — Cloudinary lo ignora en la
   cache key. Un `?cb=123` NO garantiza que estés viendo el origen; para saber si
   un cambio propagó hay que esperar la invalidación, que puede tardar.

6. **`fl_attachment` no aplica a `raw`**: no cambia el `Content-Type`, y con nombre
   (`fl_attachment:factura.pdf`) devuelve `400`.

## 7. Artefactos

| Qué | Dónde |
|---|---|
| Helper del front que normaliza la URL | `frontend/src/lib/adjuntos.ts` (commit `b5a81c2`, rama `qa`) |
| Script de saneamiento | `backend/scripts/_fix_facturas_content_type.py` — **no versionado**: lo ignora `.gitignore:111` (`backend/scripts/_*.py`). Los 40 `_*.py` que sí están trackeados son previos a esa regla |
| Backup de los binarios | local, fuera del repo (se generó con `--backup-dir`) |

El script tiene `--dry-run` por defecto, `--limit N` para procesar de a lotes y
`--aplicar` para escribir. Siempre baja el binario a disco antes de tocar el asset.

## 8. Si vuelve a pasar

1. Pedir cualquier PDF del cloud y mirar el status. `401` con
   `Content-Type: application/pdf` y `Content-Length: 0` = el checkbox se volvió a
   destildar.
2. Comparar contra una imagen del mismo cloud: si la imagen da `200` y el PDF `401`,
   es el setting, no la app ni la infra.
3. Consola de Cloudinary → *Settings → Security* → **Allow delivery of PDF and ZIP
   files** → tildado → Save.
