# Scope-Based Tool Discovery

## Visão Geral

O **MAAX COB** implementa um sistema de **discovery dinâmico de ferramentas (tools)** baseado nos **scopes OAuth2** disponíveis nas credenciais do provedor bancário.

Ao invés de retornar sempre todas as ferramentas MCP disponíveis, o servidor consulta o endpoint de **OAuth2 Introspection** do banco para descobrir quais permissões/scopes estão ativas, e retorna **apenas as ferramentas** que o usuário tem permissão para usar.

## Por que isso é importante?

1. **Segurança**: Evita que o agente tente usar ferramentas para as quais não tem permissão
2. **UX melhorada**: O usuário vê apenas o que pode realmente usar
3. **Conformidade**: Respeita as permissões OAuth2 configuradas no provedor
4. **Feedback claro**: Logs indicam exatamente quais capabilities estão disponíveis

## Como funciona?

### 1. Fluxo de Discovery

```
┌─────────────┐
│   Backend   │
│ maax-agent  │
└──────┬──────┘
       │ 1. POST /mcp (tools/list)
       │    Bearer JWT Token
       ▼
┌─────────────────────┐
│   MCP MAAX COB      │
│   (Port 8009)       │
└──────┬──────────────┘
       │ 2. Validate JWT
       │ 3. Extract provider from token
       │ 4. Get adapter for provider
       ▼
┌─────────────────────┐
│  Provider Adapter   │
│ (e.g. BB Adapter)   │
└──────┬──────────────┘
       │ 5. getAvailableScopes()
       │    → Call OAuth2 introspect endpoint
       ▼
┌─────────────────────┐
│ OAuth2 Server (BB)  │
│ /oauth/introspect   │
└──────┬──────────────┘
       │ 6. Return token scopes
       ▼
┌─────────────────────┐
│  MCP MAAX COB       │
│  Filter tools       │
└──────┬──────────────┘
       │ 7. Return filtered tools
       │    (only tools matching scopes)
       ▼
┌─────────────┐
│   Backend   │
│ Receives    │
│ toolCount:N │
└─────────────┘
```

### 2. Implementação por Provedor

Cada adapter de provedor pode implementar os seguintes métodos opcionais:

```typescript
interface PaymentProviderAdapter {
  // ... outros métodos obrigatórios

  // Capability discovery (opcional)
  getAvailableScopes?(): Promise<string[]>;
  hasScope?(scope: string): Promise<boolean>;
  canCreateCharges?(): Promise<boolean>;
  canGetStatements?(): Promise<boolean>;
}
```

### 3. Exemplo: Banco do Brasil

#### Scopes definidos:

```typescript
private static readonly CHARGE_SCOPES = [
  "cobrancas.boletos-requisicao",
  "cobrancas.boletos-info"
];

private static readonly EXTRATO_SCOPES = ["extrato-info"];
```

#### Método de Introspection:

```typescript
async getAvailableScopes(): Promise<string[]> {
  // 1. Get OAuth token
  const token = await this.getAccessToken(BancoBrasilAdapter.EXTRATO_SCOPES);

  // 2. Call introspection endpoint
  const introspectionUrl = "https://oauth.bb.com.br/oauth/introspect";

  const response = await fetch(introspectionUrl, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      token: token,
      token_type_hint: "access_token"
    })
  });

  const introspectionData = await response.json();

  // 3. Extract and cache scopes
  if (introspectionData.active && introspectionData.scope) {
    const scopes = introspectionData.scope.split(" ");
    this.availableScopes = scopes; // Cache for future requests
    return scopes;
  }

  // Fallback: return minimal scopes
  return BancoBrasilAdapter.EXTRATO_SCOPES;
}
```

#### Métodos de verificação:

```typescript
async canCreateCharges(): Promise<boolean> {
  const scopes = await this.getAvailableScopes();
  return BancoBrasilAdapter.CHARGE_SCOPES.every(s => scopes.includes(s));
}

async canGetStatements(): Promise<boolean> {
  const scopes = await this.getAvailableScopes();
  return BancoBrasilAdapter.EXTRATO_SCOPES.every(s => scopes.includes(s));
}
```

### 4. Filtragem de Tools no Server MCP

```typescript
public async discoverAvailableTools() {
  const allTools = [
    { name: "get_providers_metadata", ... },
    { name: "get_account_statement", ... },  // Requer EXTRATO_SCOPES
    { name: "create_charge", ... },          // Requer CHARGE_SCOPES
    { name: "retrieve_charge", ... },        // Requer CHARGE_SCOPES
    { name: "cancel_charge", ... },          // Requer CHARGE_SCOPES
    { name: "apply_instruction", ... }       // Requer CHARGE_SCOPES
  ];

  try {
    const providerId = this.getProviderFromContext() || 'banco_do_brasil';
    const adapter = getAdapter(providerId, credentials, config);

    if (adapter.canCreateCharges && adapter.canGetStatements) {
      const canCreateCharges = await adapter.canCreateCharges();
      const canGetStatements = await adapter.canGetStatements();

      console.error(`[MCP] 🔍 Capability discovery for ${providerId}:`);
      console.error(`  - canCreateCharges: ${canCreateCharges}`);
      console.error(`  - canGetStatements: ${canGetStatements}`);

      // Filter based on capabilities
      return allTools.filter(tool => {
        if (tool.name === 'get_providers_metadata') return true;
        if (tool.name === 'get_account_statement') return canGetStatements;
        if (['create_charge', 'retrieve_charge', 'cancel_charge', 'apply_instruction'].includes(tool.name)) {
          return canCreateCharges;
        }
        return true;
      });
    }
  } catch (error) {
    console.error('[MCP] ⚠️  Capability discovery failed, returning all tools');
  }

  // Fallback: return all tools
  return allTools;
}
```

### 5. Transport Layer (HTTP)

O transport HTTP passa o provider do JWT para o server:

```typescript
app.post("/mcp", validateJwtToken, async (req: any, res: any) => {
  const message = req.body;

  if (message.method === 'tools/list') {
    // Set provider context from JWT token
    if (this.mcpChargeServer && req.mcpAuth?.provider) {
      this.mcpChargeServer.setProviderContext(req.mcpAuth.provider);
    }

    // Call dynamic discovery
    const tools = await this.mcpChargeServer.discoverAvailableTools();

    res.status(200).json({
      jsonrpc: "2.0",
      id: message.id,
      result: { tools }
    });
  }
});
```

## Logs de Exemplo

### Cenário 1: Credenciais com apenas scope de extrato

```
[MCP] 📨 POST /mcp - Mensagem recebida
[BB] Available scopes: extrato-info
[MCP] 🔍 Capability discovery for banco_do_brasil:
  - canCreateCharges: false
  - canGetStatements: true
[MCP] ✅ Discovery retornou 2 tools para provider banco_do_brasil
[MCP] ✅ Respondendo tools/list com 2 tools
```

**Tools retornados:**
- `get_providers_metadata`
- `get_account_statement`

### Cenário 2: Credenciais com todos os scopes

```
[MCP] 📨 POST /mcp - Mensagem recebida
[BB] Available scopes: extrato-info, cobrancas.boletos-requisicao, cobrancas.boletos-info
[MCP] 🔍 Capability discovery for banco_do_brasil:
  - canCreateCharges: true
  - canGetStatements: true
[MCP] ✅ Discovery retornou 6 tools para provider banco_do_brasil
[MCP] ✅ Respondendo tools/list com 6 tools
```

**Tools retornados:**
- `get_providers_metadata`
- `get_account_statement`
- `create_charge`
- `retrieve_charge`
- `cancel_charge`
- `apply_instruction`

## Como Implementar para Outros Bancos

### Passo 1: Definir os scopes do banco

```typescript
// src/adapters/cora.ts
export class CoraAdapter implements PaymentProviderAdapter {
  private static readonly CHARGE_SCOPES = [
    "invoices:read",
    "invoices:write"
  ];

  private static readonly EXTRATO_SCOPES = [
    "accounts:read",
    "transactions:read"
  ];

  private availableScopes?: string[];
}
```

### Passo 2: Implementar OAuth2 Introspection

Consulte a documentação do banco para encontrar:
- Endpoint de introspection (geralmente `/oauth/introspect` ou `/oauth2/introspect`)
- Formato de requisição (POST com client_id/client_secret)
- Formato de resposta (campo `scope` com lista de scopes)

```typescript
async getAvailableScopes(): Promise<string[]> {
  if (this.availableScopes) {
    return this.availableScopes;
  }

  try {
    const token = await this.getAccessToken(CoraAdapter.EXTRATO_SCOPES);

    // Endpoint específico do Cora (exemplo)
    const introspectionUrl = "https://api.cora.com.br/oauth2/introspect";

    const credentials = Buffer.from(
      `${this.credentials.client_id}:${this.credentials.client_secret}`
    ).toString("base64");

    const response = await fetch(introspectionUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        token: token,
        token_type_hint: "access_token"
      })
    });

    const data = await response.json();

    if (data.active && data.scope) {
      const scopes = data.scope.split(" ");
      this.availableScopes = scopes;
      console.error(`[Cora] Available scopes: ${scopes.join(", ")}`);
      return scopes;
    }

    // Fallback
    this.availableScopes = CoraAdapter.EXTRATO_SCOPES;
    return this.availableScopes;
  } catch (error) {
    console.error("[Cora] Scope introspection failed:", error);
    this.availableScopes = CoraAdapter.EXTRATO_SCOPES;
    return this.availableScopes;
  }
}
```

### Passo 3: Implementar métodos de capability check

```typescript
async hasScope(scope: string): Promise<boolean> {
  const scopes = await this.getAvailableScopes();
  return scopes.includes(scope);
}

async canCreateCharges(): Promise<boolean> {
  const scopes = await this.getAvailableScopes();
  return CoraAdapter.CHARGE_SCOPES.every(s => scopes.includes(s));
}

async canGetStatements(): Promise<boolean> {
  const scopes = await this.getAvailableScopes();
  return CoraAdapter.EXTRATO_SCOPES.every(s => scopes.includes(s));
}
```

### Passo 4: Testar

```bash
# 1. Configure credenciais no backend-maax-agent
# 2. Reinicie o MCP server
npm run build && npm run dev

# 3. Teste a conexão no backend
# 4. Verifique os logs para ver quais scopes foram descobertos
# 5. Confirme que apenas as tools apropriadas foram retornadas
```

## Fallback e Tratamento de Erros

### Cenário 1: Introspection não disponível

Se o banco não suportar introspection ou o endpoint falhar:

```typescript
catch (error) {
  console.error("[Provider] Introspection failed, using fallback");
  // Assume apenas scopes mínimos (leitura)
  this.availableScopes = ProviderAdapter.EXTRATO_SCOPES;
  return this.availableScopes;
}
```

### Cenário 2: Adapter não implementa discovery

Se o adapter não implementar os métodos opcionais:

```typescript
if (adapter.canCreateCharges && adapter.canGetStatements) {
  // Use dynamic discovery
} else {
  // Fallback: return all tools
  console.error('[MCP] Provider does not support capability discovery');
  return allTools;
}
```

### Cenário 3: Provider desconhecido no contexto

```typescript
const providerId = this.getProviderFromContext() || 'banco_do_brasil';
```

O sistema usa um provider padrão (BB) se nenhum for especificado no JWT.

## Benefícios

1. **Segurança**: Previne tentativas de uso de APIs sem permissão
2. **Performance**: Evita chamadas desnecessárias a endpoints não autorizados
3. **UX**: Usuário vê apenas o que pode fazer
4. **Conformidade**: Respeita OAuth2 scopes
5. **Debugging**: Logs claros sobre capabilities disponíveis
6. **Manutenibilidade**: Lógica centralizada no adapter

## Referências

- **OAuth2 Token Introspection**: RFC 7662 (https://tools.ietf.org/html/rfc7662)
- **Banco do Brasil API**: https://developers.bb.com.br
- **Adapter Pattern**: `src/adapters/bancoBrasil.ts`
- **Server Discovery**: `src/mcp/server.ts` (método `discoverAvailableTools`)
- **Transport Integration**: `src/mcp/transports.ts` (POST /mcp handler)
