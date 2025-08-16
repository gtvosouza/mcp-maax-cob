import { PaymentProviderAdapter, ChargeStatus } from "../core/types";
import { decryptJson } from "../infra/crypto";

interface BancoBrasilCredentials {
  client_id: string;
  client_secret: string;
  developer_application_key: string;
  account_number: string;
  account_type: string; // "conta_corrente" | "conta_poupanca"
  sandbox?: boolean;
}

interface BancoBrasilConfig {
  webhook_url?: string;
  convenio?: string;
  carteira?: string;
}

interface BBTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface BBChargeRequest {
  numeroConvenio: string;
  numeroCarteira: string;
  numeroVariacaoCarteira: string;
  codigoModalidade: number;
  dataEmissao: string;
  dataVencimento: string;
  valorOriginal: number;
  valorAbatimento?: number;
  quantidadeDiasProtesto?: number;
  quantidadeDiasNegativacao?: number;
  orgaoNegativador?: number;
  indicadorAceiteTituloVencido: "S" | "N";
  numeroDiasLimiteRecebimento?: number;
  codigoAceite: "A" | "N";
  codigoTipoTitulo: number;
  descricaoTipoTitulo: string;
  indicadorPermissaoRecebimentoParcial: "S" | "N";
  numeroTituloBeneficiario: string;
  campoUtilizacaoBeneficiario?: string;
  numeroTituloCliente: string;
  mensagemBloquetoOcorrencia: string;
  desconto?: {
    tipo: number;
    dataExpiracao: string;
    porcentagem?: number;
    valor?: number;
  };
  segundoDesconto?: {
    dataExpiracao: string;
    porcentagem?: number;
    valor?: number;
  };
  terceiroDesconto?: {
    dataExpiracao: string;
    porcentagem?: number;
    valor?: number;
  };
  jurosMora?: {
    tipo: number;
    porcentagem?: number;
    valor?: number;
  };
  multa?: {
    tipo: number;
    data: string;
    porcentagem?: number;
    valor?: number;
  };
  pagador: {
    tipoInscricao: number; // 1=CPF, 2=CNPJ
    numeroInscricao: string;
    nome: string;
    endereco: string;
    cep: string;
    cidade: string;
    bairro: string;
    uf: string;
    telefone?: string;
  };
  beneficiarioFinal?: {
    tipoInscricao: number;
    numeroInscricao: string;
    nome: string;
  };
  indicadorPix: "S" | "N";
}

interface BBChargeResponse {
  numero: string;
  numeroCarteira: string;
  numeroVariacaoCarteira: string;
  codigoCliente: number;
  linhaDigitavel: string;
  codigoBarraNumerico: string;
  numeroContratoCobranca: number;
  beneficiario: any;
  qrCode?: {
    url: string;
    txid: string;
    emv: string;
  };
}


export class BancoBrasilAdapter implements PaymentProviderAdapter {
  private credentials: BancoBrasilCredentials;
  private config: BancoBrasilConfig;
  private baseUrl: string;
  private tokenCache: { token: string; expires: number } | null = null;

  constructor(credentialsEncrypted: string, configEncrypted: string) {
    this.credentials = decryptJson<BancoBrasilCredentials>(credentialsEncrypted);
    this.config = decryptJson<BancoBrasilConfig>(configEncrypted);
    this.baseUrl = this.credentials.sandbox 
      ? "https://api.hm.bb.com.br" 
      : "https://api.bb.com.br";
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.tokenCache && Date.now() < this.tokenCache.expires) {
      return this.tokenCache.token;
    }

    const credentials = Buffer.from(`${this.credentials.client_id}:${this.credentials.client_secret}`).toString('base64');

    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials&scope=cobrancas.boletos-requisicao cobrancas.boletos-info",
    });

    if (!response.ok) {
      throw new Error(`BB auth failed: ${response.status} ${response.statusText}`);
    }

    const tokenData: BBTokenResponse = await response.json();
    
    // Cache token with 5 minute buffer before expiration
    this.tokenCache = {
      token: tokenData.access_token,
      expires: Date.now() + (tokenData.expires_in - 300) * 1000,
    };

    return tokenData.access_token;
  }

  private formatDate(dateStr: string): string {
    // Convert YYYY-MM-DD to DD.MM.YYYY for BB API
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
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
      throw new Error("BB adapter requires at least boleto or pix payment method");
    }

    // Generate unique titulo numbers
    const numeroTitulo = Date.now().toString().slice(-10); // Last 10 digits of timestamp
    
    const chargeRequest: BBChargeRequest = {
      numeroConvenio: this.config.convenio || "0000000",
      numeroCarteira: this.config.carteira || "17",
      numeroVariacaoCarteira: "019",
      codigoModalidade: 1,
      dataEmissao: this.formatDate(new Date().toISOString().split('T')[0]),
      dataVencimento: this.formatDate(input.due_date),
      valorOriginal: input.amount / 100, // Convert cents to reais
      indicadorAceiteTituloVencido: "N",
      codigoAceite: "N",
      codigoTipoTitulo: 2,
      descricaoTipoTitulo: "DM",
      indicadorPermissaoRecebimentoParcial: "N",
      numeroTituloBeneficiario: numeroTitulo,
      numeroTituloCliente: input.reference_id || numeroTitulo,
      mensagemBloquetoOcorrencia: `Cobrança ${input.reference_id || input.tenantId}`,
      pagador: {
        tipoInscricao: input.customer.document.length === 11 ? 1 : 2, // CPF=1, CNPJ=2
        numeroInscricao: input.customer.document,
        nome: input.customer.name,
        endereco: input.customer.address?.street || "Não informado",
        cep: input.customer.address?.zip_code || "00000000",
        cidade: input.customer.address?.city || "Não informado",
        bairro: input.customer.address?.neighborhood || "Não informado",
        uf: input.customer.address?.state || "SP",
      },
      indicadorPix: isPix ? "S" : "N",
    };

    // Add interest configuration
    if (input.interest && input.interest.type !== "none") {
      chargeRequest.jurosMora = {
        tipo: input.interest.type === "percentage" ? 2 : 1,
        porcentagem: input.interest.type === "percentage" ? input.interest.value : undefined,
        valor: input.interest.type === "fixed" ? input.interest.value / 100 : undefined,
      };
    }

    // Add fine configuration
    if (input.fine && input.fine.type !== "none") {
      chargeRequest.multa = {
        tipo: input.fine.type === "percentage" ? 2 : 1,
        data: this.formatDate(input.due_date),
        porcentagem: input.fine.type === "percentage" ? input.fine.value : undefined,
        valor: input.fine.type === "fixed" ? input.fine.value / 100 : undefined,
      };
    }

    // Add discounts configuration (only first discount for simplicity)
    if (input.discounts && input.discounts.length > 0) {
      const discount = input.discounts[0];
      chargeRequest.desconto = {
        tipo: discount.type === "percentage" ? 2 : 1,
        dataExpiracao: this.formatDate(discount.date),
        porcentagem: discount.type === "percentage" ? discount.value : undefined,
        valor: discount.type === "fixed" ? discount.value / 100 : undefined,
      };
    }

    const response = await fetch(`${this.baseUrl}/cobrancas/v2/boletos`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Developer-Application-Key": this.credentials.developer_application_key,
      },
      body: JSON.stringify(chargeRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`BB charge creation failed: ${response.status} ${errorText}`);
    }

    const chargeResponse: BBChargeResponse = await response.json();

    // Build response data
    const data: Record<string, any> = {
      bb_numero: chargeResponse.numero,
      bb_numero_carteira: chargeResponse.numeroCarteira,
      bb_numero_contrato: chargeResponse.numeroContratoCobranca,
    };

    if (isBoleto) {
      data.digitable_line = chargeResponse.linhaDigitavel;
      data.barcode = chargeResponse.codigoBarraNumerico;
    }

    if (isPix && chargeResponse.qrCode) {
      data.qr_code_text = chargeResponse.qrCode.emv;
      data.qr_code_url = chargeResponse.qrCode.url;
      data.pix_txid = chargeResponse.qrCode.txid;
    }

    return {
      provider_charge_id: chargeResponse.numero,
      data,
    };
  }

  async retrieveCharge(provider_charge_id: string): Promise<{
    status: ChargeStatus;
    data: Record<string, any>;
  }> {
    const token = await this.getAccessToken();

    const response = await fetch(
      `${this.baseUrl}/cobrancas/v2/boletos/${provider_charge_id}?numeroConvenio=${this.config.convenio}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Developer-Application-Key": this.credentials.developer_application_key,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`BB charge retrieval failed: ${response.status} ${response.statusText}`);
    }

    const chargeResponse: any = await response.json();

    // Map BB status to our standard status
    let status: ChargeStatus;
    switch (chargeResponse.estadoTituloCobranca?.toLowerCase()) {
      case "normal":
      case "registro":
        status = "PENDING";
        break;
      case "liquidado":
      case "baixado_por_pagamento":
        status = "PAID";
        break;
      case "cancelado":
      case "baixado":
      case "protestado":
        status = "CANCELLED";
        break;
      default:
        status = "PENDING";
    }

    const data: Record<string, any> = {
      bb_numero: chargeResponse.numero,
      bb_estado_titulo: chargeResponse.estadoTituloCobranca,
      bb_numero_carteira: chargeResponse.numeroCarteira,
      valor_original: chargeResponse.valorOriginal * 100, // Convert back to cents
      data_vencimento: chargeResponse.dataVencimento,
    };

    if (chargeResponse.linhaDigitavel) {
      data.digitable_line = chargeResponse.linhaDigitavel;
    }

    if (chargeResponse.codigoBarraNumerico) {
      data.barcode = chargeResponse.codigoBarraNumerico;
    }

    if (chargeResponse.pagamento) {
      data.data_pagamento = chargeResponse.pagamento.data;
      data.valor_pago = chargeResponse.pagamento.valor * 100; // Convert back to cents
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
      const token = await this.getAccessToken();

      // BB uses PATCH to update boleto status to baixa (cancellation)
      const cancelRequest = {
        numeroConvenio: this.config.convenio || "0000000",
        indicadorAceiteTituloVencido: "N",
        tipoDesconto: 0,
        valorDesconto: 0,
        observacao: "Boleto cancelado via MCP"
      };

      const response = await fetch(`${this.baseUrl}/boletos/${providerChargeId}/baixar`, {
        method: "PATCH",
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
          error: `BB cancellation failed: ${response.status} - ${errorData}`
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `BB cancellation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

// Export the class, not an instance