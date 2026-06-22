import type { ConnectionOptions } from "bullmq";
import { env } from "./env.js";

/**
 * Conexão BullMQ — passamos ConnectionOptions (objeto) em vez de instância
 * Redis para evitar mismatch entre a versão de `ioredis` do projeto e a
 * versão embarcada pelo BullMQ. BullMQ cria/gerencia a conexão internamente.
 */
function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname && u.pathname !== "/" ? Number(u.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
}

export const connection: ConnectionOptions = parseRedisUrl(env.REDIS_URL);
