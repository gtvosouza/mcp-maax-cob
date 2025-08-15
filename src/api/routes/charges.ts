import { FastifyInstance } from "fastify";
import { ChargeRequest } from "../schemas";
import { getPublicKey } from "../auth";
import { getProvider, insertCharge, requireTenantByPublicKey, setChargeData, getCharge } from "../../infra/db";
import { getAdapter } from "../../adapters";

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

    const adapter = getAdapter(provider.provider_type);
    const chargeId = await insertCharge(tenantId, payload.provider_id, payload);
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

    reply.code(201).send({
      id: chargeId,
      provider_charge_id: res.provider_charge_id,
      status: "PENDING",
      amount: payload.amount,
      due_date: payload.due_date,
      payment_methods: payload.payment_methods,
      data: res.data
    });
  });

  app.post("/v1/charges/:id/instructions", async (req, reply) => {
    // MVP: accept and return 202
    reply.code(202).send({ accepted: true });
  });
}
