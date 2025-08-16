import { PaymentProviderAdapter } from "../core/types";

// Simple mock adapter returning predictable values.
export const mockAdapter: PaymentProviderAdapter = {
  async createCharge({ amount }) {
    const id = "mock-" + Math.floor(Math.random() * 1e9);
    return {
      provider_charge_id: id,
      data: {
        digitable_line: "34191.79001 01043.510047 91020.150008 5 123400000" + String(amount).padStart(2, "0"),
        qr_code_text: "00020101021226...mockpix...",
      },
    };
  },
  async retrieveCharge(provider_charge_id: string) {
    // Always return pending in MVP
    return {
      status: "PENDING",
      data: { provider_charge_id },
    };
  },
  async cancelCharge({ chargeId, providerChargeId }) {
    // Mock always succeeds
    return {
      success: true,
      data: {
        cancelled_at: new Date().toISOString(),
        provider_charge_id: providerChargeId,
        status: "CANCELLED"
      }
    };
  },
};
