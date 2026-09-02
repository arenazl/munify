# Consolidación de Tesorería al modelo core — análisis (2026-07-05)

> Resultado de un análisis multi-agente (mapear estado real → panel de 3 arquitecturas →
> síntesis → crítica adversarial). Números medidos contra la DB de qa (= copia limpia de prod).
> Criterio de aceptación de la ejecución: prueba de PARIDAD DE API para SPN (ver §5).

## 1. Hallazgo central (cambia el enfoque)
La duplicación **NO es fila-a-fila**, es **arquitectónica y de superficie**:
- El **plantel real de SPN vive en `contactos` (1185 filas, 64% de la tabla)**, NO en `empleados`
  (7 filas = seed demo: Juan Perez, Carlos Gomez…). Las dos son poblaciones distintas.
- **Solapamiento real `contactos`↔`empleados` en SPN = 0** (match robusto por nombre completo).
- El **motor de liquidaciones/sueldos corre 100% sobre `contacto_id`** (312 pagos, 244 de SPN,
  0 apuntan a `empleados`/`usuarios`; 205 de los 244 van a `contactos` tipo=empleado).
- El concepto "empleado" está **modelado 3 veces**: `empleados.tipo`, `empleado_categoria`, y
  `contactos.tipo=empleado` + catálogo `tesoreria_tipos_empleado` (sembrado en 35 munis, usado
  solo por SPN: 123 contactos linkeados).
- **No se puede deduplicar por documento**: `contactos` casi no tiene dni (16/1865) ni cuit (0/1865).

## 2. Enfoque ganador
**Persona = evolucionar la tabla `contactos` IN-PLACE** (conservar `__tablename__='contactos'` y la
PK `id`). NO crear una tabla `personas` nueva ni migrar filas en el camino activo — porque `contactos`
**ya es el hub de identidad/dinero**: le cuelgan `gastos.destino_contacto_id`,
`ordenes_pago.destino_contacto_id`, `tesoreria_pagos_programados.contacto_id` (244 SPN) y
`contactos.tipo_empleado_id` (123 SPN). Al evolucionarla en su lugar, ninguna FK de dinero se mueve.
Sobre Persona cuelgan perfiles OPCIONALES 1:1 vía FK aditiva nullable: **Empleado** (perfil operativo:
zona, cuadrilla, horarios, métricas) y **Usuario** (auth/KYC + sus ~25 FKs entrantes intactas). La
clasificación pasa del enum de un valor a `persona_roles` N:M. La tabla física `personas` con clave
dura se difiere a la última fase. Cero `if muni==X`: modelo universal.

## 3. Plan — migración en VENTANA ÚNICA (big-bang)
Con una ventana de mantenimiento coordinada con SPN (cliente parado ~1 día) + backup previo, el riesgo
de tocar datos EN CALIENTE desaparece → **no hacen falta 7 fases incrementales con adapters**. Esas
fases existían solo para no romper mientras SPN opera; con la ventana el plan colapsa a 3 momentos.
Se va **directo al modelo destino**, sin FKs "por si acaso" ni diferir la tabla física.

### 3.1 Preparación (en qa, SIN ventana — es el ~70% del trabajo)
- **Fixes de código previos** (independientes, valor propio, se deployан ANTES por flujo normal, no
  necesitan ventana): (a) fix del bug del `/merge` — reapuntar `ordenes_pago.destino_contacto_id`;
  (b) barrido de auth DRY **por archivo** (preservar `tesoreria_import` ADMIN-only, sin escalada de
  privilegios, sin el `print` de debug de `require_roles`).
- **Diseñar el modelo destino COMPLETO** de una: `contactos`→Persona in-place + perfiles Empleado/Usuario
  por FK nullable + `persona_roles` N:M **con `municipio_id`** + taxonomía de cargo unificada + identidad
  compuesta `(origen,id)` en el façade. Todos los huecos de §4 se resuelven acá, en el diseño — no diferidos.
- **Limpiar calidad de datos**: normalizar `''`→NULL en dni/cuit, dedup por nombre (dry-run + revisión manual).
- **Escribir LA migración** (schema nuevo vía `Base.metadata.create_all` en DB limpia; datos idempotente + backup JSON).
- **Probar contra un CLON de SPN en qa** hasta que la prueba de paridad (§5) dé **100%**.

### 3.2 Ventana (SPN parado, coordinada con el cliente)
1. Backup completo de la DB de prod.
2. Correr la migración YA probada.
3. **Prueba de paridad de API (baseline vs post) = GATE.** 100% → seguir; <100% → rollback por backup.
4. Arrancar + smoke del front real con navegador.

### 3.3 Rollback
El backup previo = vuelta al estado exacto. La ventana NO se cierra hasta que la paridad dé 100%.
El riesgo residual no es de datos (los cubre backup+ventana) sino de CORRECCIÓN del código/migración —
por eso el peso está en probar todo en qa con clon de SPN ANTES, no en la ventana.

## 4. Crítica adversarial — huecos a resolver ANTES de ejecutar
El plan es correcto y su tesis (evolucionar `contactos` in-place) se verificó contra el código. PERO:
1. **F0 mal vendida como "trivial/shapes idénticos".** Mezcla un fix de correctness seguro con un
   barrido de auth que introduce una **ESCALADA DE PRIVILEGIOS**: `tesoreria_import` es ADMIN-only
   (`if user.rol != ADMIN`), reemplazarlo mecánicamente por `require_roles(['admin','supervisor'])`
   dejaría a supervisores correr el **import masivo destructivo del padrón** sobre SPN. Además
   `require_roles` mete `print('[AUTH]…')` en cada request y cambia los mensajes de 403. → **PARTIR F0**:
   deployar SOLO el fix del `/merge` primero (aislado, cero-schema/data); el auth **por archivo, no
   mecánico** (preservar `tesoreria_import` ADMIN-only, el guard de municipio de `tasas`).
2. **Façade UNION (F1): colisión de IDs.** `empleados.id` y `contactos.id` se solapan (ambos desde 1).
   Identidad de Persona debe ser **compuesta `(origen, id)`** de punta a punta; Sheet/CrearOPWizard/
   ContactoAutocomplete deben seguir recibiendo ids NATIVOS, nunca de la UNION.
3. **`persona_roles` sin `municipio_id`.** El borrado de muni demo hace `DELETE … WHERE municipio_id`
   dentro de `try/except:pass` → falla silencioso y deja huérfanos. Darle `municipio_id` propio.
4. **F5 "Persona espejo" para vecinos.** `usuarios` tiene ~580 filas, mayoría VECINOS; backfillear
   `persona_id` para todos crearía un contacto por ciudadano, contaminando el padrón/autocomplete/dedup.
   **Acotar el backfill a roles de staff.**
5. **F6 UNIQUE rompe por string vacío.** `dni` viene de Excel; MySQL trata `''` como colisión (solo NULL
   no colisiona). **Normalizar `''`→NULL en dni/cuit ANTES del índice**, y correrlo en QA con clon de SPN.
6. **KPIs de Sueldos (F1):** al colapsar en `/personas`, excluir los 7 empleados-core seed de la masa
   salarial o hay regresión visible en la pantalla productiva de SPN.

## 5. Prueba final (criterio de aceptación)
**Paridad de API para SPN (muni 80):** baseline = llamar TODOS los GET de tesorería del muni 80 en
prod (o qa mientras == prod), guardar los JSON; post = mismos endpoints en qa con el modelo nuevo;
**éxito = diff 0 (100% integridad)**. El refactor interno no debe cambiar nada de lo que la API devuelve.
Baseline se captura ANTES de tocar qa. code-to-db para levantar el schema nuevo en DB limpia:
`Base.metadata.create_all` (core/database.py:37; Alembic congelado, no sirve para regenerar).

## 6. Arranque recomendado
Primer paso de la Preparación (§3.1), independiente de la ventana y con valor propio: **el fix del
`/merge`** — agregar el 3er reapunte `UPDATE ordenes_pago SET destino_contacto_id=keep_id WHERE
destino_contacto_id IN merge_ids` en `contactos.py::merge_contactos` (importar `OrdenPago`, sumar
rowcount al `MergeResponse`). Cero-schema/data, deployable y verificable solo en qa. Es un **bug real
que afecta a SPN hoy** (fusionar un contacto con OPs asociadas las orfana). Después: diseño del modelo
destino completo + limpieza de datos + la migración, todo probado en qa con clon de SPN, y recién ahí
la ventana con el cliente.
