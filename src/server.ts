import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env";
import tenants from "./api/routes/tenants";
import providers from "./api/routes/providers";
import apiKeys from "./api/routes/apiKeys";
import charges from "./api/routes/charges";
import webhooks from "./api/routes/webhooks";

const app = Fastify({ logger: true });

await app.register(helmet);
await app.register(rateLimit, {
  max: env.rateLimit,
  hook: "onSend",
  timeWindow: "1 minute",
});

app.addHook("onRequest", async (req, _reply) => {
  req.headers["x-request-id"] ||= crypto.randomUUID();
});

await app.register(tenants);
await app.register(providers);
await app.register(apiKeys);
await app.register(charges);
await app.register(webhooks);

app.get("/healthz", async () => ({ ok: true }));

app.setErrorHandler((err, req, reply) => {
  const trace_id = (req.headers["x-request-id"] as string) || "no-trace";
  app.log.error({ err, trace_id });
  reply.code(500).send({ error_code: "INTERNAL_ERROR", message: "Unexpected error", trace_id });
});

app.listen({ port: env.port, host: "0.0.0.0" }).then(() => {
  app.log.info(`MCP server listening on :${env.port}`);
});
