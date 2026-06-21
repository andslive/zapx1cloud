import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Copy,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useHotmartCredentials,
  useUpsertHotmartCredentials,
  useTestHotmartConnection,
  useHotmartProductMappings,
  useUpdateHotmartProductMapping,
  useSyncHotmartOrders,
  useHotmartOrders,
} from '@/hooks/useHotmart';
import { useProducts } from '@/hooks/useProducts';

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;

const HOTMART_EVENTS = [
  { key: 'PURCHASE_APPROVED', label: 'Compra aprovada', tag: 'Cliente' },
  { key: 'PURCHASE_BILLET_PRINTED', label: 'Boleto impresso', tag: 'Boleto Gerado' },
  { key: 'PURCHASE_OUT_OF_SHOPPING_CART', label: 'Carrinho abandonado', tag: 'Checkout Abandonado' },
  { key: 'PURCHASE_REFUNDED', label: 'Reembolso', tag: 'Reembolso' },
  { key: 'PURCHASE_CHARGEBACK', label: 'Chargeback', tag: 'Reembolso' },
  { key: 'PURCHASE_PROTEST', label: 'Disputa', tag: 'Reembolso' },
  { key: 'SUBSCRIPTION_CANCELLATION', label: 'Cancelamento de assinatura', tag: '—' },
];

export function HotmartConfigManager() {
  const { data: cred, isLoading } = useHotmartCredentials();
  const upsert = useUpsertHotmartCredentials();
  const test = useTestHotmartConnection();
  const { data: mappings = [] } = useHotmartProductMappings();
  const updateMapping = useUpdateHotmartProductMapping();
  const sync = useSyncHotmartOrders();
  const { data: orders = [] } = useHotmartOrders(20);
  const { data: products = [] } = useProducts();

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [basicToken, setBasicToken] = useState('');
  const [hottok, setHottok] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [showBasic, setShowBasic] = useState(false);

  useEffect(() => {
    if (cred) {
      setClientId(cred.client_id ?? '');
      setClientSecret(cred.client_secret ?? '');
      setBasicToken(cred.basic_token ?? '');
      setHottok(cred.hottok ?? '');
    }
  }, [cred]);

  const webhookUrl = cred?.organization_id
    ? `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/hotmart-webhook?org=${cred.organization_id}`
    : '';

  const handleSave = async () => {
    await upsert.mutateAsync({
      client_id: clientId.trim() || null,
      client_secret: clientSecret.trim() || null,
      basic_token: basicToken.trim() || null,
      hottok: hottok.trim() || null,
    });
  };

  const handleTest = async () => {
    await test.mutateAsync({
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      basic_token: basicToken.trim(),
    });
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('URL copiada');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Hotmart
            {cred?.is_active ? (
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle className="h-3 w-3 mr-1" /> Conectado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                <AlertCircle className="h-3 w-3 mr-1" /> Não conectado
              </Badge>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            Receba vendas, PIX, boletos e reembolsos automaticamente no CRM
          </p>
        </div>
        <a
          href="https://developers.hotmart.com/docs/pt-BR/"
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <Tabs defaultValue="credentials" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="credentials">Credenciais</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
          <TabsTrigger value="products">Produtos</TabsTrigger>
        </TabsList>

        {/* CREDENCIAIS */}
        <TabsContent value="credentials" className="space-y-4">
          <Alert>
            <AlertTitle>Onde encontrar?</AlertTitle>
            <AlertDescription className="text-sm">
              Acesse <strong>Hotmart → Ferramentas → Credenciais Hotmart</strong>, crie uma nova credencial e copie os 3
              campos abaixo.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <div>
              <Label htmlFor="client-id">Client ID</Label>
              <Input
                id="client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="ex: 1a2b3c4d-..."
              />
            </div>

            <div>
              <Label htmlFor="client-secret">Client Secret</Label>
              <div className="relative">
                <Input
                  id="client-secret"
                  type={showSecret ? 'text' : 'password'}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Cole o Client Secret"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="basic-token">Basic Token</Label>
              <div className="relative">
                <Input
                  id="basic-token"
                  type={showBasic ? 'text' : 'password'}
                  value={basicToken}
                  onChange={(e) => setBasicToken(e.target.value)}
                  placeholder="Cole o Basic Token (sem 'Basic ')"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                  onClick={() => setShowBasic(!showBasic)}
                >
                  {showBasic ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar credenciais
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={test.isPending}>
              {test.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Testar conexão
            </Button>
          </div>

          {cred?.last_verified_at && (
            <p className="text-xs text-muted-foreground">
              Última verificação: {new Date(cred.last_verified_at).toLocaleString('pt-BR')}
            </p>
          )}
        </TabsContent>

        {/* WEBHOOK */}
        <TabsContent value="webhook" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">URL do Postback</CardTitle>
              <CardDescription>
                Cole esta URL em <strong>Hotmart → Ferramentas → Notificações (Postback) → Nova URL</strong>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={copyWebhook} disabled={!webhookUrl}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <div>
            <Label htmlFor="hottok">Hottok (token de validação)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              A Hotmart gera o Hottok no painel do postback. Cole aqui para validar a autenticidade dos eventos.
            </p>
            <Input
              id="hottok"
              value={hottok}
              onChange={(e) => setHottok(e.target.value)}
              placeholder="Cole o Hottok"
            />
            <Button
              size="sm"
              className="mt-2"
              onClick={() => upsert.mutate({ hottok: hottok.trim() || null })}
              disabled={upsert.isPending}
            >
              Salvar Hottok
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Eventos para ativar na Hotmart</CardTitle>
              <CardDescription>
                Marque os eventos abaixo no postback para que apareçam aqui automaticamente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {HOTMART_EVENTS.map((ev) => (
                  <div
                    key={ev.key}
                    className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0"
                  >
                    <div>
                      <span className="font-medium">{ev.label}</span>
                      <code className="ml-2 text-xs text-muted-foreground">{ev.key}</code>
                    </div>
                    {ev.tag !== '—' && (
                      <Badge variant="secondary" className="text-xs">
                        Aplica tag: {ev.tag}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Sincronizar histórico</p>
              <p className="text-xs text-muted-foreground">Importa vendas dos últimos 30 dias via API</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => sync.mutate(30)} disabled={sync.isPending}>
              {sync.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sincronizar agora
            </Button>
          </div>

          {orders.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Últimos pedidos recebidos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {orders.slice(0, 10).map((o) => (
                    <div key={o.id} className="flex items-center justify-between text-xs border-b last:border-0 py-1">
                      <span className="truncate max-w-[200px]">{o.buyer_email || o.buyer_name || o.transaction_id}</span>
                      <Badge variant="outline" className="text-xs">{o.status}</Badge>
                      <span className="text-muted-foreground">
                        {o.amount ? `R$ ${Number(o.amount).toFixed(2)}` : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* MAPEAMENTO DE PRODUTOS */}
        <TabsContent value="products" className="space-y-4">
          <Alert>
            <AlertDescription className="text-sm">
              Vincule cada produto da Hotmart a um produto interno do CRM. Produtos aparecem aqui automaticamente quando
              recebemos a primeira venda.
            </AlertDescription>
          </Alert>

          {mappings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum produto Hotmart recebido ainda. Configure o webhook para começar.
            </p>
          ) : (
            <div className="space-y-2">
              {mappings.map((m) => (
                <Card key={m.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {m.hotmart_product_name || 'Produto sem nome'}
                        </p>
                        <p className="text-xs text-muted-foreground">ID Hotmart: {m.hotmart_product_id}</p>
                      </div>
                      <Select
                        value={m.product_id ?? 'none'}
                        onValueChange={(v) =>
                          updateMapping.mutate({ id: m.id, productId: v === 'none' ? null : v })
                        }
                      >
                        <SelectTrigger className="w-[220px]">
                          <SelectValue placeholder="Vincular a produto..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Não vinculado —</SelectItem>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
