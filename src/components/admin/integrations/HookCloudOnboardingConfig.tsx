// FASE 18A — onboarding manual HookCloud (interface administrativa).
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

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Facebook, Eye, EyeOff, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  buildHookCloudProvisionRequestBody,
  classifyProvisionInvokeResult,
  hasFieldErrors,
  publicErrorMessageForCode,
  validateHookCloudOnboardingForm,
  type FieldErrors,
  type HookCloudOnboardingFormValues,
  type HookCloudProvisionSuccess,
} from '@/lib/hookcloud/hookcloudProvisioning';
import { HookCloudSecretRevealModal } from './HookCloudSecretRevealModal';

const EMPTY_VALUES: HookCloudOnboardingFormValues = {
  connectionName: '',
  wabaId: '',
  phoneNumberId: '',
  displayPhoneNumber: '',
  accessToken: '',
};

type SubmitStatus = 'idle' | 'unexpected_response' | 'not_pending' | 'network_or_timeout' | 'http_error';

export function HookCloudOnboardingConfig() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<HookCloudOnboardingFormValues>(EMPTY_VALUES);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [successResult, setSuccessResult] = useState<HookCloudProvisionSuccess | null>(null);

  // Guarda adicional contra clique duplo, além do próprio `disabled` do
  // botão (que já é suficiente na prática, mas um ref síncrono elimina
  // qualquer janela entre dois eventos de clique muito próximos, antes
  // mesmo do re-render que desabilitaria o botão).
  const submittingRef = useRef(false);

  const mutation = useMutation({
    // Nunca retry automático: o provisionamento é atômico no backend, mas
    // a RESPOSTA pode se perder (rede/timeout) depois do commit — um
    // retry automático poderia, na pior hipótese, confundir o
    // administrador sobre o que já foi criado. Ver Parte 5 do relatório.
    retry: false,
    mutationFn: async (body: Record<string, string>) => {
      const { data, error } = await supabase.functions.invoke('hookcloud-provision-connection', { body });
      return classifyProvisionInvokeResult(data, error);
    },
    onSuccess: (outcome) => {
      submittingRef.current = false;
      if (outcome.kind === 'success') {
        setStatus('idle');
        setSuccessResult(outcome.data);
        // Limpa o token do formulário imediatamente após o sucesso —
        // nunca reaproveitado, nunca reapresentado.
        setValues(EMPTY_VALUES);
        queryClient.invalidateQueries({ queryKey: ['all-integration-settings'] });
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
    },
    onError: () => {
      submittingRef.current = false;
      // Falha inesperada do próprio cliente (ex.: exceção síncrona) —
      // mesmo tratamento de rede/timeout: nunca "falhou" categórico.
      setStatus('network_or_timeout');
      setStatusMessage(
        'Não foi possível confirmar o resultado. Por segurança, verifique se uma conexão pendente foi criada antes de tentar novamente.',
      );
    },
  });

  const handleChange = (field: keyof HookCloudOnboardingFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    if (fieldErrors[field]) setFieldErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || mutation.isPending) return; // uma requisição por submissão

    const errors = validateHookCloudOnboardingForm(values);
    if (hasFieldErrors(errors)) {
      setFieldErrors(errors);
      return;
    }

    submittingRef.current = true;
    setStatus('idle');
    setStatusMessage('');
    mutation.mutate(buildHookCloudProvisionRequestBody(values));
  };

  const isSubmitting = mutation.isPending;

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
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}
                  tabIndex={-1}
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
                Nunca solicitamos o App Secret da Meta. O verify token de callback é gerado automaticamente.
              </p>
            </div>

            {status !== 'idle' && (
              <Alert variant={status === 'network_or_timeout' ? 'default' : 'destructive'}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{statusMessage}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={isSubmitting} className="gap-2">
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
