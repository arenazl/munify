@echo off
echo ==========================================
echo   LIMPIANDO Y REINICIANDO SERVIDORES
echo ==========================================

echo.
echo [1/4] Matando procesos Python y Node...
taskkill /F /IM python.exe 2>nul
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo [2/4] Limpiando cache de Python...
cd /d %~dp0backend
if exist __pycache__ rmdir /s /q __pycache__
if exist api\__pycache__ rmdir /s /q api\__pycache__
if exist core\__pycache__ rmdir /s /q core\__pycache__
if exist models\__pycache__ rmdir /s /q models\__pycache__
if exist services\__pycache__ rmdir /s /q services\__pycache__
if exist .pytest_cache rmdir /s /q .pytest_cache

echo.
echo [3/4] Limpiando cache de Vite...
cd /d %~dp0frontend
if exist node_modules\.vite rmdir /s /q node_modules\.vite

echo.
echo [4/4] Listo!
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
