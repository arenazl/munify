# Esquema de Base de Datos - Referencia Rápida para IA

## Entidades del Sistema

| tabla | nombre | icono | descripcion |
|-------|--------|-------|-------------|
| reclamos | Reclamos | alert-triangle | Reclamos de vecinos |
| solicitudes | Solicitudes | file-text | Trámites iniciados por vecinos |
| empleados | Empleados | users | Personal del municipio |
| categorias | Categorías | folder | Categorías de reclamos |
| zonas | Zonas | map-pin | Zonas geográficas |
| tipos_tramites | Tipos de Trámite | layers | Categorías de trámites |
| tramites | Trámites | clipboard-list | Sub-tipos de trámite |
| usuarios | Usuarios | user | Usuarios del sistema |
| historial_reclamos | Historial Reclamos | history | Timeline de cambios en reclamos |
| historial_solicitudes | Historial Solicitudes | history | Timeline de cambios en solicitudes |

## Tablas Principales (Maestros)

### reclamos
- id, municipio_id, titulo, descripcion, estado, prioridad, direccion
- categoria_id → categorias.id
- zona_id → zonas.id
- creador_id → usuarios.id
- empleado_id → empleados.id
- fecha_programada, resolucion, fecha_resolucion, created_at

### empleados
- id, municipio_id, nombre, apellido, email, telefono, cargo, activo
- zona_id → zonas.id
- created_at

### categorias
- id, nombre, descripcion, icono, color, activo
- **NO tiene municipio_id** - usar municipio_categorias para filtrar

### municipio_categorias (tabla intermedia)
- id, municipio_id, categoria_id
- Filtra qué categorías están habilitadas por municipio

### zonas
- id, municipio_id, nombre, descripcion, activo, created_at

### usuarios
- id, municipio_id, email, nombre, rol, activo, created_at

### solicitudes
- id, municipio_id, titulo, descripcion, estado, created_at
- usuario_id → usuarios.id

### tramites
- id, titulo, descripcion, estado, created_at
- tipo_tramite_id → tipos_tramites.id
- usuario_id → usuarios.id
- **NO tiene municipio_id** - usar municipio_tramites para filtrar

### municipio_tramites (tabla intermedia)
- id, municipio_id, tramite_id
- Filtra qué trámites pertenecen a cada municipio

### tipos_tramites
- id, nombre, descripcion, activo
- **NO tiene municipio_id** - usar municipio_tipos_tramites para filtrar

### municipio_tipos_tramites (tabla intermedia)
- id, municipio_id, tipo_tramite_id
- Filtra qué tipos de trámite están habilitadas por municipio

### historial_reclamos
- id, reclamo_id, usuario_id, estado_anterior, estado_nuevo, accion, comentario, created_at

### historial_solicitudes
- id, solicitud_id, usuario_id, estado_anterior, estado_nuevo, accion, comentario, created_at

## Reglas de Filtrado Multi-Tenant

### Tablas con municipio_id directo (filtrar con WHERE):
- reclamos
- empleados
- zonas
- usuarios
- solicitudes
- municipio_categorias
- municipio_tramites
- municipio_tipos_tramites

### Tablas SIN municipio_id (requieren JOIN):
- **categorias**: JOIN con municipio_categorias
- **tramites**: JOIN con municipio_tramites
- **tipos_tramites**: JOIN con municipio_tipos_tramites

## Patrones de Consulta Comunes

### Contar reclamos por estado
```sql
SELECT estado, COUNT(*) as total
FROM reclamos
WHERE municipio_id = ?
GROUP BY estado
```

### Reclamos por categoría (requiere JOIN)
```sql
SELECT c.nombre, COUNT(r.id) as total
FROM reclamos r
JOIN categorias c ON r.categoria_id = c.id
JOIN municipio_categorias mc ON c.id = mc.categoria_id
WHERE r.municipio_id = ? AND mc.municipio_id = ?
GROUP BY c.nombre
```

### Trámites del municipio (requiere JOIN)
```sql
SELECT t.*
FROM tramites t
JOIN municipio_tramites mt ON t.id = mt.tramite_id
WHERE mt.municipio_id = ?
```

### Empleados por zona
```sql
SELECT z.nombre, COUNT(e.id) as empleados
FROM empleados e
JOIN zonas z ON e.zona_id = z.id
WHERE e.municipio_id = ?
GROUP BY z.nombre
```

## Estados Válidos

### EstadoReclamo
- NUEVO, EN_REVISION, APROBADO, EN_PROGRESO, RESUELTO, RECHAZADO, CERRADO

### EstadoSolicitud
- PENDIENTE, EN_PROCESO, COMPLETADA, CANCELADA

### EstadoTramite
- BORRADOR, PENDIENTE, EN_REVISION, APROBADO, RECHAZADO, COMPLETADO
