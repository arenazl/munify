# Carpeta compartida — memoria curada para agentes

Punto de encuentro entre la memoria que los agentes graban **en la maquina local**
del user y las sesiones que corren **en la nube**, que no tienen acceso a ese file
system.

Este documento es **general**: no pertenece a ningun proyecto en particular. Vive
en el proyecto de infraestructura, que es el que concentra las tareas cross
(deploy continuo, ambientes, pases, update kit) y oficia de gateway entre las
apps. Si aparecio en el repo de una app, es de paso: sacarlo de ahi.

## Por que existe

Un agente local lee `~/.claude/CLAUDE.md` (memoria global del usuario) y el
`CLAUDE.md` de cada proyecto. Una sesion remota **no**: arranca en un container
limpio con el repo clonado y nada mas. Todo lo que el user acumulo en años de
trabajo es contexto perdido del otro lado — y no hay hook ni configuracion que lo
arregle, porque el archivo esta en una maquina a la que el container no llega.

La unica solucion es versionar una copia **curada** de esa memoria donde la sesion
remota si pueda verla.

## Estructura

```
compartida/
├── README.md                      <- este archivo (el contrato)
├── prompt-memoria-global.md       <- se tira UNA vez, en la maquina local
├── prompt-memoria-proyecto.md     <- se tira en CADA proyecto
├── global/
│   └── memoria-global.md          <- copia curada de ~/.claude/CLAUDE.md
└── proyectos/
    ├── <app>/memoria.md           <- una carpeta por aplicacion
    └── ...
```

Los archivos curados los produce un agente corriendo los prompts de esta carpeta.
Un loop local diario los regenera y commitea.

## Contrato de los archivos curados

No son sugerencias: si no se cumplen, el archivo hace mas daño que bien.

1. **Fechado.** Primera linea: `> vigente al AAAA-MM-DD`. Sin fecha, un agente
   remoto no tiene forma de desconfiar de un dato viejo — le cree y responde con
   seguridad algo que dejo de ser cierto hace dos años.
2. **Verificado.** Toda afirmacion sobre infraestructura o servicios se contrasta
   contra la fuente real antes de entrar. Lo que no se pudo verificar entra
   marcado `(sin verificar)`. Una duda explicita vale mas que una certeza falsa.
3. **Sin credenciales.** Lo que vive aca describe **como estan armadas** las cosas,
   no como entrar. Donde el dato haga falta para entender la arquitectura, va la
   forma sin el valor: `DATABASE_URL apunta a MySQL en Aiven (credencial en el
   gestor)`. Las claves se quedan en la maquina local, detras del firewall.
4. **Presente, no historia.** Como son las cosas hoy. Lo que se probo y se
   descarto va al `legacy/` del proyecto que corresponda, no aca.
5. **Generado, no escrito a mano.** Editarlos a mano los desincroniza de la fuente
   y el proximo loop pisa el cambio.

## Refresco

Un archivo que hace semanas que no se toca es señal de que el loop se rompio, no
de que nada cambio. Chequear la fecha de la primera linea antes de confiar en el
contenido.
