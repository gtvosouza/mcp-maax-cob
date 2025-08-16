@echo off
echo.
echo ====================================
echo   BUILD LOCAL ANTES DO DOCKER
echo ====================================
echo.

REM Verificar se Node.js está instalado
node --version > nul 2>&1
if %errorlevel% neq 0 (
    echo [AVISO] Node.js nao encontrado
    echo         O Docker fara o build sem problema
    echo.
) else (
    echo [OK] Node.js encontrado
    echo.
    echo Instalando dependencias localmente...
    npm install
    echo.
    echo Fazendo build local...
    npm run build
    echo.
    echo [OK] Build local concluido
    echo.
)

echo Agora execute: deploy-windows.bat
echo.
pause