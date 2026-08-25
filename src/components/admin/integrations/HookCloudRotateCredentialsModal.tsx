// FASE 18G/21B — Alternativa B (recuperação segura), explicitamente
// preferida no relatório: o bloqueio de navegação SPA para `navigate()`
// programático não é alcançável sem migrar o roteador
// (`createBrowserRouter`/`RouterProvider`, indisponível hoje —
// `useBlocker` do react-router-dom@6.30 exige um roteador de dados e
// lança erro em runtime com `<BrowserRouter>`, confirmado lendo o
// código-fonte instalado). Em vez disso: se um administrador perder o
// callback URL/verify token por qualquer motivo (navegação, fechamento
// abrupto do navegador, etc.), esta UI chama o endpoint já auditado e
// implantado `hookcloud-rotate-credentials` (Fases 14A/16A/16B/17B) para
// gerar um par novo — o anterior é invalidado atomicamente pela RPC do
// backend, a conexão volta para `pending`.
//
// FASE 21B — a exibição do segredo rotacionado agora reutiliza o MESMO
// componente protegido do provisionamento (`HookCloudSecretRevealModal`),
// em vez de duplicar a UI inline com uma proteção mais fraca (era um
// AlertDialog Sim/Não; o componente compartilhado exige uma caixa de
// confirmação explícita antes de habilitar o fechamento — ver Parte 5 do
// gate de prontidão: "se o caminho já existir, reaproveite-o; não crie
// segundo mecanismo concorrente").
//
// Mesmo rigor de segurança de `HookCloudOnboardingConfig.tsx`:
//   - nunca usa `useMutation` (token/segredo nunca em cache do React
//     Query) — chamada `async` local simples;
//   - nunca envia `organizationId` (backend deriva do perfil);
//   - segredo só existe no estado efêmero deste componente, apagado
//     depois da confirmação explícita;
//   - bloqueia navegação interna (`<Link>`/`<a>`) e back/forward do
//     navegador enquanto o segredo não foi confirmado como salvo, e
//     `beforeunload` cobre reload/fechamento de aba — mesmos hooks já
//     testados usados por `IntegrationsManager.tsx`;
//   - visível e utilizável SOMENTE por super_admin (mesmo contrato
//     exclusivo do backend, `REQUIRED_ROLES` em
//     `hookcloud-rotate-credentials/index.ts`) — esconder o botão aqui
//     não substitui a checagem do backend, é defesa complementar.

import { useState } from 'react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, ShieldAlert, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useBlockInternalNavigationWhileSensitive } from '@/hooks/useBlockInternalNavigationWhileSensitive';
import { useBlockBrowserHistoryWhileSensitive } from '@/hooks/useBlockBrowserHistoryWhileSensitive';
import { useBlockPageUnloadWhileSensitive } from '@/hooks/useBlockPageUnloadWhileSensitive';
import {
  buildRotateHookCloudRequestBody,
  classifyRotateInvokeResult,
  publicRotateErrorMessageForCode,
  type HookCloudRotateSuccess,
} from '@/lib/hookcloud/hookcloudRotation';
import { getHookCloudCallbackExpectedOrigin } from '@/lib/hookcloud/hookcloudRuntimeConfig';
import type { HookCloudSensitiveLifecycle } from '@/lib/hookcloud/hookcloudProvisioning';
import { hookCloudLifecycleBlockMessage } from '@/lib/hookcloud/hookcloudProvisioning';
import { HookCloudSecretRevealModal, type HookCloudSecretRevealModalContent } from './HookCloudSecretRevealModal';

interface HookCloudRotateCredentialsModalProps {
  connectionId: string;
}

// Função pura de módulo — monta o conteúdo do modal compartilhado a
// partir do resultado de sucesso da rotação. Só inclui os campos que
// foram de fato rotacionados nesta chamada (o outro fica `null` no
// resultado, e nunca aparece aqui).
function buildRotateRevealContent(result: HookCloudRotateSuccess): HookCloudSecretRevealModalContent {
  const fields: HookCloudSecretRevealModalContent['fields'] = [];
  if (result.callbackUrl) fields.push({ id: 'hc-rotate-callback-url', label: 'Callback URL', value: result.callbackUrl });
  if (result.verifyToken) fields.push({ id: 'hc-rotate-verify-token', label: 'Verify token', value: result.verifyToken });
  return {
    title: 'Credenciais rotacionadas',
    description: 'Copie agora. Estes valores não serão exibidos novamente pelo CRM.',
    warning:
      'O(s) valor(es) anterior(es) já foi(foram) invalidado(s). A conexão está pendente até você configurar estes novos valores no painel HookCloud.',
    fields,
  };
}

export function HookCloudRotateCredentialsModal({ connectionId }: HookCloudRotateCredentialsModalProps) {
  const queryClient = useQueryClient();
  const { profile, isSuperAdmin } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [rotateCallback, setRotateCallback] = useState(true);
  const [rotateVerify, setRotateVerify] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [result, setResult] = useState<HookCloudRotateSuccess | null>(null);

  const lifecycle: HookCloudSensitiveLifecycle = isSubmitting ? 'submitting' : result ? 'secret_unacknowledged' : 'idle';
  const isSensitive = lifecycle !== 'idle';

  useBlockInternalNavigationWhileSensitive(isSensitive, () => {
    const warning = hookCloudLifecycleBlockMessage(lifecycle);
    if (warning) toast.warning(warning);
  });
  useBlockBrowserHistoryWhileSensitive(isSensitive, () => {
    const warning = hookCloudLifecycleBlockMessage(lifecycle);
    if (warning) toast.warning(warning);
  });
  useBlockPageUnloadWhileSensitive(isSensitive);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!rotateCallback && !rotateVerify) {
      toast.error('Selecione pelo menos um valor para rotacionar.');
      return;
    }
    const body = buildRotateHookCloudRequestBody({
      connectionId,
      rotateCallbackSecret: rotateCallback,
      rotateVerifyToken: rotateVerify,
    });
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('hookcloud-rotate-credentials', { body, timeout: 20_000 });
      const outcome = await classifyRotateInvokeResult(data, error, getHookCloudCallbackExpectedOrigin(), {
        rotateCallbackSecret: rotateCallback,
        rotateVerifyToken: rotateVerify,
      });

      if (outcome.kind === 'success') {
        setResult(outcome.data);
        setFormOpen(false);
        queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', profile?.organization_id] });
        return;
      }
      if (outcome.kind === 'network_or_timeout') {
        setStatusMessage(
          'Não foi possível confirmar o resultado. Por segurança, verifique se as credenciais foram rotacionadas antes de tentar novamente.',
        );
        return;
      }
      if (outcome.kind === 'unexpected_response' || outcome.kind === 'not_pending') {
        setStatusMessage('A resposta do servidor não pôde ser confirmada com segurança. Tente novamente.');
        return;
      }
      setStatusMessage(publicRotateErrorMessageForCode(outcome.status, outcome.code));
    } catch {
      setStatusMessage(
        'Não foi possível confirmar o resultado. Por segurança, verifique se as credenciais foram rotacionadas antes de tentar novamente.',
      );
    } finally {
      body.connectionId = '';
      setIsSubmitting(false);
    }
  };

  // FASE 21B — mesma restrição do backend (`hookcloud-rotate-credentials`,
  // REQUIRED_ROLES exclusivo de super_admin): esconder este botão para
  // quem não é super_admin NÃO é a proteção real (o backend já rejeita
  // de forma independente), mas evita oferecer uma ação que sempre
  // resultaria em 403 e evita expor a existência do fluxo de rotação a
  // um papel que nunca deveria vê-lo. Hooks acima continuam sendo
  // chamados incondicionalmente (regra de hooks do React) — para
  // qualquer usuário sem acesso, `formOpen`/`result` nunca saem de seus
  // valores iniciais, então esses hooks permanecem inertes.
  if (!isSuperAdmin()) return null;

  return (
    <>
      {/* Defesa adicional (além do overlay do modal, que já bloqueia
          ponteiro sobre este botão enquanto um segredo está visível):
          nunca inicia uma segunda rotação enquanto a anterior ainda não
          foi confirmada como salva. */}
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setFormOpen(true)} disabled={isSensitive}>
        <RefreshCw className="h-3.5 w-3.5" />
        Rotacionar credenciais
      </Button>

      <Dialog open={formOpen} onOpenChange={(open) => { if (!open && !isSubmitting) setFormOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rotacionar credenciais HookCloud</DialogTitle>
            <DialogDescription>
              Gera um callback secret e/ou verify token novos para esta conexão. O(s) valor(es) anterior(es) é
              (são) invalidado(s) imediatamente. A conexão volta para "pendente" até uma nova verificação.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Use isto somente se você perdeu o callback URL ou o verify token antes de configurá-los no painel
                HookCloud. Rotacionar não envia mensagens nem altera a UazAPI.
              </AlertDescription>
            </Alert>

            <div className="flex items-center gap-2">
              <Checkbox id="rotate-callback" checked={rotateCallback} onCheckedChange={(v) => setRotateCallback(v === true)} disabled={isSubmitting} />
              <Label htmlFor="rotate-callback" className="text-sm font-normal">Callback secret (URL de callback)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="rotate-verify" checked={rotateVerify} onCheckedChange={(v) => setRotateVerify(v === true)} disabled={isSubmitting} />
              <Label htmlFor="rotate-verify" className="text-sm font-normal">Verify token</Label>
            </div>

            {statusMessage && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{statusMessage}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={isSubmitting}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Rotacionando…' : 'Rotacionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HookCloudSecretRevealModal
        result={result ? buildRotateRevealContent(result) : null}
        onClose={() => setResult(null)}
      />
    </>
  );
}
