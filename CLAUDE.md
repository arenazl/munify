# Instrucciones para Claude

## REGLA PRINCIPAL
ANTES de realizar cualquier tarea, SIEMPRE leer la carpeta `APP_GUIDE/` para obtener contexto.

La guía `00_COMO_USAR.md` tiene el índice de todas las guías disponibles.

## Comportamiento esperado
1. Leer la guía relevante ANTES de actuar
2. NO preguntar información que ya está en las guías
3. Ser proactivo
4. Mantener las guías actualizadas cuando haya cambios

## MIGRACIONES DE BASE DE DATOS
**SIEMPRE ejecutar los cambios de schema de base de datos automáticamente.**
- NO preguntar si ejecutar migraciones
- Ejecutar directamente usando SQLAlchemy/Alembic con código Python
- Usar `async with engine.begin()` para commits automáticos
- Ejemplo:
```python
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from core.config import settings

async def migrate():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE..."))
    await engine.dispose()
```

---

## REGLAS BÁSICAS DE DESARROLLO (NO NEGOCIABLES)

### 1. Componentes Compartidos - DRY (Don't Repeat Yourself)
- **NUNCA** duplicar código de componentes visuales
- Si un elemento visual (card, badge, lista) se usa en más de un lugar → crear componente compartido en `components/ui/`
- Un `ReclamoCard` es un `ReclamoCard` → mismo componente, mismos colores, misma distribución
- Las variaciones se manejan con props (ej: `showCreador`, `similaresCount`), NO duplicando código

### 2. Colores y Estilos Consistentes
- Los colores de estados (`estadoColors`) deben estar definidos en UN solo lugar
- Si desktop y mobile muestran colores diferentes para lo mismo → está MAL
- Exportar constantes de colores desde el componente compartido e importar donde se necesite

### 3. Estructura de Componentes Compartidos
```
components/ui/
├── ReclamoCard.tsx      ← Card de reclamo (vecino + supervisor)
├── TramiteCard.tsx      ← Card de trámite
├── EstadoBadge.tsx      ← Badge de estado con colores
└── ...
```

### 4. Props para Variaciones, NO Duplicación
```tsx
// ✅ CORRECTO - Un componente con props
<ReclamoCard
  reclamo={r}
  showCreador={true}        // Solo supervisor ve el creador
  similaresCount={5}        // Solo supervisor ve similares
/>

// ❌ INCORRECTO - Duplicar componentes
<ReclamoCardVecino ... />
<ReclamoCardSupervisor ... />
```

### 5. Revisar antes de crear
Antes de escribir un componente visual, BUSCAR si ya existe algo similar que pueda reutilizarse o extenderse.

### 6. Código Resiliente a Cambios (Open/Closed Principle)
- Agregar un estado nuevo NO debería romper funcionalidades existentes
- Usar **patrones con fallback** en lugar de switch/if exhaustivos:
```tsx
// ✅ CORRECTO - Con fallback, no se rompe con estados nuevos
const color = estadoColors[estado] || estadoColors.default || '#6366f1';
const label = estadoLabels[estado] || estado;

// ❌ INCORRECTO - Se rompe si falta un case
switch(estado) {
  case 'recibido': return 'blue';
  case 'en_curso': return 'yellow';
  // Falta 'pospuesto' → rompe
}
```

- Las notificaciones, subscripciones y eventos deben manejar estados desconocidos gracefully
- Si un mapa/diccionario no tiene la clave, usar valor por defecto, NO fallar
- **Test mental**: "Si agrego un estado mañana, ¿cuántos archivos tengo que tocar?" → Si son más de 2-3, el diseño está mal

### 7. Single Source of Truth para Enums/Estados
- Los estados y sus propiedades (colores, labels, iconos) se definen en UN solo lugar
- Ese lugar exporta todo lo necesario: `estadoColors`, `estadoLabels`, `estadoIcons`
- Todos los demás archivos importan de ahí, NO duplican definiciones

---

## ESTADO ACTUAL DE DESARROLLO (2025-02-04)

### NUEVA FUNCIONALIDAD: Sistema de "Sumarse" a Reclamos Duplicados

Se implementó un sistema que permite que múltiples vecinos se unan a un mismo reclamo existente en lugar de crear duplicados. Esto incluye:

#### Backend Cambios:
- **Nuevo Modelo:** `ReclamoPersona` - Tabla intermedia que vincula múltiples usuarios con un reclamo
  - Archivo: `backend/models/reclamo_persona.py`
  - Tabla: `reclamo_personas` (FK: reclamo_id, usuario_id, es_creador_original)

- **Nuevo Endpoint:** `POST /reclamos/{id}/sumarse`
  - Valida que el usuario no sea creador original
  - Evita duplicados con UniqueConstraint
  - Crea entrada en historial con acción "persona_sumada"

- **Funciones de Notificación:**
  - `notificar_persona_sumada()` - Notifica cuando alguien se suma
  - `notificar_comentario_a_personas_sumadas()` - Notifica a TODOS los sumados cuando hay comentario

- **Actualizaciones a Modelos:**
  - `Reclamo.personas` - relación a ReclamoPersona
  - `User.reclamos_unidos` - relación a ReclamoPersona

- **Actualización de Endpoint:** `POST /reclamos/{id}/comentario`
  - Retorna datos del usuario que comenta (nombre, apellido, id)
  - Notifica a todos los sumados + supervisores

#### Frontend Cambios:
- **Componente `ReclamosSimilares.tsx`:**
  - Nuevo prop: `onSumarse?: (id: number) => Promise<void>`
  - Botón "Sumarme" junto a "Ver detalles" en cada similar
  - Estados de loading mientras se suma

- **Página `NuevoReclamo.tsx`:**
  - Handler para `onSumarse` que llamaa la API
  - Navega a detalle del reclamo después de sumarse

- **API `frontend/src/lib/api.ts`:**
  - Nuevo método: `reclamosApi.sumarse(id)`

- **Tipos TypeScript:**
  - Nueva interfaz: `ReclamoPersona` con campos id, nombre, apellido, email, created_at, es_creador_original
  - Campo opcional en `Reclamo.personas: ReclamoPersona[]`

- **Visualización de Historial:**
  - Comentarios mostrados con badge azul "💬 Comentario"
  - Acciones de sumarse mostradas con badge verde "✓ Persona sumada"
  - Comentarios tienen estilo diferenciado con borde azul

#### Migraciones de Datos:
- Script `backend/scripts/migrate_creadores_to_reclamo_personas.py`
  - Inserta todos los creadores existentes como `es_creador_original=true`
  - Ejecutado automáticamente

#### Flujo de Usuario:
1. Usuario intenta crear reclamo similar → Se muestran similares
2. Usuario hace click en "Sumarme" → POST /reclamos/{id}/sumarse
3. Se crea ReclamoPersona + entrada en historial
4. Se notifica a otros sumados
5. Usuario es redirigido al detalle del reclamo

---

## ESTADO ANTERIOR (2025-02-01)

### Cambios Completados: Eliminación rol "empleado" y nuevo flujo de estados

#### 1. Eliminación del rol "empleado"

El rol `empleado` fue eliminado del sistema. Los roles válidos ahora son:
- `vecino` - Ciudadanos que crean reclamos
- `supervisor` - Usuarios de dependencias que procesan reclamos
- `admin` - Administradores del municipio

**Usuarios de dependencia:** Tienen `municipio_dependencia_id` asignado y rol `supervisor`.

**Archivos modificados:**
- `backend/models/enums.py` - Rol EMPLEADO marcado como legacy
- `backend/scripts/crear_usuarios_dependencias.py` - Crea usuarios con rol supervisor
- `frontend/src/types/index.ts` - RolUsuario sin empleado
- `frontend/src/routes.tsx` - Rutas actualizadas
- `frontend/src/config/navigation.ts` - Navegación sin sección empleados
- `frontend/src/pages/Demo.tsx` - Removido perfil "Empleado Demo"
- Múltiples componentes actualizados para remover referencias a empleado

#### 2. Nuevo flujo de estados de reclamos

Estados activos (en orden):
1. **recibido** - Dependencia recibió el reclamo
2. **en_curso** - Trabajo en progreso (antes era "en_proceso")
3. **finalizado** - Trabajo completado
4. **pospuesto** - Trabajo diferido
5. **rechazado** - Disponible desde cualquier estado

**Estados legacy** (compatibilidad con datos existentes):
- nuevo, asignado, en_proceso, pendiente_confirmacion, resuelto

**Transiciones válidas:**
```
recibido → en_curso, rechazado
en_curso → finalizado, pospuesto, rechazado
pospuesto → en_curso, finalizado, rechazado
finalizado → (estado final)
rechazado → (estado final)
```

**Cambios en base de datos:**
- MySQL ENUM actualizado para incluir `en_curso`
- Datos migrados de `en_proceso` a `en_curso`
- Datos migrados de `nuevo` a `recibido`
- `historial_reclamos` actualizado con nuevos valores de enum

**Descripción obligatoria:** Todos los cambios de estado requieren una descripción/comentario.

#### 3. UI de estados actualizada

- Botón "Iniciar" renombrado a **"En Curso"**
- Panel muestra **"Poner En Proceso"**
- Toast: **"Reclamo en proceso"**
- Colores y labels actualizados en todos los componentes

---

## ESTADO ANTERIOR (2025-01-25)

### Tarea Completada: Asignación de Trámites Específicos a Dependencias

Se rediseñó la pantalla AsignacionDependencias para permitir asignar trámites específicos (no solo tipos) a cada dependencia.

**Nueva estructura:**
- Cada dependencia se muestra como un acordeón expandible
- Para RECLAMOS: se seleccionan categorías directamente (toggle on/off)
- Para TRÁMITES: se muestran los tipos de trámite, y al expandir un tipo se ven los trámites específicos
- Botón "Todos" para seleccionar/quitar todos los trámites de un tipo

**Backend:**
- Nuevo modelo: `MunicipioDependenciaTramite` (asigna trámites específicos a dependencias)
- Nuevos endpoints: `GET/POST /dependencias/municipio/{id}/tramites`
- Migración SQL: `migrations/create_municipio_dependencia_tramites.sql`

**Frontend:**
- Rediseño completo de `AsignacionDependencias.tsx`
- Nuevas funciones en `api.ts`: `getTramites()` y `asignarTramites()`

---

### Tarea Completada: Wizards de Nuevo Reclamo y Nuevo Trámite

Se mejoraron los wizards con:
- Panel lateral derecho con asistente IA (aiPanel) - solo desktop
- Secciones con colores distintivos (Recomendación: amber, Asistente: blue)
- Autocomplete de dirección mejorado con fallbacks para Nominatim
- Muestra la dependencia encargada antes de enviar

#### Cambios realizados:

**Frontend - NuevoReclamo.tsx:**
- Autocomplete de direcciones con 3 fallbacks (viewbox → sin viewbox → query simple)
- Fetch de dependencia encargada basado en categoría seleccionada
- Banner de dependencia en paso de confirmación
- Panel IA con colores por sección

**Frontend - WizardModal.tsx:**
- Prop `primaryButtonColor` para personalizar botón según categoría
- Removido `bottomRecommendation` (duplicaba el panel lateral)

**Frontend - api.ts:**
- `getServicios()` usa `/tramites/municipio/${municipioId}/tramites`

### Tablas Intermedias (sistema de habilitación por municipio):

| Tabla | Catálogo Global | Por Municipio |
|-------|-----------------|---------------|
| Categorías | `categorias` | `municipio_categorias` |
| Tipos Trámite | `tipos_tramite` | `municipio_tipos_tramite` |
| Trámites | `tramites` | `municipio_tramites` |
| Dependencias | `dependencias` | `municipio_dependencias` |
| Asignación Dep-Tramite | - | `municipio_dependencia_tramites` |

**Nota:** `municipio_dependencia_tramites` permite asignar trámites específicos a cada dependencia (nivel más granular que tipos).

### Endpoints relevantes:

- `GET /categorias` - Categorías habilitadas del municipio (usa MunicipioCategoria)
- `GET /categorias/catalogo` - Todas las categorías del catálogo
- `GET /tramites/tipos` - Tipos de trámite habilitados (usa MunicipioTipoTramite)
- `GET /tramites/municipio/{id}/tramites` - Trámites habilitados del municipio
- `GET /tramites/catalogo` - Todos los trámites del catálogo

---

### Tarea Anterior: Migración empleado_id → dependencia_id

Se eliminaron todas las referencias a `Reclamo.empleado_id` del backend porque esa columna no existe en la tabla `reclamos`. Los reclamos ahora se asignarán a **dependencias** (MunicipioDependencia) en lugar de empleados individuales.

#### Archivos Backend modificados:
- `api/dashboard.py` - conteo-categorias, conteo-estados, metricas-accion
- `api/reclamos.py` - filtros, mis-estadisticas, mi-historial, disponibilidad, sugerencia-asignacion
- `api/analytics.py` - rendimiento-empleados
- `api/calificaciones.py` - estadísticas y ranking
- `api/exportar.py` - filtros y stats por empleado
- `api/planificacion.py` - reclamos asignados y sin asignar
- `api/reportes.py` - top empleados
- `api/turnos.py` - calendario y disponibilidad
- `api/chat.py` - queries de IA
- `api/empleados.py` - cálculo de carga de trabajo
- `api/tramites.py` - filtros de Solicitud.empleado_id
- `models/municipio_dependencia.py` - relaciones comentadas
- `models/tramite.py` - agregado municipio_dependencia_id a Solicitud

#### Frontend modificado:
- `pages/DependenciasConfig.tsx` - diferencia superadmin vs supervisor
  - Superadmin (sin municipio_id): ve catálogo global de dependencias
  - Supervisor (con municipio_id): ve dependencias habilitadas para su municipio

### Migraciones Completadas (2025-01-25):

1. ✅ **Columna municipio_dependencia_id en reclamos** - Agregada con FK e índice
2. ✅ **Relaciones ORM habilitadas** en `models/reclamo.py` y `models/municipio_dependencia.py`
3. ✅ **Seed completo para Chacabuco (municipio_id=7)**:
   - Script: `backend/scripts/seed_chacabuco_dependencias.py`
   - 12 dependencias habilitadas
   - 24 categorías asignadas a dependencias (mapeo manual consciente)
   - 11 tipos de trámite asignados
   - 38 trámites específicos asignados
   - 5 reclamos existentes actualizados con su dependencia

### Migraciones Pendientes:

1. **Implementar auto-asignación** - Cuando se cree un reclamo, asignar automáticamente a la dependencia correcta basándose en la categoría (usar el mapeo de `municipio_dependencia_categorias`).

2. **Agregar color e icono a dependencias** - La tabla `dependencias` necesita campos `color` e `icono` para mostrar visualmente cada dependencia en la UI.
```sql
ALTER TABLE dependencias ADD COLUMN color VARCHAR(20) DEFAULT '#6366f1';
ALTER TABLE dependencias ADD COLUMN icono VARCHAR(50) DEFAULT 'Building2';
```

### Pantalla AsignacionDependencias (nueva):
- **Layout**: 2 columnas con drag & drop
- **Columna izquierda**: Items disponibles (categorías o tipos de trámite)
- **Columna derecha**: Dependencias como destinos de drop
- **Reclamos**: Arrastrás categorías a las dependencias
- **Trámites**: Arrastrás tipos de trámite, luego expandís para ver/activar trámites específicos
- Al asignar un tipo de trámite, todos sus trámites se activan por defecto
- Botón "Ver trámites" expande la dependencia para mostrar tipos asignados
- Chevron en cada tipo expande para ver/editar trámites individuales

### Notas técnicas:
- Todos los endpoints que usaban `Reclamo.empleado_id` ahora retornan 0 o listas vacías
- Hay comentarios `# TODO:` en el código indicando dónde reactivar la lógica
- El modelo `Solicitud` (trámites) ya tiene `municipio_dependencia_id` agregado
