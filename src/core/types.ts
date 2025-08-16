export type ChargeStatus = "PENDING" | "PAID" | "CANCELLED";

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
}
