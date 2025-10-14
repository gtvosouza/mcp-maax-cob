#!/bin/bash
set -e

IMAGE_NAME="mcp-maax-cob"
CONTAINER_NAME="mcp-maax-cob"
REDIS_CONTAINER="mcp-maax-cob-redis"
NETWORK_NAME="mcp-maax-cob-network"
APP_PORT=4004
WS_PORT=4005
REDIS_PORT=6381
MCP_TOKEN_SECRET="${MCP_TOKEN_SECRET:-dev-maax-cob-secret}"
ENCRYPTION_KEY_HEX="${ENCRYPTION_KEY_HEX:-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef}"
WEBHOOK_HMAC_SECRET="${WEBHOOK_HMAC_SECRET:-mcp-webhook-secret-2025}"

echo "🧹 Removendo containers antigos (se existirem)..."
docker rm -f $REDIS_CONTAINER $CONTAINER_NAME 2>/dev/null || true

echo "🌐 Criando network Docker (se não existir)..."
docker network create $NETWORK_NAME 2>/dev/null || true

echo "📦 Buildando imagem da aplicação..."
docker build --no-cache -t $IMAGE_NAME .

echo "🧱 Subindo Redis na porta ${REDIS_PORT}..."
docker run -d --name $REDIS_CONTAINER \
  --network $NETWORK_NAME \
  -p ${REDIS_PORT}:6379 \
  --health-cmd="redis-cli ping" \
  --health-interval=5s --health-timeout=3s --health-retries=5 \
  redis:7-alpine redis-server --appendonly no

echo "⏳ Aguardando Redis ficar saudável..."
until [ "$(docker inspect --format='{{.State.Health.Status}}' $REDIS_CONTAINER)" == "healthy" ]; do
  sleep 1
done

echo "🚀 Subindo aplicação nas portas HTTP:${APP_PORT} e WS:${WS_PORT}..."
docker run -d \
  --name $CONTAINER_NAME \
  --network $NETWORK_NAME \
  -e TZ=America/Sao_Paulo \
  -e NODE_ENV=production \
  -e PORT=${APP_PORT} \
  -e HOST=0.0.0.0 \
  -e LOG_LEVEL=info \
  -e MCP_TOKEN_SECRET=${MCP_TOKEN_SECRET} \
  -e REDIS_URL=redis://${REDIS_CONTAINER}:6379 \
  -e REDIS_PASSWORD= \
  -e ENCRYPTION_KEY_HEX=${ENCRYPTION_KEY_HEX} \
  -e WEBHOOK_HMAC_SECRET=${WEBHOOK_HMAC_SECRET} \
  -e RATE_LIMIT=120 \
  -p ${APP_PORT}:${APP_PORT} \
  -p ${WS_PORT}:${WS_PORT} \
  $IMAGE_NAME

echo "⏳ Aguardando aplicação iniciar..."
sleep 5

echo ""
echo "✅ Deploy concluído!"
echo "✅ HTTP:   http://localhost:${APP_PORT}/mcp"
echo "✅ WS:     ws://localhost:${WS_PORT}"
echo "✅ Health: http://localhost:${APP_PORT}/health"
echo "✅ Redis:  redis://localhost:${REDIS_PORT}"
echo ""
echo "📋 Logs: docker logs -f $CONTAINER_NAME"
echo ""
echo "🔒 Lembrete: Gere tokens JWT com MCP_TOKEN_SECRET e envie via Authorization: Bearer"
