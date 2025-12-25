# Documentación Funcional - Sistema de Gestión de Reclamos Municipales

## Visión General

Sistema integral de gestión de reclamos y sugerencias municipales que conecta a los ciudadanos con su gobierno local, optimizando la resolución de problemas urbanos mediante tecnología moderna, gamificación y comunicación en tiempo real.

---

## ARQUITECTURA DE PRODUCTOS

El sistema se divide en **DOS PRODUCTOS DISTINTOS** con diferentes audiencias y objetivos:

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLATAFORMA MUNICIPAL                         │
├─────────────────────────┬───────────────────────────────────────┤
│   APP CIUDADANO         │        PANEL DE GESTIÓN               │
│   (Consumer App)        │        (Admin Dashboard)              │
├─────────────────────────┼───────────────────────────────────────┤
│ Target: Vecinos         │ Target: Municipio                     │
│ Modelo: Freemium/Gratis │ Modelo: SaaS B2G                      │
│ Canal: Mobile/Web       │ Canal: Web Desktop                    │
├─────────────────────────┴───────────────────────────────────────┤
│                     BACKEND COMPARTIDO                          │
│              (Multi-tenant por Municipio)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

# PARTE 1: APP CIUDADANO

## Propuesta de Valor

> "Tu voz importa. Reportá problemas en tu barrio y seguí su resolución en tiempo real."

### Problema que Resuelve
- Los vecinos no tienen un canal efectivo para reportar problemas
- No hay visibilidad del estado de sus reclamos
- Falta de motivación para participar activamente
- Desconfianza en que el municipio actúe

### Solución
App móvil/web simple que permite reportar problemas en 2 minutos, con seguimiento transparente y recompensas por participación.

---

## Funcionalidades del Ciudadano

### 1. Crear Reclamo (Core Feature)

**Flujo del Usuario:**
```
1. Seleccionar Categoría → 2. Ubicación → 3. Descripción → 4. Fotos → 5. Confirmar
```

**Características:**
- Wizard de 5 pasos intuitivo
- Selección visual de categorías con iconos
- Mapa interactivo para marcar ubicación exacta
- Captura de hasta 5 fotos como evidencia
- GPS automático para geolocalización
- Estimación de tiempo de resolución visible

**Categorías típicas:**
| Categoría | Icono | Descripción |
|-----------|-------|-------------|
| Baches y Calles | 🚧 | Problemas en pavimento, veredas |
| Alumbrado Público | 💡 | Luces rotas, zonas oscuras |
| Basura y Limpieza | 🗑️ | Contenedores, residuos en vía pública |
| Espacios Verdes | 🌳 | Plazas, árboles, poda |
| Agua y Cloacas | 💧 | Pérdidas, desagües tapados |
| Tránsito | 🚗 | Señalización, semáforos |

### 2. Mis Reclamos

**Panel Personal:**
- Lista de todos los reclamos propios
- Estado visual con colores:
  - 🟡 Nuevo (pendiente)
  - 🔵 Asignado
  - 🟣 En Proceso
  - 🟢 Resuelto
  - 🔴 Rechazado
- Timeline de cada reclamo
- Notificaciones de cambios de estado

### 3. Mapa Interactivo

**Visualización:**
- Ver todos los reclamos del barrio/zona
- Filtrar por categoría y estado
- Identificar zonas problemáticas
- Ver "heat map" de concentración de problemas

### 4. Sistema de Gamificación

**Puntos por Acción:**
| Acción | Puntos |
|--------|--------|
| Crear reclamo | +10 |
| Agregar fotos | +5 |
| Ubicación exacta | +5 |
| Reclamo resuelto | +20 |
| Calificar resolución | +5 |
| Primer reclamo | +25 |
| Racha semanal | +30 |

**Sistema de Niveles:**
- Nivel = Puntos / 100
- Progreso visual circular
- Puntos para siguiente nivel

**Badges (Insignias):**
| Badge | Requisito | Bonus |
|-------|-----------|-------|
| Primer Paso | 1 reclamo | +25 |
| Vecino Activo | 5 reclamos | +50 |
| Ojos de la Ciudad | 15 reclamos | +100 |
| Reportero Estrella | 30 reclamos | +200 |
| Guardian Urbano | 50 reclamos | +300 |
| Héroe Municipal | 100 reclamos | +500 |
| Fotógrafo | 10 con foto | +50 |
| Preciso | 10 con ubicación | +50 |
| Madrugador | Reportar antes 7am | +25 |
| Nocturno | Reportar después 22pm | +25 |

**Leaderboard:**
- Ranking mensual por municipio
- Ranking por zona/barrio
- Top 3 destacados con medallas
- Posición personal visible

**Recompensas Canjeables:**
- Descuentos en comercios locales
- Entradas a eventos municipales
- Reconocimientos públicos
- Merchandising municipal

### 5. Chat con IA

**Asistente Virtual:**
- Ayuda a crear reclamos conversacionalmente
- Sugiere categorías automáticamente
- Responde consultas frecuentes
- Links directos para crear reclamos
- Powered by Google Gemini

### 6. WhatsApp (Canal Alternativo)

**Flujo Conversacional:**
```
Usuario: "Hola"
Bot: "¡Hola! Soy el asistente de [Municipio].
      ¿Querés reportar un problema?"

Usuario: "Sí, hay un bache enorme"
Bot: "Entendido. ¿En qué calle está ubicado?"
...
Bot: "¡Listo! Tu reclamo #1234 fue creado.
      Te avisaremos cuando haya novedades."
```

**Notificaciones Automáticas:**
- Reclamo recibido
- Reclamo asignado
- Cambio de estado
- Reclamo resuelto

### 7. Calificación de Servicio

**Post-Resolución:**
- Rating 1-5 estrellas
- Evaluación de:
  - Tiempo de respuesta
  - Calidad del trabajo
  - Atención recibida
- Comentarios opcionales
- Gamificación: +5 puntos por calificar

### 8. Portal Público

**Sin Registro:**
- Ver estadísticas del municipio
- Consultar estado de reclamo por código
- Ver mapa de reclamos públicos
- Transparencia total

---

## UX/UI Ciudadano - Principios

### Mobile-First
- Diseño responsive optimizado para celular
- Touch-friendly (botones grandes, gestos)
- Carga rápida (lazy loading de imágenes)
- Modo offline para formularios

### Simplicidad
- Máximo 3 clics para crear reclamo
- Sin jerga técnica
- Feedback visual inmediato
- Colores intuitivos para estados

### Confianza
- Transparencia en tiempos estimados
- Historial visible de acciones
- Fotos de antes/después cuando aplica
- Estadísticas de resolución públicas

### Engagement
- Gamificación no invasiva
- Notificaciones relevantes (no spam)
- Celebración de logros
- Comunidad y ranking

---

# PARTE 2: PANEL DE GESTIÓN (Municipio)

## Propuesta de Valor

> "Gestión municipal inteligente. Transformá reclamos en oportunidades de mejora."

### Problema que Resuelve
- Reclamos dispersos en múltiples canales
- Falta de trazabilidad y métricas
- Asignación manual ineficiente
- Sin visibilidad de SLAs
- Empleados sin herramientas modernas

### Solución
Dashboard integral que centraliza, asigna y mide la gestión de reclamos con inteligencia artificial.

---

## Roles y Permisos

### Administrador
**Acceso Total:**
- Configuración del sistema
- ABM de usuarios, categorías, zonas
- Reportes ejecutivos
- WhatsApp y email config
- SLA y escalado

### Supervisor
**Gestión Operativa:**
- Dashboard completo
- Asignar reclamos
- Gestionar empleados
- Ver SLAs y métricas
- Exportar datos

### Empleado
**Trabajo de Campo:**
- Tablero Kanban personal
- Resolver/rechazar asignados
- Agregar comentarios
- Ver mapa de zona

---

## Funcionalidades de Gestión

### 1. Dashboard Principal

**KPIs en Tiempo Real:**
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│  TOTAL      │  NUEVOS     │  EN PROCESO │  RESUELTOS  │
│    847      │     23      │      45     │     779     │
│  reclamos   │  pendientes │   activos   │  este mes   │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

**Gráficos Incluidos:**
- Reclamos por estado (dona)
- Tendencia mensual (líneas)
- Por categoría (barras)
- Por zona (barras horizontales)
- Mapa de calor geográfico

**Widgets Configurables:**
- Top 5 empleados por resolución
- Alertas de SLA críticos
- Reclamos sin asignar
- Tiempo promedio de resolución

### 2. Tablero Kanban

**Columnas:**
```
┌──────────┬──────────┬───────────┬──────────┬──────────┐
│  NUEVO   │ ASIGNADO │ EN PROCESO│ RESUELTO │ RECHAZADO│
├──────────┼──────────┼───────────┼──────────┼──────────┤
│ [Card]   │ [Card]   │ [Card]    │ [Card]   │ [Card]   │
│ [Card]   │ [Card]   │           │ [Card]   │          │
│ [Card]   │          │           │          │          │
└──────────┴──────────┴───────────┴──────────┴──────────┘
```

**Tarjeta de Reclamo:**
- Título truncado
- Categoría con icono
- Prioridad (color)
- Empleado asignado
- Tiempo transcurrido
- SLA status (verde/amarillo/rojo)

**Interacción:**
- Drag & drop entre columnas
- Click para detalle lateral
- Filtros múltiples
- Actualización en tiempo real (WebSocket)

### 3. Asignación Inteligente

**Algoritmo de Scoring:**
```
Score = (Especialidad × 40%) + (Zona × 20%) +
        (Carga × 25%) + (Disponibilidad × 15%)
```

**Candidatos Sugeridos:**
| Empleado | Score | Especialidad | Zona | Carga Actual |
|----------|-------|--------------|------|--------------|
| Juan Pérez | 92% | Baches ✓ | Centro ✓ | 3 reclamos |
| María García | 78% | Baches ✓ | Norte | 5 reclamos |
| Carlos López | 65% | General | Centro ✓ | 2 reclamos |

**Asignación Manual:**
- Override de sugerencia
- Fecha y hora programada
- Notas internas
- Notificación automática

### 4. Gestión de SLAs

**Configuración por Categoría:**
| Categoría | Prioridad | Respuesta | Resolución |
|-----------|-----------|-----------|------------|
| Baches | Alta | 2 horas | 48 horas |
| Baches | Media | 4 horas | 72 horas |
| Alumbrado | Alta | 1 hora | 24 horas |
| Basura | Media | 2 horas | 24 horas |

**Estados de SLA:**
- 🟢 OK - Dentro de tiempo
- 🟡 Warning - Próximo a vencer (80%)
- 🔴 Critical - Vencido

**Métricas:**
- % Cumplimiento por categoría
- Tiempo promedio de respuesta
- Tiempo promedio de resolución
- Violaciones históricas

### 5. Auto-Escalado

**Reglas Configurables:**
```
SI reclamo.estado = "NUEVO"
   Y tiempo_transcurrido > 4 horas
ENTONCES
   → Notificar supervisor
   → Incrementar prioridad
   → Reasignar automáticamente
```

**Acciones de Escalado:**
- Email a supervisor
- Cambio de prioridad
- Reasignación a backup
- Alerta en dashboard

### 6. Gestión de Empleados

**Ficha de Empleado:**
- Datos personales
- Especialidades (categorías)
- Zonas asignadas
- Carga actual de trabajo
- Historial de rendimiento
- Calificación promedio

**Cuadrillas:**
- Agrupar empleados
- Asignar especialidades
- Capacidad del grupo
- Rendimiento colectivo

### 7. Turnos y Disponibilidad

**Calendario:**
- Vista día/semana/mes
- Horarios de trabajo
- Vacaciones y licencias
- Días bloqueados
- Capacitaciones

**Configuración:**
- Horario default: 9-18hs
- Duración de tareas
- Descansos

### 8. Reportes y Exportación

**Reporte Ejecutivo PDF:**
- Logo y colores municipales
- KPIs del período
- Gráficos de rendimiento
- Top empleados
- Cumplimiento SLA
- Comparativo mensual

**Exportación CSV:**
- Todos los campos de reclamos
- Filtros por fecha/estado/categoría
- Compatible con Excel

### 9. Configuración WhatsApp

**Proveedores:**
- Meta Cloud API (recomendado)
- Twilio (alternativa)

**Notificaciones:**
- ✅ Reclamo recibido
- ✅ Reclamo asignado
- ✅ Cambio de estado
- ✅ Reclamo resuelto
- ⬜ Comentarios (opcional)

**Testing:**
- Enviar mensaje de prueba
- Logs de mensajes
- Estado de conexión

### 10. ABM (Altas, Bajas, Modificaciones)

**Categorías:**
- Nombre e icono
- Color representativo
- Tiempo estimado
- Prioridad default
- Imagen asociada

**Zonas:**
- Nombre del barrio
- Centro geográfico
- Empleados asignados
- Radio de cobertura

**Usuarios:**
- Crear/editar/eliminar
- Asignar roles
- Estado activo/inactivo
- Reset de contraseña

### 11. Analytics Avanzado

**Heatmap Geográfico:**
- Concentración de reclamos
- Zonas problemáticas
- Cobertura de empleados

**Clustering:**
- Reclamos cercanos
- Patrones temporales
- Predicción de demanda

**Métricas de Rendimiento:**
- Por empleado
- Por categoría
- Por zona
- Por período

---

# PARTE 3: ESTRATEGIA DE MARKETING

## Posicionamiento

### Naming Sugerido
- **Para Ciudadanos:** "MiBarrio" / "VecinoActivo" / "ReportáYa"
- **Para Municipios:** "GestiónMunicipal Pro" / "MuniDesk"

### Taglines
- Ciudadano: *"Tu barrio, tu voz"*
- Municipio: *"De reclamos a soluciones"*

---

## Diferenciación Competitiva

| Característica | Nosotros | Competencia |
|----------------|----------|-------------|
| Gamificación | ✅ Completa | ❌ No tiene |
| WhatsApp nativo | ✅ Integrado | ⚠️ Manual |
| IA para categorización | ✅ Gemini | ❌ No tiene |
| Asignación inteligente | ✅ Algoritmo | ❌ Manual |
| Multi-tenant | ✅ Listo | ⚠️ Limitado |
| Mapa interactivo | ✅ Gratuito (OSM) | ⚠️ Google (pagado) |
| Reportes PDF | ✅ Automáticos | ⚠️ Manual |

---

## Modelo de Negocio

### B2G (Business to Government)

**Pricing por Municipio:**

| Plan | Habitantes | Precio/mes |
|------|------------|------------|
| Starter | < 10.000 | $XXX |
| Growth | 10-50.000 | $XXX |
| Pro | 50-200.000 | $XXX |
| Enterprise | > 200.000 | Consultar |

**Incluye:**
- App ciudadano ilimitada
- Panel de gestión
- WhatsApp básico
- Soporte email
- Updates gratuitos

**Add-ons:**
- WhatsApp premium (templates custom)
- Reportes personalizados
- Integración ERP municipal
- SLA 24/7
- Capacitación presencial

### Freemium Ciudadano
- App gratuita siempre
- Sin publicidad
- Gamificación completa
- Valor para el municipio = más ciudadanos reportando

---

## Canales de Venta

### Municipios
1. **Demos personalizadas** - Video call con decisores
2. **Prueba piloto** - 30 días gratis con data real
3. **Referidos** - Municipios que recomiendan
4. **Licitaciones** - Participar en concursos públicos
5. **Partnerships** - Empresas de software municipal

### Ciudadanos
1. **ASO** - App Store Optimization
2. **Municipio impulsa** - Comunicación oficial
3. **Prensa local** - Notas sobre mejoras urbanas
4. **Redes sociales** - Casos de éxito
5. **WhatsApp viral** - "Reporté y me solucionaron en 24hs"

---

## Métricas de Éxito

### Para el Municipio (ROI)
- ⬇️ Tiempo promedio de resolución
- ⬆️ % de cumplimiento SLA
- ⬆️ Satisfacción ciudadana (ratings)
- ⬇️ Reclamos duplicados
- ⬆️ Productividad por empleado

### Para el Ciudadano (Engagement)
- ⬆️ Reclamos creados por usuario
- ⬆️ Tasa de retención (usuarios activos/mes)
- ⬆️ Puntos y badges promedio
- ⬆️ Calificaciones post-resolución
- ⬇️ Tiempo de creación de reclamo

---

## Roadmap de Producto

### Q1 - Consolidación
- [ ] Estabilizar gamificación
- [ ] Testing WhatsApp con municipio piloto
- [ ] Optimizar mobile performance
- [ ] Documentación de usuario

### Q2 - Escalabilidad
- [ ] Múltiples municipios simultáneos
- [ ] API pública documentada
- [ ] Integración con sistemas GIS
- [ ] PWA con modo offline

### Q3 - Inteligencia
- [ ] Predicción de demanda por zona
- [ ] Agrupación automática de reclamos similares
- [ ] Sugerencias de priorización IA
- [ ] Detección de patrones estacionales

### Q4 - Expansión
- [ ] App nativa iOS/Android
- [ ] Módulo de presupuesto participativo
- [ ] Encuestas ciudadanas
- [ ] Portal de transparencia ampliado

---

## Casos de Uso por Persona

### María - Vecina de 45 años
> "Vi un bache enorme en la esquina de casa. Saqué una foto, lo reporté desde el celular y en 3 días me avisaron que lo arreglaron. ¡Hasta gané puntos!"

**Journey:**
1. Ve problema → 2. Abre app → 3. Foto + ubicación → 4. Envía → 5. Recibe confirmación → 6. Notificación de resolución → 7. Califica → 8. Gana badge

### Carlos - Supervisor de Obras Públicas
> "Antes recibíamos reclamos por teléfono, mail, Facebook... un caos. Ahora todo está en un lugar, asigno con un click y tengo métricas para presentar al intendente."

**Journey:**
1. Ve dashboard → 2. Revisa nuevos → 3. Asigna con sugerencia IA → 4. Monitorea SLA → 5. Genera reporte mensual

### Laura - Empleada Municipal
> "El tablero Kanban me cambió la vida. Veo mis tareas, las muevo cuando avanzo, y mis jefes ven mi productividad sin que tenga que reportar nada manual."

**Journey:**
1. Ve Kanban personal → 2. Toma reclamo → 3. Va al lugar → 4. Resuelve → 5. Marca resuelto con fotos → 6. Siguiente tarea

---

# PARTE 4: SEPARACIÓN DE EXPERIENCIAS

## El Problema Actual

Actualmente la app mezcla funcionalidades de ciudadano y gestión en una misma interfaz, lo cual genera confusión:
- Vecinos ven opciones que no les corresponden
- El diseño intenta servir a todos y no optimiza para nadie
- La navegación es compleja

## Solución Propuesta: Dos Experiencias Distintas

### Opción A: Subdominios Separados
```
ciudadano.municipio.com  → App Ciudadano (simple, gamificada)
gestion.municipio.com    → Panel de Gestión (completo, profesional)
```

### Opción B: Detección por Rol
```
Login → IF rol = "vecino" → Vista Ciudadano
        IF rol IN (empleado, supervisor, admin) → Vista Gestión
```

### Opción C: Apps Separadas (Recomendado para Mobile)
```
App Store: "MiBarrio" → Ciudadanos
Play Store: "MuniDesk" → Staff municipal (con login institucional)
```

---

## Flujo del Ciudadano (Simplificado)

```
┌─────────────────────────────────────────────────────────┐
│                    LANDING PAGE                         │
│  "Reportá problemas en tu barrio"                       │
│  [Crear Reclamo]  [Ver mis Reclamos]  [Iniciar Sesión]  │
└─────────────────────────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   NUEVO     │    │    MIS      │    │   LOGROS    │
│  RECLAMO    │    │  RECLAMOS   │    │  (Gamif.)   │
│  (Wizard)   │    │  (Lista)    │    │  Ranking    │
└─────────────┘    └─────────────┘    └─────────────┘
```

**Menú del Ciudadano (4 items máximo):**
1. 🏠 Inicio (landing + stats públicas)
2. ➕ Nuevo Reclamo
3. 📋 Mis Reclamos
4. 🏆 Mis Logros

### Flujo de Gestión (Completo)

```
┌─────────────────────────────────────────────────────────┐
│                    DASHBOARD                            │
│  KPIs + Gráficos + Alertas SLA                         │
└─────────────────────────────────────────────────────────┘
                          │
    ┌─────────┬───────────┼───────────┬─────────┐
    ▼         ▼           ▼           ▼         ▼
┌───────┐ ┌───────┐  ┌─────────┐ ┌───────┐ ┌───────┐
│Reclam.│ │Tablero│  │Empleados│ │Config.│ │Report.│
│ Lista │ │Kanban │  │Cuadrill.│ │  ABM  │ │  PDF  │
└───────┘ └───────┘  └─────────┘ └───────┘ └───────┘
```

**Menú de Gestión (completo, por rol):**

| Sección | Admin | Supervisor | Empleado |
|---------|-------|------------|----------|
| Dashboard | ✅ | ✅ | ❌ |
| Reclamos (lista) | ✅ | ✅ | ✅ (solo asignados) |
| Tablero Kanban | ✅ | ✅ | ✅ |
| Mapa | ✅ | ✅ | ✅ |
| Empleados | ✅ | ✅ | ❌ |
| Cuadrillas | ✅ | ✅ | ❌ |
| Usuarios | ✅ | ✅ | ❌ |
| Categorías | ✅ | ❌ | ❌ |
| Zonas | ✅ | ❌ | ❌ |
| SLA | ✅ | ✅ | ❌ |
| Reportes | ✅ | ✅ | ❌ |
| Configuración | ✅ | ❌ | ❌ |
| WhatsApp | ✅ | ❌ | ❌ |

---

## Implementación Técnica Sugerida

### 1. Crear Layouts Separados
```
/src/layouts/
  ├── CitizenLayout.tsx   → Header simple, menú 4 items
  └── AdminLayout.tsx     → Sidebar completo, por rol
```

### 2. Rutas por Experiencia
```typescript
// Ciudadano
/                    → Landing pública
/nuevo-reclamo       → Wizard crear reclamo
/mis-reclamos        → Lista personal
/mis-reclamos/:id    → Detalle reclamo
/logros              → Gamificación

// Gestión (requiere rol)
/admin               → Dashboard
/admin/reclamos      → Lista completa
/admin/tablero       → Kanban
/admin/empleados     → ABM empleados
/admin/config        → Configuración
...
```

### 3. Componentes Compartidos
- Mapa interactivo
- Cards de reclamo
- Formulario de reclamo
- Sistema de notificaciones

---

## Preguntas Frecuentes (FAQ)

### Para Municipios

**¿Cuánto demora la implementación?**
> 2-4 semanas incluyendo personalización, carga de datos y capacitación.

**¿Se integra con nuestro sistema actual?**
> Sí, tenemos API REST documentada. Integraciones comunes: GIS, ERP municipal, sistemas de turnos.

**¿Qué pasa con los datos?**
> Los datos son 100% del municipio. Hosting en Argentina (opcional) o cloud seguro. Backup diario. GDPR compliant.

### Para Ciudadanos

**¿Es gratis?**
> Sí, la app es totalmente gratuita y sin publicidad.

**¿Mis datos están seguros?**
> Solo guardamos lo necesario para el reclamo. No vendemos datos. Podés eliminar tu cuenta cuando quieras.

**¿Qué pasa si el municipio no responde?**
> Tenemos SLAs configurados. Si se pasan del tiempo, se escala automáticamente a supervisores.

---

## Resumen Ejecutivo

### Lo que Tenemos (Funcional)
✅ Crear reclamos con wizard
✅ Mapa interactivo
✅ Estados y seguimiento
✅ Dashboard con KPIs
✅ Tablero Kanban
✅ Asignación inteligente
✅ Sistema de gamificación
✅ Chat con IA (Gemini)
✅ Configuración WhatsApp
✅ SLAs y escalado
✅ Reportes PDF
✅ Multi-tenant

### Lo que Falta (Prioridad Alta)
⬜ Separar experiencias ciudadano/gestión
⬜ Simplificar navegación ciudadano
⬜ Testing real con WhatsApp
⬜ Optimización mobile
⬜ Documentación de usuario

### Lo que Viene (Futuro)
⬜ App nativa móvil
⬜ API pública
⬜ Predicción con ML
⬜ Modo offline

---

*Documento actualizado: Diciembre 2024*
*Versión: 2.0*
