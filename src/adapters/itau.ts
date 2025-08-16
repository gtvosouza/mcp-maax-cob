import { PaymentProviderAdapter, ChargeStatus } from "../core/types";
import { decryptJson } from "../infra/crypto";
import { readFileSync } from "fs";
import * as crypto from "crypto";

interface ItauCredentials {
  client_id: string;
  client_secret: string;
  certificate_path?: string; // Path to .p12 certificate file
  certificate_password?: string;
  key_id: string; // Certificate key ID
  sandbox?: boolean;
}

interface ItauConfig {
  webhook_url?: string;
  beneficiario_id?: string;
  conta_corrente?: string;
}

interface ItauTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface ItauBoletoRequest {
  beneficiario: {
    id_beneficiario: string;
    conta_corrente: string;
    digito_verificador_conta: string;
  };
  dado_boleto: {
    descricao_instrumento_cobranca: string;
    tipo_boleto: string; // "a_vista" | "escritural"
    codigo_carteira: string;
    valor_titulo: number;
    codigo_especie: string;
    data_emissao: string;
    data_vencimento: string;
    nosso_numero?: string;
    seu_numero?: string;
    codigo_barras?: string;
    aceite: "S" | "N";
    valor_abatimento?: number;
  };
  pagador: {
    nome: string;
    cpf_cnpj: string;
    endereco: {
      logradouro: string;
      bairro: string;
      cidade: string;
      uf: string;
      cep: string;
    };
  };
  dados_individuais_boleto?: Array<{
    nosso_numero: string;
    seu_numero: string;
    data_vencimento: string;
    valor_titulo: number;
  }>;
  multa?: {
    codigo_multa: string; // "03"=isento, "01"=valor, "02"=percentual
    data_multa?: string;
    valor_multa?: number;
    percentual_multa?: number;
  };
  juros?: {
    codigo_juros: string; // "03"=isento, "01"=valor, "02"=percentual
    data_juros?: string;
    valor_juros?: number;
    percentual_juros?: number;
  };
  desconto?: {
    codigo_desconto: string; // "00"=sem desconto, "01"=valor, "02"=percentual
    data_desconto?: string;
    valor_desconto?: number;
    percentual_desconto?: number;
  };
  recebimento_divergente?: {
    codigo_tipo_autorizacao: string;
    codigo_tipo_recebimento: string;
    valor_minimo?: number;
    valor_maximo?: number;
    percentual_minimo?: number;
    percentual_maximo?: number;
  };
}

interface ItauPixRequest {
  calendario: {
    dataDeVencimento: string;
    validadeAposVencimento?: number;
  };
  devedor: {
    cpf?: string;
    cnpj?: string;
    nome: string;
  };
  valor: {
    original: string;
    modalidadeAlteracao?: number;
  };
  chave: string;
  solicitacaoPagador?: string;
  infoAdicionais?: Array<{
    nome: string;
    valor: string;
  }>;
}

interface ItauBoletoResponse {
  codigo_erro?: string;
  descricao_erro?: string;
  data_hora_efetivacao: string;
  dado_boleto: {
    nosso_numero: string;
    seu_numero: string;
    codigo_barras: string;
    linha_digitavel: string;
    url_logotipo_banco: string;
    data_limite_pagamento?: string;
  };
  qr_code?: {
    url: string;
    emv: string;
    txid: string;
  };
}

interface ItauPixResponse {
  txid: string;
  status: string;
  valor: {
    original: string;
  };
  chave: string;
  pixCopiaECola: string;
  qrcode: {
    imagemQrcode: string;
    linkVisualizacao: string;
  };
  calendario: {
    dataDeVencimento: string;
    criacao: string;
  };
}

export class ItauAdapter implements PaymentProviderAdapter {
  private credentials: ItauCredentials;
  private config: ItauConfig;
  private baseUrl: string;
  private tokenCache: { token: string; expires: number } | null = null;

  constructor(credentialsEncrypted: string, configEncrypted: string) {
    this.credentials = decryptJson<ItauCredentials>(credentialsEncrypted);
    this.config = decryptJson<ItauConfig>(configEncrypted);
    this.baseUrl = this.credentials.sandbox 
      ? "https://sandbox.devportal.itau.com.br" 
      : "https://secure.api.itau.com.br";
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.tokenCache && Date.now() < this.tokenCache.expires) {
      return this.tokenCache.token;
    }

    // For production, we would need mTLS certificate authentication
    // For sandbox, simplified authentication might be used
    const response = await fetch(`${this.baseUrl}/oauth2/v1/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${this.credentials.client_id}:${this.credentials.client_secret}`).toString('base64')}`,
      },
      body: "grant_type=client_credentials&scope=readonly",
    });

    if (!response.ok) {
      throw new Error(`Itau auth failed: ${response.status} ${response.statusText}`);
    }

    const tokenData: ItauTokenResponse = await response.json();
    
    // Cache token with 5 minute buffer before expiration
    this.tokenCache = {
      token: tokenData.access_token,
      expires: Date.now() + (tokenData.expires_in - 300) * 1000,
    };

    return tokenData.access_token;
  }

  private formatDate(dateStr: string): string {
    // Convert YYYY-MM-DD to YYYY-MM-DD (Itau expects ISO format)
    return dateStr;
  }

  private generateNossoNumero(): string {
    // Generate a unique nosso numero for Itau (8 digits)
    return Math.floor(Math.random() * 99999999).toString().padStart(8, "0");
  }

  async createCharge(input: {
    tenantId: string;
    providerId: string;
    amount: number;
    due_date: string;
    reference_id?: string;
    payment_methods: string[];
    customer: any;
    interest?: any;
    fine?: any;
    discounts?: any[];
  }): Promise<{ provider_charge_id: string; data: Record<string, any> }> {
    const token = await this.getAccessToken();
    
    const isPix = input.payment_methods.includes("pix");
    const isBoleto = input.payment_methods.includes("boleto");
    
    if (!isBoleto && !isPix) {
      throw new Error("Itau adapter requires at least boleto or pix payment method");
    }

    let boletoResponse: ItauBoletoResponse | null = null;
    let pixResponse: ItauPixResponse | null = null;

    // Create boleto if requested
    if (isBoleto) {
      const nossoNumero = this.generateNossoNumero();
      
      const boletoRequest: ItauBoletoRequest = {
        beneficiario: {
          id_beneficiario: this.config.beneficiario_id || "000000",
          conta_corrente: this.config.conta_corrente || "00000",
          digito_verificador_conta: "0",
        },
        dado_boleto: {
          descricao_instrumento_cobranca: "boleto",
          tipo_boleto: "a_vista",
          codigo_carteira: "109",
          valor_titulo: input.amount / 100, // Convert cents to reais
          codigo_especie: "01", // Duplicata mercantil
          data_emissao: this.formatDate(new Date().toISOString().split('T')[0]),
          data_vencimento: this.formatDate(input.due_date),
          nosso_numero: nossoNumero,
          seu_numero: input.reference_id || nossoNumero,
          aceite: "N",
        },
        pagador: {
          nome: input.customer.name,
          cpf_cnpj: input.customer.document,
          endereco: {
            logradouro: input.customer.address?.street || "Não informado",
            bairro: input.customer.address?.neighborhood || "Não informado",
            cidade: input.customer.address?.city || "São Paulo",
            uf: input.customer.address?.state || "SP",
            cep: input.customer.address?.zip_code || "00000000",
          },
        },
      };

      // Add interest configuration
      if (input.interest && input.interest.type !== "none") {
        boletoRequest.juros = {
          codigo_juros: input.interest.type === "percentage" ? "02" : "01",
          data_juros: this.formatDate(input.due_date),
          percentual_juros: input.interest.type === "percentage" ? input.interest.value : undefined,
          valor_juros: input.interest.type === "fixed" ? input.interest.value / 100 : undefined,
        };
      }

      // Add fine configuration
      if (input.fine && input.fine.type !== "none") {
        boletoRequest.multa = {
          codigo_multa: input.fine.type === "percentage" ? "02" : "01",
          data_multa: this.formatDate(input.due_date),
          percentual_multa: input.fine.type === "percentage" ? input.fine.value : undefined,
          valor_multa: input.fine.type === "fixed" ? input.fine.value / 100 : undefined,
        };
      }

      // Add discounts configuration (only first discount)
      if (input.discounts && input.discounts.length > 0) {
        const discount = input.discounts[0];
        boletoRequest.desconto = {
          codigo_desconto: discount.type === "percentage" ? "02" : "01",
          data_desconto: this.formatDate(discount.date),
          percentual_desconto: discount.type === "percentage" ? discount.value : undefined,
          valor_desconto: discount.type === "fixed" ? discount.value / 100 : undefined,
        };
      }

      const boletoRes = await fetch(`${this.baseUrl}/cash_management/v2/boletos`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Itau-Client-Id": this.credentials.client_id,
        },
        body: JSON.stringify(boletoRequest),
      });

      if (!boletoRes.ok) {
        const errorText = await boletoRes.text();
        throw new Error(`Itau boleto creation failed: ${boletoRes.status} ${errorText}`);
      }

      boletoResponse = await boletoRes.json();
    }

    // Create PIX if requested
    if (isPix) {
      const pixRequest: ItauPixRequest = {
        calendario: {
          dataDeVencimento: input.due_date,
          validadeAposVencimento: 30, // 30 days after due date
        },
        devedor: {
          [input.customer.document.length === 11 ? "cpf" : "cnpj"]: input.customer.document,
          nome: input.customer.name,
        },
        valor: {
          original: (input.amount / 100).toFixed(2), // Convert cents to reais string
        },
        chave: "chave-pix-itau", // This would be the actual PIX key
        solicitacaoPagador: `Cobrança ${input.reference_id || input.tenantId}`,
      };

      const pixRes = await fetch(`${this.baseUrl}/pix_recebimentos/v2/cob`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Itau-Client-Id": this.credentials.client_id,
        },
        body: JSON.stringify(pixRequest),
      });

      if (!pixRes.ok) {
        const errorText = await pixRes.text();
        throw new Error(`Itau PIX creation failed: ${pixRes.status} ${errorText}`);
      }

      pixResponse = await pixRes.json();
    }

    // Build response data
    const data: Record<string, any> = {};
    let provider_charge_id = "";

    if (boletoResponse) {
      provider_charge_id = boletoResponse.dado_boleto.nosso_numero;
      data.itau_nosso_numero = boletoResponse.dado_boleto.nosso_numero;
      data.digitable_line = boletoResponse.dado_boleto.linha_digitavel;
      data.barcode = boletoResponse.dado_boleto.codigo_barras;
      data.url_logotipo = boletoResponse.dado_boleto.url_logotipo_banco;
      
      if (boletoResponse.qr_code) {
        data.qr_code_url = boletoResponse.qr_code.url;
        data.qr_code_text = boletoResponse.qr_code.emv;
        data.pix_txid = boletoResponse.qr_code.txid;
      }
    }

    if (pixResponse) {
      if (!provider_charge_id) provider_charge_id = pixResponse.txid;
      data.pix_txid = pixResponse.txid;
      data.qr_code_text = pixResponse.pixCopiaECola;
      data.qr_code_image = pixResponse.qrcode.imagemQrcode;
      data.qr_code_link = pixResponse.qrcode.linkVisualizacao;
      data.pix_status = pixResponse.status;
    }

    return {
      provider_charge_id,
      data,
    };
  }

  async retrieveCharge(provider_charge_id: string): Promise<{
    status: ChargeStatus;
    data: Record<string, any>;
  }> {
    const token = await this.getAccessToken();

    // Try to retrieve as boleto first
    try {
      const response = await fetch(
        `${this.baseUrl}/cash_management/v2/boletos/${provider_charge_id}`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Itau-Client-Id": this.credentials.client_id,
          },
        }
      );

      if (response.ok) {
        const chargeResponse: any = await response.json();

        // Map Itau status to our standard status
        let status: ChargeStatus;
        switch (chargeResponse.situacao_boleto?.toLowerCase()) {
          case "emitido":
          case "registrado":
            status = "PENDING";
            break;
          case "liquidado":
          case "pago":
            status = "PAID";
            break;
          case "cancelado":
          case "baixado":
          case "vencido":
            status = "CANCELLED";
            break;
          default:
            status = "PENDING";
        }

        const data: Record<string, any> = {
          itau_nosso_numero: chargeResponse.nosso_numero,
          itau_situacao: chargeResponse.situacao_boleto,
          valor_titulo: chargeResponse.valor_titulo * 100, // Convert back to cents
          data_vencimento: chargeResponse.data_vencimento,
        };

        if (chargeResponse.linha_digitavel) {
          data.digitable_line = chargeResponse.linha_digitavel;
        }

        if (chargeResponse.codigo_barras) {
          data.barcode = chargeResponse.codigo_barras;
        }

        if (chargeResponse.data_pagamento) {
          data.data_pagamento = chargeResponse.data_pagamento;
        }

        return { status, data };
      }
    } catch (error) {
      // If boleto lookup fails, try PIX
    }

    // Try to retrieve as PIX
    const pixResponse = await fetch(
      `${this.baseUrl}/pix_recebimentos/v2/cob/${provider_charge_id}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Itau-Client-Id": this.credentials.client_id,
        },
      }
    );

    if (!pixResponse.ok) {
      throw new Error(`Itau charge retrieval failed: ${pixResponse.status} ${pixResponse.statusText}`);
    }

    const pixChargeResponse: ItauPixResponse = await pixResponse.json();

    // Map PIX status to our standard status
    let status: ChargeStatus;
    switch (pixChargeResponse.status?.toLowerCase()) {
      case "ativa":
      case "pendente":
        status = "PENDING";
        break;
      case "concluida":
      case "paga":
        status = "PAID";
        break;
      case "removida_pelo_usuario_recebedor":
      case "removida_pelo_psp":
      case "expirada":
        status = "CANCELLED";
        break;
      default:
        status = "PENDING";
    }

    const data: Record<string, any> = {
      pix_txid: pixChargeResponse.txid,
      pix_status: pixChargeResponse.status,
      valor_original: parseFloat(pixChargeResponse.valor.original) * 100, // Convert back to cents
      qr_code_text: pixChargeResponse.pixCopiaECola,
      data_criacao: pixChargeResponse.calendario.criacao,
      data_vencimento: pixChargeResponse.calendario.dataDeVencimento,
    };

    return {
      status,
      data,
    };
  }

  async cancelCharge({ chargeId, providerChargeId }: {
    tenantId: string;
    providerId: string;
    chargeId: string;
    providerChargeId?: string;
  }): Promise<{
    success: boolean;
    error?: string;
    data?: Record<string, any>;
  }> {
    try {
      const token = await this.getAccessToken();

      // For PIX charges, Itaú uses PUT to update status to "REMOVIDA_PELO_USUARIO_RECEBEDOR"
      const cancelRequest = {
        status: "REMOVIDA_PELO_USUARIO_RECEBEDOR"
      };

      const response = await fetch(`${this.baseUrl}/pix/v2/cob/${providerChargeId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(cancelRequest),
      });

      if (response.ok) {
        return {
          success: true,
          data: {
            cancelled_at: new Date().toISOString(),
            provider_charge_id: providerChargeId,
            status: "CANCELLED"
          }
        };
      } else {
        const errorData = await response.text();
        return {
          success: false,
          error: `Itaú cancellation failed: ${response.status} - ${errorData}`
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Itaú cancellation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

// Export the class, not an instance