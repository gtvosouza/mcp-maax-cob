@echo off
echo.
echo ============================================
echo   MCP MAAX COB - VERSAO LITE (SEM RABBIT)
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

REM Parar containers antigos se existirem
echo Parando containers antigos (se existirem)...
docker-compose -f docker-compose.mcp-lite.yml down > nul 2>&1

echo.
echo Fazendo build do MCP Server...
docker-compose -f docker-compose.mcp-lite.yml build mcp
if %errorlevel% neq 0 (
    echo [ERRO] Falha no build
    echo        Verifique se o arquivo Dockerfile.mcp esta correto
    pause
    exit /b 1
)

echo.
echo Subindo servicos (PostgreSQL + MCP)...
docker-compose -f docker-compose.mcp-lite.yml up -d
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao subir servicos
    pause
    exit /b 1
)

echo.
echo Aguardando servicos iniciarem (20 segundos)...
timeout /t 20 /nobreak > nul

echo.
echo Status dos servicos:
docker-compose -f docker-compose.mcp-lite.yml ps

echo.
echo ============================================
echo           TESTANDO SERVICOS
echo ============================================
echo.

REM Testar PostgreSQL
echo 1. PostgreSQL (porta 5432)...
docker-compose -f docker-compose.mcp-lite.yml exec -T db pg_isready -U mcpuser -d mcp > nul 2>&1
if %errorlevel% equ 0 (
    echo    [OK] PostgreSQL funcionando
) else (
    echo    [AVISO] PostgreSQL iniciando...
)

REM Testar MCP HTTP
echo.
echo 2. MCP Server HTTP (porta 3001)...
timeout /t 2 /nobreak > nul
curl -f -s http://localhost:3001/health > nul 2>&1
if %errorlevel% equ 0 (
    echo    [OK] MCP HTTP funcionando
) else (
    echo    [INFO] MCP HTTP pode estar iniciando
    echo           Tente: http://localhost:3001/health
)

echo.
echo ============================================
echo        DEPLOY LITE CONCLUIDO!
echo ============================================
echo.
echo SERVICOS DISPONIVEIS:
echo.
echo   MCP HTTP:        http://localhost:3001/mcp
echo   MCP Health:      http://localhost:3001/health
echo   MCP Tools:       http://localhost:3001/tools
echo   MCP WebSocket:   ws://localhost:3002
echo   PostgreSQL:      localhost:5432 (mcpuser/mcppass)
echo.
echo TESTAR NO NAVEGADOR:
echo.
echo   1. http://localhost:3001/health
echo   2. http://localhost:3001/tools
echo.
echo COMANDOS UTEIS:
echo.
echo   Ver logs MCP:    docker-compose -f docker-compose.mcp-lite.yml logs -f mcp
echo   Parar tudo:      docker-compose -f docker-compose.mcp-lite.yml down
echo   Restart MCP:     docker-compose -f docker-compose.mcp-lite.yml restart mcp
echo.
echo CONFIGURAR CLAUDE DESKTOP:
echo.
echo   Adicione ao %%APPDATA%%\Claude\claude_desktop_config.json:
echo.
echo   {
echo     "mcpServers": {
echo       "mcp-maax-cob": {
echo         "command": "docker",
echo         "args": ["exec", "-i", "mcp-maax-cob-lite-mcp-1", "node", "dist/mcp.js"]
echo       }
echo     }
echo   }
echo.
pause