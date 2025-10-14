import crypto from "node:crypto";
import type { Redis } from "ioredis";

const SESSION_KEY_PREFIX = "session";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

export interface SessionCacheEntry {
  sessionId: string;
  providerId: string;
  tenantId?: string;
  credentialsEncrypted: string;
  providerConfigEncrypted?: string;
  createdAt: string;
  expiresAt: string;
  context?: Record<string, unknown>;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => [key, sortValue(val)] as const);

    return Object.fromEntries(sortedEntries);
  }

  return value;
}

export function deriveSessionId(
  providerId: string,
  credentials: unknown,
  tenantId?: string
): string {
  const fingerprintPayload = {
    providerId,
    tenantId: tenantId ?? null,
    credentials: sortValue(credentials)
  };

  const serialized = JSON.stringify(fingerprintPayload);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

function buildRedisKey(sessionId: string, prefix?: string) {
  if (prefix) {
    return `${SESSION_KEY_PREFIX}:${prefix}:${sessionId}`;
  }

  return `${SESSION_KEY_PREFIX}:${sessionId}`;
}

export async function getCachedSession(
  client: Redis,
  sessionId: string,
  prefix?: string
): Promise<SessionCacheEntry | null> {
  const key = buildRedisKey(sessionId, prefix);
  const raw = await client.get(key);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionCacheEntry;
  } catch (error) {
    await client.del(key);
    return null;
  }
}

export async function setCachedSession(
  client: Redis,
  sessionId: string,
  entry: SessionCacheEntry,
  ttlSeconds: number,
  prefix?: string
): Promise<void> {
  const key = buildRedisKey(sessionId, prefix);
  await client.set(key, JSON.stringify(entry), "EX", ttlSeconds);
}

export async function deleteCachedSession(
  client: Redis,
  sessionId: string,
  prefix?: string
): Promise<void> {
  const key = buildRedisKey(sessionId, prefix);
  await client.del(key);
}

export function getDefaultTtlSeconds(): number {
  return DEFAULT_SESSION_TTL_SECONDS;
}
