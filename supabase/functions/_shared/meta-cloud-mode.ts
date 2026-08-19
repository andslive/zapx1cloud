// FASE 2B.0.EVOHUB-1 — modo operacional do endpoint meta-cloud-send,
// independente (e mais granular) do flag on/off por organização já
// existente em `meta-cloud-flags.ts` (que continua sendo o circuito de
// desligamento principal — qualquer modo aqui só importa se a organização
// também estiver habilitada na tabela).
//
// off      — endpoint recusa qualquer envio (equivalente a feature
//            totalmente desligada, independente do flag por organização).
//            Default de produção.
// shadow   — processa a requisição inteira (resolve conexão, resolve
//            token) mas NUNCA chama a Graph API de verdade — usado para
//            provar que a integração funciona ponta a ponta sem enviar
//            nenhuma mensagem real a nenhum destinatário.
// canary   — chama a Graph API de verdade, mas SOMENTE para conexões
//            explicitamente listadas em META_CLOUD_CANARY_CONNECTION_IDS
//            (lista separada por vírgula). Qualquer outra conexão é
//            recusada, mesmo com a organização habilitada.
// active   — chama a Graph API de verdade para qualquer conexão cuja
//            organização esteja habilitada (sem allowlist adicional).
//
// Lido de env var (nunca de tabela — troca de modo é operação de deploy,
// não de UI, nesta fase) para manter o rollback trivial: apagar/zerar a
// env var e reiniciar volta ao default "off" sem qualquer escrita no
// banco.

export type MetaCloudApiMode = "off" | "shadow" | "canary" | "active";

const VALID_MODES: readonly MetaCloudApiMode[] = ["off", "shadow", "canary", "active"];

export function resolveMetaCloudApiMode(env: { get(key: string): string | undefined } = Deno.env): MetaCloudApiMode {
  const raw = (env.get("META_CLOUD_API_MODE") ?? "off").trim().toLowerCase();
  if ((VALID_MODES as readonly string[]).includes(raw)) {
    return raw as MetaCloudApiMode;
  }
  // Valor desconhecido nunca é tratado como "active" por engano — falha
  // fechada para o modo mais restritivo.
  return "off";
}

export function resolveCanaryConnectionIds(env: { get(key: string): string | undefined } = Deno.env): ReadonlySet<string> {
  const raw = env.get("META_CLOUD_CANARY_CONNECTION_IDS") ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return new Set(ids);
}

export interface ModeGateResult {
  allowed: boolean;
  dryRun: boolean;
  reason?: string;
}

/**
 * Decide, a partir do modo corrente e da conexão-alvo, se o envio real
 * deve prosseguir e se deve ser um dry-run (shadow). Não substitui a
 * checagem de flag por organização (`isMetaCloudApiEnabled`) — é uma
 * checagem adicional, mais restritiva, nunca mais permissiva.
 */
export function evaluateModeGate(
  mode: MetaCloudApiMode,
  connectionId: string,
  canaryConnectionIds: ReadonlySet<string>,
): ModeGateResult {
  if (mode === "off") {
    return { allowed: false, dryRun: false, reason: "META_CLOUD_API_MODE=off" };
  }
  if (mode === "shadow") {
    return { allowed: true, dryRun: true };
  }
  if (mode === "canary") {
    if (!canaryConnectionIds.has(connectionId)) {
      return { allowed: false, dryRun: false, reason: "connection_not_in_canary_allowlist" };
    }
    return { allowed: true, dryRun: false };
  }
  // active
  return { allowed: true, dryRun: false };
}
