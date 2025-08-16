import { PaymentProviderAdapter, ChargeStatus } from "../core/types";
import { decryptJson } from "../infra/crypto";

interface SicrediCredentials {
  api_key: string;
  cooperativa: string;
  posto: string;
  codigo_beneficiario: string;
  sandbox?: boolean;
}

interface SicrediConfig {
  webhook_url?: string;
  carteira?: string;
}

interface SicrediChargeRequest {
  cooperativa: string;
  posto: string;
  codigoBeneficiario: string;
  nossoNumero?: string;
  seuNumero?: string;
  valor: number;
  dataVencimento: string;
  tipoCobranca: "HIBRIDA" | "BOLETO" | "PIX";
  pagador: {
    nome: string;
    cpfCnpj: string;
    endereco?: {
      logradouro?: string;
      bairro?: string;
      cidade?: string;
      uf?: string;
      cep?: string;
    };
  };
  mensagem?: string;
  juros?: {
    tipo?: "ISENTO" | "PERCENTUAL_DIA" | "VALOR_DIA";
    valor?: number;
  };
  multa?: {
    tipo?: "ISENTO" | "PERCENTUAL" | "VALOR";
    valor?: number;
  };
  desconto?: Array<{
    tipo: "PERCENTUAL" | "VALOR";
    valor: number;
    dataLimite: string;
  }>;
}

interface SicrediChargeResponse {
  linhaDigitavel: string;
  codigoBarras: string;
  nossoNumero: string;
  seuNumero: string;
  dataVencimento: string;
  valor: number;
  situacao: string;
  txid?: string;
  pixCopiaECola?: string;
  pixQrCode?: string;
  linkBoleto: string;
  linkComprovante?: string;
}

interface SicrediStatusResponse {
  nossoNumero: string;
  situacao: string;
  valor: number;
  dataVencimento: string;
  dataPagamento?: string;
  valorPago?: number;
  txid?: string;
  pixCopiaECola?: string;
}

export class SicrediAdapter implements PaymentProviderAdapter {
  private credentials: SicrediCredentials;
  private config: SicrediConfig;
  private baseUrl: string;

  constructor(credentialsEncrypted: string, configEncrypted: string) {
    this.credentials = decryptJson<SicrediCredentials>(credentialsEncrypted);
    this.config = decryptJson<SicrediConfig>(configEncrypted);
    this.baseUrl = this.credentials.sandbox 
      ? "https://api-parceiro-hm.sicredi.com.br" 
      : "https://api-parceiro.sicredi.com.br";
  }

  private generateNossoNumero(): string {
    // Generate a unique nosso numero (8 digits + DV)
    const numero = Math.floor(Math.random() * 99999999).toString().padStart(8, "0");
    return numero;
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
    
    // Determine charge type based on payment methods
    let tipoCobranca: "HIBRIDA" | "BOLETO" | "PIX";
    if (input.payment_methods.includes("boleto") && input.payment_methods.includes("pix")) {
      tipoCobranca = "HIBRIDA";
    } else if (input.payment_methods.includes("pix")) {
      tipoCobranca = "PIX";
    } else {
      tipoCobranca = "BOLETO";
    }

    const nossoNumero = this.generateNossoNumero();

    const chargeRequest: SicrediChargeRequest = {
      cooperativa: this.credentials.cooperativa,
      posto: this.credentials.posto,
      codigoBeneficiario: this.credentials.codigo_beneficiario,
      nossoNumero,
      seuNumero: input.reference_id,
      valor: input.amount / 100, // Convert cents to reais
      dataVencimento: input.due_date,
      tipoCobranca,
      pagador: {
        nome: input.customer.name,
        cpfCnpj: input.customer.document,
        endereco: input.customer.address ? {
          logradouro: input.customer.address.street,
          bairro: input.customer.address.neighborhood,
          cidade: input.customer.address.city,
          uf: input.customer.address.state,
          cep: input.customer.address.zip_code,
        } : undefined,
      },
      mensagem: `Cobrança ${input.reference_id || input.tenantId}`,
    };

    // Add interest configuration
    if (input.interest && input.interest.type !== "none") {
      chargeRequest.juros = {
        tipo: input.interest.type === "percentage" ? "PERCENTUAL_DIA" : "VALOR_DIA",
        valor: input.interest.value,
      };
    }

    // Add fine configuration
    if (input.fine && input.fine.type !== "none") {
      chargeRequest.multa = {
        tipo: input.fine.type === "percentage" ? "PERCENTUAL" : "VALOR",
        valor: input.fine.value,
      };
    }

    // Add discounts configuration
    if (input.discounts && input.discounts.length > 0) {
      chargeRequest.desconto = input.discounts.map(discount => ({
        tipo: discount.type === "percentage" ? "PERCENTUAL" : "VALOR",
        valor: discount.value,
        dataLimite: discount.date,
      }));
    }

    const response = await fetch(`${this.baseUrl}/v2/cobranca/boleto`, {
      method: "POST",
      headers: {
        "x-api-key": this.credentials.api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chargeRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sicredi charge creation failed: ${response.status} ${errorText}`);
    }

    const chargeResponse: SicrediChargeResponse = await response.json();

    // Build response data
    const data: Record<string, any> = {
      sicredi_nosso_numero: chargeResponse.nossoNumero,
      sicredi_situacao: chargeResponse.situacao,
      link_boleto: chargeResponse.linkBoleto,
    };

    if (chargeResponse.linhaDigitavel) {
      data.digitable_line = chargeResponse.linhaDigitavel;
    }

    if (chargeResponse.codigoBarras) {
      data.barcode = chargeResponse.codigoBarras;
    }

    if (chargeResponse.pixCopiaECola) {
      data.qr_code_text = chargeResponse.pixCopiaECola;
    }

    if (chargeResponse.pixQrCode) {
      data.qr_code = chargeResponse.pixQrCode;
    }

    if (chargeResponse.txid) {
      data.pix_txid = chargeResponse.txid;
    }

    return {
      provider_charge_id: chargeResponse.nossoNumero,
      data,
    };
  }

  async retrieveCharge(provider_charge_id: string): Promise<{
    status: ChargeStatus;
    data: Record<string, any>;
  }> {
    const response = await fetch(
      `${this.baseUrl}/v2/cobranca/boleto/consulta/${this.credentials.cooperativa}/${this.credentials.posto}/${this.credentials.codigo_beneficiario}/${provider_charge_id}`,
      {
        method: "GET",
        headers: {
          "x-api-key": this.credentials.api_key,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Sicredi charge retrieval failed: ${response.status} ${response.statusText}`);
    }

    const chargeResponse: SicrediStatusResponse = await response.json();

    // Map Sicredi status to our standard status
    let status: ChargeStatus;
    switch (chargeResponse.situacao?.toLowerCase()) {
      case "emitido":
      case "registro":
      case "aberto":
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
      sicredi_nosso_numero: chargeResponse.nossoNumero,
      sicredi_situacao: chargeResponse.situacao,
      valor: chargeResponse.valor * 100, // Convert back to cents
      data_vencimento: chargeResponse.dataVencimento,
    };

    if (chargeResponse.dataPagamento) {
      data.data_pagamento = chargeResponse.dataPagamento;
    }

    if (chargeResponse.valorPago) {
      data.valor_pago = chargeResponse.valorPago * 100; // Convert back to cents
    }

    if (chargeResponse.txid) {
      data.pix_txid = chargeResponse.txid;
    }

    if (chargeResponse.pixCopiaECola) {
      data.qr_code_text = chargeResponse.pixCopiaECola;
    }

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
      // Sicredi uses different endpoints for boleto and PIX cancellation
      // For boletos: PUT /cobranca/v2/boletos/{nossoNumero}/baixa
      // For PIX: PUT /pix/v2/cob/{txid} with status update

      const baseUrl = this.credentials.sandbox ? 
        "https://api-pix-h.sicredi.com.br" : 
        "https://api-pix.sicredi.com.br";

      // Try boleto cancellation first
      const boletoResponse = await fetch(`${baseUrl}/cobranca/v2/boletos/${providerChargeId}/baixa`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${this.credentials.api_key}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          tipoBaixa: "DEVOLVIDA", // Sicredi cancellation type
          descricaoMotivoCancelamento: "Cancelamento via MCP"
        }),
      });

      if (boletoResponse.ok) {
        return {
          success: true,
          data: {
            cancelled_at: new Date().toISOString(),
            provider_charge_id: providerChargeId,
            status: "CANCELLED",
            cancellation_type: "boleto"
          }
        };
      }

      // If boleto cancellation failed, try PIX cancellation
      const pixResponse = await fetch(`${baseUrl}/pix/v2/cob/${providerChargeId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${this.credentials.api_key}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          status: "REMOVIDA_PELO_USUARIO_RECEBEDOR"
        }),
      });

      if (pixResponse.ok) {
        return {
          success: true,
          data: {
            cancelled_at: new Date().toISOString(),
            provider_charge_id: providerChargeId,
            status: "CANCELLED",
            cancellation_type: "pix"
          }
        };
      }

      // Both attempts failed
      const boletoError = await boletoResponse.text();
      const pixError = await pixResponse.text();

      return {
        success: false,
        error: `Sicredi cancellation failed. Boleto: ${boletoResponse.status} - ${boletoError}. PIX: ${pixResponse.status} - ${pixError}`
      };

    } catch (error) {
      return {
        success: false,
        error: `Sicredi cancellation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

// Export the class, not an instance