"""Cliente API para el kit de semillas integrales (QA Paraguay Limpio).

Base compartida de TODOS los modulos m_*.py de esta carpeta:
- ApiQA: cliente HTTP autenticado contra el backend QA (via proxy Netlify).
- Helpers de idempotencia: buscar() / asegurar() por clave natural.
- Helpers de fechas DETERMINISTICAS relativas a hoy: hoy() / dias(n) / dias_hora(n, "HH:MM").
- guard_qa(): guard obligatorio para los pocos modulos que escriben tabla directa.

Filosofia (framework-first): deterministico, idempotente, generico y reutilizable.
Nada random, nada circunstancial. Ver README.md de esta carpeta.
"""
from __future__ import annotations

import json as _json
from datetime import date, datetime, time as dtime, timedelta

import requests

DEFAULT_BASE_URL = "https://paraguay-limpio.netlify.app/api"
DEFAULT_ADMIN_EMAIL = "admin@asuncion.demo.com"
DEFAULT_ADMIN_PASSWORD = "demo123"
TIMEOUT = 60  # segundos por request


# ---------------------------------------------------------------------------
# Errores
# ---------------------------------------------------------------------------
class ApiError(RuntimeError):
    """Error de API con contexto completo: metodo, URL, status y body."""

    def __init__(self, metodo: str, url: str, status: int, body: str):
        self.metodo = metodo
        self.url = url
        self.status = status
        self.body = body
        super().__init__(
            f"{metodo} {url} -> HTTP {status}\n{body[:800]}"
        )


# ---------------------------------------------------------------------------
# Fechas deterministicas (SIEMPRE relativas a hoy, jamas random)
# ---------------------------------------------------------------------------
def hoy() -> date:
    """Fecha de hoy (date)."""
    return date.today()


def dias(n: int) -> str:
    """hoy + n dias (n puede ser negativo) en ISO 'YYYY-MM-DD'."""
    return (date.today() + timedelta(days=n)).isoformat()


def dias_hora(n: int, hhmm: str) -> str:
    """hoy + n dias a la hora fija 'HH:MM', en ISO 'YYYY-MM-DDTHH:MM:00'.

    Para planes que exigen datetimes fijos (ej. turnos 08:30, pagos 11:40).
    """
    hh, mm = (int(x) for x in hhmm.split(":"))
    d = date.today() + timedelta(days=n)
    return datetime.combine(d, dtime(hh, mm)).isoformat()


# ---------------------------------------------------------------------------
# Guard para modulos que escriben tabla directa (sin endpoint de escritura)
# ---------------------------------------------------------------------------
def guard_qa(database_url: str) -> str:
    """Aborta si la DATABASE_URL no es claramente de QA. Devuelve la URL validada.

    Uso obligatorio en todo modulo que use SQLAlchemy directo:
        engine = create_async_engine(guard_qa(os.environ["DATABASE_URL"]))
    """
    if not database_url:
        raise SystemExit("[guard_qa] DATABASE_URL vacia — abortando.")
    if "qa" not in database_url.lower():
        raise SystemExit(
            "[guard_qa] DATABASE_URL no contiene 'qa' — este kit SOLO escribe en QA. Abortando."
        )
    return database_url


# ---------------------------------------------------------------------------
# Cliente API
# ---------------------------------------------------------------------------
class ApiQA:
    """Cliente HTTP autenticado contra el backend QA.

    Uso tipico dentro de un modulo:
        obj, creado = api.asegurar(
            "/tesoreria/cajas", "codigo", "TESORO",
            "/tesoreria/cajas", {"nombre": "Tesoreria central [DEMO]", ...},
        )
    """

    def __init__(self, base_url: str = DEFAULT_BASE_URL):
        self.base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self.token: str | None = None
        self.session = requests.Session()

    # -- auth ---------------------------------------------------------------
    def login(
        self,
        email: str = DEFAULT_ADMIN_EMAIL,
        password: str = DEFAULT_ADMIN_PASSWORD,
    ) -> dict:
        """Login OAuth2 password-form. Guarda el Bearer para el resto de las llamadas."""
        url = f"{self.base_url}/auth/login"
        resp = self.session.post(
            url,
            data={"username": email, "password": password},
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            raise ApiError("POST", url, resp.status_code, resp.text)
        data = resp.json()
        self.token = data["access_token"]
        user = data.get("user") or {}
        print(
            f"[login] ok como {email} "
            f"(user_id={user.get('id')}, municipio_id={user.get('municipio_id')})"
        )
        return data

    def _headers(self) -> dict:
        h = {"Accept": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    # -- HTTP crudo ---------------------------------------------------------
    def _request(self, metodo: str, endpoint: str, **kwargs):
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        kwargs.setdefault("timeout", TIMEOUT)
        headers = {**self._headers(), **kwargs.pop("headers", {})}
        resp = self.session.request(metodo, url, headers=headers, **kwargs)
        if resp.status_code >= 400:
            raise ApiError(metodo, url, resp.status_code, resp.text)
        if not resp.content:
            return None
        try:
            return resp.json()
        except _json.JSONDecodeError:
            return resp.text

    def get(self, endpoint: str, params: dict | None = None):
        return self._request("GET", endpoint, params=params)

    def post(self, endpoint: str, json: dict | None = None, **kwargs):
        return self._request("POST", endpoint, json=json, **kwargs)

    def put(self, endpoint: str, json: dict | None = None, **kwargs):
        return self._request("PUT", endpoint, json=json, **kwargs)

    def delete(self, endpoint: str, **kwargs):
        return self._request("DELETE", endpoint, **kwargs)

    # -- idempotencia por clave natural -------------------------------------
    def listar(self, lista_endpoint: str, params: dict | None = None) -> list:
        """GET a un endpoint de lista, normalizando la envoltura ({items|data|results} o lista)."""
        data = self.get(lista_endpoint, params=params)
        if data is None:
            return []
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for clave in ("items", "data", "results", "rows"):
                if isinstance(data.get(clave), list):
                    return data[clave]
        raise ApiError(
            "GET", f"{self.base_url}/{lista_endpoint.lstrip('/')}", 200,
            f"respuesta no es lista ni envoltura conocida: {str(data)[:300]}",
        )

    @staticmethod
    def _match(item_valor, valor) -> bool:
        if item_valor == valor:
            return True
        if item_valor is None or valor is None:
            return False
        return str(item_valor).strip().lower() == str(valor).strip().lower()

    def buscar(
        self,
        lista_endpoint: str,
        campo: str,
        valor,
        params: dict | None = None,
    ) -> dict | None:
        """Busca en la lista el primer item cuyo `campo` matchee `valor` (clave natural).

        Match exacto o string case-insensitive. Devuelve el dict del item o None.
        """
        for item in self.listar(lista_endpoint, params=params):
            if isinstance(item, dict) and self._match(item.get(campo), valor):
                return item
        return None

    def asegurar(
        self,
        lista_endpoint: str,
        campo: str,
        valor,
        post_endpoint: str,
        payload: dict,
        params: dict | None = None,
    ) -> tuple[dict, bool]:
        """Nucleo de la idempotencia: devuelve (obj, creado).

        1) buscar(lista_endpoint, campo, valor) — si existe, (obj, False) sin crear.
        2) Si no existe, POST payload a post_endpoint y devuelve (obj_creado, True).
           Si el POST no devuelve el objeto, re-busca en la lista.
        Segunda corrida del kit => 0 creaciones.
        """
        existente = self.buscar(lista_endpoint, campo, valor, params=params)
        if existente is not None:
            return existente, False
        creado = self.post(post_endpoint, json=payload)
        if not isinstance(creado, dict) or campo not in creado:
            refresco = self.buscar(lista_endpoint, campo, valor, params=params)
            if refresco is not None:
                return refresco, True
        return (creado if isinstance(creado, dict) else {campo: valor}), True
