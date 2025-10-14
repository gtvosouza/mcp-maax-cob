import { CoraAdapter } from "./cora";
import { SicrediAdapter } from "./sicredi";
import { BancoBrasilAdapter } from "./bancoBrasil";
import { ItauAdapter } from "./itau";
import { PaymentProviderAdapter } from "../core/types";
import { encryptJson } from "../infra/crypto";

/**
 * Creates an adapter with plain (decrypted) credentials
 * Used when credentials come from JWT (already decrypted)
 */
export function getAdapterWithPlainCredentials(
  provider_type: string,
  credentials: Record<string, any>,
  config: Record<string, any> = {}
): PaymentProviderAdapter {
  // Encrypt credentials before passing to adapter
  const credentialsEncrypted = encryptJson(credentials);
  const configEncrypted = encryptJson(config);

  return getAdapter(provider_type, credentialsEncrypted, configEncrypted);
}

export function getAdapter(provider_type: string, credentialsEncrypted?: string, configEncrypted?: string): PaymentProviderAdapter {
  switch (provider_type) {
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
