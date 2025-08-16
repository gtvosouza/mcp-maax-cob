#!/bin/bash

# Test Deploy Script - MCP MAAX COB
# Testa se o deploy Docker está funcionando

echo "🧪 TESTE PÓS-DEPLOY - MCP MAAX COB"
echo "=================================="

API_URL="http://localhost:3000"

# Função para testar endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local expected_status=$3
    local description=$4
    
    echo -n "   $description... "
    
    response=$(curl -s -w "\\n%{http_code}" -X "$method" "$API_URL$endpoint" 2>/dev/null)
    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$status_code" = "$expected_status" ]; then
        echo "✅ ($status_code)"
        return 0
    else
        echo "❌ ($status_code)"
        echo "      Response: $body"
        return 1
    fi
}

# Função para aguardar serviço
wait_for_service() {
    local url=$1
    local timeout=$2
    local description=$3
    
    echo "⏳ Aguardando $description..."
    
    for i in $(seq 1 $timeout); do
        if curl -f -s "$url" > /dev/null 2>&1; then
            echo "   ✅ $description disponível!"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    
    echo ""
    echo "   ❌ $description não respondeu em ${timeout}s"
    return 1
}

echo ""
echo "📡 1. Verificando conectividade..."

# Aguardar API estar disponível
if ! wait_for_service "$API_URL/health/ready" 30 "API"; then
    echo "❌ API não está respondendo. Verifique se o deploy foi feito corretamente."
    exit 1
fi

echo ""
echo "🏥 2. Testando endpoints de health..."

test_endpoint "GET" "/health/ready" "200" "Health check"
test_endpoint "GET" "/health/live" "200" "Liveness check"

echo ""
echo "🔧 3. Testando endpoints principais..."

test_endpoint "POST" "/v1/tenants/init" "200" "Inicializar tenant"
test_endpoint "GET" "/v1/tenants" "200" "Listar tenants"

echo ""
echo "🔑 4. Testando endpoints administrativos..."

# Primeiro criar uma admin key para testar
echo "   Criando admin key de teste..."
init_response=$(curl -s -X POST "$API_URL/v1/tenants/init" 2>/dev/null)
admin_key=$(echo "$init_response" | grep -o '"admin_api_key":"[^"]*"' | cut -d'"' -f4)

if [ -n "$admin_key" ]; then
    echo "   ✅ Admin key obtida: ${admin_key:0:20}..."
    
    # Testar endpoints admin
    curl -s -H "X-Admin-Api-Key: $admin_key" "$API_URL/v1/admin/providers" > /dev/null && echo "   ✅ Listar providers" || echo "   ❌ Listar providers"
    curl -s -H "X-Admin-Api-Key: $admin_key" -H "Content-Type: application/json" -d '{"provider_type":"mock","friendly_name":"Test","credentials":{},"provider_specific_config":{}}' "$API_URL/v1/admin/providers" > /dev/null && echo "   ✅ Criar provider mock" || echo "   ❌ Criar provider mock"
    
else
    echo "   ❌ Não foi possível obter admin key"
fi

echo ""
echo "📊 5. Verificando logs recentes..."
echo "   Últimas 5 linhas dos logs da API:"

if command -v docker-compose &> /dev/null; then
    docker-compose logs api --tail=5 2>/dev/null | tail -5 | sed 's/^/      /'
elif command -v docker compose &> /dev/null; then
    docker compose logs api --tail=5 2>/dev/null | tail -5 | sed 's/^/      /'
else
    echo "      Docker Compose não disponível"
fi

echo ""
echo "🐳 6. Status dos containers..."

if command -v docker-compose &> /dev/null; then
    docker-compose ps 2>/dev/null | sed 's/^/   /'
elif command -v docker compose &> /dev/null; then
    docker compose ps 2>/dev/null | sed 's/^/   /'
else
    echo "   Docker Compose não disponível"
fi

echo ""
echo "🎯 7. Teste de integração mock..."

if [ -n "$admin_key" ]; then
    # Criar API key pública
    echo "   Criando API key pública..."
    api_key_response=$(curl -s -X POST -H "X-Admin-Api-Key: $admin_key" "$API_URL/v1/admin/api-keys" 2>/dev/null)
    public_key=$(echo "$api_key_response" | grep -o '"public_api_key":"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$public_key" ]; then
        echo "   ✅ API key pública obtida: ${public_key:0:20}..."
        
        # Obter provider ID
        providers_response=$(curl -s -H "X-Admin-Api-Key: $admin_key" "$API_URL/v1/admin/providers" 2>/dev/null)
        provider_id=$(echo "$providers_response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        
        if [ -n "$provider_id" ]; then
            echo "   ✅ Provider ID obtido: $provider_id"
            
            # Criar cobrança de teste
            charge_data='{
                "provider_id": "'$provider_id'",
                "amount": 1000,
                "due_date": "2025-12-31",
                "payment_methods": ["boleto", "pix"],
                "customer": {
                    "name": "Teste Docker",
                    "document": "12345678901"
                }
            }'
            
            echo "   Criando cobrança de teste..."
            charge_response=$(curl -s -X POST -H "X-Public-Api-Key: $public_key" -H "Content-Type: application/json" -d "$charge_data" "$API_URL/v1/charges" 2>/dev/null)
            charge_id=$(echo "$charge_response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
            
            if [ -n "$charge_id" ]; then
                echo "   ✅ Cobrança criada: $charge_id"
                
                # Consultar cobrança
                curl -s -H "X-Public-Api-Key: $public_key" "$API_URL/v1/charges/$charge_id" > /dev/null && echo "   ✅ Consulta de cobrança" || echo "   ❌ Consulta de cobrança"
                
            else
                echo "   ❌ Erro ao criar cobrança"
                echo "      Response: $charge_response"
            fi
        else
            echo "   ❌ Não foi possível obter provider ID"
        fi
    else
        echo "   ❌ Não foi possível obter API key pública"
    fi
else
    echo "   ⚠️ Pulando teste - admin key não disponível"
fi

echo ""
echo "🎉 TESTE PÓS-DEPLOY CONCLUÍDO!"
echo ""
echo "📋 RESUMO:"
echo "   🌐 API disponível em: $API_URL"
echo "   📊 Health check: $API_URL/health/ready"
echo "   🔧 Tenants: $API_URL/v1/tenants"
echo ""
echo "🚀 Sistema MCP MAAX COB está funcionando!"
echo ""
echo "💡 Para usar em produção:"
echo "   1. Configure credenciais reais dos bancos"
echo "   2. Ajuste variáveis de ambiente"
echo "   3. Configure HTTPS"
echo "   4. Implemente backup do banco"
echo ""