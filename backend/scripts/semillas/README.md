# Kit de semillas integrales — QA Paraguay Limpio (muni 146)

Semillas **deterministicas, idempotentes y via API** para dejar TODOS los modulos
de la demo Paraguay Limpio con datos vivos. Se escriben una vez y sirven para
siempre: nada circunstancial, nada random.

## Filosofia (no negociable)

1. **Via API, no SQL directo.** Cada modulo siembra con `POST` contra la API real
   (`https://paraguay-limpio.netlify.app/api`) logueado como admin demo. Asi la
   logica de negocio (cuotas, movimientos de caja, imputaciones) se genera sola y
   la semilla prueba de paso los endpoints reales. Excepcion unica: si el modulo
   NO tiene endpoint de escritura, se usa SQLAlchemy async con `DATABASE_URL` del
   entorno **envuelta en `guard_qa()`** (aborta si la URL no contiene `qa`).
2. **Idempotente.** Antes de crear, se consulta y matchea por **clave natural**
   (nombre / codigo / concepto+fecha). Segunda corrida = 0 creaciones.
3. **Deterministico.** Fechas SIEMPRE relativas a hoy (`dias(-30)`, `dias(+7)`),
   horas fijas. JAMAS `random`.
4. **Datos `[DEMO]` verosimiles** paraguayo-rioplatenses: montos en guaranies,
   CI/RUC formato PY, direcciones reales de Asuncion. **NUNCA inventar
   coordenadas**: `lat`/`lng` en `NULL` salvo que el plan del modulo diga otra
   cosa. Excluido del kit: TesoreriaMapa / mapa de contactos (custom SPN).
5. **Prohibido Playwright** y dependencias raras. Python 3.12 + `requests`.

## Como correr

```bash
cd backend/scripts/semillas
python runner.py                    # todo el kit, en orden por prefijo numerico
python runner.py --solo cajas       # solo los modulos cuyo nombre contenga 'cajas'
python runner.py --base-url https://otra-qa.example.com/api
```

El runner loguea con el admin demo (`admin@asuncion.demo.com` / `demo123`),
corre `sembrar(api, hoy)` de cada `m_*.py` en orden (`m_10_`, `m_20_`, ...) y
cierra con un resumen por modulo (OK/ERROR, duracion, creados/existentes).
Exit code 1 si algun modulo fallo.

## Como agregar un modulo nuevo

1. Crear `m_NN_nombre.py` en esta carpeta. El prefijo `NN` define el **orden de
   ejecucion** — respetar dependencias (ej.: catalogos y cajas antes que gastos;
   contactos antes que agenda de pagos).
2. Exponer `sembrar(api, hoy)`:
   - `api` es un `ApiQA` ya logueado (ver `_api.py`).
   - `hoy` es `datetime.date` de hoy; para offsets usar `dias(n)` / `dias_hora(n, "08:30")`.
   - Imprimir al final: `[nombre] creados=N existentes=M` y (opcional pero
     recomendado) devolver `{"creados": N, "existentes": M}` para el resumen.
3. Idempotencia con el helper central:

```python
from _api import dias

def sembrar(api, hoy):
    creados = existentes = 0
    obj, creado = api.asegurar(
        "/tesoreria/cajas",            # endpoint de lista (consulta previa)
        "codigo", "TESORO",            # clave natural: campo + valor
        "/tesoreria/cajas",            # endpoint de POST si no existe
        {
            "nombre": "Tesoreria central [DEMO]",
            "codigo": "TESORO",
            "saldo_inicial": 850_000_000,
            "fecha_apertura": dias(-120),
        },
    )
    creados += creado; existentes += (not creado)
    print(f"[cajas] creados={creados} existentes={existentes}")
    return {"creados": creados, "existentes": existentes}
```

4. Si el modulo no tiene endpoint de escritura y el plan exige tabla directa:

```python
import os
from sqlalchemy.ext.asyncio import create_async_engine
from _api import guard_qa

engine = create_async_engine(guard_qa(os.environ["DATABASE_URL"]))
# ... INSERT idempotente (SELECT previo por clave natural) ...
```

## API del kit (`_api.py`)

| Helper | Que hace |
|---|---|
| `ApiQA(base_url)` | Cliente HTTP; `login()` con el admin demo guarda el Bearer |
| `api.get/post/put/delete` | HTTP con auth; al fallar levanta `ApiError` con status + body |
| `api.listar(endpoint)` | GET de lista normalizando envoltura (`items`/`data`/lista cruda) |
| `api.buscar(lista_ep, campo, valor)` | Primer item que matchea la clave natural, o `None` |
| `api.asegurar(lista_ep, campo, valor, post_ep, payload)` | `(obj, creado)` — crea solo si no existe |
| `hoy()` | `date` de hoy |
| `dias(n)` | hoy +/- n dias en ISO `YYYY-MM-DD` |
| `dias_hora(n, "HH:MM")` | hoy +/- n dias a hora fija en ISO datetime |
| `guard_qa(url)` | Aborta si la `DATABASE_URL` no es de QA (para modulos tabla-directa) |
