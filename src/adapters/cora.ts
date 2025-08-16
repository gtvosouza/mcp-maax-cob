import { PaymentProviderAdapter, ChargeStatus } from "../core/types";
import { decryptJson } from "../infra/crypto";
import * as https from "https";

interface CoraCredentials {
  client_id: string;
  client_secret?: string;
  account_id?: string;
  cert?: string;
  privateKey?: string;
  sandbox?: boolean;
}

interface CoraConfig {
  webhook_url?: string;
}

interface CoraTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface CoraChargeRequest {
  account_id: string;
  amount: number;
  due_date: string;
  customer: {
    name: string;
    document: string;
    address?: {
      zip_code?: string;
      street?: string;
      number?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
    };
  };
  payment_methods: string[];
  description?: string;
  reference_id?: string;
}

interface CoraChargeResponse {
  id: string;
  status: string;
  amount: number;
  due_date: string;
  created_at: string;
  payment_methods: string[];
  boleto?: {
    digitable_line: string;
    barcode: string;
    pdf_url: string;
  };
  pix?: {
    qr_code: string;
    qr_code_text: string;
    expires_at: string;
  };
}

export class CoraAdapter implements PaymentProviderAdapter {
  private credentials: CoraCredentials;
  private config: CoraConfig;
  private baseUrl: string;
  private tokenCache: { token: string; expires: number } | null = null;

  constructor(credentialsEncrypted: string, configEncrypted: string) {
    this.credentials = decryptJson<CoraCredentials>(credentialsEncrypted);
    this.config = decryptJson<CoraConfig>(configEncrypted);
    this.baseUrl = this.credentials.sandbox 
      ? "https://sandbox.cora.com.br/v1" 
      : "https://api.cora.com.br/v1";
  }

  private getHttpsAgent() {
    if (this.credentials.cert && this.credentials.privateKey) {
      return new https.Agent({
        cert: this.credentials.cert,
        key: this.credentials.privateKey,
        rejectUnauthorized: !this.credentials.sandbox
      });
    }
    return undefined;
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.tokenCache && Date.now() < this.tokenCache.expires) {
      return this.tokenCache.token;
    }

    // If using certificate auth (mTLS), no need for OAuth token
    if (this.credentials.cert && this.credentials.privateKey) {
      // Return client_id as token for mTLS authentication
      return this.credentials.client_id;
    }

    // OAuth flow for non-certificate auth
    if (!this.credentials.client_secret) {
      throw new Error("Either certificate or client_secret is required for authentication");
    }

    const response = await fetch(`${this.baseUrl}/auth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.credentials.client_id,
        client_secret: this.credentials.client_secret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Cora auth failed: ${response.status} ${response.statusText}`);
    }

    const tokenData: CoraTokenResponse = await response.json();
    
    // Cache token with 1 hour buffer before expiration
    this.tokenCache = {
      token: tokenData.access_token,
      expires: Date.now() + (tokenData.expires_in - 3600) * 1000,
    };

    return tokenData.access_token;
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

    const chargeRequest: CoraChargeRequest = {
      account_id: this.credentials.account_id || "",
      amount: input.amount,
      due_date: input.due_date,
      customer: {
        name: input.customer.name,
        document: input.customer.document,
        address: input.customer.address ? {
          zip_code: input.customer.address.zip_code,
          street: input.customer.address.street,
          number: input.customer.address.number,
          neighborhood: input.customer.address.neighborhood,
          city: input.customer.address.city,
          state: input.customer.address.state,
        } : undefined,
      },
      payment_methods: input.payment_methods,
      description: `Cobrança ${input.reference_id || input.tenantId}`,
      reference_id: input.reference_id,
    };

    const response = await fetch(`${this.baseUrl}/charges`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chargeRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cora charge creation failed: ${response.status} ${errorText}`);
    }

    const chargeResponse: CoraChargeResponse = await response.json();

    // Build response data
    const data: Record<string, any> = {
      cora_charge_id: chargeResponse.id,
      status: chargeResponse.status,
      created_at: chargeResponse.created_at,
    };

    if (chargeResponse.boleto) {
      data.digitable_line = chargeResponse.boleto.digitable_line;
      data.barcode = chargeResponse.boleto.barcode;
      data.boleto_pdf_url = chargeResponse.boleto.pdf_url;
    }

    if (chargeResponse.pix) {
      data.qr_code_text = chargeResponse.pix.qr_code_text;
      data.qr_code = chargeResponse.pix.qr_code;
      data.pix_expires_at = chargeResponse.pix.expires_at;
    }

    return {
      provider_charge_id: chargeResponse.id,
      data,
    };
  }

  async retrieveCharge(provider_charge_id: string): Promise<{
    status: ChargeStatus;
    data: Record<string, any>;
  }> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.baseUrl}/charges/${provider_charge_id}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Cora charge retrieval failed: ${response.status} ${response.statusText}`);
    }

    const chargeResponse: CoraChargeResponse = await response.json();

    // Map Cora status to our standard status
    let status: ChargeStatus;
    switch (chargeResponse.status.toLowerCase()) {
      case "pending":
      case "waiting_payment":
        status = "PENDING";
        break;
      case "paid":
      case "confirmed":
        status = "PAID";
        break;
      case "canceled":
      case "cancelled":
      case "expired":
        status = "CANCELLED";
        break;
      default:
        status = "PENDING";
    }

    const data: Record<string, any> = {
      cora_charge_id: chargeResponse.id,
      cora_status: chargeResponse.status,
      amount: chargeResponse.amount,
      due_date: chargeResponse.due_date,
      created_at: chargeResponse.created_at,
    };

    if (chargeResponse.boleto) {
      data.digitable_line = chargeResponse.boleto.digitable_line;
      data.barcode = chargeResponse.boleto.barcode;
      data.boleto_pdf_url = chargeResponse.boleto.pdf_url;
    }

    if (chargeResponse.pix) {
      data.qr_code_text = chargeResponse.pix.qr_code_text;
      data.qr_code = chargeResponse.pix.qr_code;
      data.pix_expires_at = chargeResponse.pix.expires_at;
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
    // Based on our testing, Cora doesn't support cancellation via API
    // Return appropriate error message
    return {
      success: false,
      error: "Cora API does not support charge cancellation. Please contact Cora support to cancel invoices manually."
    };
  }
}

