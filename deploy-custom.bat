@echo off
echo.
echo ============================================
echo   MCP MAAX COB - PORTAS CUSTOMIZADAS
echo ============================================
echo.
echo Usando portas alternativas:
echo   - MCP HTTP:    4004 (ao inves de 3001)
echo   - MCP WS:      4005 (ao inves de 3002)
echo   - REST API:    4006 (ao inves de 3000)
echo   - PostgreSQL:  5433 (ao inves de 5432)
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

REM Parar containers antigos
echo Parando containers antigos...
docker-compose -f docker-compose.mcp-custom.yml down > nul 2>&1
docker-compose -f docker-compose.mcp.yml down > nul 2>&1
docker-compose -f docker-compose.mcp-lite.yml down > nul 2>&1

echo.
echo Fazendo build do MCP Server...
docker-compose -f docker-compose.mcp-custom.yml build mcp
if %errorlevel% neq 0 (
    echo [ERRO] Falha no build do MCP
    pause
    exit /b 1
)

echo.
echo Fazendo build da REST API...
docker-compose -f docker-compose.mcp-custom.yml build api
if %errorlevel% neq 0 (
    echo [AVISO] Build da API falhou, continuando apenas com MCP
)

echo.
echo Subindo servicos...
docker-compose -f docker-compose.mcp-custom.yml up -d
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao subir servicos
    echo.
    echo Possivel conflito de portas. Verificando...
    netstat -ano | findstr :4004
    netstat -ano | findstr :4005
    netstat -ano | findstr :4006
    netstat -ano | findstr :5433
    echo.
    pause
    exit /b 1
)

echo.
echo Aguardando servicos iniciarem (20 segundos)...
timeout /t 20 /nobreak > nul

echo.
echo Status dos servicos:
docker-compose -f docker-compose.mcp-custom.yml ps

echo.
echo ============================================
echo           TESTANDO SERVICOS
echo ============================================
echo.

REM Testar PostgreSQL
echo 1. PostgreSQL (porta 5433)...
docker-compose -f docker-compose.mcp-custom.yml exec -T db pg_isready -U mcpuser -d mcp > nul 2>&1
if %errorlevel% equ 0 (
    echo    [OK] PostgreSQL funcionando
) else (
    echo    [AVISO] PostgreSQL iniciando...
)

REM Testar MCP HTTP
echo.
echo 2. MCP Server (porta 4004)...
timeout /t 2 /nobreak > nul
curl -f -s http://localhost:4004/health > nul 2>&1
if %errorlevel% equ 0 (
    echo    [OK] MCP Server funcionando
) else (
    echo    [INFO] MCP Server iniciando...
)

REM Testar REST API
echo.
echo 3. REST API (porta 4006)...
curl -f -s http://localhost:4006/health/ready > nul 2>&1
if %errorlevel% equ 0 (
    echo    [OK] REST API funcionando
) else (
    echo    [INFO] REST API iniciando ou nao configurada
)

echo.
echo ============================================
echo         DEPLOY CONCLUIDO!
echo ============================================
echo.
echo SERVICOS DISPONIVEIS:
echo.
echo   MCP HTTP:        http://localhost:4004/mcp
echo   MCP Health:      http://localhost:4004/health
echo   MCP Tools:       http://localhost:4004/tools
echo   MCP WebSocket:   ws://localhost:4005
echo   REST API:        http://localhost:4006
echo   PostgreSQL:      localhost:5433 (mcpuser/mcppass)
echo.
echo TESTAR NO NAVEGADOR:
echo.
echo   1. MCP Health:   http://localhost:4004/health
echo   2. MCP Tools:    http://localhost:4004/tools
echo   3. REST API:     http://localhost:4006/health/ready
echo.
echo COMANDOS UTEIS:
echo.
echo   Ver logs:        docker-compose -f docker-compose.mcp-custom.yml logs -f
echo   Ver logs MCP:    docker-compose -f docker-compose.mcp-custom.yml logs -f mcp
echo   Parar tudo:      docker-compose -f docker-compose.mcp-custom.yml down
echo   Restart MCP:     docker-compose -f docker-compose.mcp-custom.yml restart mcp
echo.
echo CONFIGURAR CLAUDE DESKTOP:
echo.
echo   {
echo     "mcpServers": {
echo       "mcp-maax-cob": {
echo         "command": "docker",
echo         "args": ["exec", "-i", "mcp-maax-cob-custom-mcp-1", "node", "dist/mcp.js"],
echo         "env": {"MCP_TRANSPORT": "stdio"}
echo       }
echo     }
echo   }
echo.
pause