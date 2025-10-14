import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  deleteCachedSession,
  deriveSessionId,
  getCachedSession,
  getDefaultTtlSeconds,
  setCachedSession,
  type SessionCacheEntry
} from "../cache/session-store";
import { verifyInitializeToken, TokenVerificationError } from "../security/token";
import { extractBearerToken } from "../utils/auth";
import { encryptJson } from "../infra/crypto";
import { extractProviderConfig } from "../utils/provider-config";

const querySchema = z
  .object({
    forceRefresh: z.coerce.boolean().optional()
  })
  .partial();

export default async function registerInitializeRoute(app: FastifyInstance) {
  app.post("/initialize", async (request, reply) => {
    const token = extractBearerToken(request.headers.authorization as string | undefined);

    if (!token) {
      return reply.status(401).send({ message: "Missing initialize token" });
    }

    const query = querySchema.safeParse(request.query ?? {});
    if (!query.success) {
      return reply.status(400).send({
        message: "Invalid query parameters",
        issues: query.error.issues
      });
    }

    let payload;
    try {
      payload = verifyInitializeToken(token, app.appContext.env.mcpTokenSecret);
    } catch (error) {
      if (error instanceof TokenVerificationError) {
        return reply.status(401).send({ message: error.message, details: error.cause ?? null });
      }

      request.log.error({ err: error }, "Failed to verify initialize token");
      return reply.status(500).send({ message: "Unable to verify initialize token" });
    }

    const shouldUseCache = payload.meta?.cacheEnabled !== false;
    const forceRefresh = query.data.forceRefresh === true;
    const ttlSeconds = payload.meta?.ttlSeconds ?? getDefaultTtlSeconds();
    const redisPrefix = payload.meta?.redisKeyPrefix;

    const sessionId = deriveSessionId(payload.providerId, payload.credentials, payload.tenantId);

    if (shouldUseCache && forceRefresh) {
      await deleteCachedSession(app.appContext.redis, sessionId, redisPrefix);
    }

    let cacheEntry: SessionCacheEntry | null = null;
    let cacheHit = false;

    if (shouldUseCache && !forceRefresh) {
      cacheEntry = await getCachedSession(app.appContext.redis, sessionId, redisPrefix);
      cacheHit = cacheEntry !== null;
    }

    if (!cacheEntry) {
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + ttlSeconds * 1000);
      const providerConfig = extractProviderConfig(payload.context ?? null);

      cacheEntry = {
        sessionId,
        providerId: payload.providerId,
        tenantId: payload.tenantId,
        credentialsEncrypted: encryptJson(payload.credentials),
        providerConfigEncrypted: providerConfig ? encryptJson(providerConfig) : undefined,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        context: payload.context
      };

      if (shouldUseCache) {
        await setCachedSession(app.appContext.redis, sessionId, cacheEntry, ttlSeconds, redisPrefix);
      }
    }

    const expiresInSeconds = Math.max(
      0,
      Math.floor((new Date(cacheEntry.expiresAt).getTime() - Date.now()) / 1000)
    );

    return reply.send({
      providerId: payload.providerId,
      tenantId: payload.tenantId ?? null,
      sessionId: cacheEntry.sessionId,
      cache: {
        enabled: shouldUseCache,
        hit: cacheHit,
        forceRefresh,
        ttlSeconds: expiresInSeconds
      },
      expiresAt: cacheEntry.expiresAt,
      context: payload.context ?? null
    });
  });
}
