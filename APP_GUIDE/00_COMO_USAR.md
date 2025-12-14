# CÓMO USAR ESTA GUÍA

## Documento Padre: INITIAL_PROMPT.md

> **IMPORTANTE:** Antes de usar esta guía, DEBE existir el archivo `INITIAL_PROMPT.md` en la raíz del proyecto. Este archivo contiene la especificación del negocio y es la FUENTE DE VERDAD.

```
proyecto/
├── INITIAL_PROMPT.md    ← DOCUMENTO PADRE (específico del negocio)
└── APP_GUIDE/           ← Esta guía (genérica, reutilizable)
```

---

## Flujo de Trabajo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FLUJO COMPLETO                                  │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌──────────────────────┐
                         │   INITIAL_PROMPT.md  │
                         │   (Documento Padre)  │
                         │                      │
                         │   - Entidades        │
                         │   - Roles            │
                         │   - Flujos           │
                         │   - Reglas negocio   │
                         └──────────┬───────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PASO 1: Leer INITIAL_PROMPT.md completo                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  - Identificar TODAS las entidades mencionadas                              │
│  - Identificar los roles de usuario                                         │
│  - Entender los flujos de estado                                            │
│  - Identificar las reglas de negocio                                        │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PASO 2: 01_ANALISIS.md → Diseño técnico                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Basándose en INITIAL_PROMPT.md, generar:                                   │
│  - Modelo de datos (tablas, campos, relaciones)                             │
│  - Enums necesarios                                                         │
│  - Lista de endpoints API                                                   │
│  - Estructura de carpetas                                                   │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PASO 3: 02_PANTALLAS.md → UI/UX y navegación                               │
│  ─────────────────────────────────────────────────────────────────────────  │
│  - Lista de pantallas/páginas según los roles                               │
│  - Menú de navegación por rol                                               │
│  - Rutas del router                                                         │
│  - PATRÓN ABM: Sheet/Side Modal (NUNCA páginas separadas)                   │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PASO 4: 03_STACK.md → Tecnologías                                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│  - Backend: FastAPI + SQLAlchemy + MySQL/PostgreSQL                         │
│  - Frontend: React + Vite + Tailwind + shadcn/ui                            │
│  - Servicios externos (Cloudinary, etc.)                                    │
│  - Dependencias específicas                                                 │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PASO 5: 04_UI.md → Layout y componentes                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  - Layout base (sidebar + header + contenido)                               │
│  - Componentes UI reutilizables                                             │
│  - Sistema de temas/colores                                                 │
│  - Animaciones y transiciones                                               │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PASO 6: 05_CREDENCIALES.md → Servicios externos                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│  - Instrucciones para crear cuentas                                         │
│  - Template de archivos .env                                                │
│  - Variables de entorno requeridas                                          │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PASO 7: 06_DEPLOY.md → Despliegue                                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│  - Configuración de Heroku (backend)                                        │
│  - Configuración de Netlify (frontend)                                      │
│  - Variables de entorno en producción                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Qué Buscar en INITIAL_PROMPT.md

Antes de generar código, extraer del documento padre:

### 1. Entidades del Sistema
```
Buscar sustantivos que representen datos:
- Usuario, Reclamo, Categoría, Zona, Cuadrilla, etc.
- NO asumir solo 3-4 tablas - leer TODO el documento
```

### 2. Campos de Cada Entidad
```
El INITIAL_PROMPT lista los campos requeridos:
- Tipos de dato (string, int, fecha, etc.)
- Campos obligatorios vs opcionales
- Relaciones (FK)
```

### 3. Roles de Usuario
```
Identificar todos los roles mencionados:
- ¿Qué puede hacer cada rol?
- ¿Qué pantallas ve cada rol?
- ¿Qué acciones puede ejecutar?
```

### 4. Flujos de Estado
```
Máquinas de estado del negocio:
- Estados posibles (pendiente → asignado → resuelto)
- Transiciones permitidas
- Quién puede cambiar estados
```

### 5. Reglas de Negocio
```
Lógica específica del dominio:
- Validaciones
- Cálculos automáticos
- Restricciones
```

---

## Checklist de Análisis

Antes de comenzar a codear:

- [ ] Leí INITIAL_PROMPT.md completo
- [ ] Identifiqué TODAS las entidades (no solo las obvias)
- [ ] Listé los campos de cada entidad
- [ ] Identifiqué las relaciones entre entidades
- [ ] Entendí los roles y sus permisos
- [ ] Entendí los flujos de estado
- [ ] Identifiqué las reglas de negocio

---

## Regla Crítica: Patrón ABM

> **TODA operación de Alta/Baja/Modificación DEBE usar Side Modal (Sheet)**

```
✅ CORRECTO:
/entidades           → Listado con Sheet para crear/ver/editar

❌ INCORRECTO (PROHIBIDO):
/entidades/nuevo     → NO crear rutas separadas
/entidades/:id       → NO crear páginas de detalle
/entidades/:id/edit  → NO crear páginas de edición
```

---

## Archivos de la Guía

| Archivo | Propósito |
|---------|-----------|
| `00_COMO_USAR.md` | Este documento - cómo usar la guía |
| `01_ANALISIS.md` | Modelo de datos, endpoints, estructura |
| `02_PANTALLAS.md` | Navegación, rutas, patrón ABM |
| `03_STACK.md` | Tecnologías, dependencias, troubleshooting |
| `04_UI.md` | Layout, componentes, temas, animaciones |
| `05_CREDENCIALES.md` | Servicios externos, variables de entorno |
| `06_DEPLOY.md` | Heroku, Netlify, producción |

---

## Resumen

```
INITIAL_PROMPT.md (negocio específico)
        │
        ▼
APP_GUIDE/ (guía genérica)
        │
        ▼
Código generado según ambos
```

**La guía es reutilizable. Solo cambia INITIAL_PROMPT.md por proyecto.**
