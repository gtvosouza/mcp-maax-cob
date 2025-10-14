import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { verifyInitializeToken, TokenVerificationError, type TokenPayload } from "../security/token";
import { extractBearerToken } from "../utils/auth";
import {
  deriveSessionId,
  getCachedSession,
  setCachedSession,
  getDefaultTtlSeconds,
  type SessionCacheEntry
} from "../cache/session-store";
import { encryptJson } from "../infra/crypto";
import { chargeRequestSchema, type ChargeRequest } from "./charges.schema";
import { extractProviderConfig } from "../utils/provider-config";
import { metricsCollector } from "../infra/metrics";
import { getAdapter } from "../adapters";

interface SessionResolution {
  entry: SessionCacheEntry;
  sessionId: string;
}

type FastifyRequestWithBody = FastifyRequest<{ Body: unknown; Params: Record<string, string> }>;

async function resolveSession(
  app: FastifyInstance,
  payload: TokenPayload,
  options: { providerConfigOverride?: Record<string, unknown> | null } = {}
): Promise<SessionResolution> {
  const shouldUseCache = payload.meta?.cacheEnabled !== false;
  const ttlSeconds = payload.meta?.ttlSeconds ?? getDefaultTtlSeconds();
  const redisPrefix = payload.meta?.redisKeyPrefix;
  const sessionId = deriveSessionId(payload.providerId, payload.credentials, payload.tenantId);

  let cacheEntry: SessionCacheEntry | null = null;

  if (shouldUseCache) {
    cacheEntry = await getCachedSession(app.appContext.redis, sessionId, redisPrefix);
  }

  const providerConfigOverride = options.providerConfigOverride ?? null;

  if (!cacheEntry || providerConfigOverride) {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + ttlSeconds * 1000);
    const context = payload.context ?? null;

    const providerConfig =
      providerConfigOverride ?? extractProviderConfig(context) ?? {};

    const contextToPersist = providerConfigOverride
      ? {
          ...(context ?? {}),
          providerConfig: providerConfigOverride
        }
      : context;

    const entry: SessionCacheEntry = {
      sessionId,
      providerId: payload.providerId,
      tenantId: payload.tenantId,
      credentialsEncrypted: encryptJson(payload.credentials),
      providerConfigEncrypted: encryptJson(providerConfig),
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      context: contextToPersist ?? undefined
    };

    if (shouldUseCache) {
      await setCachedSession(app.appContext.redis, sessionId, entry, ttlSeconds, redisPrefix);
    }

    return { entry, sessionId };
  }

  return { entry: cacheEntry, sessionId };
}

function handleTokenVerificationError(reply: FastifyReply, error: unknown) {
  if (error instanceof TokenVerificationError) {
    return reply.status(401).send({
      error_code: "AUTH_INVALID_TOKEN",
      message: error.message,
      details: error.cause ?? null
    });
  }

  return reply
    .status(500)
    .send({ error_code: "TOKEN_VERIFICATION_ERROR", message: "Unable to verify token" });
}

function createAdapter(providerId: string, entry: SessionCacheEntry) {
  const credentialsEncrypted = entry.credentialsEncrypted;
  const configEncrypted = entry.providerConfigEncrypted ?? encryptJson({});
  return getAdapter(providerId, credentialsEncrypted, configEncrypted);
}

function requireTokenPayload(
  app: FastifyInstance,
  request: FastifyRequestWithBody,
  reply: FastifyReply
): TokenPayload | null {
  const token = extractBearerToken(request.headers.authorization as string | undefined);

  if (!token) {
    void reply.status(401).send({
      error_code: "AUTH_MISSING_TOKEN",
      message: "Missing bearer token"
    });
    return null;
  }

  try {
    return verifyInitializeToken(token, app.appContext.env.mcpTokenSecret);
  } catch (error) {
    handleTokenVerificationError(reply, error);
    return null;
  }
}

function validateChargePayload(reply: FastifyReply, body: unknown) {
  const parsed = chargeRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    void reply.status(400).send({
      error_code: "VALIDATION_ERROR",
      message: parsed.error.message,
      issues: parsed.error.issues
    });
    return null;
  }
  return parsed.data;
}

export async function registerChargeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/charges", async (_request, reply) => {
    return reply.send({ data: [], next_cursor: null });
  });

  app.get("/v1/charges/:id", async (request, reply) => {
    const payload = requireTokenPayload(app, request as FastifyRequestWithBody, reply);
    if (!payload) {
      return reply;
    }

    const session = await resolveSession(app, payload);
    const adapter = createAdapter(payload.providerId, session.entry);
    metricsCollector.incrementProviderCounter(payload.providerId, "requests");

    try {
      const providerChargeId = (request.params as Record<string, string>).id;
      const charge = await adapter.retrieveCharge(providerChargeId);

      return reply.send({
        id: providerChargeId,
        provider_charge_id: providerChargeId,
        status: charge.status,
        data: charge.data
      });
    } catch (error) {
      metricsCollector.incrementProviderCounter(payload.providerId, "errors");
      app.log.error({ err: error }, "Failed to retrieve charge from provider");
      return reply.status(502).send({
        error_code: "PROVIDER_ERROR",
        message: error instanceof Error ? error.message : "Unable to retrieve charge"
      });
    }
  });

  app.post("/v1/charges", async (request, reply) => {
    const payload = requireTokenPayload(app, request as FastifyRequestWithBody, reply);
    if (!payload) {
      return reply;
    }

    const chargePayload = validateChargePayload(reply, request.body);
    if (!chargePayload) {
      return reply;
    }

    if (chargePayload.provider_id && chargePayload.provider_id !== payload.providerId) {
      return reply.status(400).send({
        error_code: "PROVIDER_MISMATCH",
        message: "provider_id in payload does not match token provider"
      });
    }

    const session = await resolveSession(app, payload, {
      providerConfigOverride: chargePayload.provider_config ?? null
    });

    const adapter = createAdapter(payload.providerId, session.entry);

    metricsCollector.incrementProviderCounter(payload.providerId, "requests");

    try {
      const result = await adapter.createCharge({
        tenantId: payload.tenantId ?? payload.providerId,
        providerId: payload.providerId,
        amount: chargePayload.amount,
        due_date: chargePayload.due_date,
        reference_id: chargePayload.reference_id,
        payment_methods: chargePayload.payment_methods,
        customer: chargePayload.customer,
        interest: chargePayload.interest,
        fine: chargePayload.fine,
        discounts: chargePayload.discounts
      });

      metricsCollector.incrementCounter("charges_created_total");

      return reply.code(201).send({
        id: result.provider_charge_id,
        provider_charge_id: result.provider_charge_id,
        status: "PENDING",
        amount: chargePayload.amount,
        due_date: chargePayload.due_date,
        payment_methods: chargePayload.payment_methods,
        data: result.data
      });
    } catch (error) {
      metricsCollector.incrementCounter("charges_failed_total");
      metricsCollector.incrementProviderCounter(payload.providerId, "errors");

      const traceId = (request.headers["x-request-id"] as string) || "no-trace";
      app.log.error({ err: error, trace_id: traceId }, "Failed to create charge");

      if (error instanceof Error && /auth|unauthor/i.test(error.message)) {
        return reply.status(401).send({
          error_code: "PROVIDER_AUTH_ERROR",
          message: error.message,
          trace_id: traceId
        });
      }

      return reply.status(502).send({
        error_code: "PROVIDER_ERROR",
        message: error instanceof Error ? error.message : "Unexpected error creating charge",
        trace_id: traceId
      });
    }
  });

  app.post("/v1/charges/:id/cancel", async (request, reply) => {
    const payload = requireTokenPayload(app, request as FastifyRequestWithBody, reply);
    if (!payload) {
      return reply;
    }

    const session = await resolveSession(app, payload);
    const adapter = createAdapter(payload.providerId, session.entry);

    metricsCollector.incrementProviderCounter(payload.providerId, "requests");

    try {
      const providerChargeId = (request.params as Record<string, string>).id;
      const result = await adapter.cancelCharge({
        tenantId: payload.tenantId ?? payload.providerId,
        providerId: payload.providerId,
        chargeId: providerChargeId,
        providerChargeId
      });

      if (!result.success) {
        metricsCollector.incrementProviderCounter(payload.providerId, "errors");
        return reply.status(400).send({
          error_code: "CANCELLATION_FAILED",
          message: result.error ?? "Failed to cancel charge",
          data: result.data ?? null
        });
      }

      return reply.send({
        id: providerChargeId,
        provider_charge_id: providerChargeId,
        status: "CANCELLED",
        data: result.data ?? {}
      });
    } catch (error) {
      metricsCollector.incrementProviderCounter(payload.providerId, "errors");
      app.log.error({ err: error }, "Failed to cancel charge via provider");
      return reply.status(502).send({
        error_code: "PROVIDER_ERROR",
        message: error instanceof Error ? error.message : "Unexpected error cancelling charge"
      });
    }
  });

  app.post("/v1/charges/:id/instructions", async (_request, reply) => {
    return reply.code(202).send({ accepted: true });
  });
}
