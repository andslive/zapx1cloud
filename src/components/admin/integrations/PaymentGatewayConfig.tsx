import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, HelpCircle, Loader2, Copy, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  usePaymentGatewayAccounts,
  useSavePaymentGatewayAccount,
  useSetPaymentGatewayEnabled,
  useTestPaymentGatewayAccount,
  type ConnectionTestResult,
  type GatewayEnvironment,
  type GatewayProvider,
  type PaymentGatewayAccount,
} from '@/hooks/usePaymentGateways';

const COPY: Record<GatewayProvider, { title: string; method: string; webhookSteps: string[] }> = {
  colocapay: {
    title: 'ColocaPay — SPEI (MXN)',
    method: 'SPEI / MEX / MXN',
    webhookSteps: [
      'Defina no painel da ColocaPay o webhook de organização apontando para a URL abaixo.',
      'O valor do x-secret é você quem define: informe-o no campo "Segredo do webhook" e salve antes de pedir o teste de conexão do painel (test/ping).',
    ],
  },
  leonapay: {
    title: 'LeonaPay — OXXO (MXN)',
    method: 'OXXO / MXN',
    webhookSteps: [
      'Crie o webhook no painel da LeonaPay (ou via API) com a URL abaixo e os eventos de pagamento (pago, falhou, expirou, pendente).',
      'O segredo whsec_… aparece uma única vez, na criação: copie-o e cole em "Segredo do webhook" aqui logo em seguida.',
    ],
  },
};

function CopyUrl({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={value} className="font-mono text-xs" />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Copiar URL do webhook"
        onClick={() => {
          navigator.clipboard.writeText(value);
          toast.success('URL copiada');
        }}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

function TestResult({ result }: { result: ConnectionTestResult }) {
  const row = (ok: boolean | null, label: string, detail?: string) => (
    <div className="flex items-start gap-2 text-sm">
      {ok === true ? (
        <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-500" />
      ) : ok === false ? (
        <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
      ) : (
        <HelpCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
      )}
      <div>
        <span className="font-medium">{label}</span>
        {detail && <p className="text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="gateway-test-result">
      {row(
        result.credential_accepted,
        result.credential_accepted ? 'Credencial aceita' : 'Credencial não aceita',
        result.credential_accepted ? undefined : result.detail,
      )}
      {result.credential_accepted &&
        row(
          result.method_available,
          result.method_available === true
            ? 'Método disponível para esta conta'
            : result.method_available === false
              ? 'Método indisponível para esta conta'
              : 'Disponibilidade não avaliada',
          result.detail,
        )}
      {result.limits && (result.limits.min !== undefined || result.limits.max !== undefined) && (
        <p className="text-xs text-muted-foreground">
          Limites informados: {result.limits.min ?? '—'} a {result.limits.max ?? '—'}
        </p>
      )}
      {result.credential_accepted && result.parser_confidence !== 'matched' && (
        <p className="text-xs text-amber-600">
          A resposta do gateway foi interpretada de forma aproximada; confirme no painel do provedor.
        </p>
      )}
      <p className="text-xs text-muted-foreground">Verificado em {new Date(result.checked_at).toLocaleString()}</p>
    </div>
  );
}

function AccountForm({
  provider,
  account,
  help,
  onDone,
}: {
  provider: GatewayProvider;
  account?: PaymentGatewayAccount;
  help: { apiKey: string; webhookSecret: string };
  onDone: () => void;
}) {
  const save = useSavePaymentGatewayAccount();
  const test = useTestPaymentGatewayAccount();
  const setEnabled = useSetPaymentGatewayEnabled();
  const [label, setLabel] = useState(account?.label ?? '');
  const [environment, setEnvironment] = useState<GatewayEnvironment>(account?.environment ?? 'sandbox');
  const [apiKey, setApiKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [savedId, setSavedId] = useState<string | undefined>(account?.id);
  const [url, setUrl] = useState(account?.webhook_url);
  const [result, setResult] = useState<ConnectionTestResult | null>(account?.last_test_result ?? null);
  const copy = COPY[provider];

  const doSave = async () => {
    try {
      const { account: saved } = await save.mutateAsync({
        id: savedId,
        provider,
        label,
        environment,
        api_key: apiKey || undefined,
        webhook_secret: webhookSecret || undefined,
      });
      setSavedId(saved.id);
      setUrl(saved.webhook_url);
      // Segredo digitado sai do estado do formulário assim que foi guardado no Vault.
      setApiKey('');
      setWebhookSecret('');
      toast.success('Conta salva');
      return saved.id;
    } catch (e) {
      toast.error((e as Error).message);
      return undefined;
    }
  };

  const doTest = async () => {
    const id = savedId ?? (await doSave());
    if (!id) return;
    try {
      const r = await test.mutateAsync(id);
      setResult(r.result);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="gw-label">Nome da conta</Label>
          <Input id="gw-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: México — sandbox" />
        </div>
        <div className="space-y-1.5">
          <Label>Ambiente</Label>
          <Select value={environment} onValueChange={(v) => setEnvironment(v as GatewayEnvironment)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">{provider === 'colocapay' ? 'QA (sandbox)' : 'Sandbox'}</SelectItem>
              <SelectItem value="production">Produção</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {environment === 'production' && (
        <Alert variant="destructive">
          <AlertTitle>Ambiente de produção</AlertTitle>
          <AlertDescription>Cobranças criadas com esta conta são reais. Use sandbox para testes.</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="gw-key">API key</Label>
        <Input
          id="gw-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={account?.api_key_masked ?? 'Cole a chave'}
        />
        <p className="text-xs text-muted-foreground">{help.apiKey}</p>
        {account?.api_key_masked && (
          <p className="text-xs text-muted-foreground">Em branco mantém a chave atual ({account.api_key_masked}).</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gw-wh">Segredo do webhook</Label>
        <Input
          id="gw-wh"
          type="password"
          autoComplete="off"
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
          placeholder={account?.webhook_secret_masked ?? 'Cadastre após criar o webhook no provedor'}
        />
        <p className="text-xs text-muted-foreground">{help.webhookSecret}</p>
      </div>

      {url ? (
        <div className="space-y-1.5">
          <Label>URL do webhook para o painel do gateway</Label>
          <CopyUrl value={url} />
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            {copy.webhookSteps.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">A URL do webhook aparece depois de salvar a conta.</p>
      )}

      {result && <TestResult result={result} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={doSave} disabled={save.isPending || !label.trim() || (!savedId && !apiKey)}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
        </Button>
        <Button variant="outline" onClick={doTest} disabled={test.isPending || (!savedId && !apiKey)}>
          {test.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Testar conexão
        </Button>
        <Button variant="ghost" onClick={onDone}>Fechar</Button>
        {savedId && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <Switch
              checked={account?.enabled ?? false}
              disabled={setEnabled.isPending}
              onCheckedChange={(v) => setEnabled.mutate({ id: savedId, enabled: v })}
            />
            Conta ativa
          </label>
        )}
      </div>
    </div>
  );
}

export function PaymentGatewayConfig({ provider }: { provider: GatewayProvider }) {
  const { data, isLoading, error } = usePaymentGatewayAccounts();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const copy = COPY[provider];
  const accounts = (data?.accounts ?? []).filter((a) => a.provider === provider);
  const help = data?.catalog.find((c) => c.provider === provider)?.credential_help ?? { apiKey: '', webhookSecret: '' };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (error) return <Alert variant="destructive"><AlertDescription>{(error as Error).message}</AlertDescription></Alert>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>
            Meio habilitado neste piloto: {copy.method}. As credenciais ficam no Vault e nunca são exibidas depois de salvas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {accounts.length === 0 && editing !== 'new' && (
            <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada.</p>
          )}
          {accounts.map((a) => (
            <div key={a.id} className="rounded-md border p-3">
              {editing === a.id ? (
                <AccountForm provider={provider} account={a} help={help} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.label}</span>
                  <Badge variant="outline">{a.environment === 'production' ? 'Produção' : 'Sandbox'}</Badge>
                  <Badge variant={a.enabled ? 'default' : 'secondary'}>{a.enabled ? 'Ativa' : 'Inativa'}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{a.api_key_masked}</span>
                  <Badge variant={a.webhook_secret_set ? 'outline' : 'secondary'}>
                    {a.webhook_secret_set ? 'Webhook configurado' : 'Webhook pendente'}
                  </Badge>
                  <Button className="ml-auto" size="sm" variant="outline" onClick={() => setEditing(a.id)}>Editar</Button>
                </div>
              )}
            </div>
          ))}
          {editing === 'new' ? (
            <div className="rounded-md border p-3">
              <AccountForm provider={provider} help={help} onDone={() => setEditing(null)} />
            </div>
          ) : (
            <Button variant="outline" onClick={() => setEditing('new')}>
              <Plus className="mr-2 h-4 w-4" />Nova conta
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
