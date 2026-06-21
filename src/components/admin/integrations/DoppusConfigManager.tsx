import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProducts } from '@/hooks/useProducts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2, AlertCircle, Copy, Loader2, ExternalLink, Eye, EyeOff,
  Plus, Trash2, RefreshCw, XCircle, Webhook,
} from 'lucide-react';
import { toast } from 'sonner';
import { useDoppusWebhookLogs, type DoppusWebhookLog } from '@/hooks/useDoppusWebhookLogs';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const DOPPUS_EVENTS: Array<{ key: string; label: string; tag: string }> = [
  { key: 'compra_aprovada', label: 'Compra aprovada', tag: 'Cliente' },
  { key: 'pix_gerado', label: 'PIX gerado', tag: 'PIX Gerado' },
  { key: 'boleto_gerado', label: 'Boleto gerado', tag: 'Boleto Gerado' },
  { key: 'checkout_abandonado', label: 'Checkout abandonado', tag: 'Checkout Abandonado' },
  { key: 'reembolso', label: 'Reembolso', tag: 'Reembolso' },
  { key: 'chargeback', label: 'Chargeback', tag: 'Reembolso' },
  { key: 'assinatura_cancelada', label: 'Assinatura cancelada', tag: '—' },
];

type DoppusProduct = {
  id: string;
  name: string;
  token: string;
  doppus_product_id: string;
  internal_product_id: string;
};

type DoppusSettings = {
  api_token?: string | null;
  webhook_secret?: string | null;
  product_mapping?: Record<string, string>;
  products?: DoppusProduct[];
};

function genToken() {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '').slice(0, 40);
}

export function DoppusConfigManager() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const supaUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();

  const { data: settingsRow, isLoading } = useQuery({
    queryKey: ['doppus-settings', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('settings, is_configured, last_verified_at')
        .eq('organization_id', orgId!)
        .eq('integration_type', 'doppus')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const settings = (settingsRow?.settings ?? {}) as DoppusSettings;
  const dpProducts: DoppusProduct[] = settings.products ?? [];

  const [apiToken, setApiToken] = useState('');
  useEffect(() => { setApiToken(settings.api_token ?? ''); }, [settingsRow]);

  const saveSettings = useMutation({
    mutationFn: async (next: Partial<DoppusSettings>) => {
      if (!orgId) throw new Error('Organização não identificada');
      const merged = { ...settings, ...next } as DoppusSettings;
      const { error } = await supabase
        .from('integration_settings')
        .upsert(
          {
            organization_id: orgId,
            integration_type: 'doppus',
            settings: merged as any,
            is_configured: !!(merged.products && merged.products.length > 0),
            last_verified_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,integration_type' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doppus-settings', orgId] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Erro ao salvar'),
  });

  const upsertProduct = (next: DoppusProduct) => {
    const list = [...dpProducts];
    const idx = list.findIndex((p) => p.id === next.id);
    if (idx >= 0) list[idx] = next; else list.push(next);
    return saveSettings.mutateAsync({ products: list });
  };
  const removeProduct = (id: string) => {
    const list = dpProducts.filter((p) => p.id !== id);
    return saveSettings.mutateAsync({ products: list });
  };

  const isConnected = dpProducts.length > 0;

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Doppus
            {isConnected ? (
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" /> {dpProducts.length} produto(s)
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                <AlertCircle className="h-3 w-3 mr-1" /> Sem produtos
              </Badge>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            Cadastre cada produto da Doppus, vincule a um produto interno e dispare o pós-venda automaticamente.
          </p>
        </div>
        <a href="https://doppus.com" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <Tabs defaultValue="products" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="events">Eventos</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="advanced">Avançado</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-3">
          <Alert>
            <AlertDescription className="text-sm space-y-1">
              <p><strong>Como conectar:</strong></p>
              <ol className="list-decimal ml-5 space-y-0.5">
                <li>Na Doppus, vá em <em>Postbacks</em> do produto e copie o <strong>Token de Segurança</strong>.</li>
                <li>Cadastre aqui: cole o token, informe o <strong>ID do Produto</strong> da Doppus e escolha o produto interno.</li>
                <li>Na Doppus, no campo "URL para envio dos dados", cole esta URL:
                  <code className="block mt-1 p-1 bg-muted rounded text-xs break-all">
                    {`${supaUrl}/functions/v1/doppus-webhook`}
                  </code>
                </li>
                <li>Selecione todos os eventos acionadores e salve.</li>
              </ol>
              <p className="text-xs text-muted-foreground pt-1">
                A URL é única para todos os produtos. Identificamos o produto pelo <code>items[0].code</code> e validamos o token recebido no header <code>doppus-token</code>.
              </p>
            </AlertDescription>
          </Alert>

          {dpProducts.map((p) => (
            <ProductCard
              key={p.id}
              value={p}
              orgId={orgId!}
              supaUrl={supaUrl}
              internalProducts={products}
              onSave={upsertProduct}
              onRemove={() => removeProduct(p.id)}
              busy={saveSettings.isPending}
            />
          ))}

          <NewProductForm
            orgId={orgId!}
            supaUrl={supaUrl}
            internalProducts={products}
            onSave={upsertProduct}
            busy={saveSettings.isPending}
          />
        </TabsContent>

        <TabsContent value="events" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Eventos suportados</CardTitle>
              <CardDescription>Cada evento dispara as ações de pós-venda do produto interno vinculado.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {DOPPUS_EVENTS.map((ev) => (
                  <div key={ev.key} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                    <div>
                      <span className="font-medium">{ev.label}</span>
                      <code className="ml-2 text-xs text-muted-foreground">{ev.key}</code>
                    </div>
                    {ev.tag !== '—' && (
                      <Badge variant="secondary" className="text-xs">Aplica tag: {ev.tag}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-3">
          <WebhookLogsPanel orgId={orgId!} dpProducts={dpProducts} />
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <div>
            <Label htmlFor="doppus-api-token">API Token (opcional)</Label>
            <p className="text-xs text-muted-foreground mb-1">
              Usado para sincronizar pedidos via API (futuro). Não é necessário para receber webhooks.
            </p>
            <Input
              id="doppus-api-token"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="dpps_..."
            />
            <Button
              size="sm"
              className="mt-2"
              onClick={() => saveSettings.mutate({ api_token: apiToken || null })}
              disabled={saveSettings.isPending}
            >
              Salvar
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Sub-components ----------

function buildWebhook(supaUrl: string, _orgId: string, _token?: string) {
  // URL única e estável. A Doppus envia o produto no payload (items[0].code) e
  // o token no header `doppus-token`; o backend resolve a organização sozinho.
  return `${supaUrl}/functions/v1/doppus-webhook`;
}

function ProductCard({
  value, orgId, supaUrl, internalProducts, onSave, onRemove, busy,
}: {
  value: DoppusProduct;
  orgId: string;
  supaUrl: string;
  internalProducts: Array<{ id: string; name: string }>;
  onSave: (p: DoppusProduct) => Promise<void>;
  onRemove: () => Promise<void>;
  busy: boolean;
}) {
  const [name, setName] = useState(value.name);
  const [doppusId, setDoppusId] = useState(value.doppus_product_id);
  const [token, setToken] = useState(value.token);
  const [internalId, setInternalId] = useState(value.internal_product_id);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    setName(value.name); setDoppusId(value.doppus_product_id);
    setToken(value.token); setInternalId(value.internal_product_id);
  }, [value]);

  const dirty =
    name !== value.name ||
    doppusId !== value.doppus_product_id ||
    token !== value.token ||
    internalId !== value.internal_product_id;

  const url = buildWebhook(supaUrl, orgId, token);

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Assinatura Premium" />
          </div>
          <div>
            <Label>ID do Produto na Doppus</Label>
            <Input value={doppusId} onChange={(e) => setDoppusId(e.target.value)} placeholder="ex.: 85616746" />
          </div>
        </div>

        <div>
          <Label>Token de Segurança (gerado pela Doppus)</Label>
          <div className="relative">
            <Input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="font-mono pr-10"
              placeholder="Cole aqui o token que a Doppus gerou para este produto"
            />
            <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setShowToken(v => !v)}>
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            A Doppus envia este token em cada postback (header) — usamos para identificar o produto.
          </p>
        </div>

        <div>
          <Label>Produto interno do CRM</Label>
          <Select value={internalId || ''} onValueChange={setInternalId}>
            <SelectTrigger><SelectValue placeholder="Selecione o produto interno" /></SelectTrigger>
            <SelectContent>
              {internalProducts.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>URL do Webhook (cole na Doppus)</Label>
          <div className="flex gap-2">
            <Input value={url} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(url); toast.success('URL copiada'); }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => { if (confirm('Remover este produto?')) onRemove(); }}
            disabled={busy}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Remover
          </Button>
          <Button
            size="sm"
            disabled={!dirty || busy || !name || !doppusId || !token || !internalId}
            onClick={async () => {
              await onSave({ id: value.id, name, doppus_product_id: doppusId, token, internal_product_id: internalId });
              toast.success('Produto atualizado');
            }}
          >
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar alterações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NewProductForm({
  orgId, supaUrl, internalProducts, onSave, busy,
}: {
  orgId: string;
  supaUrl: string;
  internalProducts: Array<{ id: string; name: string }>;
  onSave: (p: DoppusProduct) => Promise<void>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [doppusId, setDoppusId] = useState('');
  const [token, setToken] = useState('');
  const [internalId, setInternalId] = useState('');

  const reset = () => { setName(''); setDoppusId(''); setToken(''); setInternalId(''); };
  const valid = name && doppusId && token && internalId;

  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-2" /> Adicionar produto
      </Button>
    );
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Novo produto Doppus</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Doppus" />
          </div>
          <div>
            <Label>ID do Produto na Doppus</Label>
            <Input value={doppusId} onChange={(e) => setDoppusId(e.target.value)} placeholder="ex.: 85616746" />
          </div>
        </div>

        <div>
          <Label>Token de Segurança (gerado pela Doppus)</Label>
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="font-mono"
            placeholder="Cole o token gerado na Doppus"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Vá em Doppus → Postbacks → copie o Token de Segurança do produto e cole aqui.
          </p>
        </div>

        <div>
          <Label>Produto interno do CRM</Label>
          <Select value={internalId} onValueChange={setInternalId}>
            <SelectTrigger><SelectValue placeholder="Selecione o produto interno" /></SelectTrigger>
            <SelectContent>
              {internalProducts.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
          <p className="font-medium">URL do Webhook (após salvar):</p>
          <code className="break-all">{buildWebhook(supaUrl, orgId, token)}</code>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setOpen(false); reset(); }}>Cancelar</Button>
          <Button
            size="sm"
            disabled={!valid || busy}
            onClick={async () => {
              await onSave({
                id: crypto.randomUUID(),
                name, doppus_product_id: doppusId, token, internal_product_id: internalId,
              });
              toast.success('Produto cadastrado');
              setOpen(false); reset();
            }}
          >
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Cadastrar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Webhook Logs Panel ----------

const EVENT_LABEL: Record<string, string> = {
  compra_aprovada: 'Compra aprovada',
  pix_gerado: 'PIX gerado',
  boleto_gerado: 'Boleto gerado',
  checkout_abandonado: 'Checkout abandonado',
  reembolso: 'Reembolso',
  chargeback: 'Chargeback',
  assinatura_cancelada: 'Assinatura cancelada',
  invalid_token: 'Token inválido (rejeitado)',
  unmapped: 'Evento não mapeado',
  mismatch: 'Token x Produto não conferem',
};

function WebhookLogsPanel({ orgId, dpProducts }: { orgId: string; dpProducts: DoppusProduct[] }) {
  const [filterInternalId, setFilterInternalId] = useState<string>('all');
  const internalFilter = filterInternalId === 'all' ? null : filterInternalId;
  const { data: logs = [], isLoading, refetch, isFetching } = useDoppusWebhookLogs(orgId, internalFilter);
  const [selected, setSelected] = useState<DoppusWebhookLog | null>(null);

  return (
    <div className="space-y-3">
      <Alert>
        <Webhook className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Histórico das últimas 50 chamadas recebidas da Doppus para esta organização. Atualiza
          automaticamente a cada 15s.
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-2">
        <Select value={filterInternalId} onValueChange={setFilterInternalId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Filtrar por produto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os produtos</SelectItem>
            {dpProducts.map((p) => (
              <SelectItem key={p.id} value={p.internal_product_id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Atualizar
        </Button>
        <Badge variant="secondary" className="ml-auto">{logs.length} registro(s)</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum webhook recebido ainda.<br />
              Configure a URL do produto na Doppus e dispare um teste.
            </div>
          ) : (
            <div className="divide-y">
              {logs.map((log) => {
                const actions = Array.isArray(log.executed_actions) ? log.executed_actions : [];
                const failed = actions.some((a) => a && a.success === false);
                const ok = actions.length > 0 && !failed;
                return (
                  <button
                    key={log.id}
                    onClick={() => setSelected(log)}
                    className="w-full text-left p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {ok ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          ) : failed ? (
                            <XCircle className="h-4 w-4 text-destructive shrink-0" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                          )}
                          <span className="text-sm font-medium">
                            {EVENT_LABEL[log.event_type] ?? log.event_type}
                          </span>
                          {log.lead && (
                            <span className="text-xs text-muted-foreground truncate">
                              · {log.lead.name || log.lead.email || log.lead.phone}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 ml-6">
                          {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                          {' · '}
                          {actions.length} ação(ões)
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selected ? EVENT_LABEL[selected.event_type] ?? selected.event_type : ''}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                    Ações executadas
                  </p>
                  <div className="space-y-1.5">
                    {(selected.executed_actions ?? []).map((a, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        {a.success ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <code className="text-xs">{a.action}</code>
                          {a.error && (
                            <p className="text-xs text-destructive">{a.error}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                    Dados do evento (variáveis)
                  </p>
                  <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto">
                    {JSON.stringify(
                      Object.fromEntries(
                        Object.entries(selected.event_data ?? {}).filter(([k]) => k !== '__raw'),
                      ),
                      null,
                      2,
                    )}
                  </pre>
                </div>
                {selected.event_data?.__raw && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                      Payload bruto recebido
                    </p>
                    <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto">
                      {JSON.stringify(selected.event_data.__raw, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
