# Future: Tipos de Reclamo como template per-municipio

**Estado:** Pendiente de revisar — el usuario cree que **ya existe** algún tipo de data
template para reclamos en el código, posiblemente con nombres distintos a los que
buscamos en esta sesión (grep por `tipo_reclamo`, `tipos_reclamo`, `subcategoria`,
`ejemplos_reclamos` no encontraron nada, pero puede estar con otro nombre).
**Acción al retomar:** buscar mejor. Posibles lugares: seeds viejos en `backend/scripts/`,
constantes en `services/`, modelos con nombres tipo `plantilla_*` o `template_*`.
**Fecha de captura:** sesión 2026-04 refactor tramites per-municipio.
**Decisión:** Se pospuso para no mezclar con el refactor de trámites que está en curso.

## La idea

Hoy tenemos:

```
CategoriaReclamo (per-municipio)
    └──< Reclamo (texto libre escrito por el vecino)
```

La propuesta es agregar un nivel intermedio de **templates** de tipos de reclamo:

```
CategoriaReclamo (per-municipio, editable)
    └──< TipoReclamo (per-municipio, template editable, pre-sembrado al crear municipio)
            └──< Reclamo (instancia dinámica creada por el vecino, puede o no apuntar a un TipoReclamo)
```

### Ejemplo

Categoría **"Bacheo y calles"** tendría como tipos template:

- Bache en calzada
- Hundimiento del asfalto
- Rotura de vereda
- Pozo profundo
- Tapa de desagüe hundida
- Falta de pintura / demarcación
- Badenes rotos
- Escombros en calle

Categoría **"Alumbrado público"** tendría:

- Luminaria apagada
- Luminaria intermitente
- Columna caída
- Cable suelto
- Luminaria con destellos

Etc. para las 10 categorías del seed.

## Para qué sirve

1. **UX del vecino al crear reclamo**: en vez de escribir texto libre a ciegas, el wizard le muestra chips con los tipos típicos de esa categoría. Click en un chip → precarga el título del reclamo. Igual puede escribir libre si el tipo no aparece.

2. **Stats y dashboard**: poder agrupar los reclamos reales por `tipo_reclamo_id` para ver
   *"¿qué % de los reclamos de Bacheo son hundimientos vs baches vs roturas de vereda?"* sin NLP.

3. **Automatización futura**: cada `TipoReclamo` podría tener tiempos de respuesta distintos,
   dependencia asignada por defecto, prioridad, imagen ejemplo, etc.

## Modelo propuesto

```python
class TipoReclamo(Base):
    __tablename__ = "tipos_reclamo"
    id = Column(Integer, primary_key=True)
    municipio_id = Column(Integer, FK("municipios.id"), nullable=False, index=True)
    categoria_reclamo_id = Column(Integer, FK("categorias_reclamo.id"), nullable=False, index=True)
    nombre = Column(String(200), nullable=False)              # "Bache en calzada"
    descripcion = Column(Text, nullable=True)                 # hint opcional
    icono = Column(String(50), nullable=True)
    imagen_ejemplo = Column(String(500), nullable=True)       # URL opcional
    tiempo_resolucion_estimado = Column(Integer, nullable=True)  # override de la categoría
    prioridad_default = Column(Integer, nullable=True)        # override de la categoría
    activo = Column(Boolean, default=True)
    orden = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())

    categoria = relationship("CategoriaReclamo", back_populates="tipos")
    reclamos = relationship("Reclamo", back_populates="tipo")
```

Y `Reclamo.tipo_reclamo_id` (nullable) como FK opcional para no forzar a los reclamos viejos a tener tipo.

## Cómo se siembra al crear municipio

Extender `services/categorias_default.py::crear_categorias_default()` para que después de sembrar las 10 categorías de reclamo, siembre los ~5-8 tipos template por categoría. Esto vive en una constante nueva `services/categorias_seed.py::TIPOS_RECLAMO_TEMPLATE_POR_CATEGORIA` (dict: nombre_categoria → lista de tipos).

Ejemplo:

```python
TIPOS_RECLAMO_TEMPLATE_POR_CATEGORIA = {
    "Bacheo y calles": [
        {"nombre": "Bache en calzada", "prioridad_default": 2},
        {"nombre": "Hundimiento del asfalto", "prioridad_default": 1},
        {"nombre": "Rotura de vereda", "prioridad_default": 3},
        ...
    ],
    "Alumbrado público": [
        {"nombre": "Luminaria apagada", "prioridad_default": 3},
        {"nombre": "Columna caída", "prioridad_default": 1},
        ...
    ],
    ...
}
```

Total esperado: ~60 tipos (6 promedio × 10 categorías).

## Pantallas que hay que tocar

1. **Nueva pantalla admin `TiposReclamoConfig.tsx`**: ABM per-categoría, igual a
   `TramitesConfig.tsx` en estructura (listado agrupado por categoría, wizard o sheet para crear).

2. **`NuevoReclamo.tsx` (vecino)**: al elegir categoría, mostrar chips con los tipos template de esa
   categoría. Click en chip → autofill del título. Dejar campo libre si el vecino quiere.

3. **Seed al crear municipio**: extender `crear_categorias_default`.

4. **Dashboard**: agregar agregación por `tipo_reclamo_id`.

## Migración

- Tabla `tipos_reclamo` nueva.
- Columna `reclamos.tipo_reclamo_id` (nullable, FK).
- No romper reclamos existentes — el FK es opcional, los reclamos preexistentes de Chacabuco
  quedan con `tipo_reclamo_id = NULL`.

## Decisión final pendiente

Retomar cuando terminemos con:
1. Wizard de trámite con autocomplete (en curso)
2. Integración checklist en GestionTramites (hecho)
3. Testing UI end-to-end del refactor trámites (en curso)

Después del merge del branch `refactor/tramites-categorias-per-municipio` a master,
arrancar una nueva sesión dedicada a tipos de reclamo template.
