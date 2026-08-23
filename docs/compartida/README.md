# Carpeta compartida — memoria curada para agentes

Punto de encuentro entre la memoria que los agentes graban **en la maquina local**
del user y las sesiones que corren **en la nube** (Claude Code on the web), que no
tienen acceso a ese file system.

## Por que existe

Un agente local lee `~/.claude/CLAUDE.md` (memoria global del usuario) y el
`CLAUDE.md` de cada proyecto. Una sesion remota **no**: arranca en un container
limpio con el repo clonado y nada mas. Todo lo que el user acumulo en años de
trabajo es contexto perdido del otro lado.

La solucion es versionar una copia **curada** de esa memoria en un repo que la
sesion remota si pueda ver.

## Estado actual

Por ahora esta carpeta contiene **solo los prompts**. El contenido curado NO va
aca todavia.

> **`arenazl/munify` es un repositorio PUBLICO.** La memoria global cruza ~40
> proyectos: rutas del file system, URLs de infraestructura, nombres de clientes.
> Nada de eso puede vivir en un repo publico.

**Destino final del contenido:** el proyecto de infraestructura (privado), que ya
concentra las tareas cross-project (CD, ambientes, pases, update kit). Cuando ese
repo este en la nube, esta carpeta entera se muda ahi y los proyectos la traen
como fuente unica.

## Estructura de destino

```
compartida/
├── README.md                      <- este archivo (el contrato)
├── prompt-memoria-global.md       <- se tira UNA vez, en la maquina local
├── prompt-memoria-proyecto.md     <- se tira en CADA proyecto
├── global/
│   └── memoria-global.md          <- copia curada de ~/.claude/CLAUDE.md
└── proyectos/
    ├── munify/memoria.md          <- copia curada del memory de munify
    ├── tasar/memoria.md
    └── <una carpeta por app>
```

## Contrato de los archivos curados

Todo archivo que caiga aca cumple estas reglas. No son sugerencias: si no se
cumplen, el archivo hace mas daño que bien.

1. **Fechado.** Primera linea: `> vigente al AAAA-MM-DD`. Sin fecha, un agente
   remoto no tiene forma de desconfiar de un dato viejo — le cree y responde con
   seguridad algo que dejo de ser cierto hace dos años.
2. **Cero secretos.** Ni tokens, ni API keys, ni passwords, ni connection strings
   con credenciales, ni contenido de `.env`. Si un dato solo sirve teniendo la
   credencial, no va.
3. **Presente, no historia.** Como son las cosas hoy. Lo que se probo y se
   descarto va a `docs/legacy/`, no aca.
4. **Generado, no escrito a mano.** Estos archivos los produce un agente corriendo
   los prompts de esta carpeta. Editarlos a mano los desincroniza de la fuente.

## Refresco

El user corre un loop local (diario) que vuelve a tirar los prompts y commitea el
resultado. Un archivo que hace semanas que no se toca es señal de que el loop se
rompio, no de que nada cambio.
