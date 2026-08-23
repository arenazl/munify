# Prompt — curar la memoria GLOBAL

**Donde se tira:** en la maquina local, una sola vez (despues lo repite el loop diario).
**Que produce:** `compartida/global/memoria-global.md` en el repo de infraestructura.

Copiar de la linea punteada para abajo.

---------------------------------------------------------------------------

Sos un agente con acceso a mi file system local. Tarea: **curar mi memoria global
de Claude Code** y dejar una version publicable para sesiones remotas.

## 1. Encontrar la fuente

No asumas rutas — verificalas. Buscar, en este orden:

- `~/.claude/CLAUDE.md` (memoria global del usuario, la fuente principal)
- `~/.claude/memory/` si existe
- cualquier `CLAUDE.md` o `MEMORY.md` en el home que no pertenezca a un proyecto puntual

Listame que encontraste y cuanto pesa cada uno **antes** de tocar nada.

## 2. Separar en tres baldes

Leer todo y clasificar cada bloque. La pregunta para cada uno es una sola:

> Si un agente que no me conoce lee esto solo, ¿lo lleva a la verdad o a un error?

- **CROSS (va al archivo curado).** Aplica a mas de un proyecto: convenciones mias
  de trabajo, librerias compartidas y sus versiones, el kit de componentes, como
  funciona el proyecto de infraestructura, la carpeta compartida del file system
  por donde se comunican mis apps, criterios de deploy, decisiones que tome una vez
  y valen para todo.
- **DE UN PROYECTO (no va).** Todo lo especifico de una sola app. Decime a que
  proyecto corresponde cada bloque y dejalo apartado: se maneja con el otro prompt.
- **MUERTO (no va).** Cosas superadas, intentos abandonados, referencias a
  servicios que ya no uso, datos que se contradicen con otros mas nuevos.

Si dos bloques se contradicen, **no elijas por tu cuenta**: mostrame los dos y
preguntame cual vale.

## 3. Sanitizar — bloqueante

El archivo va a un repositorio. Antes de escribir, barrer y **eliminar**:

- tokens, API keys, passwords, connection strings con credenciales
- contenido de `.env` de cualquier proyecto
- IDs de servicio que solo sirvan teniendo la credencial

Donde el dato sea necesario para entender la arquitectura, dejar la forma sin el
valor: `DATABASE_URL apunta a MySQL en Aiven (credencial en el gestor)`.

Si encontras un secreto, **decimelo aparte**: significa que un agente lo guardo en
claro y hay que rotarlo.

## 4. Escribir

Un solo archivo: `compartida/global/memoria-global.md`.

- Primera linea: `> vigente al AAAA-MM-DD` con la fecha de hoy.
- Agrupado por tema, con titulos `##` que digan de que se trata.
- Cada bloque en presente y afirmativo: como son las cosas hoy.
- **Sin emojis** (regla dura mia, aplica a todo lo que escribas).
- Apuntar a un techo de ~400 lineas. Esto se lee en cada sesion remota: cada
  linea de mas se paga siempre. Si no entra, lo que sobra es referencia, no
  regla — mandalo a un archivo aparte y dejá el link.

## 5. Reportar

Al terminar, en no mas de 10 lineas:

- cuantos bloques entraron, cuantos quedaron apartados por proyecto, cuantos tiraste
- las contradicciones que encontraste y como quedaron
- si aparecio algun secreto (y cual, para rotarlo)
- que quedo afuera por el techo de lineas

No commitees. Quiero revisarlo antes.
