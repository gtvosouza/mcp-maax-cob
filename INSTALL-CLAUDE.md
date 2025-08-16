# 🚀 Instalação no Claude Desktop

## Pré-requisitos
- Claude Desktop instalado
- Node.js 18+ 
- PostgreSQL rodando
- Redis rodando (opcional)

## 📦 Passo 1: Build do projeto

```bash
cd /home/gtvosouza/mcp-maax-cob

# Instalar dependências
npm install

# Compilar TypeScript
npm run build
```

## 🔧 Passo 2: Localizar arquivo de configuração do Claude

### Windows
```
%APPDATA%\Claude\claude_desktop_config.json
```

### macOS
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

### Linux
```
~/.config/Claude/claude_desktop_config.json
```

## 📝 Passo 3: Adicionar servidor MCP

Abra o arquivo `claude_desktop_config.json` e adicione:

```json
{
  "mcpServers": {
    "mcp-maax-cob": {
      "command": "node",
      "args": ["/home/gtvosouza/mcp-maax-cob/dist/mcp.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "NODE_ENV": "production",
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_DB": "mcp",
        "POSTGRES_USER": "mcpuser",
        "POSTGRES_PASSWORD": "mcppass",
        "REDIS_URL": "redis://localhost:6379",
        "ENCRYPTION_KEY_HEX": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        "WEBHOOK_HMAC_SECRET": "mcp-webhook-secret-2025",
        "RATE_LIMIT": "120"
      }
    }
  }
}
```

⚠️ **IMPORTANTE**: Ajuste os caminhos e credenciais!

## 🏃 Passo 4: Testar antes de instalar

```bash
# Testar se o MCP funciona
cd /home/gtvosouza/mcp-maax-cob
npm run mcp:stdio

# Deve aparecer:
# [MCP] Servidor iniciado com sucesso!
# 📝 Modo STDIO - Use com Claude Desktop
```

## ♻️ Passo 5: Reiniciar Claude Desktop

1. Feche completamente o Claude Desktop
2. Abra novamente
3. O servidor MCP deve aparecer conectado

## ✅ Passo 6: Verificar integração

No Claude Desktop, digite:

```
Quais ferramentas MCP você tem disponíveis?
```

Claude deve listar:
- `create_charge` - Criar cobrança
- `retrieve_charge` - Consultar cobrança
- `list_charges` - Listar cobranças
- `cancel_charge` - Cancelar cobrança
- `apply_instruction` - Aplicar instruções

## 🧪 Teste rápido

Peça ao Claude:

```
Use a ferramenta create_charge para criar uma cobrança de teste com:
- provider_id: "mock-provider"
- amount: 10000 (R$ 100,00)
- due_date: "2025-12-31"
- payment_methods: ["boleto", "pix"]
- customer: {name: "Teste", document: "12345678901"}
- api_key: "pk_test_123"
```

## 🐛 Troubleshooting

### MCP não aparece no Claude

1. Verifique o caminho no config:
```bash
ls -la /home/gtvosouza/mcp-maax-cob/dist/mcp.js
```

2. Teste manualmente:
```bash
node /home/gtvosouza/mcp-maax-cob/dist/mcp.js
```

3. Verifique logs do Claude:
- Windows: `%APPDATA%\Claude\logs`
- macOS: `~/Library/Logs/Claude`
- Linux: `~/.config/Claude/logs`

### Erro de conexão com banco

1. Certifique-se que PostgreSQL está rodando:
```bash
psql -U mcpuser -d mcp -c "SELECT 1"
```

2. Inicialize o banco:
```bash
cd /home/gtvosouza/mcp-maax-cob
psql -U mcpuser -d mcp < init.sql
```

### Erro de permissão

```bash
chmod +x /home/gtvosouza/mcp-maax-cob/dist/mcp.js
```

## 🎯 Configuração Avançada

### Usar com Docker

```json
{
  "mcpServers": {
    "mcp-maax-cob": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "--network", "host", "mcp-maax-cob:latest"],
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

### Debug mode

Adicione ao env:
```json
"DEBUG": "mcp:*",
"LOG_LEVEL": "debug"
```

## 📊 Comandos úteis no Claude

Após instalado, você pode pedir ao Claude:

1. **Criar cobrança**:
   "Crie uma cobrança de R$ 150,00 para João Silva"

2. **Consultar status**:
   "Qual o status da cobrança ID xyz?"

3. **Listar cobranças**:
   "Liste as últimas cobranças"

4. **Cancelar cobrança**:
   "Cancele a cobrança ID abc"

## 🎉 Pronto!

O MCP MAAX COB está integrado ao Claude Desktop!

Agora o Claude pode criar e gerenciar cobranças diretamente através das ferramentas MCP.