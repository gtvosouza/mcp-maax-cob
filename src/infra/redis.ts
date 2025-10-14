import Redis from "ioredis";
import { env } from "../env";

export const redis = new Redis(env.redis.url, {
  password: env.redis.password || undefined
});
