# Sistema de Gestión de Reclamos Municipales

Plataforma integral para la gestión de reclamos ciudadanos con geolocalización, seguimiento en tiempo real y asignación de cuadrillas de trabajo.

---

## Descripción General

Sistema web que digitaliza el proceso de atención de reclamos vecinales en municipios. Los ciudadanos reportan problemas urbanos con ubicación exacta y evidencia fotográfica, mientras que el personal municipal gestiona eficientemente la resolución mediante cuadrillas de trabajo organizadas por zona y especialidad.

El sistema conecta a vecinos, cuadrillas de trabajo y supervisores municipales en una única plataforma, permitiendo transparencia total en el proceso de resolución de problemas urbanos.

---

## Roles de Usuario

| Rol | Descripción | Acceso |
|-----|-------------|--------|
| **Vecino** | Ciudadano registrado en el sistema | Crear y seguir sus reclamos, ver mapa público |
| **Cuadrilla** | Personal de campo del municipio | Tablero de trabajos asignados, registrar resoluciones |
| **Supervisor** | Coordinador de área municipal | Gestionar reclamos, asignar cuadrillas, ver reportes |
| **Admin** | Administrador general del sistema | Acceso total al sistema y configuración |

---

## Funcionalidades por Rol

### Vecino

**Registro y acceso**
- Registro con datos personales y domicilio dentro del municipio
- Login con email y contraseña
- Recuperación de contraseña por email
- Edición de perfil y datos de contacto

**Gestión de reclamos**
- Crear nuevo reclamo seleccionando categoría del problema
- Marcar ubicación exacta en mapa interactivo
- Adjuntar fotos del problema (hasta 5 imágenes)
- Escribir descripción detallada del inconveniente
- Ver listado de todos sus reclamos con estado actual
- Consultar detalle y evolución de cada reclamo
- Ver fotos de la solución aplicada cuando se resuelve

**Mapa público**
- Visualizar todos los reclamos de la zona en un mapa
- Filtrar por categoría y estado
- Ver información básica de cada punto marcado
- Identificar zonas con mayor concentración de problemas

---

### Cuadrilla

**Tablero de trabajo**
- Vista Kanban con columnas organizadas por estado
- Lista de reclamos asignados ordenados por prioridad y antigüedad
- Detalle completo de cada reclamo incluyendo fotos, ubicación y descripción
- Contador de trabajos pendientes

**Gestión de trabajos**
- Iniciar trabajo (cambia estado a "En Proceso")
- Registrar avances o notas durante la ejecución
- Marcar como resuelto con descripción obligatoria de la solución
- Adjuntar fotos del trabajo realizado como evidencia
- Ver historial de trabajos completados

**Navegación**
- Abrir ubicación del reclamo en Google Maps o Waze
- Ver dirección aproximada del problema

---

### Supervisor

**Dashboard**
- Resumen de reclamos organizados por estado
- Listado de reclamos nuevos pendientes de asignación
- Alertas de reclamos demorados que exceden tiempos esperados
- Métricas de rendimiento del equipo

**Gestión de reclamos**
- Ver todos los reclamos del sistema con filtros avanzados
- Filtrar por: estado, categoría, fecha, barrio, cuadrilla asignada
- Asignar cuadrilla a reclamos nuevos según zona y especialidad
- Reasignar reclamos a otra cuadrilla si es necesario
- Rechazar reclamos inválidos especificando el motivo
- Ver historial completo de cambios de cada reclamo
- Exportar listados a Excel/CSV

**Gestión de cuadrillas**
- Ver listado de cuadrillas activas con su carga de trabajo
- Consultar cantidad de reclamos asignados por cuadrilla
- Ver rendimiento: reclamos resueltos y tiempos promedio
- Identificar cuadrillas sobrecargadas o disponibles

**Reportes**
- Estadísticas de reclamos por barrio
- Estadísticas por categoría de problema
- Tiempos de resolución promedio por tipo y cuadrilla
- Comparativas entre períodos

---

### Administrador

Tiene acceso a todas las funcionalidades del Supervisor, más:

**Dashboard ejecutivo**
- Métricas globales consolidadas del sistema
- Gráficos de tendencia (reclamos por día, semana y mes)
- Comparativas entre períodos anteriores
- Ranking de barrios con mayor cantidad de reclamos
- Performance comparativa de todas las cuadrillas
- Indicadores de eficiencia del sistema

**ABM de Cuadrillas**
- Crear nuevas cuadrillas con nombre y zona asignada
- Editar datos: nombre, zona de cobertura, especialidad
- Asignar usuarios con rol cuadrilla a cada equipo
- Activar o desactivar cuadrillas temporalmente
- Eliminar cuadrillas que no tengan trabajos pendientes

**Gestión de usuarios**
- Ver listado completo de usuarios registrados
- Cambiar rol de usuarios (vecino, cuadrilla, supervisor)
- Bloquear o desbloquear cuentas de usuario
- Ver actividad y estadísticas de cada usuario
- Resetear contraseñas manualmente

**Configuración del sistema**
- Gestionar categorías de reclamos (agregar, editar, desactivar)
- Definir zonas y barrios del municipio
- Configurar tiempos esperados de resolución por categoría
- Personalizar textos de notificaciones
- Configurar parámetros generales del sistema

---

## Categorías de Reclamos

| Categoría | Descripción | Ejemplos Típicos |
|-----------|-------------|------------------|
| **Alumbrado** | Problemas relacionados con iluminación pública | Luminaria apagada, poste caído, cable suelto, foco intermitente |
| **Bacheo** | Desperfectos en calzadas y calles | Pozo en calzada, hundimiento, rotura de pavimento, cordón roto |
| **Limpieza** | Acumulación de residuos y problemas de higiene | Basura acumulada, microbasural, contenedor roto o faltante |
| **Arbolado** | Problemas con árboles y vegetación urbana | Árbol caído, rama peligrosa, solicitud de poda, raíces que rompen vereda |
| **Tránsito** | Señalización vial y elementos de tránsito | Semáforo roto, cartel caído, falta de señalización, demarcación borrada |
| **Agua** | Problemas con la red de agua potable | Pérdida de agua, caño roto, falta de presión, agua turbia |
| **Cloacas** | Problemas con desagües y sistema cloacal | Obstrucción, desborde, boca de tormenta tapada, olores nauseabundos |
| **Espacios Verdes** | Mantenimiento de plazas y espacios públicos | Plaza descuidada, juegos rotos, pasto muy alto, bancos dañados |

---

## Ciclo de Vida del Reclamo

```
    ┌─────────────────────────────────────────────────────────────┐
    │                                                             │
    │   NUEVO ──────► ASIGNADO ──────► EN PROCESO ──────► RESUELTO
    │     │                                                       │
    │     │                                                       │
    │     └──────────────► RECHAZADO ◄────────────────────────────┘
    │                                                             │
    └─────────────────────────────────────────────────────────────┘
```

| Estado | Descripción | Responsable del cambio |
|--------|-------------|------------------------|
| **Nuevo** | Reclamo recién creado por el vecino, pendiente de revisión | Vecino (automático al crear) |
| **Asignado** | Se asignó una cuadrilla para atender el reclamo | Supervisor |
| **En Proceso** | La cuadrilla está trabajando activamente en el lugar | Cuadrilla |
| **Resuelto** | Trabajo completado exitosamente con solución registrada | Cuadrilla |
| **Rechazado** | Reclamo inválido, duplicado o fuera de la jurisdicción municipal | Supervisor |

---

## Flujo Operativo Detallado

### Paso 1: Vecino crea el reclamo

El vecino accede al sistema y completa el formulario de nuevo reclamo:

1. Selecciona la categoría que mejor describe el problema
2. Marca la ubicación exacta en el mapa interactivo (puede usar GPS del dispositivo)
3. Sube entre 1 y 5 fotos que evidencien el problema
4. Escribe una descripción detallada del inconveniente
5. Confirma y envía el reclamo

**Resultado:** El reclamo queda registrado con estado **NUEVO** y el vecino recibe confirmación con número de seguimiento.

### Paso 2: Supervisor revisa y asigna

El supervisor ve el nuevo reclamo en su bandeja de pendientes:

1. Revisa los datos, fotos y ubicación del reclamo
2. Valida que sea un reclamo procedente y dentro de la jurisdicción
3. **Si es válido:** Selecciona la cuadrilla más apropiada según zona y tipo de problema
4. **Si no es válido:** Rechaza el reclamo especificando el motivo

**Resultado válido:** Estado cambia a **ASIGNADO** y la cuadrilla recibe notificación.
**Resultado rechazado:** Estado cambia a **RECHAZADO** y el vecino recibe notificación con el motivo.

### Paso 3: Cuadrilla ejecuta el trabajo

La cuadrilla ve el reclamo asignado en su tablero de trabajo:

1. Revisa el detalle del reclamo (fotos, descripción, ubicación)
2. Se traslada al lugar usando la navegación integrada
3. Al llegar, marca "Iniciar trabajo" → Estado: **EN PROCESO**
4. Realiza la reparación o solución correspondiente
5. Toma fotos del trabajo realizado
6. Registra la descripción de la solución aplicada
7. Marca como resuelto → Estado: **RESUELTO**

**Resultado:** El reclamo queda cerrado con la solución documentada.

### Paso 4: Vecino recibe actualización

El vecino es notificado en cada cambio de estado:

1. Recibe email informando que su reclamo fue resuelto
2. Puede acceder al sistema para ver el detalle
3. Visualiza las fotos del trabajo realizado
4. Consulta la descripción de la solución aplicada
5. El reclamo queda en su historial para referencia futura

---

## Funcionalidades del Mapa

### Mapa de creación de reclamo (Vecino)

- Mapa interactivo centrado en los límites del municipio
- Click en cualquier punto para marcar la ubicación del problema
- Botón "Usar mi ubicación actual" que utiliza el GPS del dispositivo
- Buscador de direcciones para ubicar calles específicas
- Marcador arrastrable para ajustar la posición con precisión
- Zoom y navegación fluida por toda el área

### Mapa público de reclamos

- Visualización de todos los reclamos como marcadores en el mapa
- Código de colores según estado:
  - 🔴 Rojo: Nuevo (pendiente)
  - 🟡 Amarillo: Asignado o En Proceso
  - 🟢 Verde: Resuelto
  - ⚫ Gris: Rechazado
- Íconos diferenciados según categoría del reclamo
- Click en marcador muestra popup con resumen del reclamo
- Panel de filtros por categoría y estado
- Agrupación automática (clusters) en zonas con muchos reclamos
- Leyenda explicativa de colores e íconos

### Mapa de administración (Supervisor/Admin)

- Vista completa de todos los reclamos activos
- Filtros avanzados combinables
- Visualización de límites de zonas y barrios
- Heatmap de concentración de reclamos
- Identificación visual de zonas problemáticas
- Herramientas de selección por área

---

## Dashboard y Métricas

### Indicadores principales (KPIs)

| Indicador | Descripción |
|-----------|-------------|
| Total de reclamos | Cantidad de reclamos en el período seleccionado |
| Reclamos pendientes | Cantidad en estado Nuevo sin asignar |
| Reclamos en proceso | Cantidad actualmente siendo atendidos |
| Tiempo promedio de resolución | Días/horas promedio desde creación hasta resolución |
| Tasa de resolución | Porcentaje de reclamos resueltos vs total |
| Reclamos por día | Promedio de reclamos ingresados diariamente |

### Gráficos disponibles

- **Tendencia temporal:** Línea mostrando evolución de reclamos por día, semana o mes
- **Distribución por categoría:** Gráfico de torta con porcentaje por tipo de problema
- **Distribución por estado:** Barras horizontales con cantidad por estado
- **Ranking por barrio:** Lista ordenada de barrios con más reclamos
- **Performance por cuadrilla:** Comparativo de reclamos resueltos y tiempos
- **Comparativa de períodos:** Variación porcentual respecto al período anterior

### Filtros de período

- Hoy
- Ayer
- Esta semana
- Semana pasada
- Este mes
- Mes pasado
- Últimos 3 meses
- Últimos 6 meses
- Este año
- Rango de fechas personalizado

---

## Sistema de Notificaciones

| Evento | Destinatario | Canal | Contenido |
|--------|--------------|-------|-----------|
| Reclamo creado | Vecino | Email | Confirmación con número de reclamo |
| Reclamo creado | Supervisor | Sistema | Alerta de nuevo reclamo pendiente |
| Reclamo asignado | Cuadrilla | Email + Sistema | Detalle del nuevo trabajo asignado |
| Reclamo asignado | Vecino | Email | Aviso de que su reclamo fue asignado |
| Trabajo iniciado | Vecino | Email | Aviso de que están trabajando en su reclamo |
| Reclamo resuelto | Vecino | Email | Notificación con detalle de la solución |
| Reclamo rechazado | Vecino | Email | Notificación con motivo del rechazo |
| Reclamo demorado | Supervisor | Sistema | Alerta de reclamo que excede tiempo esperado |

---

## Reglas de Negocio

### Generales
- Un vecino solo puede ver y gestionar sus propios reclamos
- No se puede eliminar un reclamo del sistema, solo rechazar o resolver
- Todos los cambios de estado quedan registrados en el historial con fecha, hora y usuario
- Las acciones son irreversibles: un reclamo resuelto no puede volver a estados anteriores

### Creación de reclamos
- Las fotos son obligatorias al crear un reclamo (mínimo 1, máximo 5)
- La ubicación georreferenciada es obligatoria
- La descripción debe tener un mínimo de 20 caracteres
- Un vecino no puede crear más de 5 reclamos por día (límite configurable)
- La ubicación debe estar dentro de los límites del municipio

### Asignación
- Un reclamo solo puede tener una cuadrilla asignada a la vez
- Solo usuarios con rol Supervisor o Admin pueden asignar cuadrillas
- Al asignar, se puede establecer una prioridad (normal, urgente)
- Se recomienda asignar según zona de cobertura de la cuadrilla

### Resolución
- Una cuadrilla solo puede resolver reclamos que tenga asignados
- Al resolver, es obligatorio describir la solución aplicada (mínimo 20 caracteres)
- Se recomienda adjuntar al menos una foto del trabajo realizado
- El sistema registra automáticamente fecha y hora de resolución

### Rechazo
- El rechazo requiere especificar un motivo obligatoriamente
- Motivos válidos: duplicado, fuera de jurisdicción, no corresponde a categoría municipal, información insuficiente, otro
- Un reclamo rechazado no puede ser reabierto (el vecino debe crear uno nuevo)

### Cuadrillas
- Una cuadrilla no puede ser eliminada si tiene reclamos en estado Asignado o En Proceso
- Cada cuadrilla puede tener asignada una zona de cobertura y especialidades
- Se puede desactivar temporalmente una cuadrilla sin eliminarla

---

## Casos de Uso Específicos

### Caso 1: Reclamo duplicado

**Situación:** Un vecino crea un reclamo por un pozo en la calle, pero otro vecino ya había reportado el mismo problema.

**Proceso:**
1. El supervisor identifica que ya existe un reclamo activo para la misma ubicación
2. Rechaza el nuevo reclamo con motivo "Duplicado"
3. Opcionalmente indica en el motivo el número del reclamo original
4. El vecino recibe notificación explicando la situación

### Caso 2: Reclamo fuera de jurisdicción

**Situación:** Un vecino reporta un problema de agua, pero el servicio de agua es responsabilidad de una empresa provincial, no del municipio.

**Proceso:**
1. El supervisor identifica que no corresponde al municipio
2. Rechaza con motivo "Fuera de jurisdicción"
3. En el detalle del motivo, indica a qué organismo debe dirigirse el vecino
4. El vecino recibe notificación con la orientación correspondiente

### Caso 3: Reasignación de cuadrilla

**Situación:** Se asignó una cuadrilla pero está sobrecargada y no puede atender a tiempo.

**Proceso:**
1. El supervisor identifica la demora en el dashboard
2. Accede al reclamo y selecciona "Reasignar"
3. Elige otra cuadrilla disponible con menos carga
4. La nueva cuadrilla recibe notificación del trabajo
5. El sistema registra la reasignación en el historial

### Caso 4: Trabajo que requiere múltiples visitas

**Situación:** La cuadrilla inicia el trabajo pero necesita materiales que no tiene disponibles.

**Proceso:**
1. La cuadrilla marca el reclamo como "En Proceso"
2. Registra una nota explicando que se requiere volver con materiales
3. El reclamo permanece en estado "En Proceso"
4. Cuando completan el trabajo, registran la solución final y lo marcan como "Resuelto"

### Caso 5: Reclamo con fotos insuficientes

**Situación:** Las fotos enviadas por el vecino no permiten identificar bien el problema.

**Proceso:**
1. El supervisor puede agregar una nota solicitando más información
2. Alternativamente, asigna la cuadrilla para que verifique en el lugar
3. La cuadrilla documenta la situación real con sus propias fotos
4. Se procede con la resolución normal

---

## Preguntas Frecuentes (FAQ)

### Para Vecinos

**¿Cómo me registro en el sistema?**
Accedé a la página de registro, completá tus datos personales incluyendo DNI, email y domicilio dentro del municipio. Recibirás un email de confirmación para activar tu cuenta.

**¿Cuántos reclamos puedo crear?**
Podés crear hasta 5 reclamos por día. Si necesitás reportar más problemas, podés hacerlo al día siguiente.

**¿Puedo modificar un reclamo después de enviarlo?**
No, una vez enviado no se puede modificar. Si cometiste un error, podés crear un nuevo reclamo con la información correcta.

**¿Cómo sé en qué estado está mi reclamo?**
Podés verlo en la sección "Mis Reclamos" donde aparece el estado actual de cada uno. También recibirás notificaciones por email ante cada cambio.

**¿Por qué rechazaron mi reclamo?**
En el detalle del reclamo podés ver el motivo del rechazo. Los motivos más comunes son: reclamo duplicado, problema fuera de la jurisdicción municipal, o información insuficiente.

**¿Puedo ver reclamos de otros vecinos?**
Sí, en el mapa público podés ver todos los reclamos de la zona con información básica, pero no los datos personales de quien los creó.

### Para Cuadrillas

**¿Cómo sé qué trabajos tengo asignados?**
Al ingresar al sistema verás tu tablero de trabajo con todos los reclamos asignados, organizados por estado.

**¿Puedo rechazar un trabajo asignado?**
No directamente. Si hay algún problema con un trabajo asignado, debés comunicarte con tu supervisor para que reasigne el reclamo.

**¿Es obligatorio subir fotos del trabajo?**
Es muy recomendable como evidencia del trabajo realizado, aunque el sistema permite resolver sin fotos.

**¿Qué hago si no puedo resolver el problema en el momento?**
Dejá el reclamo en estado "En Proceso" y agregá una nota explicando la situación. Cuando puedas completar el trabajo, lo marcás como resuelto.

### Para Supervisores

**¿Cómo sé qué cuadrilla asignar?**
El sistema muestra la carga de trabajo de cada cuadrilla. Considerá la zona del reclamo, la especialidad de la cuadrilla y su disponibilidad actual.

**¿Puedo asignar varios reclamos a la vez?**
Sí, podés seleccionar múltiples reclamos y asignarlos masivamente a una cuadrilla.

**¿Cómo identifico reclamos demorados?**
En el dashboard aparecen alertas de reclamos que superan el tiempo esperado de resolución según su categoría.

---

## Glosario

| Término | Definición |
|---------|------------|
| **Reclamo** | Solicitud formal de un vecino para que el municipio atienda un problema urbano |
| **Cuadrilla** | Equipo de trabajo municipal encargado de resolver reclamos en el territorio |
| **Geolocalización** | Ubicación exacta de un punto mediante coordenadas geográficas (latitud y longitud) |
| **Tablero Kanban** | Visualización de tareas en columnas que representan diferentes estados |
| **ABM** | Alta, Baja y Modificación - operaciones básicas de gestión de datos |
| **KPI** | Key Performance Indicator - indicador clave de rendimiento |
| **Cluster** | Agrupación de múltiples marcadores en el mapa cuando están muy cerca entre sí |
| **Heatmap** | Mapa de calor que muestra concentración de puntos mediante colores |
| **Jurisdicción** | Área geográfica donde el municipio tiene competencia para actuar |
| **SLA** | Service Level Agreement - acuerdo de nivel de servicio con tiempos de respuesta |

---

## Anexos

### Tiempos de Resolución Esperados (Sugeridos)

| Categoría | Tiempo Normal | Tiempo Urgente |
|-----------|---------------|----------------|
| Alumbrado | 5 días | 48 horas |
| Bacheo | 10 días | 72 horas |
| Limpieza | 3 días | 24 horas |
| Arbolado | 7 días | 24 horas (si hay riesgo) |
| Tránsito | 5 días | 24 horas |
| Agua | 3 días | 12 horas |
| Cloacas | 3 días | 12 horas |
| Espacios Verdes | 15 días | 5 días |

*Nota: Los tiempos son configurables por cada municipio según su capacidad operativa.*

### Datos Requeridos para Cada Entidad

**Usuario Vecino:**
- Nombre y apellido
- DNI
- Email (único)
- Contraseña
- Teléfono
- Domicilio dentro del municipio

**Reclamo:**
- Categoría
- Ubicación (latitud, longitud)
- Dirección aproximada (calculada automáticamente)
- Descripción
- Fotos (1-5)
- Usuario creador
- Fecha de creación
- Estado actual
- Cuadrilla asignada (opcional)
- Fecha de resolución (cuando aplica)
- Descripción de solución (cuando aplica)

**Cuadrilla:**
- Nombre
- Zona de cobertura
- Especialidades (opcional)
- Estado (activa/inactiva)
- Usuarios asignados

**Historial de Reclamo:**
- Reclamo
- Estado anterior
- Estado nuevo
- Usuario que realizó el cambio
- Fecha y hora
- Notas (opcional)

---

*Documento generado para el Sistema de Gestión de Reclamos Municipales*
*Versión 1.0*