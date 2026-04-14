#!/usr/bin/env bash
# ============================================================================
# restart.sh — reinicia el backend de forma quirúrgica.
#
# Qué hace:
#   1. Lee el puerto del .env (fallback a 8000).
#   2. Encuentra el/los procesos que escuchan ese puerto y los mata (sólo
#      esos — no toca el resto de tus python.exe).
#   3. Limpia el bytecode cache (__pycache__ + *.pyc) para evitar que
#      uvicorn levante con código stale.
#   4. Arranca `python run.py` en background, redirigiendo log a un archivo.
#   5. Hace polling a /health (o / si no existe) hasta que el server responda,
#      o se rinde a los 30s.
#   6. Imprime el PID y el path del log para que sepas dónde mirar.
#
# Uso:
#   cd backend && ./restart.sh
#
# Si querés foreground en vez de background (para ver los logs en vivo):
#   ./restart.sh --fg
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---- 1. Leer puerto del .env ----
PORT=8000
if [[ -f .env ]]; then
  env_port=$(grep -E '^PORT=' .env 2>/dev/null | tail -n1 | cut -d= -f2 | tr -d '[:space:]' || true)
  if [[ -n "${env_port:-}" ]]; then
    PORT="$env_port"
  fi
fi
echo "==> Backend port: $PORT"

# ---- 2. Matar proceso(s) en ese puerto ----
# En git-bash/Windows usamos netstat + taskkill. En Linux/mac usamos lsof.
kill_port() {
  local port="$1"
  local killed=0

  if command -v netstat >/dev/null 2>&1 && [[ "${OS:-}" == "Windows_NT" ]]; then
    # Windows (git-bash): netstat -ano da PID en la última columna
    local pids
    pids=$(netstat -ano 2>/dev/null | grep "LISTENING" | grep -E "[:.]$port\b" | awk '{print $NF}' | sort -u || true)
    for pid in $pids; do
      if [[ -n "$pid" && "$pid" != "0" ]]; then
        echo "    matando PID $pid (Windows)..."
        taskkill //F //PID "$pid" >/dev/null 2>&1 && killed=$((killed + 1)) || true
      fi
    done
  elif command -v lsof >/dev/null 2>&1; then
    # Linux/mac
    local pids
    pids=$(lsof -ti ":$port" 2>/dev/null || true)
    for pid in $pids; do
      echo "    matando PID $pid..."
      kill -9 "$pid" 2>/dev/null && killed=$((killed + 1)) || true
    done
  fi

  echo "    procesos matados: $killed"
}

echo "==> Matando lo que escuche en :$PORT..."
kill_port "$PORT"

# Esperar un toque a que el puerto quede libre
sleep 1

# ---- 3. Limpiar bytecode cache ----
echo "==> Limpiando __pycache__ y *.pyc..."
find . -type d -name "__pycache__" -prune -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true

# ---- 4. Arrancar el server ----
LOG_FILE="$SCRIPT_DIR/uvicorn.log"
: > "$LOG_FILE"   # truncar log anterior

MODE="bg"
if [[ "${1:-}" == "--fg" ]]; then
  MODE="fg"
fi

if [[ "$MODE" == "fg" ]]; then
  echo "==> Arrancando en foreground (Ctrl+C para detener)..."
  echo
  exec python run.py
fi

echo "==> Arrancando en background, log -> $LOG_FILE"
# nohup + & para desacoplar del terminal; stdout/stderr al log
nohup python run.py > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "    PID: $SERVER_PID"

# ---- 5. Health check con polling ----
echo "==> Esperando que el server responda en http://localhost:$PORT ..."
HEALTH_URL="http://localhost:$PORT/health"
FALLBACK_URL="http://localhost:$PORT/"

ready=0
for i in $(seq 1 30); do
  # Primero probamos /health, si no existe probamos / (cualquier 2xx/3xx/4xx sirve
  # como señal de que uvicorn levantó — un 404 ya implica que está vivo).
  if curl -s -o /dev/null -w "%{http_code}" --max-time 1 "$HEALTH_URL" 2>/dev/null | grep -qE "^[234]"; then
    ready=1
    break
  fi
  if curl -s -o /dev/null -w "%{http_code}" --max-time 1 "$FALLBACK_URL" 2>/dev/null | grep -qE "^[234]"; then
    ready=1
    break
  fi

  # Chequear que el proceso siga vivo; si murió, cortamos temprano
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo
    echo "!! El proceso murió antes de estar listo. Últimas líneas del log:"
    echo "---"
    tail -n 40 "$LOG_FILE" || true
    echo "---"
    exit 1
  fi

  printf "."
  sleep 1
done
echo

if [[ "$ready" == "1" ]]; then
  echo "==> Server UP en http://localhost:$PORT (PID $SERVER_PID)"
  echo "==> Log: tail -f $LOG_FILE"
else
  echo "!! Timeout: el server no respondió en 30s. Últimas líneas del log:"
  echo "---"
  tail -n 40 "$LOG_FILE" || true
  echo "---"
  exit 1
fi
