@echo off
echo.
echo ============================================
echo   MCP APENAS - PORTAS 4004/4005
echo   (SEM PORTA 3000)
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

echo Parando containers antigos...
docker ps -q | findstr . > nul 2>&1
if %errorlevel% equ 0 (
    docker stop $(docker ps -q) > nul 2>&1
)

echo Removendo containers antigos...
docker-compose -f docker-compose.mcp-custom.yml down > nul 2>&1

echo.
echo Construindo APENAS o MCP Server...
echo.

REM Criar um docker-compose minimo sem REST API
echo version: '3.8' > docker-compose.minimal.yml
echo. >> docker-compose.minimal.yml
echo services: >> docker-compose.minimal.yml
echo   db: >> docker-compose.minimal.yml
echo     image: postgres:15-alpine >> docker-compose.minimal.yml
echo     environment: >> docker-compose.minimal.yml
echo       POSTGRES_DB: mcp >> docker-compose.minimal.yml
echo       POSTGRES_USER: mcpuser >> docker-compose.minimal.yml
echo       POSTGRES_PASSWORD: mcppass >> docker-compose.minimal.yml
echo     ports: >> docker-compose.minimal.yml
echo       - "5433:5432" >> docker-compose.minimal.yml
echo     healthcheck: >> docker-compose.minimal.yml
echo       test: ["CMD-SHELL", "pg_isready -U mcpuser -d mcp"] >> docker-compose.minimal.yml
echo       interval: 10s >> docker-compose.minimal.yml
echo       timeout: 5s >> docker-compose.minimal.yml
echo       retries: 5 >> docker-compose.minimal.yml
echo. >> docker-compose.minimal.yml
echo   mcp: >> docker-compose.minimal.yml
echo     build: >> docker-compose.minimal.yml
echo       context: . >> docker-compose.minimal.yml
echo       dockerfile: Dockerfile.mcp >> docker-compose.minimal.yml
echo     depends_on: >> docker-compose.minimal.yml
echo       db: >> docker-compose.minimal.yml
echo         condition: service_healthy >> docker-compose.minimal.yml
echo     environment: >> docker-compose.minimal.yml
echo       NODE_ENV: production >> docker-compose.minimal.yml
echo       MCP_TRANSPORT: http >> docker-compose.minimal.yml
echo       MCP_HTTP_PORT: 4004 >> docker-compose.minimal.yml
echo       MCP_WS_PORT: 4005 >> docker-compose.minimal.yml
echo       POSTGRES_HOST: db >> docker-compose.minimal.yml
echo       POSTGRES_PORT: 5432 >> docker-compose.minimal.yml
echo       POSTGRES_DB: mcp >> docker-compose.minimal.yml
echo       POSTGRES_USER: mcpuser >> docker-compose.minimal.yml
echo       POSTGRES_PASSWORD: mcppass >> docker-compose.minimal.yml
echo       ENCRYPTION_KEY_HEX: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef >> docker-compose.minimal.yml
echo     ports: >> docker-compose.minimal.yml
echo       - "4004:4004" >> docker-compose.minimal.yml
echo       - "4005:4005" >> docker-compose.minimal.yml

echo Docker Compose minimo criado!
echo.
echo Fazendo build do MCP...
docker-compose -f docker-compose.minimal.yml build mcp

if %errorlevel% neq 0 (
    echo [ERRO] Falha no build
    pause
    exit /b 1
)

echo.
echo Subindo servicos (DB + MCP)...
docker-compose -f docker-compose.minimal.yml up -d

if %errorlevel% neq 0 (
    echo [ERRO] Falha ao subir servicos
    pause
    exit /b 1
)

echo.
echo Aguardando servicos (20 segundos)...
timeout /t 20 /nobreak > nul

echo.
echo Verificando containers ativos...
docker ps

echo.
echo ============================================
echo         MCP RODANDO!
echo ============================================
echo.
echo SERVICOS:
echo.
echo   MCP HTTP:        http://localhost:4004
echo   MCP Health:      http://localhost:4004/health
echo   MCP Tools:       http://localhost:4004/tools
echo   MCP WebSocket:   ws://localhost:4005
echo   PostgreSQL:      localhost:5433
echo.
echo TESTE NO NAVEGADOR:
echo.
echo   http://localhost:4004/health
echo.
echo COMANDOS:
echo.
echo   Ver logs:    docker-compose -f docker-compose.minimal.yml logs -f mcp
echo   Parar:       docker-compose -f docker-compose.minimal.yml down
echo.
echo CLAUDE DESKTOP CONFIG:
echo.
echo {
echo   "mcpServers": {
echo     "mcp-maax-cob": {
echo       "command": "docker",
echo       "args": ["exec", "-i", "mcp-maax-cob-mcp-1", "node", "dist/mcp.js"],
echo       "env": {"MCP_TRANSPORT": "stdio"}
echo     }
echo   }
echo }
echo.
pause