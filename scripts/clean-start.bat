@echo off
echo ==========================================
echo   LIMPIANDO Y REINICIANDO SERVIDORES
echo ==========================================

echo.
echo [1/5] Matando procesos en puertos 8001 y 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8001.*LISTENING" 2^>nul') do (
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173.*LISTENING" 2^>nul') do (
    taskkill /F /PID %%a 2>nul
)
timeout /t 1 /nobreak >nul

echo.
echo [2/5] Limpiando cache de Python...
cd /d %~dp0backend
for /d /r %%d in (__pycache__) do @if exist "%%d" rmdir /s /q "%%d" 2>nul
if exist .pytest_cache rmdir /s /q .pytest_cache

echo.
echo [3/5] Limpiando cache de Vite...
cd /d %~dp0frontend
if exist node_modules\.vite rmdir /s /q node_modules\.vite

echo.
echo [4/5] Verificando puertos libres...
netstat -ano | findstr ":8001.*LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo   [ERROR] Puerto 8001 sigue ocupado!
) else (
    echo   [OK] Puerto 8001 libre
)
netstat -ano | findstr ":5173.*LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo   [ERROR] Puerto 5173 sigue ocupado!
) else (
    echo   [OK] Puerto 5173 libre
)

echo.
echo [5/5] Listo!
echo.
echo ==========================================
echo   PARA INICIAR LOS SERVIDORES:
echo ==========================================
echo.
echo   Backend (en una terminal):
echo     cd backend
echo     python run.py
echo.
echo   Frontend (en otra terminal):
echo     cd frontend
echo     npm run dev
echo.
echo ==========================================
pause
