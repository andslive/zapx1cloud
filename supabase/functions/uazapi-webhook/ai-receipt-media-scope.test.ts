// Testa o trecho corrigido de case "ai_receipt" (branch de download de
// mídia via rawMessage) usando a função REAL importada de
// ../_shared/evolution-provider-config.ts — antes da correção, esse ponto
// referenciava resolvedEvoUrl/resolvedApiKeys de um escopo irmão
// inacessível, causando ReferenceError/TS2304 em produção.
import { assert, assertEquals } from "https://deno.land/std@0.207.0/assert/mod.ts";
import { resolveEvolutionProviderConfig } from "../_shared/evolution-provider-config.ts";

function makeSupabase(opts: {
  integrationSettings?: { evolution_go_url?: string; evolution_go_global_api_key?: string } | null;
  platformSettings?: { evolution_go_url?: string; evolution_go_global_api_key?: string } | null;
}) {
  return {
    from(table: string) {
      if (table === "integration_settings") {
        return {
          select: (_c: string) => ({
            eq: (_c1: string, _v1: any) => ({
              eq: (_c2: string, _v2: any) => ({
                maybeSingle: async () => ({
                  data: opts.integrationSettings ? { settings: opts.integrationSettings } : null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "platform_settings") {
        return {
          select: (_c: string) => ({
            limit: (_n: number) => ({ maybeSingle: async () => ({ data: opts.platformSettings ?? null, error: null }) }),
          }),
        };
      }
      throw new Error("unexpected table " + table);
    },
  };
}

// Reprodução fiel do branch corrigido dentro de case "ai_receipt":
//   if (!mediaData && effectiveMedia.rawMessage) {
//     const { evoUrl, apiKeys } = await resolveEvolutionProviderConfig(...);
//     const dl = await downloadMediaBase64(evoUrl, apiKeys, ...);
//   }
async function aiReceiptDownloadBranch(
  supabase: any,
  instance: { organization_id: string; instance_token: string | null; name: string; instance_id: string },
  effectiveMedia: { base64?: string; url?: string; rawMessage?: any; type?: string; messageId?: string },
  downloadMediaBase64Fn: (...args: any[]) => Promise<{ base64: string } | null>,
  norm: { remoteJid: string; messageId: string },
) {
  let mediaData = "";
  let configResolutionCalled = false;
  let downloadArgs: any[] | null = null;

  if (effectiveMedia.base64) {
    mediaData = effectiveMedia.base64;
  } else if (!mediaData && effectiveMedia.rawMessage) {
    configResolutionCalled = true;
    const { evoUrl, apiKeys } = await resolveEvolutionProviderConfig(
      supabase,
      instance.organization_id,
      instance.instance_token,
    );
    downloadArgs = [evoUrl, apiKeys];
    const dl = await downloadMediaBase64Fn(
      evoUrl,
      apiKeys,
      effectiveMedia.rawMessage,
      effectiveMedia.messageId || norm.messageId,
      effectiveMedia.type,
      norm.remoteJid,
      instance.name,
      instance.instance_id,
    );
    if (dl) mediaData = dl.base64;
  }

  return { mediaData, configResolutionCalled, downloadArgs };
}

const instance = { organization_id: "org-1", instance_token: "tok-1", name: "chip1", instance_id: "inst-1" };
const norm = { remoteJid: "5511999999999@s.whatsapp.net", messageId: "MSG-1" };

Deno.test("sem base64, sem URL pública, com rawMessage: resolve config e chama download com URL e credenciais corretas (sem ReferenceError)", async () => {
  const supabase = makeSupabase({
    integrationSettings: { evolution_go_url: "https://evo.example.com", evolution_go_global_api_key: "global-key" },
  });
  const downloadMediaBase64Fn = async (..._args: any[]) => ({ base64: "ZmFrZQ==" });

  let threw = false;
  let result: any = null;
  try {
    result = await aiReceiptDownloadBranch(
      supabase, instance,
      { rawMessage: { some: "payload" }, type: "image", messageId: "MSG-1" },
      downloadMediaBase64Fn, norm,
    );
  } catch (_e) {
    threw = true;
  }

  assert(!threw, "nenhuma exceção/ReferenceError");
  assertEquals(result.mediaData, "ZmFrZQ==");
  assert(result.configResolutionCalled, "config foi resolvida localmente, dentro do branch correto");
  assertEquals(result.downloadArgs[0], "https://evo.example.com", "download chamado com a URL resolvida");
  assert(result.downloadArgs[1].includes("tok-1") && result.downloadArgs[1].includes("global-key"), "download chamado com as credenciais corretas");
});

Deno.test("base64 já presente: não resolve config nem chama download (sem consulta desnecessária)", async () => {
  const supabase = makeSupabase({});
  let downloadCalled = false;
  const downloadMediaBase64Fn = async () => { downloadCalled = true; return null; };

  const result = await aiReceiptDownloadBranch(
    supabase, instance,
    { base64: "amFfdGVuaG8=", rawMessage: { some: "payload" } },
    downloadMediaBase64Fn, norm,
  );

  assertEquals(result.mediaData, "amFfdGVuaG8=");
  assert(!result.configResolutionCalled, "config não é resolvida quando já há base64 direto");
  assert(!downloadCalled, "downloadMediaBase64 não é chamado");
});
