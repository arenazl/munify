# PASE A PRODUCCIÓN — Munify / Persona y Obras

> **Paquete preparado el 2026-09-14, con el deploy a QA recién hecho y los datos en la mano.**
> Contrato: `base-compartida/21-PASE-A-PRODUCCION.md`. Lo ejecuta **Infra**; esta app no
> mergea a `master` ni escribe en la base de producción.
>
> **Este paquete NO es urgente.** Es el que queda listo para cuando el dueño decida promover.
> Nada de acá se ejecuta sin que él lo pida.

---

## En una línea

Los empleados, proveedores y contactos pasan a ser **una sola entidad Persona** con tipos y
subtipos por municipio, y sobre eso se apoya el **módulo Obras** (etapas, plata por etapa,
diagnóstico). Todo el esquema es **aditivo**: ningún endpoint cambia su respuesta.

## Estado en QA (lo que Infra puede verificar por su cuenta)

| Qué | Valor |
|---|---|
| Commit en `qa` | `cc4c7976` |
| Build backend QA | SUCCESS · `deploy-munify-api-qa` · SHA `cc4c797` |
| Build front QA | SUCCESS · `deploy-munify-front-qa` · SHA `cc4c797` |
| Backend vivo | `GET /api/obras` sin token → **401** (la ruta existe) |
| Front vivo | `qa.munify.com.ar` → bundle `index-CV1C1xXA.js` |
| Datos en QA | 8 obras en San Pedro Norte, 4 de ellas `[DEMO]`; 2.278 personas con rol |

## Gates (corridos el 2026-09-14, antes del push)

| Gate | Resultado |
|---|---|
| `npm run build` (front) | **exit 0** |
| `npx eslint` de los archivos tocados | **limpio** (queda un error viejo en `components/ui/Modal.tsx`, un `setState` dentro de un efecto, que ya estaba antes de este trabajo) |
| `pyflakes` de los archivos tocados | **limpio** |
| **Gate de paridad de Tesorería** | **38 endpoints, DIFERENCIA CERO** |

El gate de paridad es el que importa: compara las respuestas de los 38 endpoints de Tesorería
como **Bartolo** (usuario 858, San Pedro Norte) entre el QA publicado *sin* el cambio y el
backend *con* el cambio, contra la misma base. Cero diferencia significa que al único cliente
productivo no le cambia **nada** de lo que ve hoy.

Reproducirlo:

```bash
cd backend
python scripts/paridad_tesoreria.py capturar --base <backend_sin_el_cambio> --out ../_paridad/pre
python scripts/paridad_tesoreria.py capturar --base <backend_con_el_cambio> --out ../_paridad/post
python scripts/paridad_tesoreria.py comparar ../_paridad/pre ../_paridad/post
```

---

## 1. El código

**La promoción `qa` → `master` NO tiene conflictos.** Verificado el 2026-09-14 con
`git merge-tree` sobre la base común `82bbd4e5`: **0 marcas de conflicto**.

Dos caminos posibles, la decisión no es de esta app:

- **A. Promoción en bloque** (`qa` → `master`, el camino normal del doc 10). Limpia, sin
  conflictos. **Arrastra los otros 82 commits que `qa` acumuló** de otros trabajos (llamados,
  tarjeta de SPN, cartografía). Sólo sirve si todo eso también está para promover.
- **B. Rama aislada sólo con este bloque.** Si se decide promover únicamente Persona y Obras,
  **avisar y la preparo yo**: son 13 commits y tocan archivos que `master` también cambió
  (`pages/Tesoreria.tsx`, `lib/api.ts`, `main.py`), así que el aislamiento hay que hacerlo con
  cuidado y probarlo, no es un cherry-pick a ciegas.

Alcance del bloque: 3 tablas nuevas, columnas nuevas en 6 tablas, 2 endpoints nuevos
(`/api/personas`, `/api/obras`), 3 pantallas nuevas y el catálogo de Configuración unificado.

## 2. El script de datos

`backend/scripts/pase_persona_obras.py` — cumple la forma estándar del contrato:

```bash
cd backend
python scripts/pase_persona_obras.py                           # PLAN: dice qué haría
python scripts/pase_persona_obras.py --apply --si-estoy-seguro  # lo hace
python scripts/pase_persona_obras.py --revertir <backup.json>   # lo deshace
```

- **Modo PLAN por defecto**: no escribe nada, imprime los números. Ese output es el informe.
- **Doble bandera para escribir.** Con una sola, aborta.
- **Backup antes de escribir**, a `backend/respaldos/pase_persona_obras_<fecha>.json`.
- **Idempotente**: la segunda corrida dice "ya está hecho" y sale.
- **Los datos van en UNA transacción.** El esquema es DDL y MySQL le hace commit implícito a
  cada sentencia; por eso es sólo aditivo (tablas nuevas y columnas NULL): si el pase se
  revierte, lo que queda es inocuo para el código anterior, que no las mira.
- **Cero credenciales por parámetro**: la `DATABASE_URL` sale del entorno donde corre.

### Probado punta a punta en QA el 2026-09-14

| Paso | `persona_roles` |
|---|---|
| antes | 2.278 |
| después de `--apply --si-estoy-seguro` | 2.531 |
| después de `--revertir` | **2.278** (exacto) |

`contactos` (2.278) y `empleados` (383) no se movieron en ninguno de los tres pasos. Después
del ensayo se volvió a aplicar, así que **QA quedó en el estado correcto**.

### Qué hace, en orden

1. **Esquema aditivo**: crea `persona_tipos`, `persona_roles` y `obra_etapas`; agrega columnas
   NULL a `contactos`, `empleados`, `usuarios`, `proyectos`, `gasto_proyectos`,
   `ordenes_trabajo` e `inventario_ordenes_compra`.
2. **Catálogo** de tipos de persona por municipio (`INSERT IGNORE`).
3. **Roles**: espeja el enum `contactos.tipo` a la tabla N:M.
4. **Empleados**: crea la Persona de cada empleado y lo engancha.
5. **Usuarios de gestión activos**: su Persona y su rol. Los vecinos nunca entran.
6. **San Pedro Norte**: sus tipos de empleado pasan a subtipos de `empleado` y cada persona que
   cobra sueldo recibe su ficha laboral con la modalidad que corresponde.

---

## 3. LO SENSIBLE de esta app en el pase

> Esto es lo que hay que mirar con lupa. El resto es rutina.

| Qué | Por qué es sensible | Cómo está cubierto |
|---|---|---|
| **`contactos` de San Pedro Norte** | Es la libreta real del único cliente productivo: 2.278 personas, y de ahí sale a quién se le paga | El pase **sólo agrega** filas y vínculos. No modifica ni borra una sola persona existente |
| **Las fichas laborales de SPN** | Si quedan mal, Bartolo no puede liquidar sueldos | Se crean sólo para personas activas que ya cobran, con la traducción de sus 12 tipos de empleado, revisada con él |
| **`empleados.capacidad_maxima`** | Si queda NULL, `/api/empleados` devuelve 500. **Ya nos pasó en QA** | El script la fija en 10 y lo **verifica al final**; si algo quedó NULL, aborta y avisa |
| **Empleados con nombre repetido** | Enlazarlos a la persona equivocada mezcla dos legajos | El script **NO los engancha**: los lista por id para curar a mano |
| **Los 38 endpoints de Tesorería** | Es la operatoria diaria del cliente | Gate de paridad: **diferencia cero** |
| **El renombre `contactos` → `personas`** | Es lo único no aditivo de todo el trabajo | **NO entra en este pase.** Es el paso 2 de la noche de mantenimiento, con su propio procedimiento |

### Lo que NO es sensible

- **El esquema**: tablas nuevas y columnas NULL. El código anterior no las mira, así que un
  rollback de código las deja ahí sin efecto.
- **Tesorería, cajas, agenda de pagos, órdenes de pago y la tarjeta**: no se tocan.
- **El módulo Obras**: es **opt-in**. En producción arranca **apagado** para todos los
  municipios; se enciende desde la pantalla de módulos cuando el municipio lo contrata.

### Lo que NO tiene que viajar a producción

- **Las 4 obras `[DEMO]` de San Pedro Norte y las 3 de Merlo.** Son datos de prueba que viven
  sólo en QA. El script de pase **no las crea**: la semilla (`scripts/semilla_obras.py`) es un
  script aparte que nadie ejecuta en el pase.
- **Ninguna persona ni gasto de demostración.**

---

## 4. Los pasos (checklist para Infra)

1. **Merge** del código a `master` (opción A o B de la sección 1) → el CD deploya solo.
2. **Verificar el deploy**: revisión nueva sirviendo, `GET /health` → `{"status":"ok"}`, y
   `GET /api/obras` sin token → **401** (la ruta existe).
3. **Script en PLAN**: `python scripts/pase_persona_obras.py` → **devolver el output** a la app
   y al dueño. Ahí se ve cuántos vínculos, empleados y fichas toca, y si hay ambiguos.
4. Con el visto bueno: `python scripts/pase_persona_obras.py --apply --si-estoy-seguro`.
   **Guardar el backup** que imprime la última línea.
5. **Verificar**: que los números coincidan con los del plan y que diga "Verificación: todo da".
6. **Smoke del cliente**: entrar como San Pedro Norte y abrir Tesorería → Gastos. Tiene que
   verse igual que siempre.

**Si algo sale mal:** `python scripts/pase_persona_obras.py --revertir <backup.json>` y
rollback del código. El esquema queda, y es inocuo.

---

## 5. Plantilla del pedido (para el canal, cuando el dueño lo decida)

```
PASE A PRODUCCION — munify / Persona y Obras
Que es: empleados, proveedores y contactos pasan a una sola entidad Persona; encima va Obras.
Codigo: qa cc4c7976. Promocion qa->master SIN conflictos (merge-tree, base 82bbd4e5).
Alcance: 3 tablas nuevas + columnas NULL en 7 tablas. ALTER destructivo: NO.
Gates: build ok · eslint ok · pyflakes ok · PARIDAD TESORERIA SPN = DIFERENCIA CERO (38 endpoints)
Probado en QA: apply y revertir, persona_roles 2278 -> 2531 -> 2278 exacto.
Script: backend/scripts/pase_persona_obras.py (plan / --apply --si-estoy-seguro / --revertir)
Sensible: fichas laborales de SPN, capacidad_maxima (rompe /api/empleados si queda NULL),
          empleados homonimos (NO se enganchan solos, se listan).
NO viaja: las obras [DEMO], el renombre contactos->personas, el modulo Obras encendido.
Pasos: 1) merge  2) verificar deploy  3) script en PLAN -> me pasas el output
       4) apply  5) verificar  6) smoke de Tesoreria como SPN
```

---

_Preparado el 2026-09-14 junto con el deploy a QA, según la norma del dueño: **el paquete de
pase se arma en el momento del deploy a QA, con los datos en caliente**, no cuando se decide
promover._
