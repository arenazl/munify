# STANDARD — Cabecera de pantalla: cuándo va hero semántico y cuándo no

Criterio delegado por el dueño (2026-07-31) para el repaso de TODAS las pantallas
con grilla. Aplica al kit completo, no sólo a Munify.

## 1. Lo que va SIEMPRE, sin excepción

Toda pantalla arranca con la **cabecera de módulo** (`PageHeader`):

```
EYEBROW EN CAPS          ← categoría; se auto-oculta si repite la miga de pan
Título grande en display ← enunciativo, dice de qué se trata la pantalla
Bajada de 1-2 líneas     ← qué ve el usuario acá y cómo está ordenado
```

Después, el orden del estándar: hero (si corresponde) → controles → filtros →
contenido. Nunca el título abajo, nunca pegado al buscador.

## 2. La pregunta que decide si va hero semántico

> **¿Puedo escribir una frase que cambie mañana y que le diga al usuario qué
> hacer HOY?**

- **Sí** → hero semántico, con su frase veredictada, sus KPIs y sus acciones.
- **No** (la frase sería siempre la misma, tipo "Tenés 12 categorías cargadas")
  → **sin hero**. Del título y la bajada se pasa directo al contenido.

El costo de equivocarse no es estético: si el hero a veces dice obviedades, el
usuario aprende a no leerlo y lo saltea **también donde sí importa**. Un hero de
relleno le quita credibilidad a los que informan de verdad.

## 3. Reparto tentativo (validar pantalla por pantalla al migrar)

**CON hero semántico** — tienen vencimientos, cola de trabajo o plata en juego:
Reclamos · Trámites · Mapa · Tablero · Planificación · SLA · Órdenes ·
Inventario (stock que se agota, activos sin devolver) · Agenda · Mostrador ·
Cobros · Tasas · Gastos · Liquidaciones · Cajas · Conciliación · Personal
(licencias de hoy, gente sin cuadrilla) · Horarios (movido acá 2026-08-02:
el canvas Horarios.dc.html lo trae con hero — el canvas manda sobre esta
lista cuando difieren).

**SIN hero, sólo título + bajada** — catálogos y configuración, donde el estado
no cambia solo: Categorías · Zonas · Usuarios · Tipos de trabajo ·
Tipos de POI · todas las pantallas de Configuración.

**Caso intermedio (actualizado 2026-08-02, mandato del dueño):** los KPIs
sueltos NO existen más en ninguna pantalla. Si hay 2-3 números útiles sin
decisión asociada, van igual al strip de KPIs del SemanticHero, con una frase
mínima FACTUAL (sin veredicto si no hay nada que juzgar). La frase es lo que
exige tener algo que decir; los números siempre viven dentro del hero.

## 4. Regla de datos (no negociable)

La frase del hero se arma con datos REALES de la pantalla. Si un dato no está
disponible, esa parte de la frase no se escribe — nunca se rellena con un
número inventado ni con un placeholder. Los umbrales de veredicto salen de
`lib/veredictos.ts`, jamás de números mágicos en la pantalla.
