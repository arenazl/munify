# Manual de Testing - Sistema de Gestión Municipal (SGM)

## 📋 Información General

**URL Base**: https://reclamos-mun.netlify.app
**Versión**: v1.0
**Fecha**: 15 de enero de 2026

## 🎯 Alcance del Sistema

El SGM es una plataforma completa para la gestión de reclamos y trámites municipales que conecta a **3 tipos de usuarios**:

1. **Vecinos** - Ciudadanos que reportan problemas
2. **Empleados** - Personal municipal que resuelve los reclamos
3. **Supervisores** - Gestores que supervisan y asignan tareas

---

## 🚀 Inicio de Testing

### 1. Acceso a la Aplicación

**URL Inicial**: https://reclamos-mun.netlify.app/bienvenido

#### Pantalla de Bienvenida
- **Título**: "Tu voz importa en tu ciudad"
- **Descripción**: "Reporta problemas, sigue el estado de tus reclamos y ayuda a mejorar tu comunidad"
- **Características mostradas**:
  - ⏱️ **Rápido** - En minutos
  - 🔒 **Seguro** - Datos protegidos
  - 👥 **Comunidad** - Juntos mejor

#### Estadísticas del Sistema
- **7 Municipios** activos
- **24/7 Disponible**
- **100% Gratis**

---

### 2. Selección de Municipio

**Municipios Disponibles**:
1. **La Plata** (la-plata)
2. **Municipalidad de San Martín** (san-martin)
3. **Merlo** (merlo) ⭐ *Usar para testing*
4. **San Isidro** (san-isidro)

**Acción**: Click en "Merlo" para continuar

---

### 3. Opciones de Acceso

Después de seleccionar el municipio, aparecen las siguientes opciones:

#### Opción 1: Sin Registro (Recomendado para Testing)
- **Botón**: "Continuar sin registrarme" (Verde)
- **Descripción**: "Podés hacer reclamos sin crear una cuenta"
- **Ventaja**: Acceso inmediato, ideal para testing rápido

#### Opción 2: Iniciar Sesión
- **Botón**: "Iniciar Sesión" (Azul)
- **Para**: Usuarios registrados (vecinos, empleados, supervisores)

#### Opción 3: Crear Cuenta
- **Botón**: "Crear Cuenta" (Gris)
- **Para**: Vecinos que quieren registro permanente

#### Opción 4: Ver Mapa
- **Link**: "Ver Mapa de Reclamos"
- **Función**: Visualizar reclamos públicos sin login

---

## 👤 Testing como VECINO

### Acceso Rápido (Sin Registro)

**Paso 1**: Click en "Continuar sin registrarme"
**Resultado**: Acceso automático al panel de vecino con usuario temporal

### Panel Principal del Vecino

**URL**: `/gestion/mi-panel`

#### Bienvenida Personalizada
```
¡Hola, Diego!
Bienvenido a tu panel de reclamos
```

#### Métricas del Vecino
El panel muestra 4 tarjetas principales:

1. **Total** 📋
   - Cantidad: 6 reclamos

2. **Pendientes** ⏱️
   - Cantidad: 3 reclamos

3. **Resueltos** ✅
   - Cantidad: 2 reclamos

4. **Rechazados** ⚠️
   - Cantidad: 1 reclamo

#### Estadísticas del Municipio (Sidebar Derecha)

**Merlo - Estadísticas**:
- **Tasa de resolución**: 39.3% 📈
- **Días promedio**: 5.4 días ⏰
- **Calificación**: 4.1 ⭐
- **Atendidos**: 4242 reclamos 📊

**Categorías más reportadas**:
1. Alumbrado Público: 355
2. Baches y Calles: 337
3. Desagües Pluviales: 337
4. Señalización Vial: 331

#### Reclamos Recientes
Lista de reclamos con:
- **#ID** y **Estado** (badge coloreado)
- **Título** del reclamo
- **📍 Ubicación** completa
- **→** Botón para ver detalles

Ejemplo:
```
#5485 | Asignado
Pozo
📍 Cochabamba, San Antonio de Padua, Partido de Merlo, Buenos Aires, 1718, Argentina
```

#### Accesos Rápidos
- **📋 Mis Reclamos**: Ver historial completo
- **🗺️ Ver Mapa**: Reclamos en tu zona

---

### Crear un Nuevo Reclamo

**Acceso**: Botón naranja "Nuevo Reclamo" (esquina superior derecha)

**URL**: `/gestion/crear-reclamo`

#### Flujo de Creación (5 Pasos)

---

#### **PASO 1: Describir el Problema**

**Título**: "Contanos tu problema"
**Descripción**: "Describí lo que querés reportar y te ayudaremos a clasificarlo"

**Asistente IA** 🤖:
- **Mensaje**: "¡Hola! 👋 Soy tu asistente virtual. Contame, ¿qué problema querés reportar?"
- **Tiempo estimado**: 2-3 min

**Campo de Texto**:
- Placeholder: "Escribí tu problema aquí..."
- Ejemplo sugerido: "Hay un bache grande en la esquina de mi casa que es peligroso para los autos"

**Funcionalidad del Asistente**:
- ✅ **Clasificación automática** con IA
- ✅ **Sugerencia de categoría** en tiempo real
- ✅ **Nivel de confianza** mostrado (ej: "Confianza: 200%")

**Test Case Ejemplo**:
```
Input: "Hay un bache enorme en la calle que es peligroso"
Output:
  - Categoría sugerida: "Baches y Calles"
  - Confianza: 200%
  - Badge: "Categoría sugerida" (amarillo)
```

**Botón**: "Confirmar" para aceptar la categoría sugerida

---

#### **PASO 2: Seleccionar Categoría**

**Título**: "¿Qué problema querés reportar?"
**Descripción**: "Seleccioná la categoría que mejor describa el problema"

**Categorías Disponibles** (Grid de 3 columnas):

1. ⚡ **Alumbrado Público**
2. 🐕 **Animales Sueltos**
3. 🌳 **Arbolado Público**
4. 🚧 **Baches y Calles** *(pre-seleccionada en el ejemplo)*
5. 💧 **Desagües Pluviales**
6. 🌿 **Espacios Verdes**
7. 🗑️ **Limpieza Urbana**
8. 🔊 **Ruidos Molestos**
9. 🚦 **Señalización Vial**
10. 🚶 **Veredas**

**Características**:
- ✅ Iconos visuales para cada categoría
- ✅ Categoría sugerida por IA ya seleccionada
- ✅ Posibilidad de cambiar manualmente
- ✅ Buscador de categorías (si hay muchas opciones)

**Tips del Asistente**:
- 💡 "Elegí la categoría más adecuada"
- 💡 "Usá el buscador si hay muchas opciones"

**Botón**: "Siguiente" para continuar

---

#### **PASO 3: Ubicación del Problema**

**Título**: "¿Dónde está el problema?"
**Descripción**: "Indicá la dirección y ubicación del reclamo"

**Campos del Formulario**:

1. **Dirección*** (Obligatorio)
   - Campo: Autocompletar con búsqueda
   - Placeholder: "Escribí para buscar direcciones..."
   - Tecnología: Integración con API de mapas

2. **Zona/Barrio**
   - Dropdown: "Seleccionar zona"
   - Opciones: Barrios del municipio

3. **Ubicación en el mapa** (Opcional)
   - Mapa interactivo: OpenStreetMap
   - Controles: Zoom (+/-), Pan
   - Marcador: Click en el mapa para ubicación exacta
   - Providers: Leaflet © OpenStreetMap

4. **Referencia** (Opcional)
   - Campo de texto libre
   - Placeholder: "Ej: Frente a la plaza, cerca del hospital"
   - Ayuda: Información adicional para localizar

**Tips del Asistente**:
- 💡 "Indicá la dirección exacta"
- 💡 "Usá el mapa para ajustar la ubicación"

**Progreso**: Paso 3 de 5 (barra de progreso naranja)

**Botones**:
- "← Anterior" (izquierda)
- "Siguiente →" (derecha, naranja)

---

#### **PASO 4: Detalles Adicionales** *(Próximo paso a explorar)*

---

#### **PASO 5: Confirmación y Envío** *(Próximo paso a explorar)*

---

### Menú Lateral (Sidebar)

**Opciones disponibles para el vecino**:

1. 🏠 **Mi Panel** (activo por defecto)
   - Dashboard con resumen

2. ➕ **Nuevo Reclamo** (naranja destacado)
   - Crear reclamo nuevo

3. 📋 **Mis Reclamos**
   - Lista completa de reclamos propios
   - Historial y estados

4. 📄 **Mis Trámites**
   - Gestión de trámites municipales

5. 🗺️ **Mapa**
   - Ver reclamos en el mapa del municipio

6. 🏆 **Logros**
   - Gamificación: puntos, badges
   - Sistema de recompensas

---

## 👷 Testing como EMPLEADO

### Acceso

**Opción 1**: Click en "Iniciar Sesión" desde la pantalla de selección de municipio

**Opción 2**: Usar usuarios demo disponibles (MODO DEMO):
- **Juan Perez** - Empleado (botón verde) ⭐ *Recomendado para testing*
- **Carlos Rodriguez** - Empleado (botón verde)
- **Miguel Fernandez** - Empleado (botón verde)
- **Luis García** - Empleado (botón verde)
- **Roberto Martínez** - Empleado (botón verde)
- **María González** - Empleado (botón verde)
- **Ana Martínez** - Empleado (botón verde)

**Acción**: Click en "Juan Perez" para acceder como empleado

---

### Panel Principal del Empleado

**URL**: `/gestion/mis-trabajos`

#### Encabezado
```
Municipalidad: Merlo
Usuario: Juan Perez - Empleado
```

#### Vista "Mis Trabajos"

**Descripción**: Dashboard principal donde el empleado ve todos los trabajos (reclamos y trámites) asignados a él.

**Métricas principales** (filtros por estado):
- **Todos**: 50 trabajos totales
- **Nuevo**: 0 trabajos sin iniciar
- **Asignado**: 13 trabajos pendientes de comenzar
- **En Proceso**: 13 trabajos en ejecución
- **Resuelto**: 24 trabajos finalizados exitosamente
- **Rechazado**: 6 trabajos no completados

**Filtros por categoría disponibles**:
- ⚡ Alumbrado: 8
- 🐕 Animales: 5
- 🌳 Arbolado: 4
- 🚧 Baches: 6
- 💧 Desagües: 7
- 🌿 Espacios: 5
- 🗑️ Limpieza: 5
- 🔊 Ruidos: 6
- 🚦 Señalización: 5
- 🚶 Veredas: 2

**Ordenamiento**:
- "Más recientes" (por defecto)
- "Por vencer"

**Vistas**:
- Lista (por defecto)
- Grid/Tarjetas

---

#### Lista de Trabajos

**Columnas mostradas**:
1. **#** - Número de reclamo
2. **Título** - Descripción del problema
3. **Ubicación** 📍 - Dirección completa
4. **Estado** - Badge coloreado (Nuevo/Asignado/En Proceso/Resuelto/Rechazado)
5. **Vecino** - Solicitante del reclamo
6. **Empleado** - Asignado (siempre "Juan" en este caso)
7. **Creación** - Fecha de creación
8. **Actualización** - Última modificación

**Ejemplo de trabajo en la lista**:
```
#6983 | Resuelto
arbol ombu de 200 años
📍 Luan 3443, Avenida Nicolás, Villa Udaondo...
Vecino: Ana López
Empleado: Juan
Creación: 1/1/2026
Actualización: 1/1/2026
```

---

### Gestión de un Trabajo

**Acceso**: Click en cualquier trabajo de la lista

**URL**: `/gestion/mis-trabajos` (panel lateral se abre)

#### Panel de Detalle del Trabajo

**Encabezado**:
```
Reclamo #6896 - 28/12/25
Problema de alumbrado público
```

**Pestañas disponibles**:
1. **🔄 En Proceso** - Estado actual (tab activo)
2. **⚡ Alumbrado Público** - Categoría
3. **📜 Historial** - Timeline de eventos

---

#### Pestaña "En Proceso"

**Dirección completa**:
```
📍 Italia, San Antonio de Padua, Partido de Merlo, Buenos Aires, 1718, Argentina
```

**Sección: Descripción del Reclamo**
```
Luz no alumbre
```

**Sección: Datos del Vecino**
- **Nombre**: Emmanuel -
- **Email**: 📧 emaditomaso@hotmail.com

**Sección: Empleado Asignado**
- **Nombre**: Juan Perez
- **Especialidad**: Bacheo y Calles

---

**Sección: Finalizar Trabajo**

**Opciones de finalización**:
- ✅ **Trabajo Exitoso** (botón verde con borde)
- ❌ **No Finalizado** (botón gris)

**Campo de texto**:
- Placeholder: "Describe cómo se resolvió el problema"
- Obligatorio para finalizar

**Botón principal**:
- 🟢 **"Marcar Resuelto"** (verde, bottom)

**Funcionalidad**:
1. Empleado selecciona "Trabajo Exitoso" o "No Finalizado"
2. Escribe una descripción de la resolución
3. Click en "Marcar Resuelto"
4. El sistema cambia el estado del reclamo
5. Notifica al vecino automáticamente

---

#### Pestaña "Historial"

**Muestra timeline cronológico**:

**Ejemplo**:
```
🟢 En proceso | En Proceso
Trabajo iniciado
Diego Sánchez - 15-ene, 09:46 a.m.

👤 Asignado | Asignado
look - Programado para 2026-01-02 de 11:00:00 a 12:00:00
Ana López - 01-ene, 09:36 p.m.

📋 Creado | Nuevo
Reclamo creado
Laura Martinez - 01-ene, 12:54 p.m.
```

**Información mostrada en cada evento**:
- 🔵 Icono de estado
- **Título del evento** | Badge de estado
- Descripción del cambio
- Usuario responsable
- Fecha y hora exacta

---

### Mi Rendimiento

**URL**: `/gestion/mi-rendimiento`

**Descripción**: Dashboard de estadísticas personales del empleado

#### Métricas Principales (Cards superiores)

1. **🎯 Total asignados**
   - Cantidad: 0 (en el caso de prueba)

2. **✅ Resueltos**
   - Cantidad: 0

3. **⏱️ En proceso**
   - Cantidad: 0

4. **📈 Tasa resolución**
   - Porcentaje: 0%

#### Estadísticas Mensuales

**Este Mes**:
- Reclamos resueltos: 0

**Tiempo Promedio**:
- Días por reclamo: 0.0

**Rendimiento**:
- Estado: "En progreso" (badge naranja)

#### Gráficos y Visualizaciones

**Nota**: Cuando el empleado tiene trabajos asignados, se muestran:
- Gráfico de barras de trabajos por mes
- Tendencia de resolución
- Comparativa con otros empleados
- Ranking de performance

**Mensaje cuando no hay datos**:
```
📊 Aún no tenés reclamos asignados. Las estadísticas aparecerán cuando comiences a trabajar.
```

---

### Menú Lateral (Sidebar) - Empleado

**Opciones disponibles**:

1. 📋 **Mis Trabajos** (naranja destacado)
   - Lista de reclamos/trámites asignados
   - Vista principal del empleado

2. 🗺️ **Mapa**
   - Ver ubicaciones de trabajos asignados
   - Planificar recorrido

3. 📊 **Mi Rendimiento**
   - Estadísticas personales
   - Métricas de performance

4. 📜 **Mi Historial**
   - Trabajos completados
   - Registro histórico

---

## 👨‍💼 Testing como SUPERVISOR

### Acceso

**Opción 1**: Click en "Iniciar Sesión" desde la pantalla de selección de municipio

**Opción 2**: Usar usuario demo disponible (MODO DEMO):
- **Ana López** - Supervisor (botón naranja) ⭐ *Recomendado para testing*

**Acción**: Click en "Ana López" para acceder como supervisor

---

### Dashboard Principal del Supervisor

**URL**: `/gestion`

#### Encabezado
```
Municipalidad de Merlo
Monitoreo en tiempo real de gestión municipal
```

**Información destacada**:
- 📋 **3285 reclamos** totales
- ⏱️ **6.6d promedio** de resolución
- 🏢 **Merlo** - Municipio activo
- 🟢 **En vivo** - Datos en tiempo real

---

#### Métricas Principales (Cards Superiores)

1. **TOTAL RECLAMOS**
   - Cantidad: 3285
   - Variación: +12% vs mes ant. (verde)

2. **NUEVOS HOY**
   - Cantidad: 0
   - Variación: +5 vs mes ant. (verde)

3. **ESTA SEMANA**
   - Cantidad: 0
   - Variación: -8% vs mes ant. (rojo)

4. **TIEMPO PROMEDIO**
   - Duración: 6.6 días
   - Variación: -0.5d vs mes ant. (verde)

---

#### Gráfico: Por Estado

**Distribución de reclamos por estado (Donut Chart)**:
- 🟠 **En Proceso**: Mayor porción
- 🔵 **Asignado**: Segunda mayor porción
- 🟢 **Resuelto**: Porción significativa
- ⚫ **Nuevo**: Porción pequeña
- 🔴 **Rechazado**: Porción mínima

**Nota adicional**: "Pendiente Confirmación" también visible

---

#### Mapa de Calor - Concentración de Reclamos

**Tecnología**: OpenStreetMap + Leaflet

**Descripción**: Visualización geográfica mostrando:
- Puntos rojos (clusters): Zonas con mayor concentración
- Números sobre clusters: Cantidad de reclamos en la zona
- Mapa interactivo: Zoom y pan habilitados

**Datos mostrados**:
- "1383 puntos en los últimos 90 días"

**Leyenda del mapa** (categorías más frecuentes):
- 🔶 Alumbrado: 174
- 🟥 Baches y Calles: 135
- 🔵 Desagües: 150
- 🟩 Espacios Verdes: 141
- 🟣 Señalización: 129
- 🔷 Basura: 142
- ⚫ Otros: 512

---

#### Top Categorías (Ranking)

**5 categorías más reportadas**:

1. **Alumbrado Público**: 355 reclamos (11%)
   - Barra: Naranja

2. **Baches y Calles**: 337 reclamos (10%)
   - Barra: Verde

3. **Desagües Pluviales**: 337 reclamos (10%)
   - Barra: Azul

4. **Señalización Vial**: 331 reclamos (10%)
   - Barra: Morado

5. **Ruidos Molestos**: 330 reclamos (10%)
   - Barra: Rojo

---

#### Sección Inferior: Analytics por Barrio/Zona

**Pestañas disponibles**:
- 🏘️ **Barrios** (activa)
- ⏰ **Tiempos**
- 🔄 **Recurrentes**
- 📈 **Tendencias**
- 🗂️ **Categorías**

**Vista "Reclamos por Barrio/Zona"**:

Gráfico de barras horizontales mostrando:
- **Merlo Centro**: 369 reclamos
- **Parque San Martín**: 349 reclamos
- **Libertad**: 345 reclamos
- **Villa Progreso**: 343 reclamos
- **Mariano Acosta**: 326 reclamos

**Cobertura por Zona** (panel derecho):

Listado con % de reclamos resueltos:
- **Parque San Martín**: 10.8% resueltos (16)
- **Barrio Castelar**: 10.8% resueltos (16)
- **Merlo Centro**: 33.3% resueltos (35)
- **Mariano Acosta**: 36.8% resueltos (19)
- **Libertad**: 38.9% resueltos (18)

**Información adicional**:
- "Zonas críticas: 2" (en rojo)
- "Resolución global: 45%"

---

### Gestión de Reclamos (Supervisor)

**URL**: `/gestion/reclamos`

#### Vista Principal de Reclamos

**Buscador**: Campo de búsqueda "Buscar reclamos..."

**Filtros superiores** (Categorías):
- Alumbrado (8)
- Animales (5)
- Arbolado (4)
- Baches (6)
- Desagües (7)
- Espacios (5)
- Limpieza (5)
- Ruidos (6)
- Señalización (5)
- Veredas (2)

**Filtros por Estado**:
- Todos (805)
- Nuevo (200)
- Revisión (181)
- Proceso (115)
- Aprobado (75)
- Finalizado (76)
- Rechazado (40)

**Ordenamiento**:
- "Más recientes" (default)
- "Por vencer"

**Vistas disponibles**:
- 📋 Lista
- 📊 Tablero (Kanban)
- 📅 Calendario

---

#### Tabla de Reclamos

**Columnas**:
1. **# ID** - Número de reclamo
2. **Título** - Descripción breve
3. **Categoría** - Con icono
4. **Ubicación** 📍 - Dirección
5. **Estado** - Badge coloreado
6. **Vecino** - Solicitante
7. **Empleado** - Asignado
8. **Creación** - Fecha
9. **Actualización** - Última modificación
10. **Acciones** - Botones

**Ejemplo de fila**:
```
#6905 | Problema de alumbrado público
⚡ Alumbrado Público
📍 Cochabamba 230, San Antonio de Padua
🟠 En Proceso
Vecino: Laura Martinez
Empleado: Diego Sánchez - Inspector Municipal
Creación: 01/01/26
```

---

### Detalle y Asignación de Reclamo

**Acceso**: Click en cualquier reclamo de la lista

**URL**: `/gestion/reclamos/:id`

#### Panel Lateral de Reclamo

**Encabezado**:
```
Reclamo #6905 - 01/01/26
Problema de alumbrado público
```

**Pestañas**:
1. **🔄 En Proceso** - Datos principales
2. **⚡ Alumbrado Público** - Categoría
3. **📜 Historial** - Timeline

---

#### Pestaña "En Proceso"

**Información del Vecino**:
- **Nombre**: Laura Martinez
- **Email**: 📧 vecino4@merlo.test.com
- **Teléfono**: ☎️ 11-2185-2495

**Empleado Asignado** 👷:
- **Nombre**: Diego Sánchez
- **Especialidad**: Inspector Municipal

**Sección: Finalizar Trabajo**

**Opciones**:
- ✅ **Trabajo Exitoso**
- ❌ **No Finalizado**

**Campo de descripción**:
- Placeholder: "Describe cómo se resolvió el problema"

**Botón principal**:
- 🟢 **"Marcar Resuelto"** (verde)

---

#### Pestaña "Historial"

**Timeline de eventos**:
```
🟢 En proceso | En Proceso
Trabajo iniciado
Diego Sánchez - 15-ene, 09:46 a.m.

👤 Asignado | Asignado
look - Programado para 2026-01-02 de 11:00:00 a 12:00:00
Ana López - 01-ene, 09:36 p.m.

📋 Creado | Nuevo
Reclamo creado
Laura Martinez - 01-ene, 12:54 p.m.
```

**Funcionalidad**:
- Trazabilidad completa del reclamo
- Registro de todos los cambios de estado
- Usuario responsable de cada acción
- Timestamp exacto

**Sección: Agregar comentario**
- Campo de texto: "Escribe información adicional o una pregunta..."
- Nota: "Tu comentario será visible para los empleados municipales"
- Botón: **"Enviar"** (naranja)

---

### Gestión de Trámites (Supervisor)

**URL**: `/gestion/tramites`

**Descripción**: Similar a reclamos pero para trámites administrativos

#### Filtros superiores (Tipos de Trámite):
- Todos (805)
- 🏗️ Obras (67)
- 🏪 Comercio (89)
- 🚗 Tránsito (77)
- 🌳 Espacios (77)
- 🏘️ Catastro (87)
- 🏗️ Desarrollo (93)
- 💰 Rentas (91)
- 🏥 Salud (67)
- 🎭 Cultura (80)
- ⚖️ Legales

**Filtros por Estado**:
- Todos (805)
- Nuevo (200)
- Revisión (181)
- Proceso (115)
- Aprobado (75)
- Finalizado (76)
- Rechazado (40)

**Ejemplos de trámites**:
```
SOL-2825-00526
Cultura y Educación - Inscripción a Talleres
Solicitante: Carlos García (DNI: 35462161)
Asunto: Solicitud de certificado - ...
Estado: 🔵 Iniciado
Sin asignar
Creación: 26/12/2025
Vencido (10d)
```

**Diferencias con Reclamos**:
- Trámites tienen **número de solicitud** (SOL-XXXX-XXXXX)
- Trámites tienen **DNI del solicitante**
- Trámites pueden estar **Sin asignar** (esperando asignación administrativa)
- Trámites tienen **vencimientos** más estrictos
- Empleados asignados son **administrativos** (no operarios)

---

### Mapa Geográfico (Supervisor)

**URL**: `/gestion/mapa`

**Título**: "Mapa de Reclamos"

**Estado**: "🔄 Cargando más..." (mensaje temporal al cargar)

#### Filtros Superiores

**Todos**: 2596 reclamos visibles

**Por Estado**:
- 🔵 **Nuevo** (249)
- 🔵 **Asignado** (431)
- 🟠 **En Proceso** (642)
- 🟣 **Pend. Confirmación** (1)
- 🟢 **Resuelto** (1154)
- 🔴 **Rechazado** (119)

#### Mapa Interactivo

**Tecnología**: Leaflet + OpenStreetMap

**Funcionalidad**:
- Zoom (+/-) interactivo
- Pan para explorar
- Marcadores de colores según estado
- Clusters para zonas con muchos reclamos
- Click en marcador: Ver detalle del reclamo

**Marcadores por color**:
- 🔵 Azul: Nuevo/Asignado
- 🟠 Naranja: En Proceso
- 🟢 Verde: Resuelto
- 🟣 Morado: Pendiente Confirmación
- 🔴 Rojo: Rechazado

**Cobertura geográfica**: Todo el municipio de Merlo y alrededores

---

### Tablero Kanban (Supervisor)

**URL**: `/gestion/tablero`

**Título**: "Tablero"

#### Filtro de Fecha

**Selector de rango**:
- Desde: 01/14/2026
- Hasta: 01/16/2026
- Botón "×" para limpiar

**Buscador**: Campo "Buscar..."

#### Columnas del Tablero

**5 columnas drag & drop**:

1. **🔴 Nuevos** (0)
   - Reclamos sin asignar
   - Drop zone activo

2. **🔵 Asignados** (0)
   - Reclamos asignados a empleado
   - Drop zone activo

3. **🟠 En Proceso** (0)
   - Empleado trabajando
   - Drop zone activo

4. **🟣 Pend. Confirmación** (0)
   - Esperando aprobación
   - Drop zone activo

5. **🟢 Resueltos** (0)
   - Finalizados exitosamente
   - Drop zone activo

**Funcionalidad**:
- **Drag & Drop**: Arrastrar tarjetas entre columnas para cambiar estado
- **Actualización automática**: Al soltar, el estado cambia en el sistema
- **Mensaje cuando está vacío**: "Sin reclamos. Arrastra aquí para mover"

**Instrucción**:
- "Arrastra las tarjetas entre columnas para cambiar el estado de los reclamos"

---

### Planificación Semanal (Supervisor)

**URL**: `/gestion/planificacion`

**Título**: "Planificación Semanal"
**Período**: enero de 2026

#### Navegación Temporal

**Controles**:
- ← Flecha izquierda (semana anterior)
- **HOY** (botón naranja - ir a semana actual)
- Flecha derecha → (semana siguiente)
- "Fin de semana" (toggle)
- 🔽 Filtro adicional

#### Vista Semanal (Grid)

**Columnas de días**:
- LUN 12 (día 12)
- MAR 13 (día 13)
- MIE 14 (día 14)
- JUE 15 (día 15)
- **VIE 16** (día 16 - destacado en azul como "hoy")

#### Lista de Empleados (13 empleados)

**Formato de cada empleado**:
```
[Avatar] Nombre del Empleado
        [CFEE] Turno
        [Badge] Especialidad
```

**Ejemplos**:
1. **Ana Martinez**
   - Turno: CFEE (Operario)
   - Especialidad: Supervisora de Limpieza

2. **Carlos Rodriguez**
   - Turno: CFEE (Norte)
   - Especialidad: Baches y Calles

3. **Diego Sánchez**
   - Turno: CFEE
   - Especialidad: Inspector Municipal

4. **Juan Perez**
   - Turno: CFEE (Centro)
   - Especialidad: Baches y Calles

5. **Laura López**
   - Turno: CFEE
   - Especialidad: Coordinadora de Obras

6. **Luis García**
   - Turno: CFEE
   - Especialidad: Espacios Verdes

*... y 7 empleados más*

#### Celdas de Planificación

**Estado por defecto**:
- "Sin tareas" (gris claro)

**Funcionalidad esperada** (no visible en demo actual):
- Click en celda: Asignar tarea
- Ver tareas programadas
- Drag & drop para reorganizar
- Indicadores de carga de trabajo

---

### Menú Lateral (Sidebar) - Supervisor

**Opciones disponibles**:

1. 📊 **Dashboard** (Inicio)
   - Métricas generales
   - Mapa de calor
   - Top categorías

2. 📋 **Reclamos**
   - Lista completa de reclamos
   - Asignación a empleados
   - Gestión de estados

3. 📄 **Trámites**
   - Gestión de trámites administrativos
   - Asignación a personal administrativo

4. 🗺️ **Mapa**
   - Vista geográfica de todos los reclamos
   - Filtros por estado

5. 📊 **Tablero**
   - Vista Kanban drag & drop
   - Gestión visual de estados

6. 📅 **Planificación**
   - Calendario semanal
   - Asignación de empleados
   - Programación de tareas

7. 📈 **SLA**
   - Service Level Agreements
   - Métricas de cumplimiento
   - KPIs de rendimiento

8. 📤 **Exportar**
   - Exportar datos a Excel/CSV
   - Generar reportes

---

## 🔧 Funcionalidades Clave a Testear

### 1. Clasificación Automática con IA
- ✅ Ingreso de descripción en lenguaje natural
- ✅ Sugerencia automática de categoría
- ✅ Nivel de confianza mostrado
- ✅ Posibilidad de cambiar categoría

### 2. Geolocalización
- ✅ Búsqueda de direcciones con autocompletar
- ✅ Mapa interactivo (OpenStreetMap)
- ✅ Marcador de ubicación precisa
- ✅ Selector de zona/barrio

### 3. Sistema Multirol
- ✅ Vecinos: crear y seguir reclamos
- ✅ Empleados: resolver reclamos asignados
- ✅ Supervisores: gestionar y asignar

### 4. Seguimiento en Tiempo Real
- ✅ Estados de reclamos: Nuevo, Asignado, En Proceso, Resuelto, Rechazado
- ✅ Notificaciones de cambios
- ✅ Historial completo

### 5. Gamificación
- ✅ Sistema de logros
- ✅ Puntos por participación
- ✅ Badges y recompensas

---

## 📊 Estados de Reclamos

| Estado | Color | Descripción |
|--------|-------|-------------|
| **Nuevo** | Azul | Reclamo recién creado, sin asignar |
| **Asignado** | Azul | Asignado a un empleado específico |
| **En Proceso** | Amarillo | Empleado trabajando en la resolución |
| **Resuelto** | Verde | Problema solucionado completamente |
| **Rechazado** | Rojo | Reclamo rechazado con justificación |

---

## 🧪 Casos de Prueba Sugeridos

### Test Case 1: Crear Reclamo como Vecino Sin Registro
**Objetivo**: Verificar que un vecino puede crear un reclamo sin registrarse

**Pasos**:
1. Ir a https://reclamos-mun.netlify.app/bienvenido
2. Seleccionar "Merlo"
3. Click en "Continuar sin registrarme"
4. Click en "Nuevo Reclamo"
5. Escribir: "Hay una luminaria rota que deja la calle oscura"
6. Verificar que sugiere "Alumbrado Público"
7. Confirmar categoría
8. Completar ubicación
9. Finalizar reclamo

**Resultado Esperado**: Reclamo creado exitosamente con ID asignado

---

### Test Case 2: Asistente IA - Clasificación Correcta
**Objetivo**: Verificar que la IA clasifica correctamente diferentes tipos de problemas

**Pasos**:
1. Acceder como vecino
2. Crear nuevo reclamo
3. Probar diferentes descripciones:
   - "Bache peligroso" → Debe sugerir "Baches y Calles"
   - "Basura acumulada" → Debe sugerir "Limpieza Urbana"
   - "Perros sueltos" → Debe sugerir "Animales Sueltos"
   - "Semáforo roto" → Debe sugerir "Señalización Vial"

**Resultado Esperado**: Clasificación correcta en todos los casos

---

### Test Case 3: Flujo Completo Empleado
**Objetivo**: Verificar que un empleado puede tomar, trabajar y resolver un reclamo

**Pasos**:
1. Login como empleado (Juan Perez - MODO DEMO)
2. Ver reclamos asignados
3. Tomar un reclamo nuevo
4. Cambiar estado a "En Proceso"
5. Agregar comentario
6. Subir foto del trabajo
7. Marcar como "Resuelto"

**Resultado Esperado**: Reclamo resuelto y notificación enviada al vecino

---

### Test Case 4: Dashboard Supervisor
**Objetivo**: Verificar que el supervisor tiene visibilidad completa

**Pasos**:
1. Login como supervisor (Ana López - MODO DEMO)
2. Verificar métricas en dashboard:
   - Total de reclamos
   - Tasa de resolución
   - Tiempo promedio
   - Mapa de calor
3. Asignar un reclamo sin asignar a un empleado
4. Ver estadísticas por categoría

**Resultado Esperado**: Todas las métricas visibles y funcionales

---

## 🌐 Tecnologías Utilizadas

- **Frontend**: React + TypeScript + Vite
- **Mapas**: Leaflet + OpenStreetMap
- **IA**: Clasificación automática con NLP
- **UI**: Tailwind CSS
- **Deploy**: Netlify
- **Backend**: API REST (URL no mostrada en frontend)

---

## 📱 Navegadores Compatibles

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile: iOS Safari, Chrome Mobile

---

## 🔗 URLs Importantes

| Sección | URL |
|---------|-----|
| Bienvenida | `/bienvenido` |
| Panel Vecino | `/gestion/mi-panel` |
| Nuevo Reclamo | `/gestion/crear-reclamo` |
| Mis Reclamos | `/gestion/mis-reclamos` |
| Mapa | `/gestion/mapa` |
| Trámites | `/gestion/mis-tramites` |
| Logros | `/gestion/logros` |

---

## ✅ Checklist de Testing

### Funcionalidad Básica
- [ ] Selección de municipio funciona correctamente
- [ ] Acceso sin registro funciona
- [ ] Login con usuario registrado funciona
- [ ] Crear cuenta nueva funciona

### Vecino
- [ ] Panel muestra métricas correctas
- [ ] Crear reclamo completo funciona
- [ ] IA sugiere categorías correctamente
- [ ] Mapa de ubicación funciona
- [ ] Ver mis reclamos muestra historial
- [ ] Ver mapa muestra reclamos públicos
- [ ] Sistema de logros funciona

### Empleado
- [ ] Ver reclamos asignados
- [ ] Cambiar estados de reclamos
- [ ] Agregar comentarios
- [ ] Subir fotos
- [ ] Marcar como resuelto

### Supervisor
- [ ] Dashboard muestra métricas
- [ ] Mapa de calor funciona
- [ ] Asignar reclamos a empleados
- [ ] Ver estadísticas por categoría
- [ ] Gestionar empleados

---

## 📝 Notas Adicionales

- El sistema está en **producción** y tiene datos reales
- **Modo DEMO** disponible con usuarios de prueba
- La IA puede tardar 2-3 segundos en clasificar
- Los mapas requieren conexión a internet
- El sistema es **24/7** y **100% gratuito**

---

## 🐛 Reporte de Bugs

Si encontrás bugs durante el testing, documentar:

1. **URL** donde ocurrió el bug
2. **Usuario** con el que estabas logueado
3. **Pasos** para reproducir
4. **Resultado esperado** vs **Resultado obtenido**
5. **Screenshots** si es posible
6. **Navegador** y versión

---

**Última actualización**: 15/01/2026
**Documento creado por**: Claude Code
**Versión del manual**: 1.0
