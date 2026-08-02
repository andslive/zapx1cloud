// Resolve UazAPI/Evolution config (URL + API keys) para uma organização,
// com o fallback integration_settings → platform_settings usado em todo o
// uazapi-webhook. Extraído para arquivo próprio (sem Deno.serve) para poder
// ser importado tanto pelo index.ts quanto por testes, sem iniciar um
// listener HTTP real ao importar.
//
// Contexto: existiam duas cópias inline dessa mesma lógica dentro de
// uazapi-webhook/index.ts; uma delas, dentro de `case "ai_receipt"`,
// referenciava por engano a variável resolvida no outro escopo (bloco de
// mídia da mensagem inbound), causando ReferenceError/TS2304 em produção.
export async function resolveEvolutionProviderConfig(
  supabase: any,
  organizationId: string,
  instanceToken?: string | null,
): Promise<{ evoUrl: string; apiKeys: string[] }> {
  const { data: cfg } = await supabase
    .from("integration_settings")
    .select("settings")
    .eq("organization_id", organizationId)
    .eq("integration_type", "whatsapp_provider")
    .maybeSingle();
  const settings = (cfg as any)?.settings || {};
  let evoUrl = String(settings.evolution_go_url || "").replace(/\/$/, "");
  const apiKeys = [instanceToken, settings.evolution_go_global_api_key];
  if (!evoUrl || apiKeys.every((k) => !k)) {
    const { data: platformCfg } = await supabase
      .from("platform_settings")
      .select("evolution_go_url, evolution_go_global_api_key")
      .limit(1)
      .maybeSingle();
    evoUrl = evoUrl ||
      String((platformCfg as any)?.evolution_go_url || "").replace(/\/$/, "");
    apiKeys.push((platformCfg as any)?.evolution_go_global_api_key);
  }
  return { evoUrl, apiKeys };
}
