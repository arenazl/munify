@echo off
:loop
cls
echo ========================================
echo   Servidor Backend - Quick Restart
echo ========================================
echo.
python run.py
echo.
echo Servidor detenido.
echo Presiona Enter para reiniciar, Ctrl+C para salir...
pause >nul
goto loop
