# 🚀 MCP MAAX COB - Guia de Produção

Servidor MCP stateless focado em tokens Bearer e Redis para cache de sessões. Esta versão **não utiliza banco relacional**.

## ✅ Checklist Rápido

- [ ] `MCP_TOKEN_SECRET` definido (32+ caracteres aleatórios)
- [ ] `ENCRYPTION_KEY_HEX` gerado com `openssl rand -hex 32`
- [ ] Redis acessível (preferencialmente com TLS e senha)
- [ ] Logs agregados (CloudWatch, Elastic, Loki...)
- [ ] Monitoramento de métricas exposto para Prometheus/Grafana

## 🐳 Deploy com Docker Compose

### 1. Preparar variáveis (`.env.production`)
```bash
PORT=3000
NODE_ENV=production
REDIS_URL=redis://usuario:senha@redis-prod:6379
MCP_TOKEN_SECRET=<seu-segredo-jwt>
ENCRYPTION_KEY_HEX=$(openssl rand -hex 32)
WEBHOOK_HMAC_SECRET=<segredo-webhook>
RATE_LIMIT=200
LOG_LEVEL=info
```

### 2. Subir serviços
```bash
npm run build
docker compose -f docker-compose-final.yml up -d
```

### 3. Health check
```bash
curl http://sua-api:3000/health
```

## 🔐 Gestão de Tokens

Os tokens são JWTs assinados com `MCP_TOKEN_SECRET`. Recomenda-se gerar via um serviço seguro (KMS/Vault).

### Payload mínimo
```json
{
  "providerId": "cora",
  "credentials": { ... },
  "meta": {
    "ttlSeconds": 28800,
    "cacheEnabled": true,
    "redisKeyPrefix": "tenant-123"
  },
  "tenantId": "tenant-123"
}
```

### Boas práticas
- Rotacionar `MCP_TOKEN_SECRET` periodicamente
- Expirar tokens curtos (`exp` <= 1h) e usar refresh controlado
- Assinar tokens em service account, nunca em clientes

## 🔧 Operações Principais

| Operação | Endpoint | Autenticação |
|----------|----------|--------------|
| Health | `GET /health` | Pública |
| Initialize | `POST /initialize` | `Authorization: Bearer <token>` |
| Criar cobrança | `POST /v1/charges` | `Authorization: Bearer <token>` |
| Consultar cobrança | `GET /v1/charges/:provider_charge_id` | `Authorization: Bearer <token>` |
| Cancelar cobrança | `POST /v1/charges/:provider_charge_id/cancel` | `Authorization: Bearer <token>` |

## 📊 Observabilidade

- **Logs**: `docker compose -f docker-compose-final.yml logs -f`
- **Métricas JSON**: `GET /metrics`
- **Métricas Prometheus**: `GET /metrics/prometheus`
- **Tempo de resposta** monitorado via `metricsCollector`

## 🔒 Segurança & Compliance

- Restrinja `MCP_TOKEN_SECRET` e `ENCRYPTION_KEY_HEX` a segredos gerenciados
- Utilize Redis com TLS/ACLs ou serviço gerenciado (Azure Cache, ElastiCache, Memorystore)
- Configure HTTPS via reverse proxy (nginx, traefik, API Gateway)
- Habilite logs estruturados e centralizados

## ♻️ Backups & Retenção

- Redis é cache; persistência opcional via AOF/RDB caso deseje warm start
- Tokens podem ser reemitidos; mantenha rotação em segredo

## 🛠️ Atualizações

```bash
# Pull do código
git pull

# Build e rollout
npm run build
docker compose -f docker-compose-final.yml up -d --build mcp
```

Valide sempre com `curl /health` antes de liberar tráfego.

## 🧯 Troubleshooting

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| `401 AUTH_INVALID_TOKEN` | Token expirado / segredo incorreto | Regerar token e validar `MCP_TOKEN_SECRET` |
| `502 PROVIDER_ERROR` | API do banco indisponível | Consultar status do provedor, habilitar retries | 
| Cache não reduz latência | `meta.cacheEnabled` false ou Redis fora | Checar Redis, TTL e prefixos |

---

💡 **Lembrete:** este deploy é stateless. Toda informação sensível deve estar no token ou proveniente do provedor. Mantendo Redis saudável e segredos protegidos, o serviço escala horizontalmente sem migrações.
