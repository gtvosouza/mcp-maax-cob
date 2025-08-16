import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

interface Metrics {
  requests_total: number;
  requests_duration_ms: number[];
  charges_created_total: number;
  charges_failed_total: number;
  provider_requests_total: Record<string, number>;
  provider_errors_total: Record<string, number>;
  webhook_deliveries_total: number;
  webhook_failures_total: number;
}

class MetricsCollector {
  private metrics: Metrics = {
    requests_total: 0,
    requests_duration_ms: [],
    charges_created_total: 0,
    charges_failed_total: 0,
    provider_requests_total: {},
    provider_errors_total: {},
    webhook_deliveries_total: 0,
    webhook_failures_total: 0,
  };

  private startTime = Date.now();

  incrementCounter(metric: keyof Pick<Metrics, 'requests_total' | 'charges_created_total' | 'charges_failed_total' | 'webhook_deliveries_total' | 'webhook_failures_total'>) {
    this.metrics[metric]++;
  }

  recordDuration(durationMs: number) {
    this.metrics.requests_duration_ms.push(durationMs);
    // Keep only last 1000 measurements for memory efficiency
    if (this.metrics.requests_duration_ms.length > 1000) {
      this.metrics.requests_duration_ms = this.metrics.requests_duration_ms.slice(-1000);
    }
  }

  incrementProviderCounter(provider: string, type: 'requests' | 'errors') {
    const metric = type === 'requests' ? 'provider_requests_total' : 'provider_errors_total';
    if (!this.metrics[metric][provider]) {
      this.metrics[metric][provider] = 0;
    }
    this.metrics[metric][provider]++;
  }

  getMetrics() {
    const durations = this.metrics.requests_duration_ms;
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const p95Duration = durations.length > 0 ? durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)] : 0;

    return {
      ...this.metrics,
      uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
      requests_duration_avg_ms: Math.round(avgDuration),
      requests_duration_p95_ms: p95Duration,
      memory_usage: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }

  reset() {
    this.metrics = {
      requests_total: 0,
      requests_duration_ms: [],
      charges_created_total: 0,
      charges_failed_total: 0,
      provider_requests_total: {},
      provider_errors_total: {},
      webhook_deliveries_total: 0,
      webhook_failures_total: 0,
    };
  }
}

export const metricsCollector = new MetricsCollector();

export function registerMetricsRoutes(app: FastifyInstance) {
  app.get("/metrics", async () => {
    return metricsCollector.getMetrics();
  });

  // Prometheus-compatible format
  app.get("/metrics/prometheus", async (req, reply) => {
    const metrics = metricsCollector.getMetrics();
    const prometheus = [
      `# HELP mcp_requests_total Total number of HTTP requests`,
      `# TYPE mcp_requests_total counter`,
      `mcp_requests_total ${metrics.requests_total}`,
      ``,
      `# HELP mcp_requests_duration_avg_ms Average request duration in milliseconds`,
      `# TYPE mcp_requests_duration_avg_ms gauge`,
      `mcp_requests_duration_avg_ms ${metrics.requests_duration_avg_ms}`,
      ``,
      `# HELP mcp_charges_created_total Total number of charges created`,
      `# TYPE mcp_charges_created_total counter`,
      `mcp_charges_created_total ${metrics.charges_created_total}`,
      ``,
      `# HELP mcp_charges_failed_total Total number of failed charge attempts`,
      `# TYPE mcp_charges_failed_total counter`,
      `mcp_charges_failed_total ${metrics.charges_failed_total}`,
      ``,
      `# HELP mcp_uptime_seconds Server uptime in seconds`,
      `# TYPE mcp_uptime_seconds gauge`,
      `mcp_uptime_seconds ${metrics.uptime_seconds}`,
    ];

    // Add provider metrics
    Object.entries(metrics.provider_requests_total).forEach(([provider, count]) => {
      prometheus.push(`mcp_provider_requests_total{provider="${provider}"} ${count}`);
    });

    Object.entries(metrics.provider_errors_total).forEach(([provider, count]) => {
      prometheus.push(`mcp_provider_errors_total{provider="${provider}"} ${count}`);
    });

    reply.header('Content-Type', 'text/plain');
    return prometheus.join('\n');
  });
}

export function metricsMiddleware(req: FastifyRequest, reply: FastifyReply, done: () => void) {
  const startTime = Date.now();
  
  metricsCollector.incrementCounter('requests_total');
  
  reply.raw.on('finish', () => {
    const duration = Date.now() - startTime;
    metricsCollector.recordDuration(duration);
  });
  
  done();
}