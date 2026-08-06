# Handoff · Configuración: prototipo copiado y cableado a medias

**Fecha:** 2026-08-03
**Rama:** `qa`
**Estado:** ~50%. La estética está copiada del prototipo (40 pantallas); 10 de
25 tienen datos reales. **14 commits SIN pushear** — el dueño pidió no publicar
y trabajar en local.
**Continúa:** `2026-08-03_kit-controles-y-migracion-config.md`

---

## 0. Lo primero que tenés que hacer

**Abrí el prototipo**: `docs/design-sync/Configuracion.dc.html`, doble clic.
Anda offline. Es la especificación: lo que no coincide con eso es un desvío.

Después abrí la app: `localhost:5175/gestion/configuracion` (admin).

**No empieces a codear sin haber visto los dos.** El error que costó dos días
en esta sesión fue justamente ese: implementé leyendo el `.dc` como texto, sin
abrir nunca la pantalla, y validaba con `tsc` en verde. `tsc` limpio no es
"está hecho".

---

## 1. Cómo está armado

El prototipo se copió **a datos**, no a markup. Tres archivos y tres
componentes:

| Archivo | Qué tiene |
|---|---|
| `config/canvasAbmSpec.ts` | Los 17 ABM del canvas: eyebrow, veredicto en prosa, 5 KPIs, pista, filtros, columnas, filas de muestra y la regla del pie. Copia directa de `abmSpec()`. |
| `config/canvasConfigSpec.ts` | El árbol de navegación (8 grupos, **40 pantallas**, cada una con su tipo), los catálogos con sus filas y los 4 "puentes". |
| `components/config/datosDeAjuste.ts` | **El cableado.** Una función por entidad que devuelve `filas` + `kpis` con la forma del spec, y el mapa `CABLEADO`. |

| Componente | Renderiza |
|---|---|
| `AbmDeConfiguracion` | Los 17 ABM. Traduce el spec a `SemanticAbmPage`. |
| `CatalogoDelCanvas` | Los 7 catálogos simples (nombre, icono, color, activo, orden). |
| `PuenteModulo` | Los 4 ajustes que viven en otro módulo (vecinos, inventario, contactos, ausencias). |

En `pages/Configuracion.tsx`, el panel elige en este orden: **puente →
catálogo → ABM del prototipo → pantalla real**. Las que ya tienen datos reales
están en `CON_DATOS_REALES` y ganan sobre el prototipo.

**Regla que no se negocia:** cero HTML del `.dc` en el código. El veredicto
viene del canvas como texto con `<strong>` y se **parsea** a los segmentos del
hero (`frasesDeVeredicto`), no se inyecta. Los colores del mockup (rojo, ámbar,
verde) se traducen a veredictos del kit, así ningún hex del prototipo llega a
la pantalla.

---

## 2. Cómo cablear una pantalla (la receta)

Es lo que falta hacer 15 veces. Ejemplo con Cuadrillas, ya hecha:

1. En `datosDeAjuste.ts`, escribí `datosLoQueSea()`: llamá al `list` de la API,
   armá `filas` con los helpers (`celda`, `numero`, `punto`) y `kpis` con los
   cinco que pide el spec.
2. Sumala a `CABLEADO` con el id del ajuste (el del riel, no el del spec).
3. Listo. `AbmDeConfiguracion` la usa sola; mientras carga muestra el prototipo,
   así la pantalla nunca queda en blanco ni cambia de forma.

**Cuando el spec pide un dato que el modelo no tiene** (pasó en Cuadrillas con
"órdenes abiertas" y en Zonas con "barrios cubiertos"): NO se hardcodea el
número del mockup ni se deja el hueco. Va **otro dato real y relevante de esa
misma sección**, en la misma posición y tipografía. En Cuadrillas, en vez de
las órdenes, fue si tiene responsable — el otro dato que decide si puede salir
a trabajar.

---

## 3. Qué falta, en orden

### 3.1 — Los botones (lo que más se nota)

**Ninguna de las 28 pantallas copiadas tiene el alta cableada.** El CTA del
prototipo (`spec.cta`) se renderiza sólo si le pasás `onNuevo`, y hoy nadie se
lo pasa. El formulario de cada entidad YA EXISTE en su pantalla vieja: hay que
conectar el CTA a ese drawer, no escribirlo de nuevo.

**BUG que hay que arreglar primero:** `components/ui/StickyPageHeader.tsx:152`
hace `if (embedded) return null`. Ahí adentro viven el buscador, los filtros
**y el botón "Nuevo"** de ~10 pantallas. Por eso "Nuevo plazo" y "Nuevo tipo"
no hacen nada: no existen. Lo correcto es que en modo embebido siga mostrando
las ACCIONES y oculte sólo el título y el "volver" (que es lo que duplicaba).

### 3.2 — Cablear 8 pantallas (no tocan backend)

Contactos (`contactosApi.list` + `duplicados`), Retenciones
(`retencionesApi.list`), Proyectos (`proyectosApi.list`), Tarjetas
(`tarjetasApi.list`), Proveedores de pago (`proveedoresPagoApi.list`),
Auditoría (`auditApi.list` + `stats`), y los catálogos de conceptos
(`conceptosAbmApi`, `conceptosLiquidacionApi`).

### 3.3 — Cuatro COUNT en el backend

Mismo patrón que ya está hecho en `api/categorias_reclamo.py` y `api/zonas.py`:
un `COUNT` agrupado en el listado, **una query para todas las filas** (la base
está en otro continente; una por fila es inaceptable).

| Pantalla | Falta |
|---|---|
| SLA | cumplimiento real (resueltos dentro del plazo / total) |
| Dependencias | reclamos en cola por dependencia |
| Cajas | último arqueo por caja |
| Tasas | recaudado por tasa |

### 3.4 — Los cuerpos que no son ABM

Los 4 formularios (datos del municipio, WhatsApp, IA, sidebar) y el QR siguen
con la pantalla vieja: **no se compararon contra el mockup**. Apariencia, el
árbol de trámites y Asignación se rehicieron pero tampoco se validaron a ojo.

### 3.5 — Suscripciones

**No tiene endpoint.** Preguntarle al dueño si se crea o si esa pantalla sale
del riel. No inventar datos.

---

## 4. Ambiente

```
localhost:5175 (vite)  ──/api──▶  127.0.0.1:8002 (uvicorn local)  ──▶  Aiven `sugerenciasmun-qa`
```

- El proxy sale de `DEV_BACKEND_ORIGIN` en `frontend/.env.local`
  (gitignoreado). Comentá esa línea y vuelve al backend de QA en Cloud Run.
- Backend local, sin escribir credenciales:

  ```bash
  cd backend
  DATABASE_URL="$(gcloud secrets versions access latest --secret=DATABASE_URL_QA --project=munify-api)" \
    ENVIRONMENT=development PORT=8002 DB_AUTO_CREATE=false \
    python -m uvicorn main:app --host 127.0.0.1 --port 8002
  ```

- **OJO con `backend/.env`**: su `DATABASE_URL` apunta a la base SIN sufijo
  `-qa`. No lo uses para levantar local.
- La pantalla **pide sesión** (redirige a `/bienvenido`). Usuarios demo:
  `GET /api/municipios/public/asuncion/demo-users`, contraseña `demo123`.
  Municipio de trabajo: **Asunción, id 146** (Paraguay Limpio).

---

## 5. Reglas que salieron de esta sesión

1. **El `.dc` va a `docs/design-sync/`** en HTML autoejecutable, nunca sólo en
   el contexto del agente. Es regla GLOBAL (memoria global, regla 22).
2. **El prototipo primero, los endpoints después.** Reproducir estático,
   validar con el dueño, y recién ahí cablear. El orden inverso —migrar de a
   una con datos reales— es lo que hizo que a los dos días no se pareciera al
   mockup.
3. **El diseño le gana al criterio propio.** Si algo del `.dc` te parece mal,
   decilo, pero implementalo igual. (Yo hice `hero` opcional y se lo saqué a
   los catálogos "porque un catálogo no tiene veredicto que contar": el diseño
   decía lo contrario y esa decisión no me correspondía.)
4. **Verificá con captura, no con `tsc`.** Playwright 1.57 está instalado en
   `frontend/`. `tsc` verde + `eslint` limpio + `curl 200` no miden si se
   parece al mockup.
5. **Los toggles del prototipo** (ok/no ok, densidad, módulos contratados) no
   son controles de la app: son los ESTADOS que hay que saber dibujar.

---

## 6. Deuda abierta que no es de Configuración

- **8 scripts con la credencial de la DB hardcodeada**, los 8 con escrituras
  (`seed_categorias.py`, `run_migration.py`, `scripts/fix_dependencias_simple.py`
  y 5 más). El helper que lo resuelve está escrito —`backend/scripts/_entorno.py`,
  con `--env qa|prod` obligatorio y guard de coherencia— pero **está
  gitignoreado y los 8 scripts no se migraron**.
- **35 hooks condicionales en 8 pantallas** (`npx eslint src/ --ext .ts,.tsx |
  grep rules-of-hooks`). Son React #310 esperando pasar.
- `push_subscriptions.endpoint` se arregló (era TEXT con UNIQUE y rompía
  `create_all` contra una base vacía). Ese cambio **no está pusheado**.
