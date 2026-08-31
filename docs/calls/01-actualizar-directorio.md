# Actualizar el directorio de llamados (`/calls`)

La app de llamados vive en **`munify-qa.netlify.app/calls`**: un solo HTML con
todo adentro (municipios, teléfonos, speech por país, nombre del intendente y
lo que averiguamos de cada lugar). No tiene backend: los datos viajan dentro
del archivo y lo que anotás mientras llamás queda en tu navegador.

Por eso, **cada vez que cambian los datos hay que regenerar el archivo**. Eso
es un comando.

---

## El comando

```bash
python scripts/calls/build_calls.py
git add -A && git commit -m "chore(calls): actualizo el directorio" && git push origin qa
```

Lee todo lo que hay en `docs/regiones/`, le pega los datos curados de
`scripts/calls/datos/` y reescribe `frontend/public/calls/index.html`.
Al final imprime un resumen y **avisa** si algo quedó suelto:

```
  municipios     154  {'Argentina': 93, 'Paraguay': 24, 'Perú': 26, 'Uruguay': 11}
  con intendente 154 de 154
  investigados   45
  [!] SIN TELEFONO (2): Villa Nueva, Rufino          <- se cargaron mal en la planilla
  [!] CLAVES HUERFANAS en los json curados (3): ...  <- fichas que no le pegan a ningún municipio
```

Netlify publica solo con el push; no hay deploy manual.

---

## De dónde sale cada cosa

| Qué | Dónde | Cómo se actualiza |
|---|---|---|
| Municipios, teléfono, perfil, población | `docs/regiones/*.xlsx` y el `.docx` de Uruguay | Se agrega o edita la planilla |
| Speech por país + los tips | `docs/regiones/speech para cada region.txt` | Se edita el txt |
| **Quién es el intendente** | `scripts/calls/datos/funcionarios.json` | Búsqueda web (ver abajo) |
| **Secretarías, digitalización, dato de color** | `scripts/calls/datos/investigacion.json` | Búsqueda web (ver abajo) |
| La app en sí (HTML, CSS, JS) | `scripts/calls/plantilla.html` | Se edita la plantilla, **nunca el `index.html` generado** |

> **Ojo:** `frontend/public/calls/index.html` es SALIDA. Si lo editás a mano,
> el próximo `build_calls.py` te pisa el cambio. Todo lo visual va en
> `plantilla.html`, que tiene el hueco `/*__DATOS__*/{}` donde entran los datos.

---

## Sacar (o volver a poner) un país entero

El **2026-08-30 se sacó Argentina** y el **31 volvió**: el padrón está
completo otra vez (154 municipios). Sirve como ejemplo de que sacar un país
**no borra nada** — mientras estuvo afuera, sus 93 municipios siguieron en las
planillas de `docs/regiones/` y sus fichas curadas (intendente, investigación)
quedaron intactas.

El filtro es una línea en `build_calls.py`:

```python
fuera = set()              # vacío: entran todos
fuera = {"Argentina"}      # así se saca uno
```

Para sacar un país se agrega al set; para devolverlo, se saca y se corre el build. Lo que sale con
el país: sus municipios, su speech y sus fichas curadas (que dejan de contar
como huérfanas). El resumen del build lo dice:

```
  municipios     154  {'Argentina': 93, 'Paraguay': 24, 'Perú': 26, 'Uruguay': 11}
  fuera del padron  93  {'Argentina': 93}   (aparece sólo si hay alguno excluido)
```

---

## Caso 1: agregar municipios nuevos

1. Poné la planilla nueva en `docs/regiones/` (mismo formato que las otras:
   fila de cabecera con `Provincia` o `País`, y las columnas Localidad,
   Habitantes, Perfil, Teléfono).
2. Corré `build_calls.py`. Los municipios nuevos ya aparecen en la app, **sin
   intendente y sin investigación** — que es correcto: todavía no se buscaron.
3. Si querés completarlos, seguí el caso 3.

El **`id`** de cada municipio se deriva de `país + localidad` (por ejemplo
`argentina-alta-gracia`). Es la clave con la que empalman los datos curados.

---

## Caso 2: cambió un intendente

Editá `scripts/calls/datos/funcionarios.json` — es un mapa `id → ficha`:

```json
"argentina-alta-gracia": {
  "intendente": "Jorge De Nápoli",
  "cargo": "Intendente",
  "confianza": "alta",
  "nota": "INTERINATO: el electo Marcos Torres Lima pidió licencia en feb/2026",
  "fuente": "https://..."
}
```

- `confianza`: `alta` (fuente oficial o medio reciente), `media` (fuente vieja
  pero plausible — la app muestra "confirmalo"), `baja`.
- `nota`: cualquier cosa que convenga saber antes de marcar (interinato,
  elección en curso, juicio político). La app le pone la etiqueta **"ojo"** al
  municipio en la lista y muestra el aviso en la ficha.
- **Si no sabés el nombre, sacá la entrada.** Un nombre equivocado dicho por
  teléfono es peor que no tenerlo; la app simplemente no muestra el bloque.

Después: `build_calls.py` + push.

---

## Caso 3: la búsqueda web (repasar nombres o investigar municipios nuevos)

Esto lo hace un agente con búsqueda web. El pedido que funcionó, resumido:

**Para los nombres** (`funcionarios.json`):
> Buscá el intendente/alcalde EN EJERCICIO de estos municipios. Una búsqueda
> por municipio. Para cada uno: nombre completo, cargo, partido si aparece,
> nivel de confianza y la URL de la fuente. **Jamás inventes un nombre**: sin
> certeza razonable, `null` y `confianza: "no encontrado"`. Cuidado con los
> homónimos: verificá provincia/departamento. Anotá en `nota` si hay
> interinato, vacancia o elección en curso. Guardá el archivo cada 10-15
> municipios para no perder avance.

**Para la investigación** (`investigacion.json`), por municipio:
> `estructura` (cuántas secretarías/direcciones y las principales, para pedir
> por el área correcta), `digital` (si ya tienen app de reclamos, portal o
> nada — es la señal de si competimos o el terreno está virgen), `color` (un
> dato real y específico del lugar para romper el hielo) y `web`. Nada de
> generalidades que sirvan para cualquier municipio.

Ambos archivos usan el mismo `id` como clave. Si el agente devuelve una lista
con `localidad`, mapeala por nombre (país + localidad normalizados), **no por
posición**.

### Cada cuánto conviene repasar

- **Argentina**: mandato 2023-2027. Repasar una vez por año, y antes de una
  ronda grande.
- **Paraguay y Perú**: **ambos votaron el 4 de octubre de 2026** — todo ese
  padrón de intendentes cambia. Repasar completo después de esa fecha.
- **Uruguay**: asumieron en julio de 2025 por cinco años. Tranquilo hasta 2030.
- En Perú hay vacancias y suspensiones seguido: si vas a hacer una ronda
  fuerte ahí, conviene un repaso corto antes.

---

## Qué NO hace la app (y qué haría falta para que lo haga)

- **Lo que anotás vive en TU navegador** (`localStorage`). Si llamás desde la
  compu y desde el celular, son dos historiales distintos. Por eso están los
  botones **"Bajar copia"** y **"Restaurar"**: un JSON que te llevás de un
  lado a otro.
- Para que se sincronice solo haría falta backend (una tabla y dos endpoints).
  No está hecho a propósito: la app tiene que abrir sin login en medio de una
  llamada.

---

## Estructura

```
docs/regiones/                     las planillas del dueño (fuente)
docs/calls/01-actualizar-directorio.md   este documento
scripts/calls/
  build_calls.py                   el generador
  plantilla.html                   la app (HTML+CSS+JS) con el hueco de datos
  datos/funcionarios.json          quién es el intendente (curado)
  datos/investigacion.json         secretarías, digitalización, dato de color (curado)
frontend/public/calls/index.html   SALIDA generada — no editar a mano
```
