import type { FastifyPluginAsync } from "fastify";
import { getStats } from "../lib/raw-storage.js";

export const statsRawStorageRoute: FastifyPluginAsync = async (app) => {
  app.get("/stats/raw-storage", async () => {
    return getStats();
  });
};
