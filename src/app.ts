import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "crypto";
import type { Redis as RedisClient } from "ioredis";
import { env } from "./env";
import { redis } from "./infra/redis";
import { metricsMiddleware, registerMetricsRoutes } from "./infra/metrics";
import { registerRoutes } from "./routes";

export interface AppOptions {
  logger?: FastifyServerOptions["logger"];
}

declare module "fastify" {
  interface FastifyInstance {
    appContext: {
      env: typeof env;
      redis: RedisClient;
    };
  }
}

export async function createApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const defaultLogger: FastifyServerOptions["logger"] = env.isProduction
    ? {
        level: env.logLevel,
        serializers: {
          req(request) {
            return {
              method: request.method,
              url: request.url,
              hostname: request.hostname,
              remoteAddress: request.ip,
              remotePort: request.socket?.remotePort ?? 0,
              headers: {
                "user-agent": request.headers["user-agent"],
                "x-request-id": request.headers["x-request-id"]
              }
            };
          },
          res(response) {
            return {
              statusCode: response.statusCode,
              headers: {
                "x-request-id":
                  typeof response.getHeader === "function"
                    ? ((response.getHeader("x-request-id") as string) ?? "")
                    : ""
              }
            };
          }
        }
      }
    : { level: env.logLevel };

  const app = Fastify({
    logger: options.logger ?? defaultLogger
  });

  app.decorate("appContext", {
    env,
    redis
  });

  app.addHook("onRequest", (req, _reply, done) => {
    req.headers["x-request-id"] ||= randomUUID();
    done();
  });

  app.addHook("onRequest", metricsMiddleware);

  try {
    await redis.ping();
  } catch (error) {
    app.log.warn({ err: error }, "Redis connection not available during startup");
  }

  await app.register(helmet);
  await app.register(rateLimit, {
    max: env.rateLimit,
    timeWindow: "1 minute"
  });

  registerMetricsRoutes(app);
  await registerRoutes(app);

  app.get("/health", async () => {
    const report = {
      status: "ok" as const,
      timestamp: new Date().toISOString(),
      redis: "unknown",
      version: process.env.npm_package_version ?? "unknown"
    };

    try {
      const pong = await redis.ping();
      report.redis = pong === "PONG" ? "up" : "error";
    } catch (error) {
      app.log.warn({ err: error }, "Redis health check failed");
      report.redis = "error";
    }

    return report;
  });

  app.get("/healthz", async () => ({
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      internal_endpoints: "ok"
    },
    version: process.env.npm_package_version || "unknown"
  }));

  app.get("/health/live", async () => ({ status: "alive" }));
  app.get("/health/ready", async () => ({ status: "ready" }));

  app.setErrorHandler((err, req, reply) => {
    const traceId = (req.headers["x-request-id"] as string) || "no-trace";
    app.log.error({ err, trace_id: traceId });
    reply.code(500).send({ error_code: "INTERNAL_ERROR", message: "Unexpected error", trace_id: traceId });
  });

  app.addHook("onClose", async () => {
    try {
      await redis.quit();
    } catch (error) {
      app.log.error({ err: error }, "Error shutting down Redis connection");
    }
  });

  return app;
}
