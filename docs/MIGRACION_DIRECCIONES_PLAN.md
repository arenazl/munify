# 🔄 MIGRACIÓN: De Empleados a Direcciones
## Análisis y Modificación de Base de Datos

---

## 📊 SITUACIÓN ACTUAL

### Estructura de Asignación Actual

```
HOY:

CATEGORÍAS (reclamos) ──┐
                        ├──> EMPLEADOS ──> RECLAMOS
                        └──> CUADRILLAS ──> RECLAMOS

TIPOS_TRÁMITE ──> SOLICITUDES ──> EMPLEADOS
```

### Tablas Clave Existentes

1. **`empleados`**
   - Persona individual (Juan Pérez)
   - Tiene `categoria_principal_id`
   - Relación M:N con `categorias` via `empleado_categorias`
   - Relación M:N con `cuadrillas` via `empleado_cuadrillas`
   - **FK en `reclamos.empleado_id`**
   - **FK en `solicitudes.empleado_id`**

2. **`empleado_categorias`** (pivot table)
   - Relación Empleado ↔ Categoría
   - Columna: `es_principal`

3. **`cuadrillas`**
   - Grupo de empleados
   - Relación M:N con `categorias` via `cuadrilla_categorias`
   - Relación M:N con `empleados` via `empleado_cuadrillas`

4. **`municipio_categorias`**
   - Qué categorías tiene habilitadas cada municipio

5. **`municipio_tipos_tramites`** y **`municipio_tramites`**
   - Qué tipos de trámites tiene habilitadas cada municipio

---

## 🎯 OBJETIVO

### Nueva Estructura

```
NUEVO:

CATEGORÍAS (reclamos) ──┐
                        ├──> DIRECCIONES ──> RECLAMOS
TIPOS_TRÁMITE ──────────┘          └──> SOLICITUDES

DIRECCIÓN = Contenedor organizacional
- Puede gestionar categorías (para reclamos)
- Puede gestionar tipos de trámite (para trámites)
- Puede tener ambos simultáneamente
```

### Concepto de Dirección

```
DIRECCIÓN DE OBRAS PÚBLICAS:
├── Categorías (Reclamos):
│   ├── Baches
│   ├── Veredas rotas
│   └── Iluminación defectuosa
└── Tipos de Trámite:
    ├── Permiso de obra menor
    ├── Permiso de zanjeo
    └── Excavación en vía pública
```

---

## 🏗️ MODIFICACIONES PROPUESTAS

### 1. NUEVA TABLA: `direcciones`

```sql
CREATE TABLE direcciones (
    id INT PRIMARY KEY AUTO_INCREMENT,
    municipio_id INT NOT NULL,
    
    -- Información básica
    nombre VARCHAR(200) NOT NULL,              -- "Dirección de Obras Públicas"
    codigo VARCHAR(50),                        -- "DOP"
    descripcion TEXT,
    
    -- Ubicación física
    direccion_calle VARCHAR(300),
    direccion_numero VARCHAR(50),
    direccion_piso VARCHAR(50),
    ciudad VARCHAR(100),
    codigo_postal VARCHAR(20),
    
    -- Contacto
    telefono VARCHAR(50),
    email VARCHAR(200),
    horario_atencion VARCHAR(200),             -- "Lun-Vie 8:00-16:00"
    
    -- Tipo de gestión
    tipo_gestion VARCHAR(20) DEFAULT 'ambos',  -- 'reclamos' | 'tramites' | 'ambos'
    
    -- Configuración
    activo BOOLEAN DEFAULT TRUE,
    orden INT DEFAULT 0,
    
    created_at DATETIME,
    updated_at DATETIME,
    
    FOREIGN KEY (municipio_id) REFERENCES municipios(id) ON DELETE CASCADE,
    INDEX idx_direcciones_municipio (municipio_id),
    INDEX idx_direcciones_activo (activo)
);
```

---

### 2. NUEVA TABLA: `direccion_categorias`

```sql
CREATE TABLE direccion_categorias (
    id INT PRIMARY KEY AUTO_INCREMENT,
    direccion_id INT NOT NULL,
    categoria_id INT NOT NULL,
    
    -- Personalizaciones por dirección
    tiempo_resolucion_estimado INT,           -- horas (override)
    prioridad_default INT,                    -- 1-5 (override)
    
    activo BOOLEAN DEFAULT TRUE,
    created_at DATETIME,
    
    FOREIGN KEY (direccion_id) REFERENCES direcciones(id) ON DELETE CASCADE,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE,
    
    UNIQUE KEY uq_direccion_categoria (direccion_id, categoria_id),
    INDEX idx_dc_direccion (direccion_id),
    INDEX idx_dc_categoria (categoria_id)
);
```

---

### 3. NUEVA TABLA: `direccion_tipos_tramites`

```sql
CREATE TABLE direccion_tipos_tramites (
    id INT PRIMARY KEY AUTO_INCREMENT,
    direccion_id INT NOT NULL,
    tipo_tramite_id INT NOT NULL,
    
    activo BOOLEAN DEFAULT TRUE,
    created_at DATETIME,
    
    FOREIGN KEY (direccion_id) REFERENCES direcciones(id) ON DELETE CASCADE,
    FOREIGN KEY (tipo_tramite_id) REFERENCES tipos_tramites(id) ON DELETE CASCADE,
    
    UNIQUE KEY uq_direccion_tipo_tramite (direccion_id, tipo_tramite_id),
    INDEX idx_dtt_direccion (direccion_id),
    INDEX idx_dtt_tipo_tramite (tipo_tramite_id)
);
```

---

### 4. MODIFICACIÓN: Tabla `reclamos`

```sql
-- AGREGAR columna nueva
ALTER TABLE reclamos 
ADD COLUMN direccion_id INT NULL AFTER empleado_id,
ADD FOREIGN KEY (direccion_id) REFERENCES direcciones(id) ON DELETE SET NULL,
ADD INDEX idx_reclamos_direccion (direccion_id);

-- NOTA: Mantener empleado_id por ahora (deprecated)
-- empleado_id INT NULL (existente)
```

---

### 5. MODIFICACIÓN: Tabla `solicitudes`

```sql
-- AGREGAR columna nueva
ALTER TABLE solicitudes 
ADD COLUMN direccion_id INT NULL AFTER empleado_id,
ADD FOREIGN KEY (direccion_id) REFERENCES direcciones(id) ON DELETE SET NULL,
ADD INDEX idx_solicitudes_direccion (direccion_id);

-- NOTA: Mantener empleado_id por ahora (deprecated)
-- empleado_id INT NULL (existente)
```

---

### 6. MODIFICACIÓN: Tabla `municipios`

```sql
-- Agregar relación (ya está implícita en FK de direcciones)
-- No necesita modificación directa
```

---

### 7. (Opcional) DEPRECAR: Tablas relacionadas con Empleado

**NO ELIMINAR**, solo marcar como legacy:

- `empleado_categorias` → Usar `direccion_categorias`
- `empleado_cuadrillas` → Mantener si las cuadrillas siguen existiendo
- `cuadrilla_categorias` → Mantener si las cuadrillas siguen existiendo

---

## 📋 RESUMEN DE CAMBIOS

### Tablas Nuevas (3)
1. ✅ `direcciones`
2. ✅ `direccion_categorias`
3. ✅ `direccion_tipos_tramites`

### Tablas Modificadas (2)
1. 🔄 `reclamos` → Agregar `direccion_id`
2. 🔄 `solicitudes` → Agregar `direccion_id`

### Tablas a Deprecar (No eliminar aún)
1. ⚠️ `empleado_categorias` (legacy)
2. ⚠️ `empleado_id` en `reclamos` (legacy)
3. ⚠️ `empleado_id` en `solicitudes` (legacy)

---

## 🔄 ESTRATEGIA DE MIGRACIÓN DE DATOS

### Paso 1: Crear las nuevas tablas
```sql
-- Ejecutar CREATE TABLE de direcciones, direccion_categorias, direccion_tipos_tramites
```

### Paso 2: Crear direcciones predeterminadas por agrupación de categorías
```python
# Agrupación lógica de categorías existentes en direcciones
AGRUPACIONES_DEFAULT = {
    "Dirección Catastral": ["Permisos de Obra", "Regularizaciones", "Inspecciones"],
    "Dirección de Obras Públicas": ["Baches", "Veredas", "Iluminación", "Señalización"],
    "Dirección de Limpieza": ["Basura", "Reciclaje", "Limpieza de espacios públicos"],
    "Dirección de Espacio Público": ["Parques", "Plazas", "Arbolado"],
    "Dirección de Tránsito": ["Estacionamiento", "Licencias de conducir"],
    "Dirección de Servicios Sociales": ["Salud", "Educación", "Asistencia social"],
}
```

### Paso 3: Migrar asignaciones de empleado_categorias a direccion_categorias
```python
# Por cada empleado_categoria, crear direccion_categoria
# Agrupar empleados por especialidad en direcciones
```

### Paso 4: Migrar reclamos y solicitudes a direcciones
```python
# Asignar dirección basándose en la categoría/tipo de trámite
for reclamo in Reclamo.all():
    direccion = Direccion.query.join(DireccionCategoria).filter(
        DireccionCategoria.categoria_id == reclamo.categoria_id
    ).first()
    if direccion:
        reclamo.direccion_id = direccion.id

for solicitud in Solicitud.all():
    if solicitud.tramite:
        direccion = Direccion.query.join(DireccionTipoTramite).filter(
            DireccionTipoTramite.tipo_tramite_id == solicitud.tramite.tipo_tramite_id
        ).first()
        if direccion:
            solicitud.direccion_id = direccion.id
```

---

## 🎨 FRONTEND: Nuevas Pantallas

### 1. `/configuracion/direcciones`
- ABM completo de direcciones
- Asignación de categorías (multiselect)
- Asignación de tipos de trámite (multiselect)

### 2. Modificaciones existentes:
- `/reclamos` → Mostrar columna "Dirección"
- `/tramites` → Mostrar columna "Dirección"
- Dashboard → Estadísticas por dirección

---

## ❓ PREGUNTAS PARA EL CLIENTE

1. **¿Qué hacer con las cuadrillas?**
   - ¿Mantener las cuadrillas existentes?
   - ¿Asociar cuadrillas a direcciones?
   - ¿Eliminar cuadrillas?

2. **¿Dirección predeterminada?**
   - ¿Qué pasa si una categoría/tipo de trámite no tiene dirección?
   - ¿Crear "Dirección General"?

3. **¿Múltiples direcciones por categoría?**
   - ¿Una categoría puede estar en varias direcciones? (Modelo actual N:M)
   - ¿O exclusivamente en una dirección? (Modelo 1:N)

---

## ✅ PRÓXIMO PASO

¿Confirmo la creación de:
1. Modelos Python (`backend/models/`)
2. Migraciones de base de datos
3. API endpoints
4. Pantallas de configuración

**O prefieres ajustar algo del plan?**