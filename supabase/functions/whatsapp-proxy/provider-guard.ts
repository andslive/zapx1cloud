// FASE 18C — impede que uma ação de transporte UazAPI deste proxy
// (conectar, checar/reparar webhook, excluir via fluxo self-service) seja
// executada sobre uma conexão Meta/HookCloud (`provider = 'meta_cloud'`).
//
// Sem esta checagem, qualquer linha de `evolution_instances` — inclusive
// uma conexão HookCloud ainda `pending`, sem `instance_token` real — era
// aceita por `id` e tinha seu `instance_token` (ou a ausência dele)
// enviado para a UazAPI como se fosse uma sessão UazAPI legítima. Isso foi
// confirmado como um risco real: o Fase 18B corrigiu a invalidação de
// query do onboarding HookCloud para `['whatsapp-instances', organizationId]`
// — a mesma query que alimenta `WhatsAppInstancesPanel.tsx`, então uma
// conexão HookCloud pendente passou a aparecer nessa lista, que antes
// desta correção renderizava TODA linha com os botões de ação da UazAPI
// (Conectar/QR, Verificar webhook, Reparar webhook, Excluir), sem nenhuma
// distinção por provider.
//
// Mesma regra de retrocompatibilidade já estabelecida e testada em
// `_shared/whatsapp-provider/resolve.ts` (Fase 2A, `resolveConnectionProvider`):
// `provider` ausente/nulo/vazio resolve para 'uazapi' — as conexões de
// produção existentes hoje foram criadas antes da coluna `provider` existir
// e dependem exatamente deste comportamento para continuar funcionando.
// Qualquer outro valor (`meta_cloud`, ou qualquer string desconhecida) é
// rejeitado — nunca tratado como UazAPI por omissão.
//
// Deliberadamente NÃO importa `resolveConnectionProvider` diretamente:
// aquela função também exige match de `organization_id`, que este proxy
// ainda não valida de forma uniforme em todas as ações/chamadores
// internos (`instances-api`, `uazapi-webhook`) — expandir esse escopo
// aqui arriscaria quebrar chamadas internas legítimas fora do que esta
// fase pediu para corrigir. Gap de isolamento por organização registrado
// separadamente no relatório da Fase 18C, não corrigido nesta fase.
//
// Extraído para um módulo próprio (em vez de ficar inline em `index.ts`,
// que chama `Deno.serve` incondicionalmente no topo do arquivo — importar
// `index.ts` num teste tentaria abrir uma porta de verdade) só para
// permitir testar esta regra isoladamente, no mesmo padrão já usado pelos
// módulos `_shared/*`.
export function isUazapiInstance(instance: { provider?: string | null } | null | undefined): boolean {
  if (!instance) return false;
  const provider = instance.provider;
  if (provider === null || provider === undefined || provider === "") return true;
  return provider === "uazapi";
}

export const UNSUPPORTED_PROVIDER_RESPONSE = { ok: false, error: "unsupported_provider" };
