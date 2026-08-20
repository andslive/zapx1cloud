// FASE 18D — modelo explícito de ELEGIBILIDADE: decide, para cada linha
// de `evolution_instances`, se ela pode ser selecionada por um seletor
// OPERACIONAL (envio manual, automação, funil, campanha, disparo) — uma
// pergunta diferente da classificação de EXIBIÇÃO já resolvida em
// `connectionProviderView.ts` (Fase 18C). Deliberadamente em módulo
// separado: o hook base (`useWhatsAppInstances`) continua retornando
// TODAS as linhas sem filtro — telas administrativas (painel de
// conexões) precisam continuar vendo conexões pendentes; só os
// seletores OPERACIONAIS usam este módulo para excluí-las.
//
// Regra para UazAPI: nenhuma mudança de comportamento — `provider`
// ausente/nulo/vazio ou `'uazapi'` explícito, com o mesmo critério de
// "operacional" já usado no painel (`status` conectado/pareado — nunca
// dependeu, e continua sem depender, de nenhum metadado Meta).
//
// Regra para Meta/HookCloud: uma conexão só é selecionável para
// mensagens/funis/automações quando TODAS as condições abaixo são
// verdadeiras — falha fechada em qualquer uma que faltar:
//   - `provider === 'meta_cloud'`;
//   - o registro satélite (`evolution_instances_meta_cloud`) existe;
//   - `onboarding_source === 'hookcloud'` (única origem suportada hoje —
//     'direct_meta' existe como valor conhecido no schema, mas nenhum
//     fluxo real o produz ainda, então não é tratado como elegível);
//   - `onboarding_state === 'active'` — NUNCA verdadeiro hoje: a RPC de
//     provisionamento (`provision_hookcloud_meta_connection`) sempre
//     cria a linha com `onboarding_state = 'pending'`, e nenhum fluxo
//     real ainda promove uma conexão para `'active'`. `isMetaCloudOperationalConnection`
//     é, portanto, estruturalmente `false` para toda linha existente até
//     que essa promoção seja implementada numa fase futura — documentado
//     aqui, não escondido;
//   - `phone_number_id` presente na própria linha satélite;
//   - a flag/modo do piloto está habilitada para a organização (passada
//     explicitamente pelo chamador via `metaCloudEnabledForOrg` — este
//     módulo não lê a flag sozinho, para continuar puro/testável; a
//     ausência do parâmetro nunca é tratada como "true").

export interface EligibilityConnectionFields {
  provider?: string | null;
  status?: string | null;
}

export interface EligibilityMetaCloudFields {
  onboarding_state?: string | null;
  onboarding_source?: string | null;
  phone_number_id?: string | null;
}

const UAZAPI_LINKED_STATUSES = new Set(["connected", "paired"]);

/** Mesmo critério de "vinculado"/pronto para uso já usado no painel (`isLinked`) — nenhuma mudança de comportamento para UazAPI. */
export function isUazapiOperationalConnection(instance: EligibilityConnectionFields | null | undefined): boolean {
  if (!instance) return false;
  const provider = instance.provider;
  const isUazapi = provider === null || provider === undefined || provider === "" || provider === "uazapi";
  if (!isUazapi) return false;
  return UAZAPI_LINKED_STATUSES.has(String(instance.status));
}

export function isPendingHookCloudConnection(
  instance: EligibilityConnectionFields | null | undefined,
  metaCloudConfig: EligibilityMetaCloudFields | null | undefined,
): boolean {
  if (!instance || instance.provider !== "meta_cloud") return false;
  return metaCloudConfig?.onboarding_source === "hookcloud" && metaCloudConfig?.onboarding_state === "pending";
}

/**
 * Estruturalmente `false` hoje para toda conexão real (ver nota acima) —
 * escrita para o estado futuro em que uma conexão HookCloud possa chegar
 * a `onboarding_state === 'active'`. Nunca finge que esse estado já é
 * alcançável.
 */
export function isMetaCloudOperationalConnection(
  instance: EligibilityConnectionFields | null | undefined,
  metaCloudConfig: EligibilityMetaCloudFields | null | undefined,
  opts: { metaCloudEnabledForOrg: boolean },
): boolean {
  if (!instance || instance.provider !== "meta_cloud") return false;
  if (!metaCloudConfig) return false;
  if (metaCloudConfig.onboarding_source !== "hookcloud") return false;
  if (metaCloudConfig.onboarding_state !== "active") return false;
  if (!metaCloudConfig.phone_number_id) return false;
  if (opts.metaCloudEnabledForOrg !== true) return false;
  return true;
}

/** A pergunta que todo seletor operacional (automação/funil/campanha/disparo) deve fazer antes de listar uma conexão como opção. */
export function isSelectableMessagingConnection(
  instance: EligibilityConnectionFields | null | undefined,
  metaCloudConfig: EligibilityMetaCloudFields | null | undefined,
  opts: { metaCloudEnabledForOrg: boolean },
): boolean {
  return isUazapiOperationalConnection(instance) || isMetaCloudOperationalConnection(instance, metaCloudConfig, opts);
}

/** Usado só por telas administrativas de gerenciamento (nunca por seletores operacionais): qualquer conexão com provider conhecido (uazapi ou meta_cloud), mesmo pendente/desconectada — provider desconhecido continua falhando fechado. */
export function isManagementVisibleConnection(instance: EligibilityConnectionFields | null | undefined): boolean {
  if (!instance) return false;
  const provider = instance.provider;
  if (provider === null || provider === undefined || provider === "" || provider === "uazapi") return true;
  return provider === "meta_cloud";
}
