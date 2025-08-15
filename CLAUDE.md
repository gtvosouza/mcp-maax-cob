# Integração com Claude — MCP Client

Este guia mostra como **um agente (Claude)** pode consumir esta API MCP de forma segura e previsível.

> **TL;DR**: Exponha as operações do MCP como **ferramentas** para o modelo (CreateCharge, RetrieveCharge, ListCharges, ApplyInstruction).  
> Use **API Keys** nos headers e valide **webhooks** com HMAC.

---

## 1) Modelo mental
- O agente **não fala com bancos diretamente** — ele conversa com **este MCP**.
- A escolha do banco/fintech é feita via `provider_id`.
- O agente deve **sempre** enviar `reference_id` para idempotência.
- Respostas seguem um formato **padronizado** (ver `openapi.yaml`).

---

## 2) Definindo ferramentas (exemplo JSON)
> Ajuste `server_url` conforme seu deploy.

```jsonc
{
  "tools": [
    {
      "name": "mcp_create_charge",
      "description": "Cria uma cobrança/unificação boleto/pix via MCP",
      "input_schema": {
        "type": "object",
        "properties": {
          "provider_id": {"type":"string"},
          "amount": {"type":"integer","description":"centavos"},
          "due_date": {"type":"string","format":"date"},
          "reference_id": {"type":"string"},
          "payment_methods": {"type":"array","items":{"type":"string","enum":["boleto","pix"]}},
          "customer": {"type":"object"},
          "interest": {"type":"object"},
          "fine": {"type":"object"},
          "discounts": {"type":"array","items":{"type":"object"}}
        },
        "required": ["provider_id","amount","due_date","payment_methods","customer"]
      },
      "server_url": "http://localhost:3000/v1/charges",
      "method": "POST",
      "headers": {
        "X-Public-Api-Key": "pk_..."
      }
    },
    {
      "name": "mcp_retrieve_charge",
      "description": "Consulta uma cobrança por ID",
      "input_schema": {
        "type":"object",
        "properties":{"id":{"type":"string"}},
        "required":["id"]
      },
      "server_url": "http://localhost:3000/v1/charges/{id}",
      "method": "GET",
      "headers": { "X-Public-Api-Key": "pk_..." }
    },
    {
      "name": "mcp_list_charges",
      "description": "Lista cobranças com paginação por cursor",
      "input_schema": {
        "type":"object",
        "properties":{"limit":{"type":"integer"},"starting_after":{"type":"string"}}
      },
      "server_url": "http://localhost:3000/v1/charges",
      "method": "GET",
      "headers": { "X-Public-Api-Key": "pk_..." }
    },
    {
      "name": "mcp_apply_instruction",
      "description": "Aplica instruções (ex.: mudança de vencimento)",
      "input_schema": {
        "type":"object",
        "properties":{"id":{"type":"string"},"instruction_type":{"type":"string"},"parameters":{"type":"object"}},
        "required":["id","instruction_type"]
      },
      "server_url": "http://localhost:3000/v1/charges/{id}/instructions",
      "method": "POST",
      "headers": { "X-Public-Api-Key": "pk_..." }
    }
  ]
}
```

---

## 3) Prompt-base para o agente
> Objetivo: evitar erros de mapeamento e reforçar boas práticas.

```text
Você é um agente encarregado de criar e consultar cobranças via MCP.
- Sempre inclua `reference_id` ao criar uma cobrança (idempotência).
- Use `provider_id` informado pelo usuário ou um default conhecido.
- Para pessoas físicas (CPF = 11 dígitos) e jurídicas (CNPJ = 14), preencha `customer.document` corretamente.
- Se `payment_methods` incluir "pix", aguarde que a resposta possa conter `qr_code_text`.
- Retorne ao usuário um resumo claro: status, valor, vencimento e métodos de pagamento.
- Nunca exponha chaves de API.
- Em caso de erro, mostre `error_code` e recomende próxima ação.
```

---

## 4) Webhooks
- Configure `POST /v1/admin/webhooks` (Admin key) com a URL do seu serviço que o agente monitora.
- Valide `X-MCP-Signature` (HMAC SHA-256 com `WEBHOOK_HMAC_SECRET`).
- Recomende o padrão **“event sourcing”** para atualizar o estado mostrado ao usuário.

---

## 5) Boas práticas
- **Retentativas**: Em `PROVIDER_UNAVAILABLE`, retente com backoff.
- **Campos opcionais**: Se não souber `interest/fine/discounts`, envie vazio.
- **Privacidade**: Máscare documentos ao exibir (ex.: CPF `***.***.***-**`).

---

## 6) Teste rápido (cURL)
```bash
# 1) Tenant
curl -X POST http://localhost:3000/v1/tenants/init

# 2) Provider (mock)
curl -X POST http://localhost:3000/v1/admin/providers   -H "X-Admin-Api-Key: sk_admin_..."   -H "Content-Type: application/json"   -d '{"provider_type":"mock","friendly_name":"Conta Mock","credentials":{},"provider_specific_config":{}}'

# 3) Public API Key
curl -X POST http://localhost:3000/v1/admin/api-keys -H "X-Admin-Api-Key: sk_admin_..."

# 4) CreateCharge
curl -X POST http://localhost:3000/v1/charges   -H "X-Public-Api-Key: pk_..." -H "Content-Type: application/json"   -d '{"provider_id":"...","amount":9900,"due_date":"2025-09-10","payment_methods":["boleto","pix"],"customer":{"name":"Teste","document":"12345678901"}}'
```

---

## 7) Próximos passos
- Substituir o adapter `mock` por adapters reais (BB/Sicredi/Itaú/Cora).
- Adicionar SSE/WebSocket se precisar de status em tempo real no front.
