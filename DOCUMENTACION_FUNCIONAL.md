# Sistema de Gestion de Reclamos Municipales

## Documento Funcional Completo

---

## 1. PROPOSITO DEL SISTEMA

Este sistema es una **plataforma integral para la gestion de reclamos ciudadanos** diseñada para municipios y gobiernos locales. Permite a los vecinos reportar problemas urbanos (baches, alumbrado, basura, etc.) y a las autoridades gestionar, asignar y resolver estos reclamos de manera eficiente.

### Vision
Transformar la comunicacion entre ciudadanos y municipios mediante tecnologia moderna, haciendo que los reclamos sean faciles de crear, transparentes de seguir y eficientes de resolver.

### Problema que Resuelve
- **Para ciudadanos**: Dificultad para reportar problemas, falta de seguimiento, incertidumbre sobre el estado de sus reclamos
- **Para municipios**: Gestion manual de reclamos, falta de metricas, asignacion ineficiente de recursos, comunicacion fragmentada

---

## 2. ARQUITECTURA MULTI-TENANT

El sistema soporta **multiples municipios** desde una unica instalacion:

- Cada municipio tiene su propia configuracion, usuarios, categorias y zonas
- Los datos estan completamente aislados entre municipios
- Branding personalizable (logo, colores) por municipio
- Subdominios o parametros para identificar el municipio

---

## 3. ROLES Y PERMISOS

| Rol | Descripcion | Accesos Principales |
|-----|-------------|---------------------|
| **Vecino** | Ciudadano que reporta problemas | Crear reclamos, ver sus reclamos, calificar resoluciones, gamificacion |
| **Empleado** | Personal operativo | Tablero Kanban, resolver reclamos asignados, mapa |
| **Supervisor** | Gestor intermedio | Dashboard, todos los reclamos, asignar empleados, reportes, SLA |
| **Admin** | Administrador total | Todo lo anterior + ABM usuarios, categorias, zonas, configuracion |

---

## 4. FUNCIONALIDADES PRINCIPALES

### 4.1 Gestion de Reclamos

#### Crear Reclamo (Wizard de 5 pasos)
1. **Registro** - Si no tiene cuenta, se registra en el momento
2. **Categoria** - Seleccion visual con iconos y colores
3. **Ubicacion** - Direccion con autocompletado + mapa interactivo
4. **Detalles** - Titulo, descripcion detallada, hasta 5 fotos
5. **Confirmacion** - Revision antes de enviar

**Caracteristicas destacadas**:
- IA que sugiere categorias basandose en el titulo/descripcion
- Autocompletado de direcciones con OpenStreetMap (gratis)
- Subida de imagenes a Cloudinary
- Chat con IA para ayudar al usuario durante el proceso

#### Estados del Reclamo
```
NUEVO → ASIGNADO → EN_PROCESO → RESUELTO
           ↓           ↓            ↓
        RECHAZADO ←←←←←←←←←←←←←←←←←
```

#### Acciones sobre Reclamos
- **Asignar**: Supervisor/Admin asigna a un empleado con fecha y horarios
- **Resolver**: Empleado marca como resuelto con descripcion de la solucion
- **Rechazar**: Con motivo (duplicado, fuera de jurisdiccion, etc.)
- **Calificar**: Vecino califica de 1 a 5 estrellas una vez resuelto

### 4.2 Asignacion Inteligente

El sistema sugiere el mejor empleado para cada reclamo usando un **algoritmo de scoring**:

| Factor | Peso |
|--------|------|
| Especialidad en la categoria | 40% |
| Zona geografica | 20% |
| Carga actual de trabajo | 25% |
| Disponibilidad proxima | 15% |

Muestra los **Top 5 candidatos** con justificacion de por que cada uno es adecuado.

### 4.3 Dashboard y Analytics

**Para Admin/Supervisor**:
- KPIs: Total reclamos, resueltos, pendientes, tiempo promedio
- Graficos: Por estado, categoria, zona, tendencia mensual
- Top 5 empleados con mejor rendimiento
- Cumplimiento de SLA

**Para Vecinos (Mi Panel)**:
- Mis reclamos y sus estados
- Estadisticas personales
- Puntos y badges de gamificacion

### 4.4 Mapa Interactivo

- Tecnologia: **Leaflet** (gratis, sin API keys)
- Marcadores de colores segun estado:
  - Amarillo: Pendiente
  - Azul: Asignado
  - Violeta: En proceso
  - Verde: Resuelto
  - Rojo: Rechazado
- Click en marcador para ver detalles
- Filtros por estado y categoria

### 4.5 Tablero Kanban

- 5 columnas: NUEVO, ASIGNADO, EN_PROCESO, RESUELTO, RECHAZADO
- **Drag & Drop** para cambiar estados
- Tarjetas con: titulo, categoria, prioridad, empleado, tiempo transcurrido
- Filtros multiples
- Solo para empleados, supervisores y admins

### 4.6 Sistema de Gamificacion

**Puntos por acciones**:
| Accion | Puntos |
|--------|--------|
| Crear reclamo | 10 |
| Reclamo verificado | 15 |
| Reclamo resuelto | 20 |
| Agregar fotos | 5 |
| Ubicacion exacta | 5 |
| Primer reclamo | 25 |
| Racha semanal | 30 |
| Calificar resolucion | 5 |
| Obtener badge | 50 |

**19 Badges disponibles**:
- Por cantidad: Primer Paso, Vecino Activo, Ojos de la Ciudad, Reportero Estrella, Guardian Urbano, Heroe Municipal
- Por categoria: Cazador de Baches, Guardian de la Luz, Defensor del Verde, Vigilante del Agua
- Especiales: Fotografo, Preciso, Constante, Madrugador, Nocturno, Top del Mes

**Leaderboard**:
- Ranking global del municipio
- Ranking por zona
- Periodo mensual o total

**Recompensas**:
- Admin configura premios canjeables por puntos
- Stock limitado, fechas de vigencia
- Codigo de canje unico

### 4.7 Integracion WhatsApp

**Recibir reclamos por WhatsApp**:
- Chatbot conversacional guiado
- Flujo: titulo → descripcion → categoria → direccion → ubicacion GPS → confirmacion
- Crea usuario automatico por numero de telefono

**Notificaciones automaticas**:
- Reclamo recibido
- Cambio de estado
- Reclamo resuelto

**Proveedores soportados**:
- Meta Cloud API (oficial)
- Twilio

### 4.8 Chat con IA

- Integrado con **Google Gemini**
- Ayuda durante la creacion de reclamos
- Sugiere categorias automaticamente
- Genera links directos para crear reclamos especificos
- No requiere servidor local (Ollama eliminado)

### 4.9 SLA (Acuerdos de Nivel de Servicio)

**Configuracion**:
- Por categoria y/o prioridad
- Tiempo de respuesta (para asignar)
- Tiempo de resolucion
- Alertas amarillas (proximo a vencer)

**Monitoreo**:
- Registro de violaciones
- Notificaciones de incumplimiento
- Metricas de cumplimiento en dashboard

### 4.10 Reportes PDF

**Reporte Ejecutivo Mensual**:
- Estadisticas generales
- Graficos: por estado, categoria, zona, tendencia
- Top 5 empleados
- Metricas SLA
- Branding del municipio (logo, colores)
- Descarga directa en PDF

---

## 5. PUNTOS FUERTES DEL SISTEMA

### 5.1 Experiencia de Usuario
- Wizard intuitivo de 5 pasos para crear reclamos
- Chat con IA que guia al ciudadano
- Interfaz responsive (desktop, tablet, mobile)
- Temas personalizables (Oscuro, Claro, Azul, Verde)
- Notificaciones en tiempo real

### 5.2 Eficiencia Operativa
- Asignacion inteligente con algoritmo de scoring
- Tablero Kanban con drag & drop
- SLA tracking automatico
- Reportes ejecutivos automatizados

### 5.3 Engagement Ciudadano
- Sistema de gamificacion completo (puntos, badges, leaderboard)
- Recompensas canjeables
- Transparencia: ver estado en tiempo real
- Calificacion de resoluciones

### 5.4 Multicanalidad
- Web responsive
- WhatsApp bidireccional
- Mapa interactivo publico
- Portal publico de estadisticas

### 5.5 Tecnologia Moderna
- Backend async con FastAPI
- Frontend React con TypeScript
- Mapas gratis con Leaflet/OpenStreetMap
- IA con Google Gemini
- Almacenamiento en la nube (Cloudinary)

### 5.6 Escalabilidad
- Arquitectura multi-tenant nativa
- Base de datos MySQL en la nube
- Backend completamente asincrono
- Despliegue en Heroku + Netlify

### 5.7 Sin Costos Ocultos
- Mapas: OpenStreetMap/Leaflet (gratis)
- Geocoding: Nominatim (gratis)
- IA: Gemini tiene tier gratuito generoso
- Imagenes: Cloudinary tiene tier gratuito

---

## 6. STACK TECNOLOGICO

### Backend
- **FastAPI** - Framework web asincrono de alto rendimiento
- **SQLAlchemy 2.0** - ORM asincrono
- **MySQL** - Base de datos (Aiven cloud)
- **Pydantic** - Validacion de datos
- **JWT** - Autenticacion stateless

### Frontend
- **React 18** - UI library
- **TypeScript** - Tipado estatico
- **Vite** - Build tool ultra-rapido
- **Tailwind CSS** - Estilos utilitarios
- **Recharts** - Graficos
- **Leaflet** - Mapas

### Integraciones
- **Google Gemini** - IA conversacional
- **Cloudinary** - Almacenamiento de imagenes
- **WhatsApp Business API** - Mensajeria
- **OpenStreetMap/Nominatim** - Geocoding

---

## 7. ADMINISTRACION

### ABM (Alta, Baja, Modificacion)
- **Usuarios**: Crear, editar, eliminar, asignar roles
- **Empleados**: Especialidades, zonas, capacidad
- **Categorias**: Iconos, colores, tiempos estimados, prioridades
- **Zonas/Barrios**: Nombre, centro geografico

### Configuracion del Municipio
- Logo y colores corporativos
- Datos de contacto
- Centro geografico y radio
- Zoom del mapa por defecto
- Limite de reclamos por dia por vecino
- Configuracion de WhatsApp

---

## 8. SEGURIDAD

- Autenticacion JWT con expiracion
- Roles y permisos granulares
- Aislamiento de datos por municipio (multi-tenant)
- Validacion de entrada con Pydantic
- Passwords hasheados con bcrypt
- HTTPS en produccion

---

## 9. METRICAS CLAVE

El sistema permite medir:
- **Volumen**: Reclamos por dia/semana/mes
- **Eficiencia**: Tiempo promedio de resolucion
- **Calidad**: Calificacion promedio de resoluciones
- **Cumplimiento**: % de SLA respetados
- **Engagement**: Puntos y badges otorgados
- **Distribucion**: Por categoria, zona, estado

---

## 10. CASOS DE USO TIPICOS

### Vecino reporta bache
1. Abre la app/web
2. Selecciona "Nuevo Reclamo"
3. Elige categoria "Baches/Calzada"
4. Ingresa direccion (autocompletado)
5. Ajusta ubicacion en el mapa
6. Escribe descripcion y sube foto
7. Confirma y envia
8. Recibe confirmacion + puntos de gamificacion
9. Puede seguir el estado en "Mis Reclamos"
10. Recibe notificacion cuando se resuelve
11. Califica la resolucion

### Supervisor asigna reclamo
1. Ve nuevo reclamo en Dashboard
2. Abre detalle del reclamo
3. Sistema sugiere Top 5 empleados con scoring
4. Selecciona empleado y fecha programada
5. Empleado recibe notificacion
6. Reclamo pasa a estado ASIGNADO

### Empleado resuelve reclamo
1. Ve sus reclamos asignados en Tablero Kanban
2. Arrastra a "En Proceso" cuando comienza
3. Realiza el trabajo fisico
4. Arrastra a "Resuelto" y escribe descripcion
5. Vecino recibe notificacion y puede calificar

---

## 11. PROXIMAS MEJORAS POTENCIALES

- App mobile nativa (React Native)
- Integracion con sistemas GIS municipales
- Alertas predictivas con ML
- Reconocimiento de imagenes para categorizar
- Integracion con redes sociales
- Modulo de obras publicas
- API publica para integraciones

---

*Documento generado el 23 de Diciembre de 2024*
