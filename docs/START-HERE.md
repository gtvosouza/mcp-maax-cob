# 🚀 Como Iniciar MAAX COB MCP Server

## Porta 8009 (MCP HTTP)

O MAAX COB deve rodar na **porta 8009** em modo MCP HTTP para integrar com o backend-maax-agent.

---

## 📋 Método 1: Script Automático (Recomendado)

```bash
cd /home/gtvosouza/maax-mcp/mcp-maax-cob
./start-mcp.sh
```

**O script verifica:**
- ✅ Arquivo `.env` existe
- ✅ `MCP_TOKEN_SECRET` configurado
- ✅ Redis está rodando
- ✅ Porta 8009 está livre

---

## 📋 Método 2: Manual

```bash
cd /home/gtvosouza/maax-mcp/mcp-maax-cob

# Opção A: Comando direto
MCP_TRANSPORT=http npm run mcp

# Opção B: Usando script do package.json
npm run mcp:http
```

**Saída esperada:**
```
========================================
      MCP MAAX COB - Servidor MCP
========================================

[Config] Transporte: http
[Config] Ambiente: DESENVOLVIMENTO

[MCP] Iniciando com transporte: http
[MCP] HTTP/SSE server rodando em http://localhost:8009
[MCP] SSE endpoint: http://localhost:8009/mcp

[MCP] Servidor iniciado com sucesso!

🌐 Modo HTTP/SSE - Endpoints disponíveis:
   SSE: http://localhost:8009/mcp
   Health: http://localhost:8009/health
   Tools: http://localhost:8009/tools

========================================
```

---

## ✅ Verificar que Está Funcionando

### 1. Health Check

```bash
curl http://localhost:8009/health
```

**Resposta esperada:**
```json
{
  "status": "ok",
  "transport": "http/sse",
  "mcp_version": "2.0.0"
}
```

### 2. Listar Tools Disponíveis

```bash
curl http://localhost:8009/tools
```

**Resposta esperada:**
```json
{
  "tools": [
    "get_providers_metadata",
    "get_account_statement",
    "create_charge",
    "retrieve_charge",
    "cancel_charge",
    "apply_instruction"
  ]
}
```

### 3. Testar Endpoint MCP (requer JWT)

```bash
curl -H "Authorization: Bearer <JWT_TOKEN>" \
     http://localhost:8009/mcp
```

---

## 🔧 Configuração Necessária

### Arquivo `.env`

Certifique-se que as seguintes variáveis estão configuradas:

```bash
# Porta do MCP HTTP
MCP_HTTP_PORT=8009

# Secret JWT (DEVE ser o MESMO do backend-maax-agent)
MCP_TOKEN_SECRET=dev-maax-cob-secret-change-in-production

# Redis
REDIS_URL=redis://localhost:6379
```

### Sincronização com Backend

**Backend-maax-agent** (`.env`):
```bash
MAAX_COB_MCP_URL=http://localhost:8009/mcp
MAAX_COB_TOKEN_SECRET=dev-maax-cob-secret-change-in-production
```

⚠️ **IMPORTANTE**: O `MCP_TOKEN_SECRET` (MAAX COB) e `MAAX_COB_TOKEN_SECRET` (backend) **DEVEM SER IDÊNTICOS**!

---

## 🐛 Troubleshooting

### Erro: "Porta 8009 já está em uso"

```bash
# Verificar o que está usando a porta
lsof -i :8009

# Matar o processo
kill <PID>

# Ou use outra porta
echo "MCP_HTTP_PORT=3002" >> .env
```

### Erro: "Redis connection failed"

```bash
# Iniciar Redis
redis-server

# Ou em background
redis-server --daemonize yes

# Verificar
redis-cli ping  # Deve retornar: PONG
```

### Erro: "Invalid or missing Bearer token"

Verifique se:
1. `MCP_TOKEN_SECRET` está configurado no `.env`
2. É o mesmo valor do `MAAX_COB_TOKEN_SECRET` no backend
3. O JWT foi gerado corretamente pelo backend

---

## 🎯 Diferença entre Modos

### 🔴 ERRADO: API REST (porta 8009)

```bash
# NÃO USE ESTE COMANDO
npm run dev  # ❌ Inicia API REST, não MCP!
```

### ✅ CORRETO: MCP HTTP (porta 8009)

```bash
# USE ESTE COMANDO
npm run mcp:http  # ✅ Inicia MCP Server
```

---

## 📊 Resumo Visual

```
┌─────────────────────────────────────────┐
│         MAAX COB MCP Server             │
│                                         │
│  Porta: 8009                            │
│  Endpoint: /mcp                         │
│  Autenticação: JWT Bearer Token         │
│                                         │
│  ┌────────────────────────────────┐    │
│  │  GET /health                   │    │
│  │  → Status do servidor          │    │
│  └────────────────────────────────┘    │
│                                         │
│  ┌────────────────────────────────┐    │
│  │  GET /tools                    │    │
│  │  → Lista de ferramentas MCP    │    │
│  └────────────────────────────────┘    │
│                                         │
│  ┌────────────────────────────────┐    │
│  │  GET /mcp                      │    │
│  │  Authorization: Bearer <JWT>   │    │
│  │  → Conexão SSE (MCP Protocol)  │    │
│  └────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
           ▲
           │ JWT Bearer Token
           │
┌──────────┴──────────────────────────────┐
│      Backend-maax-agent                 │
│      (porta 3999)                       │
│                                         │
│  Gera JWT com:                          │
│  - company                              │
│  - provider                             │
│  - credentials                          │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🚀 Início Rápido (3 comandos)

```bash
# 1. Verificar configuração
cat .env | grep -E "MCP_HTTP_PORT|MCP_TOKEN_SECRET"

# 2. Iniciar servidor
npm run mcp:http

# 3. Testar (em outro terminal)
curl http://localhost:8009/health
```

**Se retornar `{"status":"ok",...}`, está funcionando! ✅**

---

## 📚 Documentação Adicional

- [SETUP-GUIDE.md](SETUP-GUIDE.md) - Guia completo de instalação
- [AUTHENTICATION-FLOW.md](AUTHENTICATION-FLOW.md) - Como funciona o JWT
- [BB-MTLS-SETUP.md](BB-MTLS-SETUP.md) - Configurar certificados Banco do Brasil

---

## ⚡ Quick Test

```bash
# Terminal 1: Iniciar MAAX COB
cd /home/gtvosouza/maax-mcp/mcp-maax-cob
npm run mcp:http

# Terminal 2: Verificar
curl http://localhost:8009/health && echo " ✅ MCP OK!"
```

Se ver `✅ MCP OK!`, o servidor está pronto para uso! 🎉
