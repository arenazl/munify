# Equipo de Agentes Especializados

Este directorio contiene agentes especializados que puedes invocar para obtener ayuda experta en diferentes áreas del proyecto. Cada agente tiene conocimiento profundo del proyecto y mejores prácticas en su dominio.

## 🎯 Cómo Usar los Agentes

Los agentes están configurados siguiendo las mejores prácticas del **Claude Agent SDK**. Cada archivo de agente tiene:

- **Metadata** en formato YAML (frontmatter)
- **Prompt especializado** con instrucciones claras
- **Herramientas específicas** para su dominio
- **Ejemplos y patrones** de salida esperada

### Invocación Directa

Cuando trabajes con Claude Code, simplemente menciona el agente que necesitas:

```
"Necesito ayuda del arquitecto para decidir cómo implementar notificaciones en tiempo real"
```

```
"Consultar con el especialista de base de datos sobre el esquema de auditoría"
```

```
"El diseñador UI debería revisar el formulario de reclamos"
```

Claude reconocerá automáticamente qué agente invocar basándose en:
- La descripción del agente (metadata)
- El contexto de tu solicitud
- Las herramientas que necesitas

---

## 👥 Agentes Disponibles

### 🏛️ Arquitecto de Software
**Archivo**: [arquitecto.md](arquitecto.md)
**Modelo**: Sonnet
**Herramientas**: Read, Grep, Glob, Task

**Especialización**:
- Diseño de sistemas y arquitectura
- Patrones arquitectónicos y mejores prácticas
- Decisiones sobre stack tecnológico
- Integración de servicios y APIs
- Escalabilidad y rendimiento
- Revisión de arquitectura existente

**Cuándo invocar**:
- Necesitas diseñar una funcionalidad compleja
- Quieres validar decisiones técnicas
- Debes integrar un nuevo servicio externo
- Necesitas resolver problemas de escalabilidad
- Quieres evaluar diferentes enfoques

**Ejemplo**:
> "Arquitecto: ¿Cómo debería implementar caché para las consultas de reclamos? Necesito evaluar Redis vs caché en memoria."

---

### 🗄️ Especialista en Base de Datos
**Archivo**: [database.md](database.md)
**Modelo**: Sonnet
**Herramientas**: Read, Grep, Glob, Bash

**Especialización**:
- Modelado de datos y normalización
- Optimización de queries y índices
- Migraciones con Alembic
- SQLAlchemy ORM (async)
- Performance tuning
- Integridad de datos

**Cuándo invocar**:
- Necesitas diseñar un nuevo schema o modificar uno existente
- Tienes queries lentas que optimizar
- Debes crear migraciones complejas
- Quieres agregar índices estratégicamente
- Necesitas asegurar integridad referencial

**Ejemplo**:
> "Especialista de DB: Este query de reclamos por zona está tardando 3 segundos. ¿Cómo lo optimizo?"

---

### 🎨 Diseñador UI/UX (Interfaz)
**Archivo**: [ui-designer.md](ui-designer.md)
**Modelo**: Sonnet
**Herramientas**: Read, Grep, Glob, Edit, Write

**Especialización**:
- Componentes React + Tailwind CSS
- shadcn/ui component library
- Diseño responsive (mobile-first)
- Sistema de diseño y temas
- Animaciones y transiciones
- Accesibilidad (WCAG AA)

**Cuándo invocar**:
- Necesitas crear o mejorar componentes UI
- Quieres hacer una pantalla responsive
- Debes seguir el design system existente
- Necesitas mejorar la jerarquía visual
- Quieres agregar animaciones sutiles

**Ejemplo**:
> "Diseñador UI: Necesito crear un componente de tarjeta de reclamo que muestre estado, categoría, fecha y tenga acciones rápidas."

---

### 🧭 Especialista en User Experience
**Archivo**: [ux-specialist.md](ux-specialist.md)
**Modelo**: Sonnet
**Herramientas**: Read, Grep, Glob, Task

**Especialización**:
- Flujos de usuario y user journeys
- Diseño de interacciones
- Reducción de fricción
- Investigación de usuarios
- Usability testing
- Mejora de conversión

**Cuándo invocar**:
- Necesitas mapear flujos de usuario
- Quieres identificar puntos de fricción
- Debes mejorar la experiencia de un proceso
- Necesitas validar un flujo antes de implementar
- Quieres optimizar la conversión de un flujo

**Ejemplo**:
> "Especialista UX: El flujo de creación de reclamo tiene 6 pasos. ¿Cómo lo simplifico sin perder información importante?"

---

### 💼 Especialista Comercial y Ventas
**Archivo**: [comercial.md](comercial.md)
**Modelo**: Sonnet
**Herramientas**: Read, Grep, WebSearch, WebFetch

**Especialización**:
- Value propositions y posicionamiento
- Estrategia de pricing
- Materiales de ventas
- Análisis de mercado
- Customer personas
- Go-to-market strategy

**Cuándo invocar**:
- Necesitas definir precios para diferentes segmentos
- Quieres crear materiales de venta (pitch deck, one-pager)
- Debes investigar competidores
- Necesitas calcular ROI para clientes
- Quieres definir estrategia de adquisición

**Ejemplo**:
> "Especialista Comercial: Necesito un modelo de pricing para municipios de 10k-50k habitantes con diferentes tiers."

---

## 🔄 Trabajando con Múltiples Agentes

Los agentes pueden trabajar juntos en tareas complejas:

### Ejemplo: Nueva Funcionalidad End-to-End

```
1. UX Specialist: Mapea el flujo de usuario
2. Arquitecto: Diseña la estructura técnica
3. Database Specialist: Crea el schema y migraciones
4. UI Designer: Diseña los componentes visuales
5. [Tu implementas con ayuda de los agentes]
6. Comercial: Crea materiales para comunicar el feature
```

### Ejemplo: Optimización de Performance

```
1. UX Specialist: Identifica dónde los usuarios sienten lentitud
2. Arquitecto: Analiza la arquitectura actual
3. Database Specialist: Optimiza queries y agrega índices
4. UI Designer: Agrega estados de carga y skeleton screens
```

---

## 📋 Mejores Prácticas

### 1. Contexto Claro
Proporciona contexto específico cuando invoques un agente:

❌ **Vago**: "Ayuda con la base de datos"
✅ **Específico**: "DB Specialist: Necesito optimizar la query de reclamos filtrados por zona, categoría y fecha que está en ReclamosController.get_all()"

### 2. Incluye Información Relevante
Los agentes tienen acceso a la documentación del proyecto, pero ayuda si mencionas:
- Archivos específicos involucrados
- Requisitos de negocio relevantes
- Restricciones técnicas
- Usuarios afectados

### 3. Define Criterios de Éxito
Indica qué constituye una solución exitosa:

```
"Arquitecto: Necesito decidir entre WebSockets y SSE para notificaciones en tiempo real.

Criterios:
- Debe funcionar en la PWA offline
- Máximo 1000 usuarios concurrentes
- Heroku deployment (restricciones de conexiones persistentes)
- Bajo costo de infraestructura"
```

### 4. Itera con el Agente
Los agentes pueden refinar sus respuestas:

```
User: "Diseñador UI: Crea un componente de filtros para reclamos"
Agent: [Propone diseño inicial]
User: "Perfecto, pero necesito que sea colapsable en mobile"
Agent: [Ajusta el diseño]
```

---

## 🛠️ Configuración Técnica

### Estructura de Archivos

Cada agente sigue este formato:

```markdown
---
description: "Breve descripción que Claude usa para decidir cuándo invocar"
tools: ["Herramientas", "permitidas", "para", "este", "agente"]
model: "sonnet|opus|haiku"
---

# Nombre del Agente

You are a [role] specializing in [domain]...

## Your Mission
[Objetivo claro del agente]

## Project Context
[Contexto específico del proyecto]

## Success Criteria
[Qué constituye éxito]

## Process
[Pasos que el agente debe seguir]

## Constraints & Guardrails
DO: [Acciones recomendadas]
DON'T: [Acciones prohibidas]
WHEN UNCERTAIN: [Cómo manejar ambigüedad]

## Output Format
[Formato esperado de salida]
```

### Herramientas por Agente

| Agente | Read | Grep | Glob | Edit | Write | Bash | WebSearch | Task |
|--------|------|------|------|------|-------|------|-----------|------|
| Arquitecto | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Database | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| UI Designer | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| UX Specialist | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Comercial | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

**Nota**: El tool `Task` permite al agente invocar otros agentes especializados si es necesario.

---

## 📚 Documentación de Referencia

Todos los agentes tienen acceso y conocen estas guías del proyecto:

### Documentación de Negocio
- `INITIAL_PROMPT.md` - Especificación completa del negocio
- `CLAUDE.md` - Instrucciones para Claude

### Guías Técnicas (`APP_GUIDE/`)
- `00_COMO_USAR.md` - Índice de guías
- `01_ANALISIS.md` - Modelo de datos
- `02_PANTALLAS.md` - Inventario de pantallas
- `03_STACK.md` - Stack tecnológico
- `04_UI.md` - Sistema de diseño
- `05_CREDENCIALES.md` - Servicios externos
- `06_DEPLOY.md` - Deployment
- `07_INFRAESTRUCTURA.md` - Arquitectura
- `08_API_CLIENT.md` - Cliente API
- `09_ESTADO_ACTUAL.md` - Estado del proyecto
- `10_PWA_INSTALACION.md` - PWA

---

## 🎓 Aprendiendo de los Agentes

Los agentes no solo resuelven problemas puntuales, sino que también:

- **Enseñan mejores prácticas** en su dominio
- **Documentan decisiones** y su razonamiento
- **Proporcionan ejemplos** reutilizables
- **Mantienen consistencia** con patrones del proyecto

Guarda las respuestas de los agentes que sean especialmente útiles para referencia futura.

---

## 🔗 Referencias

Estos agentes están construidos siguiendo las mejores prácticas documentadas en:

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Subagents in the SDK](https://platform.claude.com/docs/en/agent-sdk/subagents)
- [Agent Skills in the SDK](https://platform.claude.com/docs/en/agent-sdk/skills)
- [Claude Agent SDK Best Practices 2025](https://skywork.ai/blog/claude-agent-sdk-best-practices-ai-agents-2025/)
- [Prompt Engineering for AI Agents](https://www.prompthub.us/blog/prompt-engineering-for-ai-agents)

---

## 🚀 Próximos Pasos

**Para expandir el equipo**:

Considera agregar agentes adicionales según necesidad:
- **Testing Specialist**: Para estrategias de testing
- **Security Auditor**: Para auditorías de seguridad
- **Performance Engineer**: Para optimización específica
- **DevOps Specialist**: Para CI/CD y deployment
- **Content Writer**: Para documentación y contenido

**Para mejorar agentes existentes**:

1. Analiza conversaciones donde los agentes fueron más útiles
2. Identifica patrones de preguntas frecuentes
3. Mejora los prompts con esos casos de uso
4. Agrega ejemplos específicos del proyecto

---

## 💡 Tips Finales

1. **Experimenta**: No tengas miedo de invocar agentes para diferentes perspectivas
2. **Combina**: Usa múltiples agentes para problemas complejos
3. **Documenta**: Si un agente da una solución excelente, documéntala
4. **Feedback**: Mejora los prompts de agentes basándote en uso real
5. **Consistencia**: Los agentes ayudan a mantener patrones consistentes en el proyecto

---

¡Bienvenido al equipo! Estos agentes están aquí para ayudarte a construir un producto excelente. 🎉
