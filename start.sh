#!/bin/bash
# ==============================================
# Start script - Backend + Frontend
# Busca puertos libres automáticamente
# ==============================================

find_free_port() {
  local port=$1
  local max_attempts=${2:-10}
  for ((i=0; i<max_attempts; i++)); do
    local candidate=$((port + i))
    if ! netstat -ano 2>/dev/null | grep -q ":${candidate} .*LISTENING"; then
      echo "$candidate"
      return 0
    fi
  done
  echo ""
  return 1
}

# Puertos base preferidos
BACKEND_BASE=8000
FRONTEND_BASE=5173

BACKEND_PORT=$(find_free_port $BACKEND_BASE)
if [ -z "$BACKEND_PORT" ]; then
  echo "ERROR: No se encontró puerto libre para backend ($BACKEND_BASE-$((BACKEND_BASE+9)))"
  exit 1
fi

FRONTEND_PORT=$(find_free_port $FRONTEND_BASE)
if [ -z "$FRONTEND_PORT" ]; then
  echo "ERROR: No se encontró puerto libre para frontend ($FRONTEND_BASE-$((FRONTEND_BASE+9)))"
  exit 1
fi

echo "==========================================="
echo "  Backend:  http://localhost:$BACKEND_PORT"
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo "==========================================="

# Lanzar backend
cd backend
PORT=$BACKEND_PORT python -m uvicorn main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT" &
BACKEND_PID=$!
cd ..

# Lanzar frontend apuntando al backend correcto
cd frontend
VITE_API_URL="http://localhost:$BACKEND_PORT/api" npx vite --port "$FRONTEND_PORT" --host 0.0.0.0 &
FRONTEND_PID=$!
cd ..

# Trap para matar ambos al salir
cleanup() {
  echo ""
  echo "Cerrando servidores..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  echo "Listo."
}
trap cleanup EXIT INT TERM

# Esperar a que terminen
wait
