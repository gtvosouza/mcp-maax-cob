import { redis } from "./redis";

/**
 * Simple idempotency helper using Redis SETNX.
 * Prevents duplicate charges with same reference_id per tenant.
 */

export async function ensureIdempotency(tenantId: string, referenceId: string): Promise<boolean> {
  if (!referenceId) return true; // No reference_id, allow operation
  
  const key = `idempotency:${tenantId}:${referenceId}`;
  const result = await redis.setnx(key, "1");
  
  if (result === 1) {
    // Key was set, set expiration (24 hours)
    await redis.expire(key, 24 * 60 * 60);
    return true;
  }
  
  // Key already exists, operation is duplicate
  return false;
}

export async function releaseIdempotency(tenantId: string, referenceId: string): Promise<void> {
  if (!referenceId) return;
  
  const key = `idempotency:${tenantId}:${referenceId}`;
  await redis.del(key);
}