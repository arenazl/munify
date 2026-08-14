# Suite E2E de circuito completo (Playwright)

Suite de browser real que recorre los circuitos de negocio de punta a punta,
**agnóstica de tenant**: los specs no conocen ningún dato de Asunción — todo lo
específico del municipio vive en un fixture JSON.

## Qué cubre

- **Logins** (9 roles del picker demo): admin, 5 supervisores de secretaría,
  2 vecinos, operario de campo.
- **20 reclamos** punta a punta: el vecino crea por el wizard (categoría
  MANUAL — la clasificación IA queda afuera a propósito: determinístico) →
  el gestor (admin en casos impares, el SUPERVISOR de la dependencia en
  pares) elige candidato, escribe el plan, pasa a en curso, finaliza con la
  resolución → el vecino ve el cierre. Variantes: asignación simple (13),
  **orden de trabajo** (7: la OT nace vinculada desde el sheet y se completa
  con cascada al reclamo), y **reclamo huérfano** (categoría sin dependencia:
  la app permite avanzar con el plan escrito).
- **20 trámites**: solicitud por wizard → **turno** si aplica (12 casos:
  pestaña "Para un trámite ya iniciado", primer horario de la agenda) →
  verificación de documentos obligatorios por el mostrador (la regla real del
  pase a en curso) → finalizar → el vecino ve el cierre. Variantes: con
  turno, sin turno, online, con y sin documentos, dos vecinos alternados.

## Cómo se corre

```bash
cd frontend
npx playwright test -c e2e/playwright.config.ts              # toda la matriz (~60 min)
npx playwright test -c e2e/playwright.config.ts --grep "#07" # un caso
npx playwright show-report e2e/.report                       # reporte HTML
```

Requiere la app LOCAL levantada: uvicorn en :8002 (DB de QA) + Vite en :5173
(`DEV_BACKEND_ORIGIN` ya apunta al uvicorn en `.env.local`). La suite ESCRIBE
en la DB real de QA — jamás apuntarla a producción.

## Cómo se lleva a otro tenant / ambiente

```bash
E2E_TENANT=otro-muni E2E_BASE_URL=https://otro-front.netlify.app npx playwright test -c e2e/playwright.config.ts
```

1. Crear `e2e/tenants/<id>.json` copiando `paraguay.json`: ruta de marca,
   personas del picker (o credenciales), nombres visibles de los vecinos, y la
   matriz de casos con las categorías/trámites/direcciones REALES de ese
   municipio.
2. Nada más: los specs (`reclamos.spec.ts`, `tramites.spec.ts`) y el setup de
   auth son los mismos para todos.

`E2E_RUN_ID` marca los títulos de lo que la corrida escribe (`[E2E <id> #NN]`)
para poder distinguir corridas en la base.

## Decisiones de diseño (por qué es determinístico)

- Matriz FIJA en el fixture: sin randoms; la única variación entre corridas es
  el `E2E_RUN_ID`.
- Un solo worker y sin retries: el circuito escribe en una DB compartida y el
  orden de los pasos es parte de lo que se prueba.
- Categoría manual en el wizard (no IA), primer candidato sugerido, primer
  horario de agenda: el ranking/orden del sistema es parte de lo probado.
- El aviso de notificaciones bloqueadas se apaga de RAÍZ por `addInitScript`
  (flags de `NotificationActivationSheet`) — tapaba clicks en momentos
  aleatorios.
- Señales de éxito REALES: toasts del backend, cierre de sheets, estado en la
  fila — nunca botones que cambian de label mientras guardan (dieron falsos
  positivos durante la construcción).
