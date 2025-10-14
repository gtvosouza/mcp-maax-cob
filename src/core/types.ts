export type ChargeStatus = "PENDING" | "PAID" | "CANCELLED";

export interface AccountStatementRequest {
  providerId: string;
  agency: string;
  account: string;
  query?: {
    page?: number;
    pageSize?: number;
    startDate?: string;
    endDate?: string;
    appKey?: string;
  };
}

export interface AccountStatementResponse {
  raw: unknown;
  data: Record<string, unknown>;
}

export interface PaymentProviderAdapter {
  createCharge(input: {
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
  }): Promise<{ provider_charge_id: string; data: Record<string, any> }>;

  retrieveCharge(provider_charge_id: string): Promise<{
    status: ChargeStatus;
    data: Record<string, any>;
  }>;

  cancelCharge(input: {
    tenantId: string;
    providerId: string;
    chargeId: string;
    providerChargeId?: string;
  }): Promise<{
    success: boolean;
    error?: string;
    data?: Record<string, any>;
  }>;

  getAccountStatement?(
    input: AccountStatementRequest
  ): Promise<AccountStatementResponse>;

  // Capability discovery methods (optional - for providers that support dynamic capabilities)
  getAvailableScopes?(): Promise<string[]>;
  hasScope?(scope: string): Promise<boolean>;
  canCreateCharges?(): Promise<boolean>;
  canGetStatements?(): Promise<boolean>;
}
