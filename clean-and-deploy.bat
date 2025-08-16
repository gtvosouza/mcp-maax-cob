@echo off
echo.
echo ============================================
echo   LIMPEZA COMPLETA E DEPLOY MCP
echo ============================================
echo.

REM Verificar Docker
docker info > nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Docker Desktop nao esta rodando!
    pause
    exit /b 1
)

echo [OK] Docker detectado
echo.

echo PASSO 1: Parando TODOS os containers Docker...
docker stop $(docker ps -aq) > nul 2>&1
docker-compose down > nul 2>&1
docker-compose -f docker-compose.yml down > nul 2>&1
docker-compose -f docker-compose.mcp.yml down > nul 2>&1
docker-compose -f docker-compose.mcp-lite.yml down > nul 2>&1
docker-compose -f docker-compose.mcp-custom.yml down > nul 2>&1
docker-compose -f docker-compose.production.yml down > nul 2>&1

echo.
echo PASSO 2: Verificando portas em uso...
echo.
echo Porta 3000:
netstat -ano | findstr :3000
echo.
echo Porta 4004:
netstat -ano | findstr :4004
echo.
echo Porta 4005:
netstat -ano | findstr :4005
echo.
echo Porta 4006:
netstat -ano | findstr :4006
echo.

echo PASSO 3: Limpando imagens antigas...
docker system prune -f > nul 2>&1

echo.
echo PASSO 4: Build do MCP (portas customizadas)...
docker-compose -f docker-compose.mcp-custom.yml build --no-cache mcp

if %errorlevel% neq 0 (
    echo [ERRO] Falha no build
    pause
    exit /b 1
)

echo.
echo PASSO 5: Subindo APENAS MCP e PostgreSQL...
docker-compose -f docker-compose.mcp-custom.yml up -d db mcp

if %errorlevel% neq 0 (
    echo [ERRO] Ainda com problemas de porta
    echo.
    echo Verifique qual processo esta usando as portas:
    echo.
    netstat -ano | findstr LISTENING | findstr ":3000 :4004 :4005 :4006 :5432 :5433"
    echo.
    echo Para matar um processo, use: taskkill /PID [numero] /F
    echo.
    pause
    exit /b 1
)

echo.
echo PASSO 6: Aguardando servicos (20 segundos)...
timeout /t 20 /nobreak > nul

echo.
echo PASSO 7: Verificando status...
docker ps

echo.
echo ============================================
echo           SERVICOS ATIVOS
echo ============================================
echo.

REM Testar MCP
curl -f -s http://localhost:4004/health > nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] MCP Server: http://localhost:4004
) else (
    echo [AVISO] MCP ainda iniciando...
)

echo.
echo ============================================
echo         URLs DISPONIVEIS
echo ============================================
echo.
echo   MCP Health:      http://localhost:4004/health
echo   MCP Tools:       http://localhost:4004/tools
echo   MCP Endpoint:    http://localhost:4004/mcp
echo   WebSocket:       ws://localhost:4005
echo.
echo COMANDOS UTEIS:
echo.
echo   Ver logs:        docker logs mcp-maax-cob-custom-mcp-1
echo   Parar tudo:      docker-compose -f docker-compose.mcp-custom.yml down
echo.
echo CONFIGURACAO CLAUDE DESKTOP:
echo.
echo   Adicione ao %%APPDATA%%\Claude\claude_desktop_config.json:
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