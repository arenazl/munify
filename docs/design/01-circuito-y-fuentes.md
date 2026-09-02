# Circuito del diseño: del canvas al código

## 1. La fuente

Todo el diseño de Munify vive en **un** proyecto de Claude Design:

```
projectId: 46976e44-b6dc-4395-b1fe-15aa2a8f9584
nombre:    "Rediseño de sidebar, banner y botones"
tipo:      PROJECT_TYPE_PROJECT
```

**El nombre engaña.** Es con el que se creó el proyecto y quedó pegado: adentro
está el rediseño de la aplicación entera (Liquidaciones, Gastos, Órdenes de
Pago, Reclamos, Mapa, Mostrador, Personal, Planificación, Tablero, Agenda,
Horarios…). El sidebar es una pantalla más. No leer el título como el alcance.

## 2. Cómo se llega (el handshake)

En orden de prioridad:

1. **La URL que manda el dueño.** Cuando dispara desde el canvas, el mensaje
   trae el bloque `Use the claude_design MCP … https://claude.ai/design/p/<id>?file=<archivo>`.
   Ahí viene el proyecto **y** el archivo puntual. Es la vía explícita.
2. **El id anotado en la memoria del proyecto.** Permite trabajar cuando el
   pedido llega sin URL ("los diseños están en el canvas").
3. **Descubrirlo listando: NO SE PUEDE.** `DesignSync list_projects` sólo
   devuelve proyectos de tipo *design-system* con permiso de escritura; este
   canvas es un proyecto común y **no aparece ahí**. Se puede leer con su id,
   pero no encontrar. Sin el id y sin la URL, hay que pedírsela al dueño.

El `?file=` de la URL es una sugerencia de foco: **el proyecto entero queda
legible**, así que se puede listar para ver qué otras pantallas existen.

## 3. Dónde queda archivado

| Lugar | Qué es | Rol |
|---|---|---|
| El canvas | Los `.dc.html` originales | **Fuente de verdad.** Siempre la última versión |
| `docs/design/paquetes/NN_<fecha>_<nombre>/` | Cada bajada del canvas, fechada | **Caché descartable.** El NN más alto es la vigente |
| `docs/design/_media/` | Binarios pesados de esos paquetes (mp4, zip, exports) | Fuera de git. No se versiona ni se borra |
| `docs/design/` | Esta documentación | Índice, histórico y auditoría |
| Memoria del agente | El id del canvas y las reglas | Puntero, no contenido |

**Nada de esto va en la raíz del repo.** Hasta el 2026-08-02 había una carpeta
`design/` colgando de la raíz con 71 MB mezclados (paquetes, mp4 de reels, un zip
de 12 MB). Se consolidó toda acá, por fecha, sin perder nada.

## 3.bis. El canal es de doble vía

`DesignSync` no sólo baja. Los métodos de escritura (`finalize_plan` +
`write_files`) permiten **dejarle archivos al canvas**: un brief con el mapa de
una pantalla, el grafo de datos, el kit actual en HTML. Es la alternativa a
pegarle capturas a mano — el proyecto tenía 87 `pasted-*.png` en `uploads/`
justamente porque esta mitad del canal nunca se usó.

Asimetría a tener presente: **Claude Design no tiene herramienta para iniciar el
contacto.** Ve los archivos aparecer en su proyecto, sin saber quién los puso, y
no puede avisar cuando produce algo. El turno lo da siempre el dueño.

**Por qué existe la caché:** cuando se lanza una flota de subagentes para
migrar varias pantallas en paralelo, **`DesignSync` no llega a los subagentes**.
El orquestador tiene que bajarles el `.dc` a disco antes de largarlos.

**El HTML no queda en la memoria del agente.** La memoria guarda hechos cortos
(el id, las reglas, el estado). El contenido de un `.dc` entra al contexto de la
sesión en la que se bajó y se pierde cuando esa sesión termina. En una sesión
nueva se vuelve a bajar; no es un problema, es el diseño del circuito.

## 4. Regla dura: el `.dc` es guía visual, NO se copia

Los `.dc.html` traen `style="..."` inline, `<sc-if>`, `<sc-for>` y una clase
`DCLogic` — todo eso es el runtime del canvas y **no entra al repo**.

Lo que se hace: leer el archivo como especificación (medidas, timings, estados,
reglas de comportamiento) e implementarlo en React componible del framework:
clases en el CSS del shell/kit sobre tokens `--pl-*`, piezas reutilizables, cero
inline salvo valores calculados en runtime.

Los valores concretos del canvas **sí** se respetan (256px, 68px, 240ms,
`cubic-bezier(0.2,0.8,0.2,1)`), pero como tokens/valores en CSS.

> Copiar el markup del diseño ya costó **dos días** de arreglar HTML en otra
> oportunidad. No se re-discute por pantalla.

## 5. Higiene de la caché (deuda conocida)

Estado relevado el 2026-08-02 en `docs/design/paquetes/04_2026-07-31_handoff-v2/references/` — 18 archivos,
~1,8 MB:

- **2 pares duplicados**, idénticos byte a byte con nombres distintos:
  - `reclamos-canvas.dc.html` = `reclamos-lista-v2.dc.html`
  - `dashboard-claro.dc.html` = `sidebar-banner.dc.html` ← **el nombre miente**:
    el archivo que dice "sidebar-banner" es el dashboard claro. Un agente que
    confíe en el nombre implementa la pantalla equivocada.
- Los nombres locales **no coinciden** con los del canvas (`Liquidaciones.dc.html`
  en el canvas ↔ `liquidaciones-programados.dc.html` en disco), así que no se
  puede saber si una copia está vieja sin abrir las dos.

**Convención a futuro:** el archivo local se llama igual que el del canvas
(minúsculas y guiones), y antes de implementar se baja fresco y se sobrescribe.
La caché nunca es la fuente.
