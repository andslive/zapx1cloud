// FASE 10A — tipo fechado e parser da ORIGEM do onboarding de uma conexão
// Meta Cloud API. Isto NÃO é o transporte — o transporte continua sendo
// exclusivamente `evolution_instances.provider` ('uazapi' | 'meta_cloud'),
// decidido em resolve.ts. `onboarding_source` é só metadado de QUEM fez o
// Embedded Signup / forneceu as credenciais para uma conexão que já é
// `provider = 'meta_cloud'`:
//   - 'hookcloud'   → onboarding via HookCloud Flow (Embedded Signup
//                      facilitado por eles — ver auditoria HookCloud,
//                      Fases 8A/8B).
//   - 'direct_meta' → Embedded Signup direto, sem intermediário (o design
//                      original da Fase 2A).
// null/ausente = legado/não informado — NUNCA um erro, e NUNCA classificado
// automaticamente como uma das duas origens.
//
// Este módulo nunca decide provider, nunca escolhe adapter, nunca faz
// fallback para UazAPI — isso continua sendo responsabilidade exclusiva de
// resolve.ts, que despacha somente por `provider`. HookCloud e Meta direta
// resolvem para o MESMO `MetaAdapter` (ver meta-adapter.ts) — não existe,
// e não deve existir, um adapter `hookcloud` separado.
//
// ORDEM OPERACIONAL OBRIGATÓRIA antes de qualquer deploy do código que
// consome este módulo (meta-adapter.ts):
//   1) aplicar a migration `20260819000000_meta_cloud_onboarding_source.sql`
//      no Supabase Cloud;
//   2) verificar, por leitura (`information_schema.columns`), que a coluna
//      `evolution_instances_meta_cloud.onboarding_source` existe de fato no
//      schema real;
//   3) só então fazer deploy de `meta-adapter.ts` (ou qualquer outro
//      código que leia essa coluna).
// Este módulo assume a coluna já existente no banco quando chamado (Opção
// A, deliberada) — não implementa nenhuma tolerância silenciosa a "coluna
// ausente". Se a coluna não existir ainda no banco real e este código for
// deployado fora de ordem, o erro de SQL real (coluna inexistente) deve
// propagar como está — nunca ser adivinhado/interpretado como
// "onboarding_source ausente" por um catch genérico.

export type MetaCloudOnboardingSource = "hookcloud" | "direct_meta";

const KNOWN_ONBOARDING_SOURCES: readonly MetaCloudOnboardingSource[] = ["hookcloud", "direct_meta"];

/** Falha fechada: nunca convertida silenciosamente, nunca vira um provider. */
export class UnknownMetaCloudOnboardingSourceError extends Error {
  constructor(public readonly rawValue: unknown) {
    super(
      `onboarding_source desconhecido (${JSON.stringify(rawValue)}) — falha fechada, nenhuma conversão silenciosa e nenhum fallback de provider`,
    );
    this.name = "UnknownMetaCloudOnboardingSourceError";
  }
}

/**
 * Interpreta o valor bruto de `onboarding_source` lido do banco.
 * - null / undefined / string vazia → `null` (legado/não informado).
 * - 'hookcloud' | 'direct_meta' → o valor tipado correspondente.
 * - qualquer outro valor → lança `UnknownMetaCloudOnboardingSourceError`.
 */
export function parseMetaCloudOnboardingSource(raw: unknown): MetaCloudOnboardingSource | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "string" && (KNOWN_ONBOARDING_SOURCES as readonly string[]).includes(raw)) {
    return raw as MetaCloudOnboardingSource;
  }
  throw new UnknownMetaCloudOnboardingSourceError(raw);
}

export interface MetaCloudConnectionLogFields {
  provider: "meta_cloud";
  onboardingSource: MetaCloudOnboardingSource | null;
  connectionId: string;
  organizationId: string;
}

/**
 * Log seguro de resolução de conexão Meta Cloud API — só `provider`,
 * `onboarding_source`, `connectionId` e `organizationId`. NUNCA token,
 * `phone_number_id` completo, telefone completo ou conteúdo de mensagem.
 */
export function logMetaCloudConnectionResolved(fields: MetaCloudConnectionLogFields): void {
  console.log("[meta-cloud] conexão resolvida", {
    provider: fields.provider,
    onboarding_source: fields.onboardingSource,
    connection_id: fields.connectionId,
    organization_id: fields.organizationId,
  });
}
