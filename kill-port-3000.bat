@echo off
echo.
echo ============================================
echo   LIBERANDO PORTA 3000
echo ============================================
echo.

echo Procurando processo usando porta 3000...
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo Encontrado processo PID: %%a
    echo Matando processo...
    taskkill /PID %%a /F
    echo Processo terminado!
)

echo.
echo Verificando se porta foi liberada...
netstat -ano | findstr :3000 | findstr LISTENING

if %errorlevel% neq 0 (
    echo.
    echo [OK] Porta 3000 esta livre agora!
) else (
    echo.
    echo [AVISO] Porta 3000 ainda em uso
)

echo.
pause