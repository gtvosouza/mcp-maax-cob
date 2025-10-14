import { PaymentProviderAdapter, ChargeStatus, AccountStatementRequest, AccountStatementResponse } from "../core/types";
import { decryptJson } from "../infra/crypto";
import https from "https";
import fs from "fs";
import path from "path";

interface BancoBrasilCredentials {
  client_id: string;
  client_secret: string;
  developer_application_key: string;
  account_number: string;
  account_type: string; // "conta_corrente" | "conta_poupanca"
  sandbox?: boolean;
  // mTLS certificates (optional - uses default certs if not provided)
  cert_path?: string;
  key_path?: string;
  ca_path?: string;
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
  private tokenCache = new Map<string, { token: string; expires: number }>();
  private httpsAgent?: https.Agent;

  private static readonly CHARGE_SCOPES = [
    "cobrancas.boletos-requisicao",
    "cobrancas.boletos-info"
  ];

  private static readonly EXTRATO_SCOPES = ["extrato-info"];

  // Cached available scopes (queried once per instance)
  private availableScopes?: string[];

  constructor(credentialsEncrypted: string, configEncrypted: string) {
    this.credentials = decryptJson<BancoBrasilCredentials>(credentialsEncrypted);
    this.config = decryptJson<BancoBrasilConfig>(configEncrypted);
    this.baseUrl = this.credentials.sandbox
      ? "https://api.hm.bb.com.br"
      : "https://api.bb.com.br";

    // Initialize mTLS agent if certificates are configured
    this.initializeMTLS();
  }

  private initializeMTLS() {
    try {
      // Default certificate paths (can be overridden in credentials)
      const certsDir = path.join(process.cwd(), 'certs');
      const certPath = this.credentials.cert_path || path.join(certsDir, 'certificate.crt');
      const keyPath = this.credentials.key_path || path.join(certsDir, 'private.key');
      const caPath = this.credentials.ca_path || path.join(certsDir, 'ca_bundle.crt');

      // Check if certificates exist
      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        const agentOptions: https.AgentOptions = {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath),
          rejectUnauthorized: false // Set to true in production with proper CA
        };

        // Add CA bundle if exists
        if (fs.existsSync(caPath)) {
          agentOptions.ca = fs.readFileSync(caPath);
        }

        this.httpsAgent = new https.Agent(agentOptions);
        console.error('[BB] mTLS initialized successfully');
      } else {
        console.error('[BB] mTLS certificates not found, API calls requiring mTLS will fail');
      }
    } catch (error) {
      console.error('[BB] Failed to initialize mTLS:', error);
    }
  }

  private getExtratoBaseUrl(): string {
    if (this.credentials.sandbox === false) {
      return "https://api-extratos.bb.com.br/extratos/v1";
    }

    return "https://api.sandbox.bb.com.br/extratos/v1";
  }

  /**
   * Helper method to make HTTPS requests with mTLS support
   */
  private async fetchWithMTLS(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.httpsAgent) {
      // Fall back to regular fetch if mTLS is not configured
      return fetch(url, options);
    }

    // Use custom HTTPS agent with mTLS
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const requestOptions: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: options.headers as any,
        agent: this.httpsAgent
      };

      const req = https.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const response = {
            ok: res.statusCode! >= 200 && res.statusCode! < 300,
            status: res.statusCode!,
            statusText: res.statusMessage!,
            headers: new Headers(res.headers as any),
            text: () => Promise.resolve(data),
            json: () => Promise.resolve(JSON.parse(data))
          } as Response;

          resolve(response);
        });
      });

      req.on('error', reject);

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  private async getAccessToken(scopes: string[] = BancoBrasilAdapter.CHARGE_SCOPES): Promise<string> {
    const scopeKey = scopes.slice().sort().join(" ");
    const cached = this.tokenCache.get(scopeKey);

    if (cached && Date.now() < cached.expires) {
      return cached.token;
    }

    const credentials = Buffer.from(`${this.credentials.client_id}:${this.credentials.client_secret}`).toString("base64");
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("scope", scopes.join(" "));

    // Use correct OAuth endpoint
    const oauthUrl = "https://oauth.bb.com.br/oauth/token";

    const response = await fetch(oauthUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`BB auth failed: ${response.status} ${response.statusText}`);
    }

    const tokenData: BBTokenResponse = await response.json();

    this.tokenCache.set(scopeKey, {
      token: tokenData.access_token,
      expires: Date.now() + (tokenData.expires_in - 300) * 1000,
    });

    return tokenData.access_token;
  }

  /**
   * Introspect OAuth token to discover available scopes
   * This allows us to return only the tools the user has permission to use
   */
  async getAvailableScopes(): Promise<string[]> {
    // Return cached scopes if already queried
    if (this.availableScopes) {
      return this.availableScopes;
    }

    try {
      // First, get a token with minimal scope to introspect
      const token = await this.getAccessToken(BancoBrasilAdapter.EXTRATO_SCOPES);

      // BB OAuth2 introspection endpoint
      const introspectionUrl = "https://oauth.bb.com.br/oauth/introspect";

      const credentials = Buffer.from(
        `${this.credentials.client_id}:${this.credentials.client_secret}`
      ).toString("base64");

      const params = new URLSearchParams();
      params.append("token", token);
      params.append("token_type_hint", "access_token");

      const response = await fetch(introspectionUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        console.error(`[BB] Token introspection failed: ${response.status}`);
        // Fallback: assume only extrato scope is available
        this.availableScopes = BancoBrasilAdapter.EXTRATO_SCOPES;
        return this.availableScopes;
      }

      const introspectionData = await response.json();

      // Extract scopes from introspection response
      if (introspectionData.active && introspectionData.scope) {
        const scopes = introspectionData.scope.split(" ");
        this.availableScopes = scopes;
        console.error(`[BB] Available scopes: ${scopes.join(", ")}`);
        return scopes;
      }

      // Fallback if introspection doesn't return scope info
      this.availableScopes = BancoBrasilAdapter.EXTRATO_SCOPES;
      return this.availableScopes;
    } catch (error) {
      console.error("[BB] Error during scope introspection:", error);
      // Fallback: assume only extrato scope
      this.availableScopes = BancoBrasilAdapter.EXTRATO_SCOPES;
      return this.availableScopes;
    }
  }

  /**
   * Check if a specific scope is available
   */
  async hasScope(scope: string): Promise<boolean> {
    const scopes = await this.getAvailableScopes();
    return scopes.includes(scope);
  }

  /**
   * Check if charge operations are available
   */
  async canCreateCharges(): Promise<boolean> {
    const scopes = await this.getAvailableScopes();
    return BancoBrasilAdapter.CHARGE_SCOPES.every(s => scopes.includes(s));
  }

  /**
   * Check if statement operations are available
   */
  async canGetStatements(): Promise<boolean> {
    const scopes = await this.getAvailableScopes();
    return BancoBrasilAdapter.EXTRATO_SCOPES.every(s => scopes.includes(s));
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
    const token = await this.getAccessToken(BancoBrasilAdapter.CHARGE_SCOPES);
    
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

  public async getAccountStatement(input: AccountStatementRequest): Promise<AccountStatementResponse> {
    const query = input.query ?? {};
    const queryRecord = query as Record<string, unknown>;
    const appKey =
      query.appKey ??
      (queryRecord["app_key"] as string | undefined) ??
      (queryRecord["gwDevAppKey"] as string | undefined) ??
      (queryRecord["gw-dev-app-key"] as string | undefined) ??
      this.credentials.developer_application_key;

    if (!appKey) {
      throw new Error("Banco do Brasil adapter requires an app key (developer_application_key) to fetch statements");
    }

    const token = await this.getAccessToken(BancoBrasilAdapter.EXTRATO_SCOPES);
    const baseUrl = this.getExtratoBaseUrl();
    const params = new URLSearchParams();
    params.append("gw-dev-app-key", appKey);

    const page = query.page ?? (queryRecord["numeroPaginaSolicitacao"] as number | undefined);
    if (page !== undefined) {
      params.append("numeroPaginaSolicitacao", String(page));
    }

    const pageSize = query.pageSize ?? (queryRecord["quantidadeRegistroPaginaSolicitacao"] as number | undefined);
    if (pageSize !== undefined) {
      params.append("quantidadeRegistroPaginaSolicitacao", String(pageSize));
    }

    const startDate = query.startDate ?? (queryRecord["dataInicioSolicitacao"] as string | undefined);
    if (startDate) {
      // BB expects DDMMAAAA format, omit leading zeros (ex: 19042023 not 19.04.2023)
      const str = String(startDate);
      if (str.length === 8) {
        const day = parseInt(str.substring(0, 2), 10);
        const month = parseInt(str.substring(2, 4), 10);
        const year = str.substring(4, 8);
        const formatted = `${day}${month}${year}`;
        params.append("dataInicioSolicitacao", formatted);
      } else {
        params.append("dataInicioSolicitacao", str);
      }
    }

    const endDate = query.endDate ?? (queryRecord["dataFimSolicitacao"] as string | undefined);
    if (endDate) {
      // BB expects DDMMAAAA format, omit leading zeros (ex: 19042023 not 19.04.2023)
      const str = String(endDate);
      if (str.length === 8) {
        const day = parseInt(str.substring(0, 2), 10);
        const month = parseInt(str.substring(2, 4), 10);
        const year = str.substring(4, 8);
        const formatted = `${day}${month}${year}`;
        params.append("dataFimSolicitacao", formatted);
      } else {
        params.append("dataFimSolicitacao", str);
      }
    }

    // Remove check digit from agency and account (BB API expects without digit)
    // Also remove leading zeros as per BB documentation
    const agencyWithoutDigit = String(parseInt(input.agency.split('-')[0], 10));
    const accountWithoutDigit = String(parseInt(input.account.split('-')[0], 10));

    const pathName = `/conta-corrente/agencia/${encodeURIComponent(agencyWithoutDigit)}/conta/${encodeURIComponent(accountWithoutDigit)}`;
    const querySuffix = params.toString();
    const url = `${baseUrl}${pathName}${querySuffix ? `?${querySuffix}` : ""}`;

    console.error(`[BB] 📍 Request URL: ${url}`);
    console.error(`[BB] 📍 Agency: ${input.agency} -> ${agencyWithoutDigit}, Account: ${input.account} -> ${accountWithoutDigit}`);
    console.error(`[BB] 📍 Query params: ${querySuffix}`);

    // Use mTLS for extratos API (production requires mTLS)
    const response = await this.fetchWithMTLS(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "gw-dev-app-key": appKey
      }
    });

    console.error(`[BB] 📥 Response Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[BB] ❌ Error Response: ${errorText}`);
      throw new Error(`BB statement retrieval failed: ${response.status} ${errorText}`);
    }

    const raw = await response.json();
    console.error(`[BB] ✅ Success! Data keys: ${Object.keys(raw).join(', ')}`);
    const entriesRaw = (raw as any)?.listaLancamento;
    const entries = Array.isArray(entriesRaw)
      ? entriesRaw
      : entriesRaw
        ? [entriesRaw]
        : [];

    const data: Record<string, unknown> = {
      page: (raw as any)?.numeroPaginaAtual ?? null,
      pageSize: (raw as any)?.quantidadeRegistroPaginaAtual ?? null,
      nextPage: (raw as any)?.numeroPaginaProximo ?? null,
      previousPage: (raw as any)?.numeroPaginaAnterior ?? null,
      totalPages: (raw as any)?.quantidadeTotalPagina ?? null,
      totalRecords: (raw as any)?.quantidadeTotalRegistro ?? null,
      entries
    };

    return {
      raw,
      data
    };
  }

  async retrieveCharge(provider_charge_id: string): Promise<{
    status: ChargeStatus;
    data: Record<string, any>;
  }> {
    const token = await this.getAccessToken(BancoBrasilAdapter.CHARGE_SCOPES);

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
      const token = await this.getAccessToken(BancoBrasilAdapter.CHARGE_SCOPES);

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