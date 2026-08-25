// FASE 18A/21B — modal de exibição única de segredos HookCloud
// (callback URL, verify token — nunca o Meta Access Token, que nunca
// chega a esta tela). Reutilizado tanto pelo provisionamento
// (`HookCloudOnboardingConfig`) quanto pela rotação de credenciais
// (`HookCloudRotateCredentialsModal`) — ver Parte 5 da Fase 21B ("se o
// caminho já existir, reaproveite-o; não crie segundo mecanismo
// concorrente"): antes desta fase, o modal de rotação duplicava esta
// mesma UI inline, com uma proteção mais fraca (confirmação por
// AlertDialog Sim/Não, sem checkbox obrigatório).
//
// Máquina de estados explícita (Fase 21B, Parte 2) — nunca um booleano
// solto decidindo se o fechamento é permitido. Cinco estados nomeados,
// divididos entre este componente e seu dono (`onSensitiveLifecycleChange`
// do pai cobre os dois primeiros; os três últimos vivem aqui):
//   1) `idle`                       — dono do modal, `result === null`, nenhuma submissão em andamento.
//   2) `provisioning`               — dono do modal, requisição de rede em voo (`isSubmitting`/equivalente).
//   3) `secret_visible_unconfirmed` — ESTE componente, `result !== null` e a caixa de confirmação ainda não foi marcada.
//   4) `secret_confirmed`           — ESTE componente, caixa marcada — só agora o botão final habilita.
//   5) `closed`                     — `onClose()` foi chamado; o pai zera `result`, voltando a `idle`.
//
// Segurança do ciclo de vida do segredo, ponto a ponto:
//   - os valores só existem no estado local do componente PAI, recebidos
//     como prop — nunca em React Query cache, nunca em estado global,
//     nunca em localStorage/sessionStorage/IndexedDB, nunca em URL, nunca
//     em cache persistente, nunca enviados a analytics;
//   - fechar o modal (X, Escape, clique fora, ou o botão final) SÓ
//     funciona no estado `secret_confirmed` — em `secret_visible_unconfirmed`
//     as três formas de fechar são bloqueadas e mostram um aviso, nunca
//     fecham silenciosamente;
//   - a confirmação é SEMPRE explícita: marcar a caixa "Confirmo que
//     salvei..." — copiar um campo NUNCA marca a caixa automaticamente
//     (Fase 21C, achado da revisão independente do PR #29: a caixa em si
//     agora só fica HABILITADA depois que todos os campos copiáveis
//     foram copiados pelo menos uma vez — clicar em "Copiar" não confirma
//     sozinho, mas confirmar sem nunca ter copiado deixou de ser
//     possível);
//   - reabrir com um novo resultado (nova chamada de sucesso) sempre
//     volta a `secret_visible_unconfirmed`, mesmo que o componente já
//     estivesse montado — nunca herda a confirmação de uma exibição
//     anterior;
//   - nenhum `console.*`, nenhum evento de analytics, nenhum toast inclui
//     o valor de nenhum campo — só confirmações genéricas ("Copiado!");
//   - `beforeunload`/bloqueio de navegação SPA/voltar-avançar do
//     navegador são responsabilidade do componente PAI (que sabe se está
//     em `provisioning` ou `secret_visible_unconfirmed`/equivalente) via
//     `useBlockPageUnloadWhileSensitive`/`useBlockInternalNavigationWhileSensitive`/
//     `useBlockBrowserHistoryWhileSensitive` — este componente não
//     duplica esses hooks, só garante que NUNCA se fecha sozinho.

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  areAllRequiredFieldsCopied,
  canCloseHookCloudSecretRevealModal,
  hookCloudSecretRevealPhaseOnCheckboxChange,
  initialHookCloudSecretRevealPhase,
} from '@/lib/hookcloud/hookCloudSecretRevealState';

export interface HookCloudSecretRevealField {
  id: string;
  label: string;
  value: string;
  /** `false` para campos informativos (ex.: ID da conexão) que não precisam de botão de copiar — nunca editável de qualquer forma. */
  copyable?: boolean;
}

export interface HookCloudSecretRevealModalContent {
  title: string;
  description: string;
  /** Aviso principal (ícone de alerta) — específico do fluxo (provisionamento vs. rotação). */
  warning: string;
  fields: HookCloudSecretRevealField[];
  /** Lista opcional de próximos passos — só o provisionamento usa; a rotação omite. */
  nextSteps?: string[];
}

interface HookCloudSecretRevealModalProps {
  /** `null` = modal fechado (estado `idle`, dono do modal). */
  result: HookCloudSecretRevealModalContent | null;
  onClose: () => void;
}

async function copyToClipboard(value: string, label: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    // Nunca inclui o valor copiado na mensagem — só a confirmação.
    toast.success(`${label} copiado!`);
    return true;
  } catch {
    toast.error('Não foi possível copiar. Copie manualmente.');
    return false;
  }
}

const BLOCKED_CLOSE_WARNING = 'Marque a confirmação de que salvou os valores antes de fechar.';

export function HookCloudSecretRevealModal({ result, onClose }: HookCloudSecretRevealModalProps) {
  const [phase, setPhase] = useState(initialHookCloudSecretRevealPhase());
  // FASE 21C — quais campos copiáveis já foram copiados com sucesso PELO
  // MENOS uma vez nesta exibição. A caixa de confirmação só habilita
  // depois que todos foram copiados — clicar "Copiar" não confirma
  // automaticamente (a checkbox continua exigindo um clique à parte),
  // mas confirmar sem nunca ter copiado deixa de ser possível.
  const [copiedFieldIds, setCopiedFieldIds] = useState<ReadonlySet<string>>(new Set());

  // Cada NOVO resultado (identidade de objeto muda a cada chamada de
  // sucesso — provisionamento e rotação sempre criam um objeto novo,
  // nunca reaproveitam o anterior) reabre em `secret_visible_unconfirmed`,
  // com nenhum campo marcado como copiado, mesmo que o componente já
  // estivesse montado de uma exibição anterior.
  useEffect(() => {
    if (result) {
      setPhase(initialHookCloudSecretRevealPhase());
      setCopiedFieldIds(new Set());
    }
  }, [result]);

  const requiredFieldIds = (result?.fields ?? [])
    .filter((field) => field.copyable !== false)
    .map((field) => field.id);
  const allCopied = areAllRequiredFieldsCopied(requiredFieldIds, copiedFieldIds);

  const handleCopy = async (field: HookCloudSecretRevealField) => {
    const copied = await copyToClipboard(field.value, field.label);
    if (copied) {
      setCopiedFieldIds((prev) => new Set(prev).add(field.id));
    }
  };

  const attemptClose = () => {
    if (!canCloseHookCloudSecretRevealModal(phase)) {
      toast.warning(BLOCKED_CLOSE_WARNING);
      return;
    }
    onClose();
  };

  return (
    <Dialog
      open={!!result}
      onOpenChange={(open) => {
        if (!open) attemptClose();
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          attemptClose();
        }}
        onPointerDownOutside={(e) => {
          e.preventDefault();
          attemptClose();
        }}
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
      >
        {result && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                {result.title}
              </DialogTitle>
              <DialogDescription>{result.description}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm flex gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <p>{result.warning}</p>
              </div>

              {result.fields.map((field) => (
                <div className="space-y-1.5" key={field.id}>
                  <Label htmlFor={field.id}>{field.label}</Label>
                  <div className="flex gap-2">
                    <input
                      id={field.id}
                      readOnly
                      value={field.value}
                      className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono truncate"
                    />
                    {field.copyable !== false && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={`Copiar ${field.label}`}
                        onClick={() => handleCopy(field)}
                      >
                        {copiedFieldIds.has(field.id) ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {result.nextSteps && result.nextSteps.length > 0 && (
                <div className="rounded-md border p-3 text-sm space-y-2">
                  <p className="font-medium">Próximos passos no painel HookCloud:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    {result.nextSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-md border p-3">
                <Checkbox
                  id="hc-secret-confirm-saved"
                  checked={phase === 'secret_confirmed'}
                  disabled={!allCopied}
                  onCheckedChange={(checked) => setPhase(hookCloudSecretRevealPhaseOnCheckboxChange(checked === true))}
                />
                <Label
                  htmlFor="hc-secret-confirm-saved"
                  className={`text-sm font-normal leading-snug ${!allCopied ? 'text-muted-foreground' : ''}`}
                >
                  Confirmo que salvei a URL de callback e o verify token em local seguro. Sei que estes valores não
                  serão exibidos novamente pelo CRM — se eu perdê-los, precisarei usar a rotação segura de
                  credenciais.
                  {!allCopied && ' (copie todos os valores acima para habilitar esta confirmação)'}
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" onClick={attemptClose} disabled={!canCloseHookCloudSecretRevealModal(phase)}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
