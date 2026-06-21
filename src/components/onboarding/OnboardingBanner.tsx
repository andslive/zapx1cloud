import { useState } from 'react';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GuidedOnboarding } from './GuidedOnboarding';
import { useGuidedOnboarding } from '@/hooks/useGuidedOnboarding';

/**
 * Tarja amarela persistente que aparece no painel admin enquanto
 * o onboarding guiado não foi concluído. O botão X apenas oculta
 * a tarja na sessão atual — ela retorna em novos acessos até a
 * conclusão definitiva.
 */
export function OnboardingBanner() {
  const { shouldShow, markCompleted } = useGuidedOnboarding();
  const [dismissedThisSession, setDismissedThisSession] = useState(false);
  const [openWizard, setOpenWizard] = useState(false);

  if (!shouldShow || dismissedThisSession) {
    // Mesmo oculto, ainda renderizamos o wizard caso esteja aberto.
    if (openWizard) {
      return (
        <GuidedOnboarding
          open={openWizard}
          onClose={() => setOpenWizard(false)}
          onComplete={async () => {
            await markCompleted();
            setOpenWizard(false);
          }}
          onSkipAll={() => {
            // Não marca como pulado permanentemente — apenas fecha o wizard.
            // A tarja continuará aparecendo até a conclusão definitiva.
            setOpenWizard(false);
          }}
        />
      );
    }
    return null;
  }

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-yellow-300 bg-yellow-100 dark:bg-yellow-900/30 dark:border-yellow-700/50">
        <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-400/30 text-yellow-700 dark:text-yellow-300">
            <Sparkles size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
              Conclua a configuração inicial da sua conta
            </p>
            <p className="text-xs text-yellow-800/80 dark:text-yellow-200/80 hidden sm:block">
              Termine o cadastro guiado para liberar todo o potencial da plataforma.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setOpenWizard(true)}
            className="shrink-0 bg-yellow-500 hover:bg-yellow-600 text-yellow-950 gap-1.5"
          >
            Continuar
            <ArrowRight size={14} />
          </Button>
          <button
            onClick={() => setDismissedThisSession(true)}
            aria-label="Fechar"
            className="shrink-0 rounded p-1 text-yellow-800 hover:bg-yellow-200 dark:text-yellow-200 dark:hover:bg-yellow-800/40 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {openWizard && (
        <GuidedOnboarding
          open={openWizard}
          onClose={() => setOpenWizard(false)}
          onComplete={async () => {
            await markCompleted();
            setOpenWizard(false);
          }}
          onSkipAll={() => {
            // Não marca como pulado permanentemente.
            setOpenWizard(false);
          }}
        />
      )}
    </>
  );
}
