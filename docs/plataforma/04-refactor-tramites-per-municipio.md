# Refactor Trámites & Categorías per-Municipio

Documento de referencia del refactor completo del módulo de trámites realizado
en el branch `refactor/tramites-categorias-per-municipio`. Cubre todas las
decisiones, los cambios de modelo, los endpoints nuevos y el rediseño del
wizard de creación de solicitudes.

---

## 1. Motivación

El modelo viejo tenía:

- Un **catálogo global** de categorías (`categorias`), tipos de trámite
  (`tipos_tramite`) y trámites (`tramites`) compartido entre todos los
  municipios.
- Tablas intermedias de habilitación por municipio (`municipio_categorias`,
  `municipio_tipos_tramite`, `municipio_tramites`) para que cada intendencia
  "activara" los items que usa.
- Los documentos requeridos guardados como string libre (`"DNI | Domicilio |
  Foto"`) dentro del registro de trámite.
- Un `TramiteWizard.tsx` de 2271 líneas con chat IA, validación DNI por cámara,
  validación facial por selfie y registro inline — pensado para un "vecino
  online" que no es el escenario real del producto.

Problemas:

1. Un municipio que quería una categoría custom tenía que pedir que se agregue
   al catálogo global o sobrecargar un nombre existente.
2. Las tablas de habilitación duplicaban filas cada vez que se habilitaba algo
   — overhead innecesario.
3. Los documentos requeridos como string no se podían verificar item por item.
4. El wizard estaba sobredimensionado y distraía del caso real: **empleado
   municipal en ventanilla**, carga rápida, documentos se verifican después.

---

## 2. Nuevo modelo de datos

### Tablas nuevas / renombradas

```
municipios
├── categorias_reclamo          ← nuevo, per-municipio (FK municipio_id)
├── categorias_tramite          ← nuevo, per-municipio (FK municipio_id)
└── tramites                    ← reescrito, per-municipio (FK municipio_id, categoria_tramite_id)
     └── tramites_documentos_requeridos  ← nuevo, sub-tabla (FK tramite_id)

tramites_sugeridos              ← nuevo, CROSS-municipio (sin FK municipio_id)
                                  tabla compartida de sugerencias para autocomplete
```

### Tablas eliminadas

- `categorias` (catálogo global)
- `tipos_tramite`, `municipio_tipos_tramite`
- `municipio_tramites`, `municipio_categorias`
- `tramite_docs` (docs sueltos sin vínculo a trámite)
- Todo el subsistema de `direcciones` que estaba muerto desde antes

### Jerarquía resultante

```
CategoriaReclamo (per-municipio) → Reclamo
CategoriaTramite (per-municipio) → Tramite → TramiteDocumentoRequerido
                                          → Solicitud (instancia) → DocumentoSolicitud
```

Dos niveles para trámites (antes había tres: `TipoTramite → Tramite →
Solicitud`). Se eliminó el nivel intermedio porque `CategoriaTramite` cumple
ese rol.

### Seed automático

Al crear un municipio nuevo, el backend siembra automáticamente **20
categorías** (10 de reclamo + 10 de trámite), basadas en un análisis de normas
municipales argentinas:

**Reclamo** (10): Alumbrado Público, Recolección de Residuos, Bacheo y Calles,
Espacios Verdes, Agua y Cloacas, Tránsito y Transporte, Ruidos Molestos,
Limpieza Urbana, Poda y Árboles, Animales.

**Trámite** (10): Habilitaciones Comerciales, Licencia de Conducir, Catastro y
Obras, Vehículos y Patentes, Cementerios, Certificados, Eventos y Espectáculos,
Tasas Municipales, Vía Pública, Servicios al Vecino.

Archivo: `backend/services/categorias_seed.py`.

### Tabla `tramites_sugeridos`

Tabla cross-municipio (sin `municipio_id`) con ~96 trámites pre-cargados para
el autocomplete en el wizard admin. Cada fila tiene `nombre`, `descripcion`,
`rubro`, `tiempo_estimado_dias`, `costo_referencial`, `documentos_sugeridos`
(JSON con lista de docs típicos).

Se siembra una sola vez al bootstrapping del sistema (idempotente). Cualquier
municipio la consulta para sus sugerencias — compartida, no por-municipio.

Archivo: `backend/scripts/seed_tramites_sugeridos.py`.

---

## 3. Backend — cambios principales

### Models (`backend/models/`)

**Nuevos**
- `categoria_reclamo.py` — `CategoriaReclamo`
- `categoria_tramite.py` — `CategoriaTramite`
- `tramite_documento_requerido.py` — sub-tabla de docs requeridos
- `tramite_sugerido.py` — tabla cross-municipio

**Reescritos**
- `tramite.py` — `Tramite` ahora per-municipio con FK a `CategoriaTramite` +
  relación a `TramiteDocumentoRequerido[]`. `Solicitud` y `DocumentoSolicitud`
  también viven acá.
- `documento_solicitud.py` — agregados campos de verificación: `verificado`,
  `verificado_por_id`, `fecha_verificacion`, `tramite_documento_requerido_id`.

**Eliminados**
- `categoria.py`, `tramite_doc.py`, `municipio_dependencia_tipo_tramite.py`
- `direccion*.py` (entero, era dead code)

### APIs (`backend/api/`)

**Nuevos**
- `categorias_reclamo.py` — CRUD
- `categorias_tramite.py` — CRUD
- `tramites_sugeridos.py` — 3 endpoints: `GET /tramites-sugeridos`, `GET
  /tramites-sugeridos/rubros`, `GET /tramites-sugeridos/documentos-frecuentes`

**Reescrito**
- `tramites.py` — todos los endpoints rehechos para per-municipio:
  - `GET /api/tramites` — lista per-municipio (header `X-Municipio-ID`)
  - `POST /api/tramites` — crear trámite con docs requeridos en un solo request
  - `PUT /api/tramites/{id}`, `DELETE /api/tramites/{id}`
  - `POST /api/tramites/solicitudes?municipio_id=X` — crear solicitud
  - `GET /api/tramites/solicitudes/{sid}/checklist` — checklist combinado
  - `POST /api/tramites/solicitudes/{sid}/documentos` — subir archivo vinculado
    a un `tramite_documento_requerido_id`
  - `POST /api/tramites/solicitudes/{sid}/documentos/{doc_id}/verificar`
  - `POST /api/tramites/solicitudes/{sid}/documentos/{doc_id}/desverificar`
  - **NUEVO**: `POST /api/tramites/solicitudes/{sid}/requeridos/{req_id}/verificar-visual`
    → crea un `DocumentoSolicitud` placeholder con `tipo='verificacion_manual'`
    y `url=''` cuando el empleado verifica un doc sin digitalizarlo.

**Colaterales actualizados** (referencias al modelo viejo): `chat.py`,
`dashboard.py`, `analytics.py`, `portal_publico.py`, `empleados.py`,
`reclamos.py`, `reportes.py`, `turnos.py`, `planificacion.py`, etc.

### Fix recurrente: greenlet error post-commit

Con SQLAlchemy async, este patrón explota:

```python
await db.commit()
await db.refresh(obj)  # o acceder a obj.algo
return { "id": obj.id, ... }
```

`commit()` expira todos los atributos de la sesión. El próximo acceso dispara
una lazy query que, bajo async, falla con `greenlet_spawn has not been called`.

**Patrón correcto** aplicado en `crear_tramite`, `actualizar_tramite`,
`crear_solicitud`, `actualizar_solicitud`, `asignar_solicitud`,
`verificar_visual_sin_archivo`:

```python
# Opción A: flush + capturar escalares antes del commit
await db.flush()
obj_id = obj.id
obj_tipo = obj.tipo
await db.commit()
return { "id": obj_id, "tipo": obj_tipo }

# Opción B: re-query con selectinload después del commit
await db.commit()
result = await db.execute(
    select(Tramite)
    .options(selectinload(Tramite.categoria_tramite),
             selectinload(Tramite.documentos_requeridos))
    .where(Tramite.id == obj.id)
)
return result.scalar_one()
```

### Scripts

- `backend/scripts/refactor_tramites_per_municipio.py` — migración completa:
  wipe + recreate schema + seed 20 categorías + re-mapear 3154 reclamos
  existentes a sus nuevas FKs. Idempotente (drop-if-exists).
- `backend/scripts/seed_tramites_sugeridos.py` — seed idempotente de ~96
  trámites sugeridos cross-municipio.
- `backend/scripts/test_crear_municipio.py` — smoke test: crea un municipio,
  verifica que las 20 categorías se sembraron.

---

## 4. Frontend — cambios principales

### Types (`frontend/src/types/index.ts`)

Reescritos:
- `CategoriaReclamo`, `CategoriaTramite`
- `Tramite` con `categoria_tramite_id` + `documentos_requeridos:
  TramiteDocumentoRequerido[]`
- `TramiteDocumentoRequerido`
- `Solicitud` (separada de `Tramite`)
- `DocumentoSolicitud` con `verificado`, `verificado_por_id`, etc.
- `ChecklistDocumentoItem`, `ChecklistDocumentos` (para el endpoint de checklist)

Aliases de compatibilidad para código no migrado:
- `ServicioTramite = Tramite` (deprecado)
- `TipoTramite = CategoriaTramite` (deprecado)
- `TramiteCatalogo = Tramite` (deprecado)
- `EstadoTramite = EstadoSolicitud`, `HistorialTramite = HistorialSolicitud`

### API client (`frontend/src/lib/api.ts`)

Nuevos objetos:
- `categoriasReclamoApi` — CRUD
- `categoriasTramiteApi` — CRUD
- `tramitesApi` — reescrito: `getAll`, `create`, `update`, `delete`,
  `createSolicitud`, `getMisSolicitudes`, `getGestionSolicitudes`,
  `getChecklistDocumentos`, `uploadDocumento`, `verificarDocumento`,
  `desverificarDocumento`, `verificarSinArchivo`, `consultar`, etc.
- `tramitesSugeridosApi` — `search`, `getRubros`, `getDocumentosFrecuentes`

### Pantallas nuevas

- `pages/CategoriasReclamoConfig.tsx` — ABM de categorías de reclamo del
  municipio
- `pages/CategoriasTramiteConfig.tsx` — ABM de categorías de trámite, con
  banner explicativo sobre la jerarquía nueva
- `pages/TramitesConfig.tsx` — **rediseñado completo**. Lista de trámites del
  municipio como ABM, creación/edición con `WizardModal` de 4 steps:
  1. Info básica (nombre con autocomplete de `tramites_sugeridos`, descripción,
     tiempo, costo, validaciones DNI/facial)
  2. Categoría + icono
  3. Documentos requeridos con **chips de sugerencias frecuentes**
     (`ChipsDocumentosSugeridos` — Opción C: ordenados por combinación de
     frecuencia por rubro + match parcial)
  4. Confirmación

### Pantallas actualizadas

- `pages/GestionTramites.tsx` — integración con `ChecklistDocumentosVerificacion`,
  wizard reemplazado por `CrearSolicitudWizard`, shim del modelo viejo
  eliminado, chips de categorías con nombre completo (se había truncado por un
  `.split(' ')[0]`).
- `pages/MisTramites.tsx` — wizard reemplazado, `goToNuevoTramite` simplificado.
- `pages/AsignacionDependencias.tsx` — simplificada, eliminadas referencias a
  `tipos_tramite` del modelo viejo.

### Componentes nuevos

- `components/config/CategoriaConfigBase.tsx` — base DRY reutilizada por
  `CategoriasReclamoConfig` y `CategoriasTramiteConfig`
- `components/config/DocumentosRequeridosEditor.tsx` — editor de sub-tabla de
  docs requeridos en el wizard admin
- `components/config/TramiteAutocompleteInput.tsx` — autocomplete del nombre
  del trámite contra `tramites_sugeridos` con scoring (prefix → contains →
  descripción)
- `components/config/ChipsDocumentosSugeridos.tsx` — chips ordenados de docs
  frecuentes, el usuario cliquea para agregarlos al trámite (no se cargan
  automáticamente para evitar confusión)
- `components/tramites/ChecklistDocumentosVerificacion.tsx` — **reescrito**:
  muestra cada doc requerido con 3 estados posibles (pendiente, archivo
  subido, verificado visualmente), con botones per-fila "Subir archivo" y
  "Verificado sin archivo"
- `components/tramites/CrearSolicitudWizard.tsx` — **NUEVO**, wizard de 3 steps
  para empleado en ventanilla:
  1. **Elegir trámite** — autocomplete client-side con scoring (prefix →
     contains), grid de categorías con contador de trámites, auto-avance al
     seleccionar
  2. **Datos del solicitante** — form con nombre/apellido/DNI/email/tel/
     dirección/asunto (pre-rellenado "Solicitud: {nombre}") + observaciones
  3. **Confirmar** — resumen visual + alerta listando los N docs que van a
     requerirse (para cargar después desde gestión)

### Archivos borrados

- `components/TramiteWizard.tsx` (2271 líneas — chat IA, cámara, DNI, registro
  inline)
- `pages/mobile/MobileNuevoTramite.tsx` (implementación paralela con
  `WizardForm` que nadie usaba)
- Referencias a estos archivos en `routes.tsx` y `pages/mobile/index.ts`

---

## 5. Flujo end-to-end del nuevo modelo

### Carga inicial del municipio

1. `POST /api/municipios` crea el municipio.
2. El backend automáticamente dispara el seed de las 20 categorías
   (10 reclamo + 10 trámite).
3. El admin del municipio entra a `/gestion/categorias-tramite` y ve las 10
   pre-cargadas. Puede editar, agregar nuevas, desactivar.
4. Entra a `/gestion/tramites-config`, crea un trámite nuevo:
   - Wizard step 1: escribe "licen" → autocomplete sugiere "Licencia de
     Conducir" de `tramites_sugeridos`, acepta.
   - Step 2: elige la categoría "Licencia de Conducir" (creada en step
     anterior) y su icono.
   - Step 3: ve chips sugeridos (DNI, Certificado médico, Foto 4x4, etc) — los
     cliquea y se agregan como `TramiteDocumentoRequerido`.
   - Step 4: confirma y se guarda con sus docs requeridos.

### Empleado en ventanilla

1. Llega Juan Pérez con sus papeles.
2. Empleado entra a `/gestion/tramites`, click "Nueva solicitud".
3. `CrearSolicitudWizard` abre:
   - Step 1: empleado tipea "licen" → aparece el trámite → click.
   - Step 2: carga nombre, apellido, DNI, asunto pre-rellenado.
   - Step 3: confirma.
4. Se crea la solicitud, toast con `SOL-2026-00042`.
5. Juan se va con su número. **No subió ningún archivo.**

### Verificación posterior

1. Empleado (u otro) abre el detalle de la solicitud desde `/gestion/tramites`.
2. Ve el `ChecklistDocumentosVerificacion` con los docs requeridos sin tildar.
3. DNI: el empleado lo escanea → click "Subir archivo" → upload Cloudinary → el
   doc queda como archivo pero **sin tildar** (alguien tiene que verificar).
   → click en el checkbox → verificado.
4. Certificado médico: el empleado lo tiene físicamente en la mano → click
   "Verificado sin archivo" → se crea un `DocumentoSolicitud` placeholder con
   `tipo='verificacion_manual'`, `url=''`, `verificado=True`.
5. Foto 4x4: queda pendiente.
6. Click en "Pasar a en curso" → backend devuelve 400: "Faltan verificar: Foto
   4x4".
7. Tildar la foto (archivo o visual) → retry → transición exitosa.

El backend ya valida en `validar_transicion_a_en_curso` que todos los
`TramiteDocumentoRequerido` obligatorios tengan un `DocumentoSolicitud`
vinculado con `verificado=True` (da igual si es archivo real o placeholder
visual).

---

## 6. Archivos críticos (referencia rápida)

### Backend

| Archivo | Rol |
|---|---|
| `backend/models/categoria_reclamo.py` | Model per-municipio de categorías reclamo |
| `backend/models/categoria_tramite.py` | Model per-municipio de categorías trámite |
| `backend/models/tramite.py` | `Tramite`, `Solicitud`, `DocumentoSolicitud` |
| `backend/models/tramite_documento_requerido.py` | Sub-tabla de docs requeridos |
| `backend/models/tramite_sugerido.py` | Cross-municipio sugerencias |
| `backend/api/tramites.py` | Endpoints de trámites, solicitudes, checklist, verificación |
| `backend/api/categorias_reclamo.py` | CRUD categorías reclamo |
| `backend/api/categorias_tramite.py` | CRUD categorías trámite |
| `backend/api/tramites_sugeridos.py` | Autocomplete + rubros + docs frecuentes |
| `backend/services/categorias_seed.py` | Seed 20 categorías al crear municipio |
| `backend/scripts/refactor_tramites_per_municipio.py` | Migración one-shot |
| `backend/scripts/seed_tramites_sugeridos.py` | Seed cross-municipio sugerencias |

### Frontend

| Archivo | Rol |
|---|---|
| `frontend/src/types/index.ts` | Tipos nuevos + aliases de compat |
| `frontend/src/lib/api.ts` | `categoriasReclamoApi`, `categoriasTramiteApi`, `tramitesApi`, `tramitesSugeridosApi` |
| `frontend/src/pages/CategoriasReclamoConfig.tsx` | ABM categorías reclamo |
| `frontend/src/pages/CategoriasTramiteConfig.tsx` | ABM categorías trámite |
| `frontend/src/pages/TramitesConfig.tsx` | ABM trámites con WizardModal 4 steps |
| `frontend/src/pages/GestionTramites.tsx` | Gestión + checklist integrado |
| `frontend/src/pages/MisTramites.tsx` | Listado del vecino/empleado |
| `frontend/src/components/tramites/CrearSolicitudWizard.tsx` | Wizard empleado ventanilla 3 steps |
| `frontend/src/components/tramites/ChecklistDocumentosVerificacion.tsx` | Checklist con upload + visual |
| `frontend/src/components/config/CategoriaConfigBase.tsx` | Base DRY categorías |
| `frontend/src/components/config/TramiteAutocompleteInput.tsx` | Autocomplete nombre trámite |
| `frontend/src/components/config/ChipsDocumentosSugeridos.tsx` | Chips docs sugeridos |
| `frontend/src/components/config/DocumentosRequeridosEditor.tsx` | Editor sub-tabla docs |

---

## 7. Deuda técnica pendiente

Identificada durante el refactor pero **fuera de scope** del plan actual:

1. **~309 errores TS pre-existentes** en `GestionTramites.tsx`, `MisTramites.tsx`,
   `Tramites.tsx`, `DependenciasConfig.tsx`, `Servicios.tsx`. Causa raíz:
   variables tipadas como `Tramite[]` que en realidad contienen `Solicitud[]`
   (tienen `numero_tramite`, `asunto`, `nombre_solicitante`, etc.), más estados
   viejos (`iniciado`, `en_revision`, `aprobado`) que no existen en
   `EstadoSolicitud`. No bloquean `vite dev` ni `vite build` pero sí `tsc -b`.
   Requieren un plan aparte de limpieza de tipos.

2. **Flujo "vecino online"**: el escenario donde el vecino saca su propio
   trámite desde la web con cámara, registro inline, validación DNI/facial
   contra Nosis, chat guía por IA. Estaba en el `TramiteWizard.tsx` viejo que
   borramos. Cuando se retome, crear un `SolicitudOnlineVecinoWizard.tsx`
   separado.

3. **Búsqueda de solicitante por DNI pre-existente**: cuando el empleado tipea
   el DNI en el Step 2 del wizard, buscar si ya hay un usuario en el sistema y
   autocompletar nombre/apellido/email/teléfono. Mejora UX.

4. **Tipos de reclamo como template**: pendiente, ya documentado en
   `docs/FUTURE_TIPOS_RECLAMO_TEMPLATE.md`.

5. **Sugerencias con IA**: pendiente, ya documentado en
   `docs/FUTURE_TRAMITES_SUGERENCIAS_IA.md`.

---

## 8. Smoke test end-to-end

Pasos para validar todo el refactor en un municipio limpio:

1. Crear municipio vía superadmin → verificar que las 20 categorías aparecen
   seeded en `/gestion/categorias-reclamo` y `/gestion/categorias-tramite`.
2. En `/gestion/tramites-config` crear un trámite "Licencia de Conducir" con 3
   docs obligatorios (DNI, Certificado médico, Foto 4x4). El autocomplete debe
   sugerir la descripción.
3. En `/gestion/tramites` click "Nueva solicitud":
   - Step 1: tipear "licen" → debe aparecer "Licencia de Conducir" → click.
   - Step 2: Juan Pérez, DNI 30123456, asunto pre-rellenado.
   - Step 3: confirmar → toast con `SOL-XXXX-0000N`.
4. Abrir la solicitud en el detalle:
   - DNI: subir imagen → queda cargado sin tildar → tildar → OK verde.
   - Certificado médico: click "Verificado sin archivo" → badge "Verificado
     visualmente en ventanilla · [user]".
   - Foto 4x4: dejarla pendiente.
5. Intentar transición a `en_curso` → backend debe responder 400:
   "Faltan verificar documentos obligatorios: Foto 4x4".
6. Verificar la foto (archivo o visual) → retry → 200, queda en `en_curso`.
7. Verificar en DB (`documentos_solicitudes`): 3 filas vinculadas a la
   solicitud, una con `tipo='imagen'` + `url` de Cloudinary, dos con
   `tipo='verificacion_manual'` + `url=''`. Las 3 con `verificado=true`.

---

## 9. Reglas de oro aprendidas / aplicadas

1. **Greenlet en async SQLAlchemy**: nunca acceder a atributos ORM después de
   `commit()` sin re-query o captura previa. Patrón: `flush → capturar
   escalares → commit → return`.
2. **Per-municipio > catálogo global + habilitación**: cada municipio tiene su
   propio set sin tablas intermedias. Solo usamos cross-municipio cuando es
   genuinamente compartido (caso `tramites_sugeridos`).
3. **Shim pattern para migraciones frontend**: cuando el backend cambia pero
   hay 2271 líneas de componente viejo, se puede mapear campos en `loadData`
   para no romper nada. Pero es temporal — se borra cuando se reemplaza el
   componente.
4. **Scoring de autocomplete client-side**: prefix match > contains > descrip
   match. Datasets < 200 filas no justifican endpoint con query param.
5. **Verificación flexible de documentos**: no asumir que todos los docs
   requeridos son digitalizables. El flujo papel existe y tiene que ser
   first-class — un placeholder con `url=''` es una solución limpia.
6. **Wizard por escenario real, no por wishlist**: el `TramiteWizard` viejo
   quiso resolver todo (vecino online, cámara, IA, DNI). Reemplazado por
   `CrearSolicitudWizard` de 3 steps enfocado en el escenario 90% real
   (empleado en ventanilla). El escenario online se retoma cuando sea
   prioridad real.
