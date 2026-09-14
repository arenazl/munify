# Estado VERIFICADO del pase Persona · 2026-09-14

> Este documento existe porque la conversación previa acumuló contradicciones. Acá **todo
> está verificado contra el código y contra las dos bases**, con la consulta que lo prueba.
> Nada de memoria ni de "según el plan". Si algo no pudo verificarse, dice NO VERIFICADO.

---

## 1. Por qué había confusión: hay DOS generaciones de scripts

| Generación | Scripts | Para qué se hizo |
|---|---|---|
| **13/09 — por fases** | `migrar_f0_persona_obras` · `migrar_personas_parte_a` · `migrar_personas_parte_b1` · `migrar_personas_parte_b2` · `migrar_spn_f3` | avanzar paso a paso en QA, con **corte antes de San Pedro** (`--sin-spn`) |
| **14/09 — unificado** | `pase_persona_obras.py` | un solo comando para Infra, que no conoce el dominio |

El unificado comprime F0 + A + B2 + F3. **Al comprimir perdió el corte antes de SPN.**
Los cinco viejos siguen en el repo y no están marcados como legacy: esa convivencia sin
rótulo es la fuente del ruido.

---

## 2. Qué hace el unificado — leído del CÓDIGO, no del encabezado

1. Esquema aditivo: 3 tablas + 20 columnas NULL.
2. Catálogo de tipos de persona por municipio (`INSERT IGNORE`).
3. Espeja el enum `contactos.tipo` a `persona_roles`.
4. Crea la Persona de cada empleado y lo engancha.
5. Crea la Persona del personal con login ACTIVO. Los vecinos nunca entran.
6. SPN: sus tipos de empleado pasan a **subtipos de `empleado` con el mismo nombre**
   (`padre_id`), y cada persona que cobra recibe su ficha laboral con su modalidad.

**Dos cosas que el encabezado NO declara y el código SÍ hace:**
- Normaliza `'' -> NULL` en dni y cuit (líneas 267-268). En prod hay 3 dni vacíos, todos de SPN.
- **No borra NADA.** Los 4 `DELETE` del archivo están dentro de `--revertir` y sólo tocan
  lo que la propia corrida creó (por `id > tope`). El camino de aplicar es 100% aditivo.

**Lo que el unificado NO hace y el viejo `b2` sí:** borrar los 7 empleados de semilla de
SPN. Está bien que no lo haga: es el único paso destructivo y conviene tenerlo aparte.

---

## 3. Estado real de cada ambiente (medido hoy)

| | QA (`sugerenciasmun-qa`) | PROD (`munify_prod`) |
|---|---|---|
| tablas nuevas | las 3 | **las 3 ya existen** |
| columnas nuevas | las 20 | **faltan las 20** |
| datos migrados | **completo** | nada |
| municipios | 28 | 103 |

El script corrido en QA responde textual: **"YA ESTÁ HECHO: no hay nada que aplicar"**
(0 vínculos por crear, 0 empleados sin persona, 0 fichas pendientes).

San Pedro Norte en QA: 1.266 personas · 1.519 vínculos · 108/108 empleados enganchados ·
0 dni/cuit vacíos. En PROD: 1.272 personas · 8.538 gastos · 7 empleados (semilla, 0 OT).

---

## 4. Qué está probado, y con qué evidencia

| Prueba | Resultado | Dónde |
|---|---|---|
| aplicar → revertir | `persona_roles` 2.278 → 2.531 → **2.278 exacto**; `contactos` y `empleados` sin moverse | QA, 14/09 |
| gate de paridad | 38 endpoints como Bartolo, **diferencia cero** | QA, 14/09 |
| modo PLAN contra prod | **ROTO hasta hoy** — arreglado y reprobado en los dos ambientes | 14/09 |

---

## 5. Lo que falta, en orden

1. **Portar `--sin-spn` al unificado.** Existe y está probada en `migrar_personas_parte_b2`.
   Es la que permite: una corrida para las demos, mirar, y después la de San Pedro.
2. **Rotular los 5 scripts viejos** como legacy, o borrarlos. Mientras convivan sin rótulo,
   cualquiera (humano o agente) puede correr el equivocado.
3. **Arreglar el purgador**: no reconoce `@demo-vecinos.com`, así que saltea demos
   creyéndolas productivas (caso La Matanza: 151 usuarios con ese dominio).
4. **Decisión del dueño**: qué demos se borran y si La Matanza sobrevive como lote de prueba.

## 6. Lo que NO está verificado

- El comportamiento del unificado sobre un municipio **sin contactos pero con empleados**
  (el caso La Matanza: 31 empleados, 0 contactos). En QA nunca se probó ese perfil por
  separado. Es el motivo por el que el ensayo por lotes vale la pena.
- El `RENAME` de `contactos` a `personas` (viejo `parte_b1`) NO entra en este pase: es una
  fase aparte, con su propio deploy.
