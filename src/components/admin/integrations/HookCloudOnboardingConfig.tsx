// FASE 18A/18B — onboarding manual HookCloud (interface administrativa).
//
// Chama exclusivamente `hookcloud-provision-connection` (já implantada,
// auditada nas Fases 13A/13B/16A/16B/17A). Nunca chama a RPC diretamente,
// nunca chama a Graph API, nunca usa a chave de service role (o cliente
// `supabase` do frontend só tem a chave publicável — `apikey`/JWT da
// sessão são anexados automaticamente pelo SDK em `functions.invoke`).
//
// Este componente NUNCA envia `organizationId`, `provider` ou
// `onboardingSource` — ver `buildHookCloudProvisionRequestBody`
// (`src/lib/hookcloud/hookcloudProvisioning.ts`), que define o corpo
// exato e é testado para nunca incluir esses campos.
//
// Fase 18B, achados 1-3 (revisão independente do PR #20) — mudanças
// deliberadas nesta versão:
//   1) NÃO usa `useMutation`: `variables` de uma mutation do React Query
//      ficam retidas em memória pelo próprio observer (e potencialmente
//      inspecionáveis via devtools) mesmo com `retry:false` — o Meta
//      Access Token nunca deve passar por essa camada. A chamada é um
//      `async` local simples, com o corpo (incluindo o token) só como
//      variável de função, nunca em estado gerenciado pelo React Query.
//   2) o campo `accessToken` é apagado do estado do formulário ANTES do
//      `await` (logo após montar o corpo da requisição) — nunca só no
//      caminho de sucesso. Uma nova tentativa sempre exige que o
//      token seja colado novamente.
//   3) o componente comunica ao pai (`IntegrationConfigDrawer` →
//      `IntegrationsManager`, dono do estado do drawer) um lifecycle
//      NÃO sensível (`HookCloudSensitiveLifecycle`) via
//      `onSensitiveLifecycleChange` — nunca o segredo em si — para que o
//      drawer possa recusar fechar/trocar de item enquanto uma
//      submissão está em andamento ou um segredo ainda não foi
//      confirmado como salvo.

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Facebook, Eye, EyeOff, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useHookCloudPilotAccess } from '@/hooks/useHookCloudPilotAccess';
import {
  buildHookCloudProvisionRequestBody,
  classifyProvisionInvokeResult,
  hasFieldErrors,
  HOOKCLOUD_PROVISION_TIMEOUT_MS,
  publicErrorMessageForCode,
  validateHookCloudOnboardingForm,
  type FieldErrors,
  type HookCloudOnboardingFormValues,
  type HookCloudProvisionSuccess,
  type HookCloudSensitiveLifecycle,
} from '@/lib/hookcloud/hookcloudProvisioning';
import { getHookCloudCallbackExpectedOrigin } from '@/lib/hookcloud/hookcloudRuntimeConfig';
import { HookCloudSecretRevealModal } from './HookCloudSecretRevealModal';

const EMPTY_VALUES: HookCloudOnboardingFormValues = {
  connectionName: '',
  wabaId: '',
  phoneNumberId: '',
  displayPhoneNumber: '',
  accessToken: '',
};

type SubmitStatus = 'idle' | 'unexpected_response' | 'not_pending' | 'network_or_timeout' | 'http_error';

interface HookCloudOnboardingConfigProps {
  /** Nunca recebe o segredo em si — só o estado que o dono do drawer precisa para não fechar/trocar de item no momento errado. */
  onSensitiveLifecycleChange?: (state: HookCloudSensitiveLifecycle) => void;
}

export function HookCloudOnboardingConfig({ onSensitiveLifecycleChange }: HookCloudOnboardingConfigProps) {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  // Defesa adicional própria (mesmo padrão já usado em `IntegrationConfigDrawer`
  // para o card técnico Meta): mesmo que o item só entre no catálogo quando a
  // flag está ligada, o formulário revalida por conta própria — cobre o caso
  // de a flag mudar/expirar enquanto o drawer já está aberto.
  const { visible: hookCloudVisible } = useHookCloudPilotAccess();

  const [values, setValues] = useState<HookCloudOnboardingFormValues>(EMPTY_VALUES);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showToken, setShowToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [successResult, setSuccessResult] = useState<HookCloudProvisionSuccess | null>(null);

  // Guarda adicional contra clique duplo, além do próprio `disabled` do
  // botão (que já é suficiente na prática, mas um ref síncrono elimina
  // qualquer janela entre dois eventos de clique muito próximos, antes
  // mesmo do re-render que desabilitaria o botão).
  const submittingRef = useRef(false);

  // Identidade da sessão/organização no momento em que a submissão foi
  // disparada — Fase 18B, verificação adicional: se o usuário fizer
  // logout ou trocar de organização ENQUANTO a requisição está em
  // andamento, o resultado (quando chegar) nunca deve ser exibido nesta
  // tela — trata-se como ambíguo e é simplesmente descartado, nunca
  // mostrado a uma sessão diferente da que a originou.
  const submissionIdentityRef = useRef<{ userId?: string; orgId?: string } | null>(null);

  const lifecycle: HookCloudSensitiveLifecycle = isSubmitting
    ? 'submitting'
    : successResult
      ? 'secret_unacknowledged'
      : 'idle';

  useEffect(() => {
    onSensitiveLifecycleChange?.(lifecycle);
  }, [lifecycle, onSensitiveLifecycleChange]);

  // Logout ou troca de organização: limpa TODO estado sensível
  // imediatamente (token do formulário, segredo pendente de confirmação,
  // status de erro). Nunca deixa um segredo/token na memória de uma
  // sessão que não é mais a atual.
  const identityRef = useRef<{ userId?: string; orgId?: string }>({
    userId: user?.id,
    orgId: profile?.organization_id ?? undefined,
  });
  useEffect(() => {
    const prev = identityRef.current;
    const nextIdentity = { userId: user?.id, orgId: profile?.organization_id ?? undefined };
    const changed = prev.userId !== nextIdentity.userId || prev.orgId !== nextIdentity.orgId;
    identityRef.current = nextIdentity;
    if (changed) {
      setValues(EMPTY_VALUES);
      setFieldErrors({});
      setSuccessResult(null);
      setStatus('idle');
      setStatusMessage('');
      submittingRef.current = false;
      setIsSubmitting(false);
    }
    // Descarta qualquer submissão em voo que pertencia à identidade anterior.
    if (changed) submissionIdentityRef.current = null;
  }, [user?.id, profile?.organization_id]);

  // Proteção genérica contra fechar/recarregar a aba enquanto uma
  // submissão está em andamento ou um segredo ainda não foi confirmado
  // como salvo. Usa a API nativa do navegador (`beforeunload`) — nenhuma
  // dependência nova, nenhum segredo/dado digitado entra na mensagem (o
  // texto do prompt de confirmação é controlado inteiramente pelo
  // navegador, não pelo `returnValue`, em todos os browsers modernos).
  // Isso cobre fechar a aba/recarregar; bloquear navegação SPA (troca de
  // rota via React Router) exigiria um guard de rota — este projeto usa
  // `BrowserRouter` (não o data router `createBrowserRouter`), que não
  // expõe `useBlocker`, e não é justificável adicionar uma dependência
  // nova só para isso. Limitação registrada explicitamente no relatório
  // da Fase 18B: navegação SPA para outra tela não é bloqueada, só o
  // fechamento/recarregamento da aba.
  useEffect(() => {
    if (lifecycle === 'idle') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [lifecycle]);

  const handleChange = (field: keyof HookCloudOnboardingFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    if (fieldErrors[field]) setFieldErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || isSubmitting) return; // uma requisição por submissão

    if (!hookCloudVisible || !user || !profile?.organization_id) {
      setStatus('http_error');
      setStatusMessage('Sua sessão ou permissão para o piloto HookCloud mudou. Atualize a página e tente novamente.');
      return;
    }

    const errors = validateHookCloudOnboardingForm(values);
    if (hasFieldErrors(errors)) {
      setFieldErrors(errors);
      return;
    }

    // Corpo montado UMA VEZ, como variável LOCAL da função — nunca entra
    // em estado do React (mutation cache, query cache ou state
    // componentizado). É a única cópia do token que existirá durante a
    // requisição.
    const body = buildHookCloudProvisionRequestBody(values);
    const submissionIdentity = { userId: user.id, orgId: profile.organization_id };
    submissionIdentityRef.current = submissionIdentity;

    submittingRef.current = true;
    setIsSubmitting(true);
    setStatus('idle');
    setStatusMessage('');
    // Apaga o token do FORMULÁRIO imediatamente, antes do `await` — em
    // qualquer resultado subsequente (sucesso, erro HTTP, rede/timeout,
    // resposta inesperada), o campo já está vazio e nunca é
    // repreenchido automaticamente.
    setValues((v) => ({ ...v, accessToken: '' }));

    try {
      const { data, error } = await supabase.functions.invoke('hookcloud-provision-connection', {
        body,
        timeout: HOOKCLOUD_PROVISION_TIMEOUT_MS,
      });
      const outcome = await classifyProvisionInvokeResult(data, error, getHookCloudCallbackExpectedOrigin());

      // Descarta silenciosamente se a identidade da sessão mudou
      // enquanto a requisição estava em andamento (logout/troca de
      // organização) — nunca exibe o resultado (nem sucesso, nem erro)
      // a uma sessão diferente da que fez a submissão.
      if (submissionIdentityRef.current?.userId !== submissionIdentity.userId
        || submissionIdentityRef.current?.orgId !== submissionIdentity.orgId) {
        return;
      }

      if (outcome.kind === 'success') {
        setStatus('idle');
        setSuccessResult(outcome.data);
        // A lista real de conexões WhatsApp (`WhatsAppInstancesPanel`,
        // tabela `evolution_instances`) é invalidada com escopo exato da
        // organização autenticada — Fase 18B, achado 5: a invalidação
        // anterior (`all-integration-settings`) não correspondia a
        // nenhuma tabela alterada por este provisionamento; nunca
        // invalida a consulta de nenhuma outra organização.
        queryClient.invalidateQueries({ queryKey: ['whatsapp-instances', submissionIdentity.orgId] });
        return;
      }
      if (outcome.kind === 'network_or_timeout') {
        setStatus('network_or_timeout');
        setStatusMessage(
          'Não foi possível confirmar o resultado. Por segurança, verifique se uma conexão pendente foi criada antes de tentar novamente.',
        );
        return;
      }
      if (outcome.kind === 'unexpected_response' || outcome.kind === 'not_pending') {
        setStatus(outcome.kind);
        setStatusMessage(
          'A resposta do servidor não pôde ser confirmada com segurança. Verifique a lista de conexões antes de tentar novamente.',
        );
        return;
      }
      setStatus('http_error');
      setStatusMessage(publicErrorMessageForCode(outcome.status, outcome.code));
    } catch {
      // Falha inesperada do próprio cliente (ex.: exceção síncrona) —
      // mesmo tratamento de rede/timeout: nunca "falhou" categórico.
      if (submissionIdentityRef.current?.userId === submissionIdentity.userId
        && submissionIdentityRef.current?.orgId === submissionIdentity.orgId) {
        setStatus('network_or_timeout');
        setStatusMessage(
          'Não foi possível confirmar o resultado. Por segurança, verifique se uma conexão pendente foi criada antes de tentar novamente.',
        );
      }
    } finally {
      // O objeto `body` não sai mais desta função a partir daqui — sem
      // referência retida em nenhum estado/cache, elegível para coleta
      // de lixo assim que a closure terminar. Defesa adicional: apaga o
      // campo mutável antes de soltar a última referência local.
      body.accessToken = '';
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Facebook className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-lg">HookCloud — WhatsApp Oficial</CardTitle>
                <CardDescription>
                  Conecte um número pela API oficial do WhatsApp (Meta), com configuração assistida pela HookCloud.
                </CardDescription>
              </div>
            </div>
            <Badge variant="secondary">Configuração assistida</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription>
              Esta tela só cria a conexão como <strong>pendente</strong> — nenhuma mensagem pode ser enviada ou
              recebida até que você configure o callback no painel da HookCloud e a conexão seja validada numa
              fase posterior. A UazAPI continua sendo o provedor padrão e não é alterada por esta ação.
            </AlertDescription>
          </Alert>

          {!hookCloudVisible && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                O piloto HookCloud não está mais disponível para sua sessão atual. Atualize a página antes de
                continuar.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="hc-connection-name">Nome da conexão</Label>
              <Input
                id="hc-connection-name"
                value={values.connectionName}
                onChange={handleChange('connectionName')}
                placeholder="Ex.: WhatsApp Loja Centro"
                aria-invalid={!!fieldErrors.connectionName}
                aria-describedby={fieldErrors.connectionName ? 'hc-connection-name-error' : undefined}
                disabled={isSubmitting}
              />
              {fieldErrors.connectionName && (
                <p id="hc-connection-name-error" className="text-xs text-destructive">
                  {fieldErrors.connectionName}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hc-waba-id">WABA ID</Label>
              <Input
                id="hc-waba-id"
                value={values.wabaId}
                onChange={handleChange('wabaId')}
                placeholder="ID da WhatsApp Business Account"
                autoComplete="off"
                aria-invalid={!!fieldErrors.wabaId}
                aria-describedby={fieldErrors.wabaId ? 'hc-waba-id-error' : undefined}
                disabled={isSubmitting}
              />
              {fieldErrors.wabaId && (
                <p id="hc-waba-id-error" className="text-xs text-destructive">
                  {fieldErrors.wabaId}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hc-phone-number-id">Phone Number ID</Label>
              <Input
                id="hc-phone-number-id"
                value={values.phoneNumberId}
                onChange={handleChange('phoneNumberId')}
                placeholder="ID técnico do número (não é o número de telefone)"
                autoComplete="off"
                aria-invalid={!!fieldErrors.phoneNumberId}
                aria-describedby={fieldErrors.phoneNumberId ? 'hc-phone-number-id-error hc-phone-number-id-hint' : 'hc-phone-number-id-hint'}
                disabled={isSubmitting}
              />
              <p id="hc-phone-number-id-hint" className="text-xs text-muted-foreground">
                Disponível no painel HookCloud/Meta, ao lado do número — não é o número de telefone exibido.
              </p>
              {fieldErrors.phoneNumberId && (
                <p id="hc-phone-number-id-error" className="text-xs text-destructive">
                  {fieldErrors.phoneNumberId}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hc-display-phone">Número de telefone</Label>
              <Input
                id="hc-display-phone"
                value={values.displayPhoneNumber}
                onChange={handleChange('displayPhoneNumber')}
                placeholder="+55 11 99999-9999"
                autoComplete="off"
                aria-invalid={!!fieldErrors.displayPhoneNumber}
                aria-describedby={fieldErrors.displayPhoneNumber ? 'hc-display-phone-error' : undefined}
                disabled={isSubmitting}
              />
              {fieldErrors.displayPhoneNumber && (
                <p id="hc-display-phone-error" className="text-xs text-destructive">
                  {fieldErrors.displayPhoneNumber}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hc-access-token">Meta Access Token</Label>
              <div className="relative">
                <Input
                  id="hc-access-token"
                  type={showToken ? 'text' : 'password'}
                  value={values.accessToken}
                  onChange={handleChange('accessToken')}
                  placeholder="Token fornecido pela HookCloud após o Embedded Signup"
                  autoComplete="new-password"
                  className="pr-10"
                  aria-invalid={!!fieldErrors.accessToken}
                  aria-describedby={fieldErrors.accessToken ? 'hc-access-token-error' : undefined}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowToken((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.accessToken && (
                <p id="hc-access-token-error" className="text-xs text-destructive">
                  {fieldErrors.accessToken}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Nunca solicitamos o App Secret da Meta. O verify token de callback é gerado automaticamente. Após
                cada tentativa de envio, este campo é sempre limpo — cole o token novamente para tentar de novo.
              </p>
            </div>

            {status !== 'idle' && (
              <Alert variant={status === 'network_or_timeout' ? 'default' : 'destructive'}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{statusMessage}</AlertDescription>
              </Alert>
            )}

            {/* FASE 18F — desabilitado também durante `secret_unacknowledged`
                (não só `isSubmitting`): defesa em profundidade além do
                overlay do modal, que já bloqueia ponteiro sobre o
                formulário enquanto o segredo não foi confirmado — impede
                um segundo provisionamento mesmo se essa barreira falhar. */}
            <Button type="submit" disabled={isSubmitting || !!successResult || !hookCloudVisible} className="gap-2">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Provisionando…' : 'Provisionar conexão'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <HookCloudSecretRevealModal
        result={successResult}
        onClose={() => setSuccessResult(null)}
      />
    </div>
  );
}
