// FASE 21B — decisões PURAS (sem DOM/React) da máquina de estados do
// modal de segredo único (`HookCloudSecretRevealModal`), extraídas para
// serem testáveis via `deno test` — mesmo padrão já usado em
// `src/lib/whatsapp/internalNavigationGuard.ts` para
// `useBlockInternalNavigationWhileSensitive`: este repositório não tem
// infraestrutura de teste de componente/DOM (nenhum Vitest/Jest/Testing
// Library instalado), então a integração real com o React (`useState`,
// `useEffect`, os elementos `Dialog`/`Checkbox`) permanece sem teste
// automatizado — verificada por inspeção estrutural e validação visual,
// registrada honestamente no relatório da Fase 21B, nunca escondida como
// se fosse coberta.
//
// Dois estados possíveis para o segredo já visível (os outros três da
// máquina de 5 estados descrita no topo de `HookCloudSecretRevealModal.tsx`
// — `idle`, `provisioning`, `closed` — vivem fora deste módulo, no
// componente pai e no próprio ciclo de vida do modal):
export type HookCloudSecretRevealPhase = 'secret_visible_unconfirmed' | 'secret_confirmed';

/** Todo novo segredo exibido SEMPRE começa não confirmado — nunca herda a confirmação de uma exibição anterior. */
export function initialHookCloudSecretRevealPhase(): HookCloudSecretRevealPhase {
  return 'secret_visible_unconfirmed';
}

/** Marcar a caixa avança para `secret_confirmed`; desmarcar volta para `secret_visible_unconfirmed`. Nunca há um terceiro valor possível. */
export function hookCloudSecretRevealPhaseOnCheckboxChange(checked: boolean): HookCloudSecretRevealPhase {
  return checked ? 'secret_confirmed' : 'secret_visible_unconfirmed';
}

/** Única fonte de verdade sobre se X/Escape/clique fora/botão final podem fechar o modal — nunca decidido por um booleano solto duplicado em vários lugares. */
export function canCloseHookCloudSecretRevealModal(phase: HookCloudSecretRevealPhase): boolean {
  return phase === 'secret_confirmed';
}
