# Implementación: Sistema de "Sumarse" a Reclamos Duplicados

## Fecha: 2025-02-04

### ✅ COMPLETADO

#### BACKEND

1. **Modelo ORM: ReclamoPersona** ✓
   - Archivo: `backend/models/reclamo_persona.py`
   - Tabla intermedia con FK a reclamos y usuarios
   - UniqueConstraint en (reclamo_id, usuario_id)
   - Campo `es_creador_original` para marcar creador

2. **Relaciones en Modelos** ✓
   - `Reclamo.personas` con cascade delete
   - `User.reclamos_unidos` para acceso desde usuario

3. **Endpoint POST /reclamos/{id}/sumarse** ✓
   - Validaciones: usuario no es creador, no se ha sumado antes
   - Crea ReclamoPersona + entrada en historial
   - Plantilla lista para notificaciones

4. **Funciones de Notificación** ✓
   - `notificar_persona_sumada()` - notifica a otros sumados
   - `notificar_comentario_a_personas_sumadas()` - notifica cuando hay comentario
   - Crear notificaciones in-app en tabla Notificacion

5. **Actualización Endpoint /comentario** ✓
   - Retorna datos del usuario que comenta
   - Llama a notificar_comentario_a_personas_sumadas()
   - Historial incluye usuario completo

6. **Schema Pydantic: PersonaSumada** ✓
   - Interfaz para serializar personas sumadas
   - Campos: id, nombre, apellido, email, created_at, es_creador_original

7. **Migraciones SQL** ✓
   - Script crea tabla reclamo_personas con estructura correcta
   - FK con cascada delete
   - Índices para queries rápidas

8. **Migración de Datos** ✓
   - Script `migrate_creadores_to_reclamo_personas.py`
   - Inserta creadores como es_creador_original=true
   - Evita duplicados con validación UniqueConstraint

#### FRONTEND

1. **Componente ReclamosSimilares** ✓
   - Prop `onSumarse?: (id: number) => Promise<void>`
   - Botón "Sumarme" junto a "Ver detalles"
   - Estados de loading durante submit
   - Deshabilitado mientras se procesa

2. **Página NuevoReclamo** ✓
   - Handler para `onSumarse` implementado
   - Llama a `reclamosApi.sumarse()`
   - Toast de éxito/error
   - Navega a `/app/reclamo/{id}` (mobile) o `/gestion/reclamos/{id}` (desktop)

3. **API Client** ✓
   - Método `reclamosApi.sumarse(id)` agregado

4. **Tipos TypeScript** ✓
   - Interfaz `ReclamoPersona` completa
   - Campo opcional `personas?: ReclamoPersona[]` en `Reclamo`

5. **Visualización de Historial** ✓
   - Comentarios: badge azul "💬 Comentario"
   - Personas sumadas: badge verde "✓ Persona sumada"
   - Comentarios con estilo diferenciado
   - Muestra nombre completo del usuario

---

## 📋 ARCHIVOS MODIFICADOS/CREADOS

### Backend
- ✓ `backend/models/reclamo_persona.py` (NUEVO)
- ✓ `backend/models/reclamo.py` (agregada relación)
- ✓ `backend/models/user.py` (agregada relación)
- ✓ `backend/api/reclamos.py` (endpoint sumarse + actualización comentario)
- ✓ `backend/services/notificacion_service.py` (funciones de notificación)
- ✓ `backend/schemas/reclamo.py` (schema PersonaSumada)
- ✓ `backend/scripts/create_reclamo_personas_table.py` (NUEVO)
- ✓ `backend/scripts/migrate_creadores_to_reclamo_personas.py` (NUEVO)

### Frontend
- ✓ `frontend/src/components/ReclamosSimilares.tsx` (actualizado)
- ✓ `frontend/src/pages/NuevoReclamo.tsx` (actualizado)
- ✓ `frontend/src/lib/api.ts` (método sumarse)
- ✓ `frontend/src/types/index.ts` (tipos nuevos)
- ✓ `frontend/src/pages/MisReclamos.tsx` (visualización historial)

### Documentación
- ✓ `CLAUDE.md` (actualizado con estado actual)
- ✓ `IMPLEMENTATION_SUMMARY.md` (este archivo)

---

## 🚀 PRÓXIMOS PASOS

1. **Verificar migraciones SQL:**
   - Los scripts de migración se ejecutan en background
   - Verificar que la tabla `reclamo_personas` fue creada correctamente
   - Verificar que los creadores fueron insertados

2. **Testing:**
   - Crear un reclamo similar y verificar que aparece el botón "Sumarme"
   - Hacer click en "Sumarme" y verificar que se suma correctamente
   - Verificar que aparece en el historial con la acción "persona_sumada"
   - Verificar que otros usuarios sumados reciben notificaciones

3. **Funcionalidades Opcionales:**
   - Mostrar lista de personas sumadas en detalle del reclamo
   - Badge con cantidad de personas sumadas
   - Opción para que supervisor vea quién se sumó

---

## 📝 NOTAS TÉCNICAS

### Validaciones de Seguridad:
- Solo vecinos pueden sumarse (validar rol == VECINO)
- No pueden sumarse a reclamos que no son de su municipio
- UniqueConstraint evita duplicados automáticamente

### Performance:
- Índices en reclamo_id y usuario_id para queries rápidas
- FK con cascade delete para mantener integridad

### Compatibilidad:
- Estados legacy (en_proceso, nuevo, etc.) siguen funcionando
- Sistemas existentes de notificación integrados
- No rompe APIs existentes

---

## ⏱️ MIGRACIONES EN BACKGROUND

Dos scripts se ejecutan en background:
1. `create_reclamo_personas_table.py` - Crea la tabla SQL
2. `migrate_creadores_to_reclamo_personas.py` - Inserta creadores existentes

Esperar a que terminen antes de hacer push a producción.

---

## 🔄 FLUJO COMPLETO

```
Usuario intenta crear reclamo duplicado
    ↓
Sistema detecta similares → Modal muestra opciones
    ├─→ [Ver detalles] → Abre en nueva pestaña
    ├─→ [Sumarme] → POST /reclamos/{id}/sumarse
    │        ↓
    │   Crea ReclamoPersona
    │   Crea HistorialReclamo con acción "persona_sumada"
    │   Notifica a otros sumados
    │   Toast de éxito
    │   Navega a detalle
    │
    └─→ [Crear de todos modos] → Continúa creación normal

En el detalle del reclamo:
    ↓
Ver historial con acciones de sumarse
Ver comentarios con nombre de quién comentó
Supervisor ve notificación de nuevo comentario
```

---

**Estado:** ✅ IMPLEMENTACIÓN COMPLETADA
**Pruebas:** Pendientes
**Deploy:** Listo para código review
