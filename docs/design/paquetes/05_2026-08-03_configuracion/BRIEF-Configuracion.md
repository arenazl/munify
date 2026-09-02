# BRIEF · Pantalla de Configuración (esqueleto para componentizar)

> Copia del brief que se subió al canvas el 2026-08-02 (`BRIEF Configuracion.md`
> del proyecto `46976e44-b6dc-4395-b1fe-15aa2a8f9584`). Queda acá para que se
> pueda leer el diseño sabiendo qué se pidió.

Escrito desde el repo de Munify el 2026-08-02. Todos los datos de acá son
REALES, relevados del código — no hay nada inventado.

---

## 1. Qué necesitamos

**Un solo esqueleto bien resuelto de la pantalla de Configuración**, no 8
pantallas. La idea es que ustedes definan el patrón una vez y nosotros lo
componentizamos y lo repetimos en toda la app.

Lo que estructuralmente es Configuración:

```
[ tabs PADRE ]  ← el módulo del que estás hablando
    [ tabs HIJO ]  ← los catálogos de ese módulo
        [ contenido ]  ← casi siempre una grilla
```

Hoy eso está resuelto con un nivel de más: una pestaña muestra "tiles" y cada
tile te lleva a OTRA pantalla que a su vez tiene pestañas. Queremos eliminar el
salto: la pestaña hija ES el catálogo.

## 2. La estructura (ya decidida — es el input, no la pregunta)

El criterio es: primero el municipio y su gente, después **un tab por MÓDULO**,
y al final lo que conecta hacia afuera.

| Tab padre | Tabs hijos |
|---|---|
| **General** | Datos del municipio · QR de cartelería · Apariencia |
| **Personal** | Empleados · Cuadrillas · Ausencias |
| **Atención al vecino** | Vecinos · Categorías de reclamo · Categorías de trámite · Tipos de trámite · SLA · Tipos de punto de interés |
| **Catálogos** | Dependencias · Asignación · Zonas |
| **Inventario** | Inventario · Categorías de inventario · Tipos de trabajo |
| **Tesorería** | Conceptos · Conceptos de liquidación · Tipos de empleado · Cajas / Fondos · Retenciones · Parajes · Proyectos · Tarjetas · Contactos · Catálogo de tasas |
| **Integraciones** | Proveedores de pago · WhatsApp · IA |
| **Super Admin** | Auditoría · Suscripciones · Config del sidebar |

**El caso difícil que hay que resolver bien: la asimetría.** *General* tiene 3
hijos y *Tesorería* tiene 10. El diseño tiene que aguantar los dos sin que uno
se vea vacío y el otro desbordado. Además, **los tabs padre de módulo aparecen o
no según lo que el municipio tenga contratado**: un muni sin Tesorería no ve esa
pestaña, así que la fila de tabs padre puede tener 4 o 8 elementos.

## 3. Qué hay adentro (medido sobre la app real)

- **~70% grillas** — lista de filas con acciones (editar / borrar) y un botón
  "Nuevo". Es lo abrumadoramente mayoritario.
- **~20% "canvas"** — mapa, calendario, kanban.
- **~10% tarjetas** — pocas pantallas.
- **2 pantallas con drag & drop** (kanban de reclamos, calendario de pagos).

De los tabs hijos de la tabla de arriba, **7 son exactamente el mismo ABM**:
nombre, icono, color, activo, orden. Categorías de reclamo, Categorías de
trámite, Categorías de inventario, Tipos de trabajo, Tipos de punto de interés,
Tipos de empleado, Parajes. **Por eso pedimos UN ejemplo, no siete.**

## 4. Regla dura: todo sale del ABM Semántico

Ya tenemos un componente `SemanticAbmPage` (PageHeader + SemanticHero con los
KPIs adentro + ListToolbar + FilterBar + DataTable con statusTabs). **Queremos
que la misma pieza sirva como TABLA o como TARJETAS con un toggle de vista**, no
dos componentes distintos.

Entonces, del esqueleto de Configuración necesitamos saber:

1. Cómo se ven los **tabs padre** y los **tabs hijos** juntos sin que compitan
   (dos niveles de navegación en la misma pantalla, uno arriba del otro).
2. Cómo entra un ABM adentro de un tab hijo: ¿el ABM trae su propio header y
   título, o lo aporta el tab y el ABM entra "pelado"? Hoy tenemos el problema
   de que un componente se embebe con su header adentro de otra pantalla y hay
   que taparlo con márgenes negativos.
3. Qué pasa con un tab hijo que **no** es una grilla (ej. "Datos del municipio",
   que es un formulario; "QR de cartelería", que es una imagen + botón).

## 5. Lo que NO hace falta

- No diseñar las 8 pestañas: **una bien resuelta alcanza**, con el ejemplo del
  caso de 3 hijos y el de 10.
- No diseñar los 7 ABMs de catálogo: **uno genérico** y lo replicamos.
- "Tipos de trabajo" está por eliminarse del modelo (se fusiona con Categorías
  de reclamo). Si simplifica, ignoralo.

## 6. Contexto de marca

La app corre white-label. El ejemplo que estamos usando en QA es **Paraguay
Limpio** (Asunción, Dpto. Central), verde. El mismo esqueleto tiene que
funcionar con la marca azul de Munify.
