# Testing Checklist: Sistema de "Sumarse" a Reclamos

## Prerequisitos
- [ ] Migraciones SQL completadas (verificar tabla `reclamo_personas`)
- [ ] Migraciones de datos completadas (verificar creadores en reclamo_personas)
- [ ] Backend iniciado correctamente
- [ ] Frontend en modo desarrollo

---

## BACKEND TESTING

### 1. Tabla reclamo_personas
```sql
-- Verificar que la tabla existe
SHOW TABLES LIKE 'reclamo_personas';

-- Verificar estructura
DESCRIBE reclamo_personas;

-- Verificar que creadores fueron migrados
SELECT COUNT(*) FROM reclamo_personas WHERE es_creador_original = 1;
```
**Esperado:** Tabla existe con estructura correcta, N creadores insertados

### 2. Endpoint POST /reclamos/{id}/sumarse
**Test 1: Usuario se suma correctamente**
```bash
POST http://localhost:8000/api/reclamos/1/sumarse
Headers: Authorization: Bearer <token_vecino>

# Esperado: 200 OK
# {"success": true, "message": "Te has sumado al reclamo exitosamente", "reclamo_id": 1}
```

**Test 2: Validación - Usuario no es creador**
```bash
# Intentar sumarse como creador del reclamo
# Esperado: 400 Bad Request
# {"detail": "Ya eres el creador de este reclamo"}
```

**Test 3: Validación - No duplicados**
```bash
# Intentar sumarse dos veces
# Esperado: 400 Bad Request (segunda llamada)
# {"detail": "Ya te has sumado a este reclamo"}
```

**Test 4: Validación - Solo vecinos**
```bash
# Intentar sumarse como supervisor
# Esperado: 403 Forbidden
# {"detail": "Solo los vecinos pueden sumarse a reclamos"}
```

### 3. Historial de Reclamo
```sql
-- Verificar que se crea entrada en historial
SELECT * FROM historial_reclamos
WHERE reclamo_id = 1 AND accion = 'persona_sumada'
ORDER BY created_at DESC LIMIT 5;
```
**Esperado:** Entrada con acción "persona_sumada", nombre del usuario

### 4. Endpoint GET /reclamos/{id}
**Verificar que retorna personas sumadas**
```bash
GET http://localhost:8000/api/reclamos/1
Headers: Authorization: Bearer <token>

# En respuesta, verificar campo "personas" existe y contiene:
# [
#   {
#     "id": user_id,
#     "nombre": "Juan",
#     "apellido": "Pérez",
#     "email": "juan@test.com",
#     "created_at": "2025-02-04T...",
#     "es_creador_original": true
#   },
#   ...
# ]
```

### 5. Comentarios y Notificaciones
**Crear comentario y verificar notificación**
```bash
POST http://localhost:8000/api/reclamos/1/comentario
Headers: Authorization: Bearer <token_supervisor>
Body: {"comentario": "Esto es una prueba"}

# Verificar que se crearon notificaciones para:
# - Creador del reclamo
# - Otros usuarios sumados
# - Base de datos: tabla notificaciones
```

---

## FRONTEND TESTING

### 1. Modal de Similares
- [ ] Crear nuevo reclamo con categoría que tenga similares
- [ ] Verificar que aparece modal "Encontramos reclamos similares"
- [ ] Verificar que cada similar muestra:
  - [ ] Título
  - [ ] Dirección y distancia
  - [ ] Creador
  - [ ] Estado con badge
  - [ ] Botón "Ver detalles"
  - [ ] Botón "Sumarme" (si user es vecino)

### 2. Botón Sumarme
- [ ] Click en "Sumarme" → Estado de loading
- [ ] Toast de éxito: "¡Te has sumado al reclamo!"
- [ ] Redirección a detalle del reclamo
- [ ] Verificar URL: `/app/reclamo/{id}` (mobile) o `/gestion/reclamos/{id}` (desktop)

### 3. Historial en MisReclamos
- [ ] Abrir reclamo al que se sumó
- [ ] Verificar timeline del historial
- [ ] Verificar que muestra:
  - [ ] "✓ Persona sumada" con badge verde
  - [ ] Nombre completo del usuario
  - [ ] "se sumó al reclamo"
  - [ ] Fecha y hora

### 4. Comentarios en Historial
- [ ] Supervisor comenta en reclamo
- [ ] Verificar que aparece en historial con:
  - [ ] "💬 Comentario" con badge azul
  - [ ] Nombre completo del usuario
  - [ ] "comentó"
  - [ ] Contenido del comentario (con borde azul)

### 5. Navegación y Validaciones
- [ ] Como supervisor, intentar "Sumarme" → Botón no debe aparecer
- [ ] Como vecino en su propio reclamo, intentar "Sumarme" → Error "Ya eres el creador"
- [ ] Sumarse dos veces → Error "Ya te has sumado a este reclamo"

---

## TESTING DE NOTIFICACIONES

### En Base de Datos
```sql
-- Verificar notificaciones creadas cuando alguien se suma
SELECT * FROM notificaciones
WHERE tipo IN ('persona_sumada_reclamo', 'comentario_reclamo')
ORDER BY created_at DESC LIMIT 10;

-- Verificar que notificaciones fueron a los usuarios correctos
SELECT
    n.usuario_id,
    u.nombre,
    n.titulo,
    n.tipo,
    n.created_at
FROM notificaciones n
JOIN usuarios u ON n.usuario_id = u.id
WHERE n.reclamo_id = 1
ORDER BY n.created_at DESC;
```

### En Frontend (si está implementado)
- [ ] Abrir notificaciones del usuario
- [ ] Verificar que aparecen:
  - [ ] "Alguien se sumó al reclamo" cuando alguien se suma
  - [ ] "Nuevo comentario en reclamo" cuando alguien comenta

---

## CASOS EDGE

### 1. Reclamo sin similares
- [ ] Crear reclamo con categoría única
- [ ] No debe mostrar modal de similares
- [ ] Debe permitir crear reclamo normalmente

### 2. Usuario anónimo
- [ ] Verificar que usuarios anónimos pueden crear reclamos
- [ ] Verificar que usuarios anónimos pueden sumarse (si tienen email)
- [ ] Verificar que historial muestra usuario anónimo correctamente

### 3. Reclamo rechazado
- [ ] Verificar que no se puede sumar a reclamo rechazado
- [ ] (Opcional) Mostrar mensaje: "Este reclamo fue rechazado"

### 4. Concurrencia
- [ ] Dos usuarios intentando sumarse simultáneamente
- [ ] Verificar que ambos se suman (no se duplican)
- [ ] Verificar que ambos ven el historial actualizado

---

## PERFORMANCE

- [ ] Obtener reclamo con 100+ personas sumadas < 500ms
- [ ] POST sumarse < 300ms
- [ ] Modal de similares carga < 1000ms

---

## DOCUMENTACIÓN

- [ ] Endpoint /sumarse documentado en Swagger/OpenAPI
- [ ] Tipos TypeScript correctos en IntelliSense
- [ ] Comentarios en código explicando lógica compleja

---

## CHECKLIST FINAL

- [ ] Todas las pruebas backend pasadas
- [ ] Todas las pruebas frontend pasadas
- [ ] Sin errores en consola (frontend)
- [ ] Sin errores en logs (backend)
- [ ] Git commit hecho
- [ ] Documentación actualizada

---

**Status:** Pendiente de ejecución
**Responsable:** QA / Desarrollador
**Fecha planeada:** 2025-02-04
