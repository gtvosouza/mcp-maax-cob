@echo off
echo.
echo ============================================
echo   DEPLOY MCP MAAX COB - DOCKER DESKTOP
echo ============================================
echo.

REM Verificar se Docker esta rodando
docker info > nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Docker Desktop nao esta rodando!
    echo        Inicie o Docker Desktop e tente novamente.
    echo.
    pause
    exit /b 1
)

echo [OK] Docker Desktop detectado
echo.

REM Build das imagens
echo Fazendo build das imagens...
docker-compose -f docker-compose.mcp.yml build
if %errorlevel% neq 0 (
    echo [ERRO] Falha no build
    pause
    exit /b 1
)

echo.
echo Subindo servicos...
docker-compose -f docker-compose.mcp.yml up -d
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao subir servicos
    pause
    exit /b 1
)

echo.
echo Aguardando servicos iniciarem (15 segundos)...
timeout /t 15 /nobreak > nul

echo.
echo Status dos servicos:
docker-compose -f docker-compose.mcp.yml ps

echo.
echo ============================================
echo           VERIFICANDO SERVICOS
echo ============================================
echo.

REM Testar REST API
echo Testando REST API (porta 3000)...
curl -f -s http://localhost:3000/health/ready > nul 2>&1
if %errorlevel% equ 0 (
    echo    [OK] REST API funcionando
) else (
    echo    [AVISO] REST API pode estar iniciando
)

REM Testar MCP
echo.
echo Testando MCP Server (porta 3001)...
curl -f -s http://localhost:3001/health > nul 2>&1
if %errorlevel% equ 0 (
    echo    [OK] MCP Server funcionando
) else (
    echo    [AVISO] MCP Server pode estar iniciando
)

REM Inicializar tenant
echo.
echo Inicializando sistema...
curl -X POST http://localhost:3000/v1/tenants/init > nul 2>&1
echo    [INFO] Sistema inicializado

echo.
echo ============================================
echo           DEPLOY CONCLUIDO!
echo ============================================
echo.
echo SERVICOS DISPONIVEIS:
echo.
echo   REST API:        http://localhost:3000
echo   MCP HTTP:        http://localhost:3001/mcp
echo   MCP WebSocket:   ws://localhost:3002
echo   PostgreSQL:      localhost:5432
echo   Redis:           localhost:6379
echo   RabbitMQ:        http://localhost:15672
echo                    (usuario: admin / senha: admin123)
echo.
echo COMANDOS UTEIS:
echo.
echo   Ver logs:        docker-compose -f docker-compose.mcp.yml logs -f
echo   Parar tudo:      docker-compose -f docker-compose.mcp.yml down
echo   Restart MCP:     docker-compose -f docker-compose.mcp.yml restart mcp
echo.
echo PROXIMOS PASSOS:
echo.
echo 1. Teste no navegador:
echo    http://localhost:3000/health/ready
echo.
echo 2. Configure Claude Desktop:
echo    Arquivo: %%APPDATA%%\Claude\claude_desktop_config.json
echo.
echo 3. Ver logs para debug:
echo    docker-compose -f docker-compose.mcp.yml logs -f
echo.
pause