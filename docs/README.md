# Documentación · Munify

Índice de la doc viva del proyecto. **Si está acá, refleja el sistema hoy.** Lo histórico y los planes ya ejecutados están en [`legacy/`](legacy/) — no es para consulta diaria, sirve solo de archivo.

## Para qué leer cada cosa

| Querés... | Leé |
|---|---|
| Entender qué es Munify, módulos, roles, multi-tenant | [`ARQUITECTURA.md`](ARQUITECTURA.md) |
| Tocar UI o backend (patrones, componentes, reglas) | [`../BUILD_GUIDE.md`](../BUILD_GUIDE.md) (canónico, en root) |
| Saber cómo se deploya | [`DEPLOY.md`](DEPLOY.md) |
| Hacer testing manual de un módulo | [`TESTING.md`](TESTING.md) |
| Ver qué hizo el refactor per-municipio de trámites | [`REFACTOR_TRAMITES_PER_MUNICIPIO.md`](REFACTOR_TRAMITES_PER_MUNICIPIO.md) |
| Pitch / argumentario de ventas para intendentes | [`sales/PRODUCTO_MUNIFY.md`](sales/PRODUCTO_MUNIFY.md) |
| Prompt del agente de ventas (Bruno) | [`sales/SALES_AGENT_PROMPT.md`](sales/SALES_AGENT_PROMPT.md) |
| Brochure comercial PDF | [`marketing/Munify_Brochure.pdf`](marketing/Munify_Brochure.pdf) |
| Schema de la BD (referencia técnica) | [`database_schema_ai.json`](database_schema_ai.json) |
| OpenAPI del backend en prod | [`openapi_heroku.json`](openapi_heroku.json) |

## Reglas que se aplican a la doc

- **CLAUDE.md (root)** define las reglas duras de desarrollo. Es de lectura obligatoria antes de codear.
- **BUILD_GUIDE.md (root)** es el manual de componentes y patrones de UI. Es la fuente de verdad de cómo se construyen las cosas.
- **Cualquier plan, propuesta de refactor o spec de feature** que ya esté ejecutada (o haya quedado en pausa) **va a `legacy/`**, no se queda mezclada con la doc viva. Las decisiones del día a día viven en commits + PRs, no en MDs.

## Qué hay en `legacy/`

Material histórico que se conserva por trazabilidad pero **no describe el sistema actual**: planes ya ejecutados, refactors propuestos en pausa, logs de sesión, ideas sin implementar, especificaciones genéricas del inicio del proyecto, datos viejos de municipios de prueba. Ver [`legacy/`](legacy/) si necesitás contexto histórico de por qué algo es como es.
