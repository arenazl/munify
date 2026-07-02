# Documentación · Munify

Índice maestro de `docs/`. **Si está acá y no es histórico, refleja el sistema hoy.**
Organizada con el criterio estándar de docs (ver
`D:\Code\base-compartida\9-ORGANIZACION-DOCS.md`): en el raíz de `docs/` vive solo
este README; todo lo demás en carpetas por tema, con archivos numerados
(`01-...`, `02-...` — el número más alto es lo último del tema); lo archivado va
por fecha a `historico/` (y `legacy/` quedó congelado como archivo pre-criterio).

## Carpetas

| Carpeta | Qué tiene |
|---|---|
| [`plataforma/`](plataforma/) | Arquitectura, deploy, testing, refactors de referencia, schema/OpenAPI |
| [`salesbot/`](salesbot/) | Specs de la integración SalesBot ↔ Munify (API, turnos, verificación) |
| [`integraciones/`](integraciones/) | Contratos con apps externas (Media Studio) |
| [`turnos/`](turnos/) | Spec del sistema de turnos + calendario |
| [`sales/`](sales/) | Dossier de producto y prompt del agente de ventas |
| [`marketing/`](marketing/) | Brochure comercial |
| [`reels/`](reels/) | Contexto de reels de promoción (doc vivo entre agentes) |
| [`clientes/`](clientes/) | Docs por cliente (`spn/` = San Pedro Norte: notas, reportes, planillas) |
| [`handoffs/`](handoffs/) | Cierres de sesión por fecha (`YYYY-MM-DD_titulo.md`) — se crea al primer uso |
| [`historico/`](historico/) | Docs superados, archivados por fecha (`YYYY-MM-DD-titulo.md`) |
| [`legacy/`](legacy/) | Archivo histórico pre-criterio (congelado; no mover, no borrar) |

## Para qué leer cada cosa

| Querés... | Leé |
|---|---|
| Entender qué es Munify, módulos, roles, multi-tenant | [`plataforma/01-arquitectura.md`](plataforma/01-arquitectura.md) |
| Tocar UI o backend (patrones, componentes, reglas) | [`../BUILD_GUIDE.md`](../BUILD_GUIDE.md) (canónico, en root) |
| Saber cómo se deploya | [`plataforma/02-deploy.md`](plataforma/02-deploy.md) |
| Hacer testing manual de un módulo | [`plataforma/03-testing.md`](plataforma/03-testing.md) |
| Ver qué hizo el refactor per-municipio de trámites | [`plataforma/04-refactor-tramites-per-municipio.md`](plataforma/04-refactor-tramites-per-municipio.md) |
| Replicar el Modo Live (slides animados del dashboard) | [`plataforma/05-modo-live.md`](plataforma/05-modo-live.md) |
| La spec vigente de SalesBot (endpoints vivos) | [`salesbot/01-spec-final.md`](salesbot/01-spec-final.md) |
| Pitch / argumentario de ventas para intendentes | [`sales/01-producto-munify.md`](sales/01-producto-munify.md) |
| Prompt del agente de ventas (Bruno) | [`sales/02-sales-agent-prompt.md`](sales/02-sales-agent-prompt.md) |
| Brochure comercial PDF | [`marketing/Munify_Brochure.pdf`](marketing/Munify_Brochure.pdf) |
| Schema de la BD (referencia técnica) | [`plataforma/database-schema-ai.json`](plataforma/database-schema-ai.json) |
| OpenAPI del backend en prod (Cloud Run) | [`plataforma/openapi-prod.json`](plataforma/openapi-prod.json) |
| Qué se le comunicó/arregló a San Pedro Norte | [`clientes/spn/`](clientes/spn/) |

## ¿Dónde va un doc nuevo?

- **Tema ya existente** → a su carpeta, con el siguiente número (`salesbot/06-...`).
- **Tema de trabajo nuevo** → carpeta nueva numerada (`01-nombre-tema/`) con archivos `01-...` adentro.
- **Cierre de sesión / handoff** → `handoffs/YYYY-MM-DD_titulo.md`.
- **Doc superado por uno nuevo** → `historico/YYYY-MM-DD-titulo.md` (nunca borrar; el nuevo dice a quién supera).
- **Nada suelto en el raíz de `docs/`** y **jamás credenciales** en docs versionados.
- Actualizar ESTE índice en el mismo commit que agrega/mueve docs.

## Reglas que se aplican a la doc

- **CLAUDE.md (root)** define las reglas duras de desarrollo. Lectura obligatoria antes de codear.
- **BUILD_GUIDE.md (root)** es el manual de componentes y patrones de UI — fuente de verdad de cómo se construye.
- Las decisiones del día a día viven en commits + PRs, no en MDs.
