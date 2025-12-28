# 09 - ESTADO ACTUAL DEL PROYECTO

> **Fecha de actualización:** 28/12/2024

---

## RESUMEN EJECUTIVO

Sistema de Gestión Municipal multi-tenant con módulos de Reclamos y Trámites.
- **Backend:** Heroku (FastAPI + MySQL Aiven)
- **Frontend:** Netlify (React + TypeScript + Vite)

---

## FUNCIONALIDADES COMPLETADAS

### 1. Sistema de Autenticación
- [x] Login/Register con JWT
- [x] Roles: admin, supervisor, empleado, vecino
- [x] Multi-tenant por municipio_id
- [x] Redirección inteligente por rol

### 2. Layout Unificado
- [x] Layout único para todos los roles (`/gestion/*`)
- [x] Sidebar colapsable en desktop
- [x] Footer móvil con 5 tabs (el del medio elevado)
- [x] Navegación dinámica según rol
- [x] Tema claro/oscuro

### 3. Módulo de Reclamos
- [x] ABMPage con patrón Sheet (Side Modal)
- [x] Vista Cards y Tabla
- [x] Infinite scroll con IntersectionObserver
- [x] Indicador "Cargando más reclamos..."
- [x] Mensaje "No hay más reclamos para mostrar"
- [x] Filtros por estado, categoría, búsqueda
- [x] Wizard para crear reclamos
- [x] Asignación a empleados
- [x] Historial de cambios
- [x] Mapa con ubicación
- [x] Fotos con Cloudinary
- [x] Reclamos anónimos (opción)
- [x] Búsqueda de vecinos por nombre/DNI/teléfono

### 4. Módulo de Trámites
- [x] Catálogo de servicios por rubro
- [x] Wizard móvil para crear trámites
- [x] Gestión de trámites (GestionTramites)
- [x] Infinite scroll funcionando
- [x] Estados: iniciado, en_revision, requiere_documentacion, en_proceso, aprobado, rechazado, finalizado
- [x] Mis Trámites para vecinos

### 5. Dashboard
- [x] Dashboard público con estadísticas
- [x] Dashboard Vecino con:
  - Stats en grid 4 columnas
  - 2 botones de acción (Nuevo Reclamo, Nuevo Trámite)
  - Secciones configurables
- [x] Config Dashboard (admin puede configurar secciones visibles)

### 6. Tablero Kanban
- [x] Vista Kanban con drag & drop
- [x] Columnas: Nuevo, Asignado, En Proceso, Resuelto
- [x] Scroll horizontal en móvil con snap

### 7. Empleados/Cuadrillas
- [x] ABM de empleados
- [x] Asignación de tareas
- [x] Vista "Mis Trabajos" para empleados
- [x] Mi Rendimiento (estadísticas del empleado)

### 8. Calificaciones
- [x] Vecinos pueden calificar reclamos resueltos
- [x] Sistema de estrellas (1-5) + comentario opcional

---

## FIXES RECIENTES (28/12/2024)

### Infinite Scroll en Reclamos
- **Problema:** El IntersectionObserver no detectaba el scroll
- **Causa:** `overflow-hidden` en ABMPage bloqueaba la detección del sentinel
- **Solución:** Quitar `overflow-hidden` del contenedor del grid

### Errores 404 en cantidad-similares
- **Problema:** Endpoint `/api/reclamos/{id}/cantidad-similares` no existía
- **Causa:** Se llamaba desde frontend pero no estaba en backend
- **Solución:** Comentar temporalmente la funcionalidad hasta implementar el endpoint

---

## ARQUITECTURA DE NAVEGACIÓN

```
/                     → RootRedirect (según rol)
/bienvenido           → Landing pública con selector de municipio

/gestion              → Layout unificado
  /gestion            → Dashboard (admin/supervisor)
  /gestion/tablero    → Kanban (empleado por defecto)
  /gestion/mi-panel   → Dashboard Vecino (vecino por defecto)

  /gestion/reclamos       → ABM Reclamos (admin/supervisor)
  /gestion/mis-reclamos   → Mis Reclamos (vecino)
  /gestion/mis-trabajos   → Mis Trabajos (empleado)
  /gestion/crear-reclamo  → Wizard nuevo reclamo

  /gestion/tramites       → Gestión Trámites (admin/supervisor)
  /gestion/mis-tramites   → Mis Trámites (vecino)
  /gestion/crear-tramite  → Wizard nuevo trámite

  /gestion/mapa           → Mapa de reclamos
  /gestion/empleados      → ABM Empleados
  /gestion/categorias     → ABM Categorías
  /gestion/zonas          → ABM Zonas
  /gestion/ajustes        → Configuración
```

---

## COMPONENTES CLAVE

| Componente | Ubicación | Descripción |
|------------|-----------|-------------|
| `Layout` | components/Layout.tsx | Layout unificado con sidebar + footer móvil |
| `ABMPage` | components/ui/ABMPage.tsx | Componente reutilizable para ABMs con grid/tabla |
| `Sheet` | components/ui/Sheet.tsx | Side Modal para crear/editar/ver |
| `WizardModal` | components/ui/WizardModal.tsx | Wizard por pasos |
| `TramiteWizard` | components/TramiteWizard.tsx | Wizard específico para trámites |

---

## PRÓXIMOS PASOS SUGERIDOS

### Alta Prioridad
1. **Implementar endpoint `/api/reclamos/{id}/cantidad-similares`**
   - Para mostrar badge "X vecinos" en cards de reclamos
   - Calcular reclamos cercanos por ubicación (100m) y misma categoría

2. **Notificaciones Push**
   - Notificar a vecinos cuando cambia estado de su reclamo
   - Notificar a empleados de nuevas asignaciones

3. **Mi Historial para vecinos**
   - Timeline de todos sus reclamos/trámites
   - Página MiHistorial.tsx (ya creada, verificar funcionalidad)

### Media Prioridad
4. **Reportes/Estadísticas avanzadas**
   - Tiempo promedio de resolución por categoría
   - Reclamos por zona
   - Rendimiento de empleados

5. **Exportar datos**
   - Export a Excel/PDF de listados
   - Reporte mensual automático

6. **Mejoras de UX Móvil**
   - Pull-to-refresh en listados
   - Gestos swipe para acciones rápidas

### Baja Prioridad
7. **Sistema de Adjuntos en Trámites**
   - Subir documentos requeridos
   - Validación de tipos de archivo

8. **Chat interno**
   - Comunicación vecino-empleado sobre un reclamo
   - Historial de mensajes

9. **PWA**
   - Service Worker para offline
   - Notificaciones push nativas

---

## CREDENCIALES DE PRUEBA

| Rol | Email | Password |
|-----|-------|----------|
| Admin | admin@merlo.test.com | admin123 |
| Supervisor | super@merlo.test.com | super123 |
| Empleado | empleado@merlo.test.com | emp123 |
| Vecino | vecino@merlo.test.com | vecino123 |

---

## URLS DE DEPLOY

| Ambiente | URL |
|----------|-----|
| Frontend (Netlify) | https://sugerenciasmun.netlify.app |
| Backend (Heroku) | https://sugerenciasmun-xyz.herokuapp.com |
| DB (Aiven) | mysql://... (ver .env) |

---

## NOTAS TÉCNICAS

### Infinite Scroll
El patrón usado en todas las páginas con listados:
```tsx
// 1. Refs y estados
const observerTarget = useRef<HTMLDivElement>(null);
const [loadingMore, setLoadingMore] = useState(false);
const [hasMore, setHasMore] = useState(true);

// 2. IntersectionObserver
useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
        setPage(prev => prev + 1);
      }
    },
    { threshold: 0.1, rootMargin: '100px' }
  );
  // ...
}, [hasMore, loadingMore, loading]);

// 3. Sentinel div (IMPORTANTE: NO debe estar dentro de overflow-hidden)
<div ref={observerTarget} className="py-4">
  {loadingMore && <Spinner />}
  {!hasMore && <p>No hay más para mostrar</p>}
</div>
```

### Multi-tenant
Todas las queries deben filtrar por `municipio_id`:
```python
# Backend
query = select(Reclamo).where(Reclamo.municipio_id == current_user.municipio_id)
```

---

**Última actualización:** 28/12/2024 - Arreglo infinite scroll en Reclamos
