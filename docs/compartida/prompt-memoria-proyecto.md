# Prompt — curar la memoria de UN proyecto

**Donde se tira:** dentro de cada proyecto, con el agente parado en esa carpeta.
**Que produce:** `compartida/proyectos/<nombre>/memoria.md` en el repo de infraestructura.

Es el mismo prompt para todos los proyectos: el agente resuelve el nombre solo.
Copiar de la linea punteada para abajo.

---------------------------------------------------------------------------

Sos un agente parado en la carpeta de uno de mis proyectos. Tarea: **curar la
memoria de ESTE proyecto** y dejar una copia publicable para sesiones remotas.

## 1. Ubicarte

- Resolve el nombre del proyecto desde el remote de git (`git remote -v`), no desde
  el nombre de la carpeta local — pueden no coincidir.
- Fuentes a leer: el `CLAUDE.md` del proyecto, cualquier `CLAUDE.md` anidado en
  subcarpetas, y lo que haya en `~/.claude/projects/` para esta ruta.

Decime que encontraste antes de tocar nada.

## 2. Que entra y que no

Entra lo que **hoy es cierto y no se deduce leyendo el codigo**:

- arquitectura real y donde corre cada capa en produccion
- decisiones tomadas y por que (sobre todo las contraintuitivas)
- trampas conocidas: cosas que parecen bien y rompen
- comandos reales de build, test y deploy de este proyecto
- estado de los modulos: cual anda, cual esta a medias, cual esta abandonado

No entra:

- lo que se lee del codigo en treinta segundos (estructura de carpetas, stack)
- planes que nunca se hicieron, specs de features descartadas
- historial de bugs ya arreglados
- cualquier cosa que aplique a todos mis proyectos: eso es memoria global, va por
  el otro prompt

## 3. Contrastar contra la realidad — bloqueante

Este es el paso que importa. La memoria acumulada de años **tiene datos que
dejaron de ser ciertos**, y un dato viejo con tono seguro es peor que no tener nada.

Por cada afirmacion sobre infraestructura, deploy o servicios externos,
**verificala contra la fuente real** antes de copiarla:

- ¿dice que algo se deploya de una forma? Chequea que ese pipeline exista
- ¿nombra un servicio o proveedor? Confirma que siga en uso
- ¿nombra una URL o un endpoint? Pegale y fijate que responda

Caso real: el `CLAUDE.md` de munify decia que el front deploya via GitHub Actions.
El repo no tiene ni un workflow — Netlify usa su integracion nativa. El dato era
verosimil, estaba escrito con seguridad, y era falso.

Todo lo que no puedas verificar, marcalo `(sin verificar)` en el archivo. Preferible
una duda explicita que una certeza falsa.

## 4. Sanitizar — bloqueante

Vale lo mismo que para la memoria global: ni tokens, ni keys, ni passwords, ni
connection strings, ni contenido de `.env`. Si un secreto aparece en claro,
avisame aparte para rotarlo.

Ojo tambien con datos de clientes reales: nombres, direcciones, montos. Si hacen
falta para el contexto, anonimizalos.

## 5. Escribir

Un solo archivo: `compartida/proyectos/<nombre>/memoria.md`.

- Primera linea: `> vigente al AAAA-MM-DD` con la fecha de hoy.
- Segunda linea: en una oracion, que es este proyecto.
- Despues, agrupado por tema, en presente.
- **Sin emojis.**
- Techo de ~250 lineas.

Si el proyecto ya tiene un `memoria.md` de una corrida anterior: **no lo pises a
ciegas**. Compara, y decime que cambio antes de escribir.

## 6. Reportar

En no mas de 10 lineas: que entro, que tiraste, **que afirmaciones resultaron
falsas al verificarlas** (esto es lo mas valioso del ejercicio), y si aparecio
algun secreto.

No commitees. Quiero revisarlo antes.
