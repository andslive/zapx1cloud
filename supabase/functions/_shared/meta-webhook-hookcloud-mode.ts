// FASE 11A — modo e allowlist do webhook direto HookCloud (entrada), em
// espelho deliberado do padrão já auditado em meta-cloud-mode.ts (saída).
// Lido de env var (nunca de tabela) pelo mesmo motivo documentado lá:
// trocar o modo é operação de deploy, não de UI, nesta fase — rollback
// trivial (apagar/zerar a env var volta ao default mais restritivo, sem
// nenhuma escrita no banco).
//
// Isto é o item 1 do gate de 13 pontos (Fase 11A): "flag global específica
// HookCloud está ligada". Item 3 ("conexão está explicitamente na
// allowlist de piloto") também vem daqui. Os demais itens do gate vivem em
// meta-webhook-hookcloud-gate.ts.
//
// Default sempre "off" — qualquer valor desconhecido também cai em "off"
// (falha fechada, nunca assume ligado por engano).

export type HookCloudWebhookMode = "off" | "pilot";

const VALID_MODES: readonly HookCloudWebhookMode[] = ["off", "pilot"];

export function resolveHookCloudWebhookMode(env: { get(key: string): string | undefined } = Deno.env): HookCloudWebhookMode {
  const raw = (env.get("HOOKCLOUD_WEBHOOK_MODE") ?? "off").trim().toLowerCase();
  if ((VALID_MODES as readonly string[]).includes(raw)) {
    return raw as HookCloudWebhookMode;
  }
  return "off";
}

/**
 * Allowlist de `connection_id` explicitamente liberados para o piloto
 * HookCloud (item 3 do gate). Mesmo formato de `META_CLOUD_CANARY_CONNECTION_IDS`
 * (lista separada por vírgula) — env var separada e com nome próprio,
 * porque é um conceito diferente (quais conexões podem RECEBER webhook
 * direto sem HMAC, não quais podem ENVIAR de verdade).
 */
export function resolveHookCloudPilotConnectionIds(
  env: { get(key: string): string | undefined } = Deno.env,
): ReadonlySet<string> {
  const raw = env.get("HOOKCLOUD_WEBHOOK_PILOT_CONNECTION_IDS") ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return new Set(ids);
}
