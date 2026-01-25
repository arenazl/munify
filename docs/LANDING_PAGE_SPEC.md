# Munify Landing Page - Specification Document

This document contains all the information needed to recreate the Munify landing page using any technology stack.

---

## 1. Brand Identity

### Brand Name
**Munify** - Sistema de Gestión Municipal Inteligente

### Tagline
"Conectando al gobierno con las necesidades del vecino"

### Color Palette
```
Primary Colors (Teal/Blue gradient):
- Munify Blue: #0088cc
- Munify Blue Light: #56b4e9
- Munify Teal: #2aa198
- Munify Teal Light: #56cecb
- Munify Cyan: #00b4d8

Neutral Colors (Slate tones):
- Slate 900: #0f172a (dark text)
- Slate 800: #1e293b
- Slate 700: #334155
- Slate 600: #475569
- Slate 500: #64748b
- Slate 100: #f1f5f9 (light backgrounds)
- Slate 50: #f8fafc

Status Colors:
- Success Green: #22c55e
- Warning Amber: #f59e0b
- Error Red: #ef4444
- Info Blue: #3b82f6
```

### Typography
- **Font Family**: Inter (Google Fonts)
- **Weights Used**: 300 (Light), 400 (Regular), 500 (Medium), 600 (Semibold), 700 (Bold), 800 (Extrabold), 900 (Black)
- **Fallbacks**: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif

### Logo Assets Required
1. `munify_logo_1.png` - Full logo with text (header)
2. `munify_logo_no_text.png` - Icon only (various sections)

---

## 2. Page Structure

### Navigation (Header)
- Fixed position with glassmorphism effect
- Shrinks on scroll
- **Desktop Links**: El Problema | La Solución | Actores | Demos | Inversión
- **CTA Button**: "Solicitar Demo" (slate-800 background)
- **Mobile**: Hamburger menu with slide-in drawer

### Sections in Order
1. Hero
2. El Problema (The Problem)
3. La Solución (The Solution)
4. Cómo Funciona / Actores (How it Works / Actors)
5. ¿Por qué cambiar? (Why Change - Before/After Comparison)
6. Reportá un Reclamo (Demo: Report a Complaint)
7. Iniciá un Trámite (Demo: Start a Procedure)
8. ¿Por qué Munify? (Benefits)
9. Dashboard Previews (Carousel)
10. Planes de Contratación (Pricing)
11. Contacto (Contact)
12. Footer

---

## 3. Hero Section

### Content
- **Logo**: Large icon (h-32 desktop, h-9 mobile) + "Munify" text (text-9xl desktop)
- **Subtitle**: "Conectando al gobierno con las necesidades del vecino"

### Value Proposition Cards (3 cards in grid)

**Card 1 - La comunicación se corta**
- Icon: X in circle (slate-400)
- Text: "Todos los municipios tienen sistemas de reclamos, pero el vecino nunca sabe qué pasó con su pedido."

**Card 2 - IA + Trazabilidad total**
- Icon: Lightning bolt (teal-500)
- Text: "Reporte instantáneo y transparente. Seguimiento en tiempo real hasta que la cuadrilla resuelve el problema."

**Card 3 - Todos conectados**
- Icon: Checkmark in circle (blue-500)
- Text: "El vecino sabe quién lo atiende, el empleado sabe qué hacer, el supervisor tiene los datos. Círculo cerrado."

### Background
- City background image with 20% opacity

---

## 4. El Problema (The Problem)

### Header
- Gradient accent bar (blue to teal)
- Title: "El Problema Actual"
- Subtitle: "La realidad de los municipios tradicionales"

### Two Problem Cards

**Reclamo HOY** (Red/Orange gradient background)
- Icon: Bullhorn
- Text: "Vecino llama → anotan en cuaderno → se pierde → vuelve a llamar → nadie sabe nada → frustración."

**Trámite HOY** (Amber/Yellow gradient background)
- Icon: File document
- Text: "Vecino va al municipio → hace cola → falta un papel → vuelve otro día → más cola → semanas de espera."

### Comparison Table: "Consecuencias Medibles"

| Aspecto | Sin Sistema | Con Sistema |
|---------|-------------|-------------|
| Tiempo de Respuesta | 2-4 semanas promedio | 2-3 días (60% más rápido) |
| Reclamos Perdidos | 30-40% se pierden | 0% - Todo registrado |
| Comunicación | Llamadas repetidas | Notificaciones automáticas |
| Asignación | Manual, demoras de días | Automática en segundos |
| Evidencia | Sin registro fotográfico | Fotos antes/después + GPS |
| Satisfacción | 40-50% | 85-90% |

---

## 5. La Solución (The Solution)

### Header
- Title: "La Solución"
- Subtitle: "Sistema inteligente y automático"

### 3 Pillars (Card Grid)

**Pilar 1: Interacción en Tiempo Real**
- Icon: Comments (teal)
- Features:
  - Notificaciones push instantáneas
  - Chat integrado con WhatsApp
  - Actualizaciones en vivo del estado

**Pilar 2: Gestión Guiada por Expertos**
- Icon: Clipboard check (blue)
- Features:
  - Tracking visual paso a paso
  - IA que sugiere próximos pasos
  - Historial completo de gestiones

**Pilar 3: 2 Clicks, Sin Moverte**
- Icon: Mouse pointer (teal)
- Features:
  - Inicio inmediato de trámites
  - Formularios simples y claros
  - 100% digital, 0% presencial

### Differentiators (4 Feature Cards)

1. **Multi-Tenant** - Un solo sistema sirve a múltiples municipios con datos separados
2. **Multiplataforma REAL** - Web, PWA instalable, Bot WhatsApp, 100% responsive
3. **Inteligencia Artificial** - Asignación automática, predicción de zonas conflictivas, chatbot 24/7
4. **Tiempo Real** - Notificaciones instantáneas, tracking GPS, dashboards en vivo

---

## 6. Cómo Funciona / Actores (Carousel)

### Carousel with 3 Slides (auto-play 8 seconds)

**Slide 1: El Vecino Reporta (CIUDADANO)**
- Step label: "PASO 1"
- Image: City background
- Features:
  - Crear con IA - Categorización automática + GPS
  - Notificaciones Push - Alertas en cada cambio de estado
  - Seguimiento 24/7 - Ve el progreso en tiempo real
- Tags: "Sin registrarse"

**Slide 2: El Sistema Asigna (EMPLEADO)**
- Step label: "PASO 2"
- Image: Worker with tablet
- Features:
  - Lista de Trabajos - Ver asignados y priorizar
  - Fotos Antes/Después - Evidencia geolocalizada
  - Métricas Personales - Rendimiento y calificaciones
- Tags: "App móvil"

**Slide 3: Supervisión Total (SUPERVISOR)**
- Step label: "PASO 3"
- Image: Coordination team
- Features:
  - Dashboard Ejecutivo - KPIs, mapa de calor, analytics
  - Asignación Inteligente - Manual o automática
  - Reportes Automáticos - Excel, PDF, estadísticas
- Tags: "Dashboard ejecutivo"

---

## 7. Comparison Section (Before vs After)

### Two Side-by-Side Cards

**ANTES (Traditional)**
- Header: "Papeles, Excel y caos"
- Problems:
  - Reclamos en cuadernos - Se pierden, se mojan, nadie los encuentra
  - Excel interminable - Datos duplicados, versiones desactualizadas
  - Vecino sin respuesta - "¿Qué pasó con mi reclamo?" - Nunca lo sabrá
  - Semanas de demora - Sin seguimiento, sin métricas, sin control
- Metrics: 2-4 semanas promedio | 40% reclamos perdidos

**DESPUÉS (With Munify)**
- Header: "Todo digital, todo en tiempo real"
- Benefits:
  - Reclamos digitales - Foto + GPS + IA que categoriza automático
  - Dashboard en vivo - Métricas actualizadas, mapas de calor, KPIs
  - Vecino informado - Notificaciones push en cada paso del proceso
  - Resolución rápida - Asignación automática, fotos antes/después
- Metrics: 5.2h promedio resolución | 100% trazabilidad total

### Quick Comparison Table
| Aspecto | Tradicional | Munify |
|---------|-------------|--------|
| Tiempo de respuesta | 2-4 semanas | Mismo día |
| El vecino sabe qué pasó | Nunca | Siempre |
| Evidencia fotográfica | No hay | Antes/Después + GPS |
| Métricas y reportes | Manuales | Automáticos |
| Satisfacción ciudadana | 40-50% | 85-90% |

### CTA Button
"Empezar la transformación" (teal gradient, rocket icon)

---

## 8. Demo: Reportá un Reclamo (5-Step Flow)

### Example Case: "Bache en la calle"
"María encuentra un bache peligroso y lo reporta"

### Stepper UI (Clickable dots + progress lines)

**Step 1: María detecta el problema**
- Actor: Ciudadano
- Description: María va camino al trabajo y ve un bache grande en Av. San Martín. Es peligroso para autos y motos.
- Phone mockup: App home screen with "Crear Reclamo" button

**Step 2: Completa el formulario**
- Actor: Ciudadano | 30 segundos
- Description: Saca foto del bache, el GPS captura la ubicación automática. La IA detecta que es categoría "Baches".
- Notification: "Reclamo #4521 creado"
- Phone mockup: Form with category, location, photos

**Step 3: Supervisor asigna**
- Actor: Supervisor | 3 minutos después
- Description: Ana (supervisora) ve el reclamo nuevo en su dashboard. Lo asigna a Juan Pérez, especialista en bacheo.
- Notifications:
  - To María: "Tu reclamo fue asignado a Juan Pérez"
  - To Juan: "Nuevo trabajo asignado - Bache Av. San Martín"

**Step 4: Juan resuelve en terreno**
- Actor: Empleado | 4 horas después
- Description: Juan llega al lugar con su cuadrilla. Repara el bache, saca fotos del antes/después, y marca como "Resuelto".
- Notifications:
  - To María: "¡Tu reclamo fue resuelto! Ver fotos"
  - To Ana: "Reclamo #4521 completado en 4.2hs"

**Step 5: ¡Problema resuelto!**
- Completed: 4 horas 15 minutos totales
- Final stats: 4.2h tiempo total | 5 notificaciones | 100% trazabilidad

---

## 9. Demo: Iniciá un Trámite (4-Step Flow)

### Example Case: "Libre Deuda Municipal"
"Carlos necesita un certificado para vender su propiedad"

**Step 1: Carlos necesita el certificado**
- Actor: Ciudadano
- Description: Carlos va a vender su casa y la escribanía le pide un Certificado de Libre Deuda Municipal.

**Step 2: Inicia el trámite online**
- Actor: Ciudadano | 2 minutos
- Description: Desde su casa, Carlos entra a la web, selecciona "Libre Deuda", ingresa datos. La IA le indica qué documentos necesita.
- Notification: "Trámite #7823 iniciado"
- System check: "Sin deudas pendientes ✓"

**Step 3: Empleado procesa y aprueba**
- Actor: Empleado | 4 horas después
- Description: Laura (empleada de Rentas) revisa el trámite en su cola de trabajo. Verifica los datos, y con un click genera el certificado con firma digital.
- Notification: "Tu certificado está listo para descargar"

**Step 4: ¡Certificado listo!**
- Completed: 4 horas 15 minutos totales
- Final stats: 4h tiempo total | 0 visitas presenciales | QR verificable

---

## 10. Benefits Section: ¿Por qué Munify?

### 6 Benefit Cards (2x3 grid)

1. **Organización Total** (sitemap icon)
   - Todo en un solo lugar. Sin papeles perdidos, sin archivos dispersos.

2. **Menos Burocracia** (scissors icon)
   - Procesos simplificados. El vecino no necesita ir 3 veces al municipio.

3. **Menos Errores** (spell-check icon)
   - Validaciones automáticas, detección de duplicados con IA, trazabilidad completa.

4. **Mejor Atención al Vecino** (headset icon)
   - Respuestas más rápidas, seguimiento transparente, comunicación proactiva.

5. **Datos para Decidir** (chart-pie icon)
   - Dashboards con información real: qué barrios reclaman más, dónde poner recursos.

6. **Canal Directo** (WhatsApp icon)
   - WhatsApp, app, web. El vecino elige cómo comunicarse.

### Featured Quote
"Munify no agrega burocracia, la elimina. Automatiza lo repetitivo, ordena lo caótico, y transforma el trabajo diario de tu equipo en **información útil para gobernar** y en **respuestas concretas para los vecinos** — algo que van a valorar en los tiempos que corren."

---

## 11. Dashboard Mockups (Carousel)

### 4 Dashboard Slides

**1. Panel de Control**
- Stats: Total Reclamos (3285), Nuevos Hoy (12), Esta Semana (47), Tiempo Prom. (6.6d)
- Donut chart: Por Estado (Resuelto, Asignado, Proceso)
- Heat map: Geographic visualization of complaints

**2. Análisis por Zonas**
- Bar charts: Reclamos por Barrio (Centro 369, San Martín 349, Libertad 345, Progreso 343)
- Coverage by zone with % resolution
- Top Categorías: Alumbrado 355 (11%), Baches 337 (10%), Desagües 337 (10%), Señalización 331 (10%)

**3. Tiempos y Rendimiento**
- Average time by category (Animales 5.2d, Alumbrado 5.6d, Baches 5.4d, etc.)
- Tasks resolved by employee ranking (Ana 47, Carlos 38, Juan 34, etc.)

**4. Alertas y Operaciones**
- Alert cards: Urgentes 633, Sin Asignar 305, Para Hoy 12, Resueltos 89
- Distance traveled by employee (Luis 54km, Patricia 84km, etc.)
- Total: 709.61 km | Average: 5.86 km/reclamo

---

## 12. Pricing Section

### Trial Banner
"Período de prueba de 3 meses incluido en todos los planes"

### 3 Pricing Plans

**Plan Ciudadano** (Basic)
- Price: $0 (trial period)
- Background: White to teal-50
- Features:
  - App Ciudadana - Portal web y móvil para vecinos
  - Notificaciones en tiempo real - Para vecinos sobre sus consultas
  - Seguimiento básico - Estado de reclamos y trámites

**Plan Gestión Completa** (Featured - highlighted)
- Price: $300.000/mes (after trial)
- Background: Teal gradient (teal-600 to teal-800)
- Features:
  - Gestión de Reclamos - Recepción, asignación y seguimiento
  - Gestión de Trámites - Workflows personalizables
  - Asignación de Personal - Rutas optimizadas y cuadrillas
  - Notificaciones Empleados - Tiempo real para supervisores

**Plan Premium**
- Price: $600.000/mes (after trial)
- Background: White to slate-50
- Features:
  - Todo del plan anterior +
  - Gestión Completa Operaciones - Todos los módulos municipales
  - BI y Analytics Avanzado - Dashboards ejecutivos y reportes
  - Integraciones ilimitadas - APIs y sistemas externos
  - Soporte prioritario 24/7 - Gerente de cuenta dedicado

### Included in All Plans (8 items)
1. Instalación - Configuración en 1-2 semanas
2. Capacitación - Entrenamiento para tu equipo
3. Soporte - Asistencia cuando lo necesites
4. Actualizaciones - Nuevas funciones cada mes
5. Backups - Respaldo automático diario
6. 99.9% Uptime - Disponibilidad garantizada
7. Seguridad SSL - Conexión cifrada y protegida
8. App móvil - Acceso directo escaneando QR

---

## 13. Contact Section

### Header
- Logo icon (h-20)
- Title: "Demos el Primer Paso Juntos"
- Subtitle: "Agenda una videollamada de 30 minutos donde te mostraremos la plataforma funcionando en tiempo real con datos de prueba de tu municipio. Sin compromiso, sin costos ocultos."

### CTA Button
"Solicitar Demo" (white background, mailto link)

### Contact Methods
1. **WhatsApp**: +54 9 11 6022-3474 (wa.me link)
2. **Email**: ventas@gestionmunicipal.com
3. **Website**: www.gestionmunicipal.com

### Background
- Workers/team image with 20% opacity
- Dark slate overlay

---

## 14. Footer

### Desktop Footer (teal gradient background)
- Logo + "Munify" + "Gestión Municipal Inteligente"
- Links: Solución | Precios | Contacto
- Copyright: "© 2026 Munify. Todos los derechos reservados."

### Mobile Bottom Navigation (Fixed)
5 items with circular icon buttons:
1. Inicio (home icon)
2. Solución (lightbulb icon)
3. WhatsApp (WhatsApp icon - external link)
4. Demos (play icon)
5. Precios (tags icon)

---

## 15. Interactive Features

### Chat Widget
- Floating button (bottom-right, teal gradient)
- Chat container with:
  - Header: "Asistente Munify" - "Online - Respondo al instante"
  - Messages area
  - Input form with send button
- API connects to backend for AI responses

### Animations
1. **Fade-in on scroll**: Elements fade in with translateY(30px) when entering viewport
2. **Glassmorphism header**: Blur effect that becomes more solid on scroll
3. **Hover-lift**: Cards lift 8px on hover with shadow
4. **Pricing card pulse**: Featured card has subtle shadow pulse
5. **Carousel auto-play**: Actors carousel rotates every 8 seconds
6. **Float animation**: Subtle up/down floating effect (6s cycle)

### Carousel Controls
- Navigation arrows (left/right)
- Dot indicators (clickable)
- Touch/swipe support
- Auto-play with configurable interval

---

## 16. Technical Stack (Original)

- **CSS Framework**: Tailwind CSS v3.3.7 (CDN)
- **Icons**: Font Awesome 6.5.1 (CDN)
- **Font**: Inter from Google Fonts
- **JavaScript**: Vanilla JS (no framework)
- **PWA**: Manifest.json included

### Responsive Breakpoints
- Mobile: < 768px (md breakpoint)
- Desktop: >= 768px
- Large: >= 1024px (lg breakpoint)

---

## 17. Images Required

1. `munify_logo_1.png` - Header logo
2. `munify_logo_no_text.png` - Icon only
3. `assets-landing-ciudad.webp` - City background (hero, citizen slide)
4. `assets-landing-coordinacion.jpeg` - Coordination/team (problem, supervisor slide)
5. `assets-landing-sistema-moderno.webp` - Modern system (solution)
6. `assets-landing-trabajador-tablet.jpg` - Worker with tablet (employee slide, after comparison)
7. `assets-landing-trabajadores-hq.jpg` - Workers team (contact background)
8. `workers-checking-the-overall-equipment-effectiveness.jpg` - Traditional management (before comparison)

---

## 18. SEO Meta Tags

```html
<title>Munify - Sistema de Gestión Municipal</title>
<meta name="description" content="Munify - Sistema de Gestión Municipal Inteligente. Conectamos municipios con sus vecinos.">
<meta name="theme-color" content="#0088cc">
```

---

## Notes for Recreation

1. **Accessibility**: All interactive elements should have proper ARIA labels
2. **Performance**: Use lazy loading for images below the fold
3. **Mobile-first**: Design starts with mobile, scales up
4. **Safe areas**: Account for iOS safe areas on mobile nav
5. **Smooth scrolling**: Enable smooth scroll behavior with offset for fixed header (80px desktop, 100px mobile)
