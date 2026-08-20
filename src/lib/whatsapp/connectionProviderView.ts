// FASE 18C — classifica uma linha de `evolution_instances` para decidir
// como renderizá-la e QUAIS ações (se alguma) oferecer, sem nunca tratar
// uma conexão Meta/HookCloud como se fosse UazAPI.
//
// Achado que motivou este módulo: `useWhatsAppInstances()` faz
// `select('*')` em `evolution_instances` sem filtrar por `provider`, e
// `WhatsAppInstancesPanel.tsx`/`WhatsAppManager.tsx` (super admin)
// renderizavam TODA linha com o conjunto completo de ações UazAPI
// (Conectar/QR, Pausar, Desvincular, Verificar/Reparar webhook, Excluir),
// sem nenhuma distinção por provider. Como a Fase 18B corrigiu a
// invalidação de query do onboarding HookCloud para
// `['whatsapp-instances', organizationId]` — a MESMA query que alimenta
// esse painel —, uma conexão HookCloud recém-criada (sempre `pending`)
// passou a aparecer nessa lista, correndo o risco real de receber uma
// ação UazAPI (ex.: "Conectar" chamando `whatsapp-proxy` com
// `action:'connect_instance'` para um `id` que nunca teve sessão UazAPI).
//
// `evolution_instances.provider` é a ÚNICA fonte de verdade sobre o
// TRANSPORTE de uma conexão (documentado em
// `supabase/migrations/20260819000000_meta_cloud_onboarding_source.sql` e
// em `_shared/whatsapp-provider/resolve.ts`) — por isso a decisão de
// segurança (permitir ou não uma ação de transporte UazAPI) depende
// SOMENTE de `provider`, nunca de `onboarding_state`/`onboarding_source`
// (que vivem numa tabela satélite, `evolution_instances_meta_cloud`, só
// usada aqui para exibição, nunca para a decisão de segurança).
//
// Mesma regra de retrocompatibilidade de `resolve.ts`/`provider-guard.ts`
// (backend): `provider` ausente/nulo/vazio resolve para 'uazapi' — as
// conexões de produção existentes não têm essa coluna preenchida.

export type ConnectionDisplayKind = "uazapi" | "hookcloud_pending" | "unsupported";

export interface ConnectionProviderFields {
  provider?: string | null;
}

export interface MetaCloudConfigFields {
  onboarding_state?: string | null;
  onboarding_source?: string | null;
}

/** true somente para o provider real e conhecido de transporte UazAPI (inclui ausência, por retrocompatibilidade). Nunca usado sozinho para decidir o que EXIBIR — só para decidir se ações de transporte UazAPI são permitidas. */
export function isUazapiProvider(instance: ConnectionProviderFields | null | undefined): boolean {
  if (!instance) return false;
  const provider = instance.provider;
  if (provider === null || provider === undefined || provider === "") return true;
  return provider === "uazapi";
}

/**
 * Classifica a linha para renderização. Falha fechada: qualquer
 * combinação não reconhecida (provider desconhecido, ou `meta_cloud` com
 * origem/estado diferentes do único caminho real hoje) vira
 * `'unsupported'` — nunca inventa um estado "ativo" que o backend ainda
 * não produz, e nunca finge que é UazAPI.
 */
export function classifyConnectionForDisplay(
  instance: ConnectionProviderFields,
  metaCloudConfig: MetaCloudConfigFields | null | undefined,
): ConnectionDisplayKind {
  if (isUazapiProvider(instance)) return "uazapi";

  if (instance.provider === "meta_cloud") {
    if (metaCloudConfig?.onboarding_source === "hookcloud" && metaCloudConfig?.onboarding_state === "pending") {
      return "hookcloud_pending";
    }
    return "unsupported";
  }

  return "unsupported";
}
