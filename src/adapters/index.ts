import { mockAdapter } from "./mock";
import { CoraAdapter } from "./cora";
import { SicrediAdapter } from "./sicredi";
import { BancoBrasilAdapter } from "./bancoBrasil";
import { ItauAdapter } from "./itau";
import { PaymentProviderAdapter } from "../core/types";

export function getAdapter(provider_type: string, credentialsEncrypted?: string, configEncrypted?: string): PaymentProviderAdapter {
  switch (provider_type) {
    case "mock":
      return mockAdapter;
    case "cora":
      if (!credentialsEncrypted || !configEncrypted) {
        throw new Error("Cora adapter requires encrypted credentials and config");
      }
      return new CoraAdapter(credentialsEncrypted, configEncrypted);
    case "sicredi":
      if (!credentialsEncrypted || !configEncrypted) {
        throw new Error("Sicredi adapter requires encrypted credentials and config");
      }
      return new SicrediAdapter(credentialsEncrypted, configEncrypted);
    case "banco_do_brasil":
      if (!credentialsEncrypted || !configEncrypted) {
        throw new Error("Banco do Brasil adapter requires encrypted credentials and config");
      }
      return new BancoBrasilAdapter(credentialsEncrypted, configEncrypted);
    case "itau":
      if (!credentialsEncrypted || !configEncrypted) {
        throw new Error("Itau adapter requires encrypted credentials and config");
      }
      return new ItauAdapter(credentialsEncrypted, configEncrypted);
    default:
      throw new Error(`Unknown provider type: ${provider_type}`);
  }
}
