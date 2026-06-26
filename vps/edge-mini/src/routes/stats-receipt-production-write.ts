import type { FastifyPluginAsync } from "fastify";
import { getReceiptProductionCounters } from "../lib/receipt-production-write.js";

export const statsReceiptProductionWriteRoute: FastifyPluginAsync = async (app) => {
  app.get("/stats/receipt-production-write", async () => {
    return getReceiptProductionCounters();
  });
};
