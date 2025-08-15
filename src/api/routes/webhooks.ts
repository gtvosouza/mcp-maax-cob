import { FastifyInstance } from "fastify";
import { getAdminKey } from "../auth";
import { registerWebhook, requireTenantByAdminKey } from "../../infra/db";
import { randomUUID } from "node:crypto";

export default async function routes(app: FastifyInstance) {
  app.post("/v1/admin/webhooks", async (req, reply) => {
    const adminKey = getAdminKey(req);
    if (!adminKey) return reply.code(401).send({ error_code: "AUTH_INVALID_KEY", message: "Missing admin key" });
    const tenantId = await requireTenantByAdminKey(adminKey);
    if (!tenantId) return reply.code(401).send({ error_code: "AUTH_INVALID_KEY", message: "Invalid admin key" });

    const body = req.body as any;
    if (!body?.url || !Array.isArray(body?.enabled_events)) {
      return reply.code(400).send({ error_code: "VALIDATION_ERROR", message: "url and enabled_events required" });
    }
    const secret = "whsec_" + randomUUID().replace(/-/g, "");
    const res = await registerWebhook(tenantId, body.url, body.enabled_events, secret);
    reply.code(201).send(res);
  });
}
