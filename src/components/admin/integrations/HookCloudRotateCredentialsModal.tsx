// FASE 18G — Alternativa B (recuperação segura), explicitamente
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
// Mesmo rigor de segurança de `HookCloudOnboardingConfig.tsx`/
// `HookCloudSecretRevealModal.tsx`:
//   - nunca usa `useMutation` (token/segredo nunca em cache do React
//     Query) — chamada `async` local simples;
//   - nunca envia `organizationId` (backend deriva do perfil);
//   - segredo só existe no estado efêmero deste componente, apagado
//     depois da confirmação explícita ou fechamento autorizado;
//   - fechar o modal de segredo exige confirmação explícita
//     (AlertDialog), igual ao fluxo de provisionamento;
//   - bloqueia navegação interna (`<Link>`/`<a>`) e back/forward do
//     navegador enquanto o segredo não foi confirmado como salvo, e
//     `beforeunload` cobre reload/fechamento de aba — mesmos hooks já
//     testados usados por `IntegrationsManager.tsx`.

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, RefreshCw, ShieldAlert, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
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

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado!`);
  } catch {
    toast.error('Não foi possível copiar. Copie manualmente.');
  }
}

interface HookCloudRotateCredentialsModalProps {
  connectionId: string;
}

export function HookCloudRotateCredentialsModal({ connectionId }: HookCloudRotateCredentialsModalProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [rotateCallback, setRotateCallback] = useState(true);
  const [rotateVerify, setRotateVerify] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [result, setResult] = useState<HookCloudRotateSuccess | null>(null);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

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

  const requestCloseResult = () => setConfirmCloseOpen(true);
  const confirmCloseResult = () => {
    setConfirmCloseOpen(false);
    setResult(null);
  };
  const cancelCloseResult = () => setConfirmCloseOpen(false);

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

      <Dialog open={!!result} onOpenChange={(open) => { if (!open) requestCloseResult(); }}>
        <DialogContent
          className="sm:max-w-lg"
          onEscapeKeyDown={(e) => { e.preventDefault(); requestCloseResult(); }}
          onPointerDownOutside={(e) => { e.preventDefault(); requestCloseResult(); }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Credenciais rotacionadas
            </DialogTitle>
            <DialogDescription>
              Copie agora. Estes valores não serão exibidos novamente pelo CRM.
            </DialogDescription>
          </DialogHeader>

          {result && (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm flex gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <p>
                  O(s) valor(es) anterior(es) já foi(foram) invalidado(s). A conexão está pendente até você
                  configurar estes novos valores no painel HookCloud.
                </p>
              </div>

              {result.callbackUrl && (
                <div className="space-y-1.5">
                  <Label htmlFor="hc-rotate-callback-url">Callback URL</Label>
                  <div className="flex gap-2">
                    <input id="hc-rotate-callback-url" readOnly value={result.callbackUrl} className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono truncate" />
                    <Button type="button" variant="outline" size="icon" aria-label="Copiar Callback URL" onClick={() => copyToClipboard(result.callbackUrl!, 'Callback URL')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {result.verifyToken && (
                <div className="space-y-1.5">
                  <Label htmlFor="hc-rotate-verify-token">Verify token</Label>
                  <div className="flex gap-2">
                    <input id="hc-rotate-verify-token" readOnly value={result.verifyToken} className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono truncate" />
                    <Button type="button" variant="outline" size="icon" aria-label="Copiar Verify Token" onClick={() => copyToClipboard(result.verifyToken!, 'Verify token')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" onClick={requestCloseResult}>Já copiei, fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCloseOpen} onOpenChange={(open) => !open && cancelCloseResult()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você já salvou os novos valores?</AlertDialogTitle>
            <AlertDialogDescription>
              Eles não poderão ser recuperados pelo CRM depois que esta janela for fechada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelCloseResult}>Ainda não</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCloseResult}>Sim, já salvei</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
