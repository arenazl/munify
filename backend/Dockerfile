# Backend Dockerfile - Google Cloud Run
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencias del sistema (mysqlclient + ssl + ffi)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc default-libmysqlclient-dev pkg-config \
    libssl-dev libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Cloud Run inyecta PORT=8080 por default.
ENV PORT=8080
EXPOSE 8080

# gunicorn con worker uvicorn. 2 workers caben en 512Mi;
# --timeout 120 para uploads grandes/LLM.
CMD exec gunicorn main:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:${PORT} --timeout 120
