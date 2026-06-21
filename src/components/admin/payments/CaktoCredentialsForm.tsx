import { useEffect, useState } from 'react';
import { useCaktoCredentials, useDisconnectCakto, useSaveCaktoCredentials, useTestCaktoConnection, type CaktoScope } from '@/hooks/useCaktoCredentials';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertCircle, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CaktoLogo } from '@/components/ui/integrations/CaktoLogo';

interface Props {
  scope: CaktoScope;
  webhookUrl: string;
}

const ALL_SCOPES = ['read', 'write', 'orders', 'products', 'offers'];

export function CaktoCredentialsForm({ scope, webhookUrl }: Props) {
  const { data: cred, isLoading } = useCaktoCredentials(scope);
  const save = useSaveCaktoCredentials(scope);
  const test = useTestCaktoConnection(scope);
  const disconnect = useDisconnectCakto(scope);

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read', 'orders', 'products']);
  const [webhookSecret, setWebhookSecret] = useState('');

  useEffect(() => {
    if (cred) {
      setClientId(cred.client_id ?? '');
      setScopes(cred.scopes?.length ? cred.scopes : ['read', 'orders', 'products']);
    }
  }, [cred]);

  const toggleScope = (s: string) => {
    setScopes((prev) => (prev.includes(s) ? prev.filter((p) => p !== s) : [...prev, s]));
  };

  const handleSave = async () => {
    try {
      const result: any = await save.mutateAsync({
        client_id: clientId.trim(),
        client_secret: clientSecret || undefined,
        scopes,
        webhook_secret: webhookSecret || undefined,
      });
      setClientSecret('');
      setWebhookSecret('');
      if (result?.test?.ok) {
        toast.success(`Credenciais salvas e conexão validada (escopos: ${result.test.scope ?? '—'})`);
      } else if (result?.test?.error) {
        toast.error(`Salvo, mas a conexão falhou: ${result.test.error}`);
      } else {
        toast.success('Credenciais salvas');
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao salvar');
    }
  };

  const handleTest = async () => {
    try {
      const r = await test.mutateAsync();
      if (r.ok) toast.success(`Conectado (escopos: ${r.scope})`);
      else toast.error(r.error ?? 'Falha na conexão');
    } catch (e: any) {
      toast.error(e.message ?? 'Erro');
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Desconectar a conta Cakto?')) return;
    try {
      await disconnect.mutateAsync();
      setClientId('');
      toast.success('Desconectado');
    } catch (e: any) {
      toast.error(e.message ?? 'Erro');
    }
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('URL copiada');
  };

  const status = cred?.connection_status ?? 'disconnected';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <CaktoLogo iconOnly />
            <div>
              <CardTitle>Conta Cakto</CardTitle>
              <CardDescription>
                Conecte sua conta Cakto para {scope === 'platform' ? 'receber pagamentos das empresas' : 'monitorar suas vendas'}.{' '}
                <a href="https://docs.cakto.com.br/authentication" target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                  Ver documentação <ExternalLink className="h-3 w-3" />
                </a>
              </CardDescription>
            </div>
          </div>
          <StatusBadge status={status} />
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Client ID</Label>
                  <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="abc123xyz789" />
                </div>
                <div>
                  <Label>Client Secret {cred?.has_secret ? <span className="text-xs text-muted-foreground">(salvo: {cred.client_secret_masked})</span> : null}</Label>
                  <Input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder={cred?.has_secret ? 'Deixe em branco para manter' : 'secret_...'}
                  />
                </div>
              </div>

              <div>
                <Label>Escopos</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {ALL_SCOPES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleScope(s)}
                      className={`px-3 py-1 rounded-full text-xs border transition ${
                        scopes.includes(s)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {cred?.last_error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{cred.last_error}</span>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSave} disabled={save.isPending || !clientId}>
                  {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar
                </Button>
                <Button variant="outline" onClick={handleTest} disabled={test.isPending || !cred?.has_secret}>
                  {test.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Testar conexão
                </Button>
                {cred && (
                  <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDisconnect}>
                    Desconectar
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook</CardTitle>
          <CardDescription>
            Cole esta URL no painel Cakto para receber atualizações de pedidos em tempo real. Configure também um segredo abaixo para validar os webhooks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copyWebhook}><Copy className="h-4 w-4" /></Button>
          </div>
          <div>
            <Label>Webhook secret {cred?.webhook_secret_set ? <span className="text-xs text-muted-foreground">(definido)</span> : null}</Label>
            <Input
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={cred?.webhook_secret_set ? 'Deixe em branco para manter' : 'um valor secreto qualquer'}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Adicione <code className="px-1 rounded bg-muted">?secret=SEU_SEGREDO</code> ao final da URL do webhook na Cakto.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'connected') return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"><CheckCircle2 className="h-3 w-3 mr-1" /> Conectado</Badge>;
  if (status === 'error') return <Badge className="bg-destructive/10 text-destructive border-destructive/20"><XCircle className="h-3 w-3 mr-1" /> Erro</Badge>;
  return <Badge variant="outline"><AlertCircle className="h-3 w-3 mr-1" /> Desconectado</Badge>;
}
