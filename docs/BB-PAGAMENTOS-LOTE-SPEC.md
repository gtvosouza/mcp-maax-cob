# API Pagamentos em Lote - Banco do Brasil
## Especificação Técnica Completa

---

## 📋 Visão Geral

A API de Pagamentos em Lote do Banco do Brasil permite a automatização de pagamentos e transferências em massa, incluindo:

- Transferências bancárias (TED, DOC, Crédito em Conta BB)
- Transferências via PIX
- Pagamentos de boletos
- Pagamentos de guias com código de barras
- Pagamentos de tributos (DARF, GPS, GRU)
- Depósito judicial

### Características Principais

- **Público-alvo**: Pessoas Jurídicas (comércio, indústria, serviços, entes governamentais)
- **Disponibilidade**: 24/7
- **Performance**: Respostas em milissegundos
- **Capacidade**: Até 320 lançamentos por requisição (varia por tipo)
- **Agendamento**: Até 180 dias
- **Processamento**: Assíncrono (11 a 40 minutos em dia útil)

---

## 🔐 Segurança e Autenticação

### OAuth 2.0 Client Credentials

**Endpoints OAuth:**
- Homologação: `https://oauth.hm.bb.com.br/oauth/token`
- Produção: `https://oauth.bb.com.br/oauth/token`

**Fluxo de autenticação:**
```http
POST /oauth/token
Authorization: Basic {base64(client_id:client_secret)}
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&scope={scopes}
```

### Scopes Disponíveis

| Scope | Descrição |
|-------|-----------|
| `pagamentos-lote.transferencias-requisicao` | Criar lotes de transferências |
| `pagamentos-lote.transferencias-pix-requisicao` | Criar lotes de PIX |
| `pagamentos-lote.transferencias-info` | Consultar lotes de transferências |
| `pagamentos-lote.lotes-requisicao` | Liberar lotes para processamento |
| `pagamentos-lote.cancelar-requisicao` | Cancelar lotes/lançamentos |
| `pagamentos-lote.pagamentos-info` | Consultar pagamentos específicos |

### mTLS (Autenticação Mútua de Certificados)

**Obrigatório apenas para PRODUÇÃO** nos endpoints de Pagamentos em Lote.

- Certificado A1 necessário em produção
- Homologação: **não requer mTLS**
- Handshake mútuo entre cliente e servidor
- mTLS ≠ liberação automática (são processos independentes)

**Arquivos necessários (produção):**
- `certs/certificate.crt` - Certificado cliente
- `certs/private.key` - Chave privada
- `certs/ca_bundle.crt` - Certificado CA (opcional)

**Estrutura de diretório:**
```
mcp-maax-cob/
├── certs/              # Certificados para produção (mTLS obrigatório)
│   ├── certificate.crt
│   ├── private.key
│   └── ca_bundle.crt
```

**Comportamento do adapter:**
- `sandbox: false` → Usa mTLS com certificados de `certs/`
- `sandbox: true` → **Sem mTLS** (homologação não requer)

---

## 🌐 Ambientes e URLs

### Homologação
- **OAuth**: `https://oauth.hm.bb.com.br`
- **API Base**: `https://homologa-api-ip.bb.com.br:7144/pagamentos-lote/v1`

### Produção
- **OAuth**: `https://oauth.bb.com.br`
- **API Base**: `https://api-ip.bb.com.br/pagamentos-lote/v1`

---

## 📦 Produtos e Modalidades

### PRD 126 - Pagamentos a Fornecedor
- Modalidade 1: Crédito em Conta BB
- Modalidade 3: TED/DOC
- Modalidade 45: Transferência Pix
- Modalidade 71: Depósito Judicial ou Depósito em Garantia

### PRD 127 - Pagamento de Salários
- Modalidade 1: Crédito em Conta Salário

### PRD 128 - Pagamentos Diversos
- Modalidade 1: Crédito em Conta BB
- Modalidade 3: TED/DOC
- Modalidade 5: Crédito em Poupança
- Modalidade 6: Pagamentos Boletos BB
- Modalidade 7: Pagamentos Boletos Outros Bancos
- Modalidade 13: Pagamentos Guias Com Código de Barras
- Modalidade 21: Pagamentos Guias Arrecadação
- Modalidade 45: Transferências Pix
- Modalidade 71: Depósito Judicial ou Depósito em Garantia

---

## 🔌 Endpoints da API

### 1. POST /lotes-transferencias
**Criar Lote de Transferências**

**Scope**: `pagamentos-lote.transferencias-requisicao`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Query Params:**
- `gw-dev-app-key` (required): Chave do desenvolvedor

**Limites:**
- Até **320 transferências** por requisição

**Request Body**: Ver schema `RequisicaoPOSTLotePagamentosTransferencia`

**Response**: 201 Created
```json
{
  "estadoRequisicao": 1,
  "numeroRequisicao": 123456
}
```

---

### 2. POST /lotes-transferencias-pix
**Criar Lote de Transferências PIX**

**Scope**: `pagamentos-lote.transferencias-pix-requisicao`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Query Params:**
- `gw-dev-app-key` (required): Chave do desenvolvedor

**Limites:**
- Até **320 transferências** por requisição

**Características:**
- Pode ser enviado e liberado em qualquer horário
- Sem validação de titularidade de chave PIX
- Irrevogável após processamento

**Request Body**: Ver schema `RequisicaoPOSTLotePagamentosTransferenciaPix`

**Response**: 201 Created
- Header `Location`: URI do recurso criado
```json
{
  "estadoRequisicao": 1,
  "numeroRequisicao": 123456
}
```

---

### 3. GET /lotes-transferencias
**Consultar Lotes de Transferências**

**Scope**: `pagamentos-lote.transferencias-info`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Query Params:**
- `gw-dev-app-key` (required): Chave do desenvolvedor
- `numeroContratoPagamento` (optional): Número do contrato
- `agenciaDebito` (optional): Agência de débito
- `contaCorrenteDebito` (optional): Conta de débito
- `digitoVerificadorContaCorrente` (required): DV da conta
- `dataInicio` (optional): Data inicial (DDMMAAAA)
- `dataFim` (optional): Data final (DDMMAAAA)
- `tipoPagamento` (optional): 126, 127 ou 128
- `estadoRequisicao` (optional): Estado da requisição (1-10)
- `indice` (optional): Índice de paginação

**Estados de Requisição:**
- `1`: Todos os lançamentos consistentes
- `2`: Ao menos um lançamento inconsistente
- `3`: Todos os lançamentos inconsistentes
- `4`: Pendente de liberação
- `5`: Em processamento
- `6`: Processada
- `7`: Rejeitada
- `8`: Preparando remessa não liberada
- `9`: Liberada via API
- `10`: Preparando remessa liberada

**Response**: 200 OK
```json
{
  "paymentList": [...],
  "nextIndex": 301
}
```

**Paginação**: Máximo 300 registros por página

---

### 4. POST /liberar-pagamentos
**Liberar Lotes de Pagamentos**

**Scope**: `pagamentos-lote.lotes-requisicao`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Query Params:**
- `gw-dev-app-key` (required): Chave do desenvolvedor

**Request Body**: Ver schema `RequisicaoLiberarPagamentos`

**Comportamento:**
- Se remessa não validada: cria "teimosinha" (verifica recorrentemente)
- Mesmo lote pode ser liberado múltiplas vezes
- Consulta saldo a cada 5 minutos (7h10 às 21h55 em dias úteis)
- Sábados: a cada 1h (7h10 às 19h10)

**Response**: 200 OK

---

### 5. POST /cancelar-pagamentos
**Cancelar Lotes de Pagamentos**

**Scope**: `pagamentos-lote.cancelar-requisicao`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Query Params:**
- `gw-dev-app-key` (required): Chave do desenvolvedor

**Request Body**: Ver schema `RequisicaoPOSTCancelaLotePagamentos`

**Importante**:
- Só é possível cancelar **antes da liberação** do lote
- Após liberação, não há garantia de cancelamento

**Response**: 200 OK

---

### 6. GET /darf-preto/{id}
**Consultar Pagamento DARF Preto**

**Scope**: `pagamentos-lote.pagamentos-info`

**Path Params:**
- `id` (required): Identificação do pagamento (1 a 999999)

**Query Params:**
- `gw-dev-app-key` (required): Chave do desenvolvedor
- `agencia` (optional): Agência de débito
- `contaCorrente` (optional): Conta de débito
- `digitoVerificador` (optional): DV da conta

**Response**: 200 OK

---

### 7. GET /guias-codigo-barras/{id}
**Consultar Pagamento de Guia com Código de Barras**

**Scope**: `pagamentos-lote.pagamentos-info`

**Path Params:**
- `id` (required): Identificação do pagamento (1 a 999999)

**Query Params:**
- `gw-dev-app-key` (required): Chave do desenvolvedor
- `agencia` (optional): Agência de débito
- `contaCorrente` (optional): Conta de débito
- `digitoVerificador` (optional): DV da conta

**Response**: 200 OK

---

## ⏰ Horários e Prazos

### Horários de Liberação
- **Até 16h40**: Pagamentos no mesmo dia (TED, boletos ≥ R$ 250k, salário com float zero)
- **Até 21h30**: Demais lançamentos e salários
- **Após 21h30**: Sistema não permite liberação

### Horários de Processamento
- **Dias úteis**: Consulta saldo a cada 5 minutos (7h10 às 21h55)
- **Sábados**: Consulta a cada 1h (7h10 às 19h10)

### Prazos
- **Agendamento**: Até 180 dias
- **Processamento**: 11 a 40 minutos (dia útil)
- **Autenticação disponível**: ~5 minutos após efetivação
- **Comprovante intradia**: A cada 30 minutos (se habilitado)

---

## 📊 Limites por Tipo de Operação

| Tipo de Operação | Limite por Requisição |
|------------------|----------------------|
| Transferências | 320 |
| Guias com Código de Barras | 200 |
| GRU | 200 |
| Boletos | 150 |
| DARF | 100 |
| GPS | 100 |

---

## ❌ Códigos de Erro

### Erros PIX (SED/Bacen) - 419 a 448

| Código | Descrição |
|--------|-----------|
| 419 | Timeout no SPI |
| 420 | Erro na instituição recebedora |
| 421 | Conta inexistente ou inválida |
| 422 | Conta bloqueada |
| 423 | Conta encerrada |
| 424 | Tipo incorreto de conta |
| 426 | Conta não autorizada |
| 428 | PIX não efetivado |
| 431 | CPF/CNPJ inconsistente |
| 432 | CPF/CNPJ incorreto |
| 435 | Pagamento rejeitado |
| 437 | Prazo de devolução ultrapassado |
| 446 | Pagamento não autorizado |

### Erros de Validação - 1 a 349

| Código | Descrição |
|--------|-----------|
| 1 | Agência de crédito igual a zero |
| 2 | Conta de crédito não numérica |
| 4 | CPF não numérico |
| 5 | CNPJ não numérico |
| 6 | Data de pagamento igual a zeros |
| 9 | Valor de pagamento igual a zeros |
| 18 | Dígito do CPF inválido |
| 19 | Dígito do CNPJ inválido |
| 33 | CPF não encontrado na Receita Federal |
| 34 | CNPJ não encontrado na Receita Federal |
| 53 | Data de pagamento deve ser ≥ hoje |
| 60 | Transação cancelada pelo cliente |
| 200 | Insuficiência de fundos |
| 201 | Cancelado pelo pagador |
| 235 | Agência/Conta impedida legalmente |
| 269 | Saldo insuficiente |
| 328 | Boleto bloqueado |
| 334 | Boleto já liquidado |
| 335 | PIX não efetivado |
| 344 | Chave não cadastrada no DICT |
| 345 | QR Code inválido/vencido |
| 347 | Chave de pagamento inválida |
| 999 | Consultar o Banco |

### Códigos de Devolução PIX - 1000 a 1120

| Código | Descrição |
|--------|-----------|
| 1000 | Outros |
| 1010 | PIX não aceito pelo recebedor |
| 1020 | PIX em duplicidade |
| 1030 | Suspeita de fraude |
| 1040 | Desistência do pagador |
| 1060 | Ordem não justificada |
| 1070 | Problemas técnicos |
| 1080 | Após investigação |
| 1090 | Recebedor não autorizado |
| 1110 | Devolução - Instituição recebedora |
| 1120 | Erro no saque PIX |

---

## 📝 HTTP Status Codes (RFC 9110)

| Range | Tipo |
|-------|------|
| 1xx | Respostas Informativas |
| 2xx | Respostas Bem-sucedidas |
| 3xx | Redirecionamento |
| 4xx | Erros do Cliente |
| 5xx | Erros do Servidor |

**Principais códigos:**
- `200` OK: Sucesso
- `201` Created: Recurso criado
- `400` Bad Request: Requisição inválida
- `401` Unauthorized: Não autenticado
- `403` Forbidden: Sem permissão
- `404` Not Found: Recurso não encontrado
- `409` Conflict: Conflito com estado atual
- `500` Internal Server Error: Erro interno
- `503` Service Unavailable: Serviço indisponível

---

## 🔍 Regras Específicas

### Transferências para Conta Poupança BB

A conta poupança deve iniciar com variação **51** e ter **9 dígitos + DV**.

**Formato**: `51` + `zeros (se necessário)` + `número da conta corrente`

**Conversão do DV:**

| DV Conta Corrente | DV Conta Poupança |
|-------------------|-------------------|
| 0 | 3 |
| 1 | 4 |
| 2 | 5 |
| 3 | 6 |
| 4 | 7 |
| 5 | 8 |
| 6 | 9 |
| 7 | X |
| 8 | 0 |
| 9 | 1 |
| X | 2 |

**Exemplos:**
- Conta corrente `3066-X` → Poupança `510003066-2`
- Conta corrente `5745-2` → Poupança `510005745-5`
- Conta corrente `10841-3` → Poupança `510010841-6`

### Depósito Judicial

- **Apenas para contas BB**
- Modalidade 71
- Não disponível para outros bancos

### Conta Salário

- **Apenas para contas BB**
- PRD 127
- Obrigatório informar CPF do beneficiário

### Pagamentos de Boletos

- **Obrigatório**: dados do beneficiário (tipo inscrição, número, nome completo)
- Limite: 150 boletos por requisição

### DARF/GPS com Múltiplos Códigos

- Opção 1: Lançamentos distintos na mesma requisição
- Opção 2: Requisições separadas para cada código

---

## 🎯 Informações Obrigatórias

### Para Pagamentos de Boletos
- Tipo de inscrição do beneficiário
- Número de inscrição do beneficiário
- Nome completo do beneficiário

### Para Pagamentos de Salários
- CPF do beneficiário

---

## 🔄 Fluxo de Processamento

### 1. Envio da Requisição
```
Cliente → API: POST /lotes-transferencias
API → Cliente: 201 Created (30s)
```

### 2. Validação
```
Sistema valida dados físicos
Sistema valida regras de negócio
Estado: 1, 2, 3, 8 ou 10
```

### 3. Liberação
```
Cliente → API: POST /liberar-pagamentos
OU aguarda liberação automática (se configurado)
Estado: 4 → 9
```

### 4. Processamento
```
Sistema verifica saldo (a cada 5min)
Sistema processa pagamentos (11-40min)
Estado: 5
```

### 5. Efetivação
```
Pagamentos são efetivados
Estado: 6 (Processada) ou 7 (Rejeitada)
```

### 6. Comprovante
```
~5min após efetivação
Autenticação disponível
Consultar via GET
```

---

## 📌 Observações Importantes

### Sobre mTLS
- mTLS ≠ liberação automática
- mTLS + OAuth são usados **simultaneamente**
- Processo de autenticação ocorre no handshake

### Sobre Liberação
- Mesmo lote pode ser liberado múltiplas vezes
- "Teimosinha" verifica recorrentemente se remessa está pronta
- Após liberação, cancelamento não é garantido

### Sobre Consultas
- Máximo 300 registros por página
- Use `indice` para paginação
- Campo `nextIndex` indica próxima página

### Sobre Comprovantes
- Disponíveis via API (não em formato visual)
- Requer parâmetro "retorno intradia" = "Sim"
- Configuração por produto/modalidade na agência
- Cliente cria interface visual

### Sobre Bloqueios
- Valor superior ao limite da faixa de liberação
- Data de pagamento ultrapassada
- Data de débito de float vencida

---

## 🏗️ Pré-requisitos

1. ✅ Possuir convênio de Pagamentos contratado e ativo
2. ✅ Possuir credencial de autenticação mútua (Certificado A1)
3. ✅ Possuir cadastro no Portal Developers
4. ✅ Configurar parâmetros na agência (tarifas, float, limites)

---

## 📚 Referências

- **RFC 6749**: OAuth 2.0 Authorization Framework
- **RFC 9110**: HTTP Semantics
- **Portal Developers**: https://developers.bb.com.br
- **Apoio**: https://apoio.developers.bb.com.br

---

## 📝 Schemas (Resumo)

### Request Schemas
- `RequisicaoPOSTLotePagamentosTransferencia`
- `RequisicaoPOSTLotePagamentosTransferenciaPix`
- `RequisicaoLiberarPagamentos`
- `RequisicaoPOSTCancelaLotePagamentos`

### Response Schemas
- `RespostaPOSTLotePagamentosTransferencia`
- `RespostaPOSTLotePagamentosTransferenciaPix`
- `RespostaGETLotePagamentosTransferencia`
- `RespostaLiberarPagamentos`
- `RespostaPOSTCancelaLotePagamentos`
- `RespostaGETPagamentoEspecificoDARFPreto`
- `RespostaGETPagamentoEspecificoGuiaCodigoBarra`

### Error Schemas
- `Erro`
- `ErroOAuthNaoAutorizado`

---

**Versão da API**: 1.42.20
**Última atualização**: 2025-10-14
