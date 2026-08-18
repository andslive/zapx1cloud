// FASE 2A — ponto único de importação do contrato de provider de WhatsApp.
// Consumidores futuros (Fase 2B) devem importar só daqui, nunca dos
// arquivos internos diretamente (facilita trocar a implementação interna
// sem quebrar os pontos de chamada).

export * from "./types.ts";
export * from "./errors.ts";
export { resolveConnectionProvider, resolveWhatsAppProvider } from "./resolve.ts";
export type { ResolveWhatsAppProviderDeps, SupabaseLike } from "./resolve.ts";
export { createUazapiAdapter } from "./uazapi-adapter.ts";
export type { UazapiAdapterDeps } from "./uazapi-adapter.ts";
export { createMetaCloudAdapter } from "./meta-adapter.ts";
export type { MetaCloudAdapterDeps } from "./meta-adapter.ts";
