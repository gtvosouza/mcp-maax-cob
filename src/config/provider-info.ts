import type { ProviderId } from "./provider-credentials";

export interface ProviderOperationSupport {
  createCharge: boolean;
  retrieveCharge: boolean;
  cancelCharge: boolean;
  listCharges: boolean;
  applyInstruction: boolean;
  getStatement?: boolean;
  cancelMethods?: string[];
  notes?: string[];
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  description: string;
  paymentMethods: string[];
  authMethods: string[];
  operations: ProviderOperationSupport;
  requiredCredentials: Record<string, {
    type: string;
    description: string;
    required: boolean;
    default?: unknown;
    example?: unknown;
  }>;
  apiEndpoints?: Record<string, unknown>;
}

export const providerInfo: ProviderInfo[] = [
  {
    id: "cora",
    name: "Banco Cora",
    description: "API de cobranças do Banco Cora com suporte a PIX e boleto",
    paymentMethods: ["boleto", "pix"],
    authMethods: ["oauth2", "mtls"],
    operations: {
      createCharge: true,
      retrieveCharge: true,
      cancelCharge: false,
      listCharges: false,
      applyInstruction: false,
      getStatement: false,
      notes: ["Cancelamento indisponível via API pública"]
    },
    requiredCredentials: {
      client_id: {
        type: "string",
        description: "Client ID fornecido pelo Cora",
        required: true
      },
      client_secret: {
        type: "string",
        description: "Client Secret (obrigatório se não usar certificado)",
        required: false
      },
      account_id: {
        type: "string",
        description: "ID da conta Cora",
        required: true
      },
      cert: {
        type: "string",
        description: "Certificado PEM para mTLS (alternativa ao client_secret)",
        required: false
      },
      private_key: {
        type: "string",
        description: "Chave privada PEM para mTLS",
        required: false
      },
      sandbox: {
        type: "boolean",
        description: "Usar ambiente de testes",
        required: false,
        default: true
      }
    }
  },
  {
    id: "sicredi",
    name: "Sicredi",
    description: "Sistema de cobranças Sicredi para cooperativas",
    paymentMethods: ["boleto", "pix"],
    authMethods: ["api-key"],
    operations: {
      createCharge: true,
      retrieveCharge: true,
      cancelCharge: true,
      cancelMethods: ["boleto", "pix"],
      listCharges: false,
      applyInstruction: false,
      getStatement: false
    },
    requiredCredentials: {
      cooperativa: {
        type: "string",
        description: "Código da cooperativa (4 dígitos)",
        required: true,
        example: "0532"
      },
      posto: {
        type: "string",
        description: "Código do posto (2 dígitos)",
        required: true,
        example: "01"
      },
      codigo_beneficiario: {
        type: "string",
        description: "Código do beneficiário",
        required: true
      },
      api_key: {
        type: "string",
        description: "API Key fornecida pelo Sicredi",
        required: true
      },
      sandbox: {
        type: "boolean",
        description: "Usar ambiente de homologação",
        required: false,
        default: true
      }
    }
  },
  {
    id: "itau",
    name: "Itaú",
    description: "API Itaú Cobrança com certificado digital",
    paymentMethods: ["boleto", "pix"],
    authMethods: ["oauth2", "certificate"],
    operations: {
      createCharge: true,
      retrieveCharge: true,
      cancelCharge: true,
      cancelMethods: ["pix"],
      listCharges: false,
      applyInstruction: false,
      getStatement: false,
      notes: ["Cancelamento disponível apenas para cobranças PIX"]
    },
    requiredCredentials: {
      client_id: {
        type: "string",
        description: "Client ID cadastrado no Itaú",
        required: true
      },
      client_secret: {
        type: "string",
        description: "Client Secret do Itaú",
        required: true
      },
      certificate_path: {
        type: "string",
        description: "Caminho ou conteúdo base64 do certificado mTLS (.p12)",
        required: false
      },
      certificate_password: {
        type: "string",
        description: "Senha do certificado",
        required: false
      },
      key_id: {
        type: "string",
        description: "Identificador da chave/certificado",
        required: true
      },
      sandbox: {
        type: "boolean",
        description: "Usar ambiente de testes",
        required: false,
        default: true
      }
    }
  },
  {
    id: "banco_do_brasil",
    name: "Banco do Brasil",
    description: "APIs BB: Cobrança, Extrato e Pagamentos em Lote com mTLS",
    paymentMethods: ["boleto", "pix"],
    authMethods: ["oauth2", "mtls"],
    operations: {
      createCharge: true,
      retrieveCharge: true,
      cancelCharge: true,
      cancelMethods: ["boleto"],
      listCharges: false,
      applyInstruction: false,
      getStatement: true,
      notes: ["Cancelamento disponível apenas para boletos", "Extrato disponível via ferramenta dedicada"]
    },
    requiredCredentials: {
      client_id: {
        type: "string",
        description: "Application Key do BB",
        required: true
      },
      client_secret: {
        type: "string",
        description: "Application Secret do BB",
        required: true
      },
      developer_application_key: {
        type: "string",
        description: "Developer Application Key do BB",
        required: true
      },
      account_number: {
        type: "string",
        description: "Número da conta",
        required: true
      },
      account_type: {
        type: "string",
        description: "Tipo da conta (ex.: conta_corrente)",
        required: true
      },
      cert: {
        type: "string",
        description: "Certificado cliente emitido pelo BB (.crt em PEM) - obrigatório em produção",
        required: false
      },
      cert_key: {
        type: "string",
        description: "Chave privada do certificado BB (.key em PEM) - obrigatório em produção",
        required: false
      },
      sandbox: {
        type: "boolean",
        description: "Usar ambiente de homologação",
        required: false,
        default: true
      }
    },
    apiEndpoints: {
      sandbox: {
        auth: "https://oauth.sandbox.bb.com.br/oauth/token",
        extrato: "https://api.sandbox.bb.com.br/extrato/v1",
        pagamentos: "https://api.sandbox.bb.com.br/pagamentos/v1",
        cobranca: "https://api.sandbox.bb.com.br/cobrancas/v2"
      },
      production: {
        auth: "https://oauth.bb.com.br/oauth/token",
        extrato: "https://api.bb.com.br/extrato/v1",
        pagamentos: "https://api.bb.com.br/pagamentos/v1",
        cobranca: "https://api.bb.com.br/cobrancas/v2"
      }
    }
  }
];

export function getProviderInfoById(id: ProviderId): ProviderInfo | undefined {
  return providerInfo.find((info) => info.id === id);
}
