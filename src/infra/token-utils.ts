import jwt from "jsonwebtoken";
import { env } from "../env";

interface TokenPayload {
  provider_id: string;
  credentials: Record<string, any>;
  iat: number;
  exp: number;
}

export function decodeAuthToken(authToken: string): TokenPayload {
  // Remove provider prefix (e.g., "cora_" from "cora_eyJ...")
  const parts = authToken.split('_');
  if (parts.length < 2) {
    throw new Error('Invalid token format - missing provider prefix');
  }

  const providerPrefix = parts[0];
  const token = parts.slice(1).join('_'); // Handle tokens that might contain underscores

  try {
    const decoded = jwt.verify(token, env.encryptionKeyHex) as TokenPayload;

    // Verify provider ID matches prefix
    if (decoded.provider_id !== providerPrefix) {
      throw new Error('Token provider mismatch');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Authentication token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid authentication token');
    }
    throw error;
  }
}

export function getProviderToken(providerId: string): string | null {
  const envKey = `${providerId.toUpperCase()}_AUTH_TOKEN`;
  return process.env[envKey] || null;
}

export function getProviderCredentials(providerId: string): Record<string, any> {
  const token = getProviderToken(providerId);
  if (!token) {
    throw new Error(`No authentication token found for provider '${providerId}'. Please set ${providerId.toUpperCase()}_AUTH_TOKEN environment variable.`);
  }

  const decoded = decodeAuthToken(token);
  return decoded.credentials;
}