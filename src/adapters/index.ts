import { mockAdapter } from "./mock";
import { PaymentProviderAdapter } from "../core/types";

export function getAdapter(provider_type: string): PaymentProviderAdapter {
  switch (provider_type) {
    case "mock":
      return mockAdapter;
    // TODO: case "banco_do_brasil": return bbAdapter
    // TODO: case "sicredi": return sicrediAdapter
    // TODO: case "itau": return itauAdapter
    // TODO: case "cora": return coraAdapter
    default:
      return mockAdapter;
  }
}
