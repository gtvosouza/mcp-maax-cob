export const env = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  pg: {
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
    database: process.env.POSTGRES_DB || "mcp",
    user: process.env.POSTGRES_USER || "mcpuser",
    password: process.env.POSTGRES_PASSWORD || "mcppass",
  },
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  rabbitUrl: process.env.RABBITMQ_URL || "amqp://localhost:5672",
  encryptionKeyHex: process.env.ENCRYPTION_KEY_HEX || "",
  webhookHmacSecret: process.env.WEBHOOK_HMAC_SECRET || "change-me",
  rateLimit: parseInt(process.env.RATE_LIMIT || "120", 10),
};
