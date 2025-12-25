"""
Sistema de logging con Rich para logs bonitos y coloridos.
Paneles, tablas y formato profesional.
"""
import logging
import sys
from datetime import datetime
from typing import Optional, Any

from rich.console import Console
from rich.logging import RichHandler
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.theme import Theme
from rich.traceback import install as install_rich_traceback
from rich import box
from rich.style import Style

# Instalar traceback bonito de Rich
install_rich_traceback(show_locals=False, width=120)

# Tema personalizado
custom_theme = Theme({
    "info": "cyan",
    "warning": "yellow",
    "error": "bold red",
    "success": "bold green",
    "debug": "dim white",
    "request.get": "bold cyan",
    "request.post": "bold green",
    "request.put": "bold yellow",
    "request.patch": "bold magenta",
    "request.delete": "bold red",
    "status.2xx": "green",
    "status.3xx": "cyan",
    "status.4xx": "yellow",
    "status.5xx": "bold red",
    "db": "bold yellow",
    "auth": "bold cyan",
    "module": "dim cyan",
    "time": "dim white",
})

# Forzar UTF-8 en Windows para evitar errores de encoding con emojis
import os
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

console = Console(theme=custom_theme, force_terminal=True, color_system="auto")


class RichFormatter(logging.Formatter):
    """Formatter personalizado con Rich."""

    LEVEL_STYLES = {
        logging.DEBUG: ("○", "debug"),
        logging.INFO: ("✓", "success"),
        logging.WARNING: ("⚠", "warning"),
        logging.ERROR: ("✗", "error"),
        logging.CRITICAL: ("💀", "error"),
    }

    def format(self, record):
        # Obtener icono y estilo según nivel
        icon, style = self.LEVEL_STYLES.get(record.levelno, ("•", "info"))

        # Timestamp
        timestamp = datetime.now().strftime("%H:%M:%S")

        # Nombre del módulo
        module = record.name
        if module.startswith("api."):
            module = module[4:]
        elif module.startswith("core."):
            module = module[5:]
        module = module[:15].ljust(15)

        # Construir mensaje con Rich markup
        level_name = record.levelname.ljust(8)
        message = record.getMessage()

        return f"[time]{timestamp}[/time] [{style}]{icon}[/{style}] [{style}]{level_name}[/{style}] [module]{module}[/module] {message}"


class RequestLogFilter(logging.Filter):
    """Filtro para formatear logs de requests HTTP de manera bonita."""

    METHOD_STYLES = {
        "GET": "request.get",
        "POST": "request.post",
        "PUT": "request.put",
        "PATCH": "request.patch",
        "DELETE": "request.delete",
    }

    def filter(self, record):
        message = record.getMessage()

        # Detectar si es un request HTTP de uvicorn
        if '"' in message and "HTTP" in message:
            record.msg = self._format_request(message)
            record.args = ()

        return True

    def _format_request(self, message: str) -> str:
        """Formatear línea de request HTTP."""
        try:
            parts = message.split('"')
            if len(parts) >= 2:
                client = parts[0].strip().rstrip(" -")
                request_line = parts[1]
                rest = parts[2].strip() if len(parts) > 2 else ""

                req_parts = request_line.split()
                method = req_parts[0] if req_parts else "?"
                path = req_parts[1] if len(req_parts) > 1 else "?"
                status = rest.split()[0] if rest else "?"

                # Acortar path si es muy largo
                if len(path) > 50:
                    path = path[:47] + "..."

                # Determinar estilo según status
                status_style = "status.2xx"
                icon = "✓"
                if status.startswith("3"):
                    status_style = "status.3xx"
                    icon = "→"
                elif status.startswith("4"):
                    status_style = "status.4xx"
                    icon = "⚠"
                elif status.startswith("5"):
                    status_style = "status.5xx"
                    icon = "✗"

                method_style = self.METHOD_STYLES.get(method, "info")

                timestamp = datetime.now().strftime("%H:%M:%S")
                return (
                    f"[time]{timestamp}[/time] "
                    f"[{status_style}]{icon}[/{status_style}] "
                    f"[{method_style}]{method:7}[/{method_style}] "
                    f"[{status_style}]{status:3}[/{status_style}] "
                    f"{path:52} "
                    f"[dim]{client}[/dim]"
                )
        except Exception:
            pass

        return message


def setup_logging(level: str = "INFO"):
    """
    Configurar logging simple para toda la aplicación.
    """
    log_level = getattr(logging, level.upper(), logging.INFO)

    # Formato simple sin Rich (más compatible con Windows)
    formatter = logging.Formatter(
        '%(asctime)s %(levelname)-8s %(name)-15s %(message)s',
        datefmt='%H:%M:%S'
    )

    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.handlers.clear()

    # Handler simple a stdout
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)

    # Desactivar uvicorn.access (usamos nuestro middleware)
    access_logger = logging.getLogger("uvicorn.access")
    access_logger.handlers.clear()
    access_logger.propagate = False
    access_logger.setLevel(logging.CRITICAL)

    # Silenciar loggers ruidosos
    noisy_loggers = [
        "httpx", "httpcore", "sqlalchemy", "sqlalchemy.engine",
        "sqlalchemy.engine.Engine", "sqlalchemy.pool", "sqlalchemy.dialects",
        "sqlalchemy.orm", "aiomysql", "asyncio",
        "watchfiles.main", "watchfiles", "multipart",
    ]
    for name in noisy_loggers:
        logger = logging.getLogger(name)
        logger.setLevel(logging.CRITICAL)
        logger.handlers = []
        logger.propagate = False

    # Habilitar uvicorn.error para ver errores reales
    error_logger = logging.getLogger("uvicorn.error")
    error_logger.setLevel(logging.INFO)

    return root_logger


def get_logger(name: str) -> logging.Logger:
    """Obtener logger para un módulo."""
    return logging.getLogger(name)


def print_startup_banner(app_name: str = "Sistema de Reclamos Municipales", version: str = "1.0.0", port: int = None):
    """Imprimir banner de inicio simple."""
    if port is None:
        port = int(os.environ.get("PORT", 8000))

    print("\n" + "="*60, flush=True)
    print(f"  {app_name} v{version}", flush=True)
    print("="*60, flush=True)
    print(f"  Server:   http://localhost:{port}", flush=True)
    print(f"  API Docs: http://localhost:{port}/docs", flush=True)
    print(f"  ReDoc:    http://localhost:{port}/redoc", flush=True)
    print("="*60, flush=True)
    print("  Press CTRL+C to stop\n", flush=True)


def print_panel(title: str, content: str, style: str = "cyan"):
    """Mostrar panel con información."""
    console.print(Panel(
        content,
        title=f"[bold]{title}[/bold]",
        border_style=style,
        padding=(0, 1),
    ))


def print_table(title: str, data: dict[str, Any]):
    """Mostrar datos en una tabla."""
    table = Table(title=title, box=box.ROUNDED, border_style="cyan")
    table.add_column("Campo", style="cyan")
    table.add_column("Valor", style="white")

    for key, value in data.items():
        table.add_row(str(key), str(value))

    console.print(table)


def print_error_panel(title: str, error: str, details: Optional[str] = None):
    """Mostrar panel de error."""
    content = f"[bold red]{error}[/bold red]"
    if details:
        content += f"\n[dim]{details}[/dim]"

    console.print(Panel(
        content,
        title=f"[bold red]✗ {title}[/bold red]",
        border_style="red",
        padding=(0, 1),
    ))


def print_success_panel(title: str, message: str):
    """Mostrar panel de éxito."""
    console.print(Panel(
        f"[green]{message}[/green]",
        title=f"[bold green]✓ {title}[/bold green]",
        border_style="green",
        padding=(0, 1),
    ))


def print_request_log(method: str, path: str, status: int, duration_ms: float, user: Optional[str] = None):
    """Log de request HTTP manual (para middleware custom)."""
    method_styles = {
        "GET": "request.get",
        "POST": "request.post",
        "PUT": "request.put",
        "PATCH": "request.patch",
        "DELETE": "request.delete",
    }

    if status < 300:
        status_style, icon = "status.2xx", "✓"
    elif status < 400:
        status_style, icon = "status.3xx", "→"
    elif status < 500:
        status_style, icon = "status.4xx", "⚠"
    else:
        status_style, icon = "status.5xx", "✗"

    method_style = method_styles.get(method.upper(), "info")
    timestamp = datetime.now().strftime("%H:%M:%S")

    user_str = f" [dim]({user})[/dim]" if user else ""

    console.print(
        f"[time]{timestamp}[/time] "
        f"[{status_style}]{icon}[/{status_style}] "
        f"[{method_style}]{method:7}[/{method_style}] "
        f"[{status_style}]{status:3}[/{status_style}] "
        f"{path:40} "
        f"[dim]{duration_ms:.0f}ms[/dim]"
        f"{user_str}"
    )
    # Forzar flush para que se muestre inmediatamente
    sys.stdout.flush()
