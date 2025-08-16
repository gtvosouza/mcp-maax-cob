#!/bin/bash

# Deploy Script - MCP MAAX COB
# Sobe todos os serviços com Docker Compose

echo "🚀 DEPLOY MCP MAAX COB"
echo "====================="

# Verificar se Docker está disponível
if ! command -v docker &> /dev/null; then
    echo "❌ Docker não encontrado. Instale o Docker primeiro."
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! command -v docker compose &> /dev/null; then
    echo "❌ Docker Compose não encontrado. Instale o Docker Compose primeiro."
    exit 1
fi

# Função para usar docker-compose ou docker compose
docker_compose_cmd() {
    if command -v docker-compose &> /dev/null; then
        docker-compose "$@"
    else
        docker compose "$@"
    fi
}

echo "📋 Verificando arquivos..."

# Verificar se arquivos necessários existem
if [ ! -f "Dockerfile" ]; then
    echo "❌ Dockerfile não encontrado"
    exit 1
fi

if [ ! -f "docker-compose.yml" ]; then
    echo "❌ docker-compose.yml não encontrado"
    exit 1
fi

if [ ! -f ".env.docker" ]; then
    echo "❌ .env.docker não encontrado"
    exit 1
fi

echo "✅ Todos os arquivos necessários encontrados"

echo ""
echo "🛑 Parando containers existentes..."
docker_compose_cmd down --volumes

echo ""
echo "🔨 Fazendo build da aplicação..."
npm run build

echo ""
echo "🐳 Fazendo build das imagens Docker..."
docker_compose_cmd build --no-cache

echo ""
echo "🚀 Subindo todos os serviços..."
docker_compose_cmd up -d

echo ""
echo "⏳ Aguardando serviços iniciarem..."
sleep 10

echo ""
echo "🔍 Verificando status dos serviços..."
docker_compose_cmd ps

echo ""
echo "📊 Verificando logs da API..."
docker_compose_cmd logs api --tail=20

echo ""
echo "🏥 Testando health check..."
timeout 30 bash -c 'until curl -f http://localhost:3000/health/ready; do sleep 2; done' && echo "✅ API está rodando!" || echo "❌ API não respondeu"

echo ""
echo "🎉 DEPLOY CONCLUÍDO!"
echo ""
echo "📋 Serviços disponíveis:"
echo "   🌐 API: http://localhost:3000"
echo "   📊 Health: http://localhost:3000/health/ready"
echo "   🗄️ PostgreSQL: localhost:5432"
echo "   🔴 Redis: localhost:6379"
echo "   🐰 RabbitMQ Management: http://localhost:15672"
echo ""
echo "📖 Comandos úteis:"
echo "   docker compose logs api -f     # Ver logs da API"
echo "   docker compose ps              # Status dos containers"
echo "   docker compose down            # Parar tudo"
echo "   docker compose restart api     # Reiniciar API"
echo ""
echo "🎯 Para testar as integrações:"
echo "   curl http://localhost:3000/health/ready"
echo "   curl http://localhost:3000/v1/tenants/init -X POST"
echo ""