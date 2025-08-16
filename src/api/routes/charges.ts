import { FastifyInstance } from "fastify";
import { ChargeRequest } from "../schemas";
import { getPublicKey } from "../auth";
import { getProvider, insertCharge, requireTenantByPublicKey, setChargeData, getCharge } from "../../infra/db";
import { getAdapter } from "../../adapters";
import { metricsCollector } from "../../infra/metrics";

export default async function routes(app: FastifyInstance) {
  app.get("/v1/charges", async (req, reply) => {
    // MVP: return empty list, pagination left as exercise
    reply.send({ data: [], next_cursor: null });
  });

  app.get("/v1/charges/:id", async (req, reply) => {
    const pubKey = getPublicKey(req);
    if (!pubKey) return reply.code(401).send({ error_code: "AUTH_INVALID_KEY", message: "Missing public key" });
    const tenantId = await requireTenantByPublicKey(pubKey);
    if (!tenantId) return reply.code(401).send({ error_code: "AUTH_INVALID_KEY", message: "Invalid public key" });

    const id = (req.params as any).id as string;
    const ch = await getCharge(tenantId, id);
    if (!ch) return reply.code(404).send({ error_code: "NOT_FOUND", message: "Charge not found" });
    reply.send({
      id: ch.id,
      provider_charge_id: ch.provider_charge_id,
      status: ch.status,
      amount: ch.amount,
      due_date: ch.due_date,
      payment_methods: ch.data?.payment_methods || [],
      data: ch.data || {},
    });
  });

  app.post("/v1/charges", async (req, reply) => {
    try {
      const pubKey = getPublicKey(req);
      if (!pubKey) return reply.code(401).send({ error_code: "AUTH_INVALID_KEY", message: "Missing public key" });
      const tenantId = await requireTenantByPublicKey(pubKey);
      if (!tenantId) return reply.code(401).send({ error_code: "AUTH_INVALID_KEY", message: "Invalid public key" });

      const parsed = ChargeRequest.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error_code: "VALIDATION_ERROR", message: parsed.error.message });
      }
      const payload = parsed.data;
      const provider = await getProvider(tenantId, payload.provider_id);
      if (!provider) return reply.code(404).send({ error_code: "PROVIDER_NOT_FOUND", message: "Provider not found" });

      const adapter = getAdapter(provider.provider_type, provider.credentials_encrypted, provider.provider_specific_config_encrypted);
      const chargeId = await insertCharge(tenantId, payload.provider_id, payload);
      
      // Track provider request
      metricsCollector.incrementProviderCounter(provider.provider_type, 'requests');
      
      const res = await adapter.createCharge({
        tenantId, providerId: payload.provider_id,
        amount: payload.amount, due_date: payload.due_date,
        reference_id: payload.reference_id,
        payment_methods: payload.payment_methods,
        customer: payload.customer,
        interest: payload.interest, fine: payload.fine, discounts: payload.discounts
      });

      await setChargeData(tenantId, chargeId, {
        provider_charge_id: res.provider_charge_id,
        status: "PENDING",
        data: { ...res.data, payment_methods: payload.payment_methods }
      });

      // Track successful charge creation
      metricsCollector.incrementCounter('charges_created_total');

      reply.code(201).send({
        id: chargeId,
        provider_charge_id: res.provider_charge_id,
        status: "PENDING",
        amount: payload.amount,
        due_date: payload.due_date,
        payment_methods: payload.payment_methods,
        data: res.data
      });
    } catch (error) {
      // Track failed charge creation
      metricsCollector.incrementCounter('charges_failed_total');
      
      const trace_id = (req.headers["x-request-id"] as string) || "no-trace";
      app.log.error({ err: error, trace_id }, "Failed to create charge");
      
      if (error instanceof Error) {
        // Check if it's a provider-specific error
        if (error.message.includes("auth failed") || error.message.includes("API")) {
          const provider = await getProvider(await requireTenantByPublicKey(getPublicKey(req)!) || "", (req.body as any)?.provider_id);
          if (provider) {
            metricsCollector.incrementProviderCounter(provider.provider_type, 'errors');
          }
          return reply.code(502).send({ 
            error_code: "PROVIDER_UNAVAILABLE", 
            message: "Payment provider is temporarily unavailable",
            trace_id 
          });
        }
      }
      
      return reply.code(500).send({ 
        error_code: "INTERNAL_ERROR", 
        message: "Unexpected error creating charge",
        trace_id 
      });
    }
  });

  app.post("/v1/charges/:id/instructions", async (req, reply) => {
    // MVP: accept and return 202
    reply.code(202).send({ accepted: true });
  });

  app.post("/v1/charges/:id/cancel", async (req, reply) => {
    try {
      const pubKey = getPublicKey(req);
      if (!pubKey) return reply.code(401).send({ error_code: "AUTH_INVALID_KEY", message: "Missing public key" });
      const tenantId = await requireTenantByPublicKey(pubKey);
      if (!tenantId) return reply.code(401).send({ error_code: "AUTH_INVALID_KEY", message: "Invalid public key" });

      const id = (req.params as any).id as string;
      const charge = await getCharge(tenantId, id);
      if (!charge) return reply.code(404).send({ error_code: "NOT_FOUND", message: "Charge not found" });

      // Check if charge can be cancelled
      if (charge.status === "CANCELLED") {
        return reply.code(400).send({ error_code: "ALREADY_CANCELLED", message: "Charge is already cancelled" });
      }
      if (charge.status === "PAID") {
        return reply.code(400).send({ error_code: "CANNOT_CANCEL_PAID", message: "Cannot cancel a paid charge" });
      }

      const provider = await getProvider(tenantId, charge.provider_id);
      if (!provider) return reply.code(404).send({ error_code: "PROVIDER_NOT_FOUND", message: "Provider not found" });

      const adapter = getAdapter(provider.provider_type, provider.credentials_encrypted, provider.provider_specific_config_encrypted);
      
      // Track cancellation attempt
      metricsCollector.incrementProviderCounter(provider.provider_type, 'requests');
      
      try {
        const result = await adapter.cancelCharge({
          tenantId,
          providerId: charge.provider_id,
          chargeId: id,
          providerChargeId: charge.provider_charge_id
        });

        if (result.success) {
          await setChargeData(tenantId, id, {
            status: "CANCELLED",
            data: { ...charge.data, cancelled_at: new Date().toISOString(), cancellation_reason: "manual_cancellation" }
          });

          reply.send({
            id,
            status: "CANCELLED",
            cancelled_at: new Date().toISOString(),
            message: "Charge cancelled successfully"
          });
        } else {
          reply.code(400).send({
            error_code: "CANCELLATION_FAILED",
            message: result.error || "Failed to cancel charge with provider"
          });
        }
      } catch (error) {
        // Track failed cancellation
        metricsCollector.incrementProviderCounter(provider.provider_type, 'errors');
        
        // Check if provider doesn't support cancellation
        if (error instanceof Error && error.message.includes("not supported")) {
          return reply.code(501).send({
            error_code: "CANCELLATION_NOT_SUPPORTED",
            message: "This payment provider does not support charge cancellation"
          });
        }
        
        throw error; // Re-throw for general error handling
      }
    } catch (error) {
      const trace_id = (req.headers["x-request-id"] as string) || "no-trace";
      app.log.error({ err: error, trace_id }, "Failed to cancel charge");
      
      return reply.code(500).send({
        error_code: "INTERNAL_ERROR",
        message: "Unexpected error cancelling charge",
        trace_id
      });
    }
  });
}
