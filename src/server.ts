import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env";
import tenants from "./api/routes/tenants";
import providers from "./api/routes/providers";
import apiKeys from "./api/routes/apiKeys";
import charges from "./api/routes/charges";
import webhooks from "./api/routes/webhooks";
import { registerMetricsRoutes, metricsMiddleware } from "./infra/metrics";

const app = Fastify({ 
  logger: env.isProduction ? {
    level: 'info',
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url,
          hostname: request.hostname,
          remoteAddress: request.ip,
          remotePort: request.socket?.remotePort || 0,
          headers: {
            'user-agent': request.headers['user-agent'],
            'x-request-id': request.headers['x-request-id'],
          },
        };
      },
      res(response) {
        return {
          statusCode: response.statusCode,
          headers: {
            'x-request-id': (response.getHeader && response.getHeader('x-request-id')) || '',
          },
        };
      },
    },
  } : true,
});

await app.register(helmet);
await app.register(rateLimit, {
  max: env.rateLimit,
  timeWindow: "1 minute",
});

app.addHook("onRequest", async (req, reply) => {
  req.headers["x-request-id"] ||= crypto.randomUUID();
  metricsMiddleware(req, reply, () => {});
});

await app.register(tenants);
await app.register(providers);
await app.register(apiKeys);
await app.register(charges);
await app.register(webhooks);

registerMetricsRoutes(app);

app.get("/healthz", async (_req, reply) => {
  try {
    // Check database connection
    const { client } = await import("./infra/db");
    await client.query("SELECT 1");
    
    // Check Redis connection
    const { redis } = await import("./infra/redis");
    await redis.ping();
    
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        database: "ok",
        redis: "ok",
      },
      version: process.env.npm_package_version || "unknown",
    };
  } catch (error) {
    reply.code(503);
    return {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

app.get("/health/live", async () => ({ status: "alive" }));
app.get("/health/ready", async (_req, reply) => {
  try {
    const { client } = await import("./infra/db");
    await client.query("SELECT 1");
    return { status: "ready" };
  } catch (error) {
    reply.code(503);
    return { status: "not ready", error: error instanceof Error ? error.message : "Unknown error" };
  }
});

app.setErrorHandler((err, req, reply) => {
  const trace_id = (req.headers["x-request-id"] as string) || "no-trace";
  app.log.error({ err, trace_id });
  reply.code(500).send({ error_code: "INTERNAL_ERROR", message: "Unexpected error", trace_id });
});

app.listen({ port: env.port, host: "0.0.0.0" }).then(() => {
  app.log.info(`MCP server listening on :${env.port}`);
});
