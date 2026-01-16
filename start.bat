@echo off
echo Iniciando Sistema de Gestion Municipal...
echo.

:: Iniciar Backend
echo [1/2] Iniciando Backend (Puerto 8000)...
start "Backend SGM" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"

:: Esperar un momento para que el backend inicie
timeout /t 3 /nobreak > nul

:: Iniciar Frontend
echo [2/2] Iniciando Frontend (Puerto 5173)...
start "Frontend SGM" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Servidores iniciados!
echo - Backend: http://localhost:8000
echo - Frontend: http://localhost:5173
echo.
pause
