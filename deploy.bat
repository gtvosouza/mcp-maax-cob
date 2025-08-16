@echo off
REM ============================================
REM   MCP MAAX COB - Deploy Windows
REM   Portas: 4004 (HTTP), 4005 (WS), 5433 (DB)
REM ============================================

echo.
echo MCP MAAX COB - Deploy Windows
echo =====================================
echo.

REM Verificar Docker
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

REM Limpar ambiente
echo Limpando ambiente anterior...
docker-compose -f docker-compose-final.yml down > nul 2>&1

REM Build
echo Construindo imagem MCP...
docker-compose -f docker-compose-final.yml build mcp
if %errorlevel% neq 0 (
    echo [ERRO] Falha no build
    pause
    exit /b 1
)

REM Deploy
echo.
echo Iniciando servicos...
docker-compose -f docker-compose-final.yml up -d
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao iniciar servicos
    pause
    exit /b 1
)

REM Aguardar
echo.
echo Aguardando servicos (20 segundos)...
timeout /t 20 /nobreak > nul

REM Status
echo.
echo Status dos servicos:
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

REM Testar
echo.
echo Testando MCP Server...
curl -f -s http://localhost:4004/health > nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] MCP Server funcionando!
) else (
    echo [AVISO] MCP ainda iniciando...
)

REM Informacoes
echo.
echo =====================================
echo SERVICOS DISPONIVEIS:
echo =====================================
echo.
echo MCP Server:
echo   Health: http://localhost:4004/health
echo   Tools:  http://localhost:4004/tools
echo   HTTP:   http://localhost:4004/mcp
echo   WS:     ws://localhost:4005
echo.
echo PostgreSQL:
echo   Host: localhost
echo   Port: 5433
echo   User: mcpuser
echo   Pass: mcppass
echo.
echo COMANDOS UTEIS:
echo   Ver logs:  docker-compose -f docker-compose-final.yml logs -f mcp
echo   Parar:     docker-compose -f docker-compose-final.yml down
echo   Reiniciar: docker-compose -f docker-compose-final.yml restart mcp
echo.
echo CLAUDE DESKTOP CONFIG:
echo   {
echo     "mcpServers": {
echo       "mcp-maax-cob": {
echo         "command": "docker",
echo         "args": ["exec", "-i", "mcp-maax-cob-mcp-1", "node", "dist/mcp.js"],
echo         "env": {"MCP_TRANSPORT": "stdio"}
echo       }
echo     }
echo   }
echo.
pause