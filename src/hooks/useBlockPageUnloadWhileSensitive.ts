import { useEffect } from 'react';

// FASE 18G — extraído de `HookCloudOnboardingConfig.tsx` (Fase 18B, onde
// vivia inline) para ser reutilizado também por
// `HookCloudRotateCredentialsModal.tsx`, em vez de duplicar o mesmo
// efeito. Proteção genérica contra fechar/recarregar a aba enquanto uma
// submissão está em andamento ou um segredo ainda não foi confirmado
// como salvo. Usa a API nativa do navegador (`beforeunload`) — nenhuma
// dependência nova; nenhum segredo/dado digitado entra na mensagem (o
// texto do prompt de confirmação é controlado inteiramente pelo
// navegador, não pelo `returnValue`, em todos os browsers modernos).
export function useBlockPageUnloadWhileSensitive(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}
