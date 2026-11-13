import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { usePaymentGatewayAccounts, type GatewayProvider } from '@/hooks/usePaymentGateways';
import type { FunnelBlock } from '@/types/funnel';

/** Variáveis `gateway.*` por método. Resolvidas no backend; aqui só documentação e atalho de cópia. */
const VARIABLES: { name: string; desc: string; methods: ('SPEI' | 'OXXO')[] }[] = [
  { name: 'gateway.transaction_id', desc: 'ID externo da cobrança', methods: ['SPEI', 'OXXO'] },
  { name: 'gateway.payment_code', desc: 'CLABE (SPEI) ou referência de pagamento (OXXO). Sempre texto, com todos os dígitos', methods: ['SPEI', 'OXXO'] },
  { name: 'gateway.payment_qrcode', desc: 'URL da imagem do código de barras do voucher (OXXO)', methods: ['OXXO'] },
  { name: 'gateway.payment_link', desc: 'Link de pagamento ou do voucher, se retornado', methods: ['SPEI', 'OXXO'] },
  { name: 'gateway.expires_at', desc: 'Prazo para pagar, se retornado', methods: ['SPEI', 'OXXO'] },
  { name: 'gateway.value', desc: 'Valor solicitado; após a confirmação, o valor efetivamente pago', methods: ['SPEI', 'OXXO'] },
  { name: 'gateway.bank_name', desc: 'Banco destinatário, se retornado', methods: ['SPEI', 'OXXO'] },
  { name: 'gateway.beneficiary', desc: 'Nome do beneficiário, se retornado', methods: ['SPEI', 'OXXO'] },
  { name: 'gateway.erro', desc: 'Código de erro, utilizável em condição ou na saída de falha', methods: ['SPEI', 'OXXO'] },
];

const PROVIDER_LABEL: Record<GatewayProvider, string> = { colocapay: 'ColocaPay', leonapay: 'LeonaPay' };

type Draft = Pick<FunnelBlock['data'],
  | 'gateway_provider' | 'gateway_account_id' | 'charge_currency' | 'amount_mode' | 'amount' | 'method'
  | 'payer_name_mode' | 'payer_name_var' | 'payer_email_mode' | 'payer_email_var' | 'payer_email_domain'
  | 'ask_name_message' | 'ask_email_message'>;

const pickDraft = (d: FunnelBlock['data']): Draft => ({
  gateway_provider: d.gateway_provider, gateway_account_id: d.gateway_account_id, charge_currency: d.charge_currency ?? 'MXN',
  amount_mode: d.amount_mode ?? 'fixed', amount: d.amount ?? '', method: d.method,
  payer_name_mode: d.payer_name_mode ?? 'auto', payer_name_var: d.payer_name_var ?? '',
  payer_email_mode: d.payer_email_mode ?? 'auto', payer_email_var: d.payer_email_var ?? '', payer_email_domain: d.payer_email_domain ?? '',
  ask_name_message: d.ask_name_message ?? '', ask_email_message: d.ask_email_message ?? '',
});

interface Props {
  block: FunnelBlock;
  updateData: (key: string, value: unknown) => void;
  /** Grava vários campos numa única atualização (várias chamadas de updateData em sequência se sobrescrevem). */
  updateMany: (patch: Record<string, unknown>) => void;
}

export function ChargeBlockForm({ block, updateMany }: Props) {
  const { data, isLoading } = usePaymentGatewayAccounts();
  const applied = useMemo(() => pickDraft(block.data), [block.data]);
  const [draft, setDraft] = useState<Draft>(applied);
  const [varsOpen, setVarsOpen] = useState(false);
  useEffect(() => setDraft(applied), [applied]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const catalog = data?.catalog ?? [];
  const accounts = (data?.accounts ?? []).filter((a) => a.enabled);
  const provider = draft.gateway_provider;
  const providerAccounts = accounts.filter((a) => a.provider === provider);
  const entry = catalog.find((c) => c.provider === provider);

  // Moeda filtrada pelo gateway; meios filtrados por gateway + moeda (mesma regra do backend).
  const currencies = useMemo(() => [...new Set((entry?.methods ?? []).map((m) => m.currency))], [entry]);
  const methods = (entry?.methods ?? []).filter((m) => m.currency === draft.charge_currency);
  const selectedMethod = methods.find((m) => m.method === draft.method);
  const amountRequired = selectedMethod ? selectedMethod.requiresAmount : true;

  // Conta única elegível: seleciona sozinha.
  useEffect(() => {
    if (provider && !draft.gateway_account_id && providerAccounts.length === 1) set('gateway_account_id', providerAccounts[0].id);
  }, [provider, providerAccounts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeProvider = (p: GatewayProvider) => {
    // Trocar de gateway limpa o que deixa de valer.
    setDraft((d) => ({ ...d, gateway_provider: p, gateway_account_id: undefined, charge_currency: 'MXN', method: undefined }));
  };
  const changeCurrency = (c: string) => setDraft((d) => ({ ...d, charge_currency: c, method: undefined }));

  const emailApplies = draft.method === 'OXXO';
  const complete = !!provider && !!draft.gateway_account_id && !!draft.method && (!amountRequired || !!draft.amount?.trim());
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);

  const save = () => {
    updateMany({ ...draft });
    toast.success('Cobrança salva no bloco');
  };
  const cancel = () => setDraft(applied);

  if (isLoading) return <p className="text-xs text-muted-foreground">Carregando gateways…</p>;
  const methodVars = VARIABLES.filter((v) => !draft.method || v.methods.includes(draft.method));

  return (
    <div className="space-y-4" data-testid="charge-block-form">
      {/* 1. Gateway e conta */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Gateway</Label>
        <Select value={provider} onValueChange={(v) => changeProvider(v as GatewayProvider)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione o gateway" /></SelectTrigger>
          <SelectContent>
            {catalog.map((c) => (
              <SelectItem key={c.provider} value={c.provider}>
                {PROVIDER_LABEL[c.provider]} — {c.methods.map((m) => `${m.method}/${m.currency}`).join(', ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {provider && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold">Conta do gateway</Label>
          {providerAccounts.length === 0 ? (
            <Alert>
              <AlertDescription className="text-xs">
                Nenhuma conta ativa de {PROVIDER_LABEL[provider]}. Cadastre em{' '}
                <Link to="/admin?tab=integrations" className="underline">Integrações → Pagamentos</Link>.
              </AlertDescription>
            </Alert>
          ) : (
            <Select value={draft.gateway_account_id} onValueChange={(v) => set('gateway_account_id', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
              <SelectContent>
                {providerAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label} ({a.environment === 'production' ? 'Produção' : 'Sandbox'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* 2. Moeda e valor, lado a lado */}
      {provider && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Moeda</Label>
              <Select value={draft.charge_currency} onValueChange={changeCurrency}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Valor</Label>
              <Input
                value={draft.amount ?? ''}
                onChange={(e) => set('amount', e.target.value)}
                placeholder="250.00 ou {{valor}}"
                className="h-8 text-xs font-mono"
                disabled={!amountRequired && draft.amount_mode === 'variable'}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10px]"
              onClick={() => { set('amount_mode', 'variable'); set('amount', '{{valor}}'); }}>
              Inserir variável
            </Button>
            {['valor', 'valorcomprovante'].map((v) => (
              <Badge key={v} variant="outline" className="cursor-pointer text-[9px]"
                onClick={() => { set('amount_mode', 'variable'); set('amount', `{{${v}}}`); }}>
                {'{{'}{v}{'}}'}
              </Badge>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            O valor é resolvido e validado no backend (decimal, até 2 casas).
            {selectedMethod && !selectedMethod.supportsAmountless && ` ${selectedMethod.method} exige valor.`}
          </p>
        </div>
      )}

      {/* 3. Meio de pagamento */}
      {provider && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold">Meio de pagamento</Label>
          <Select value={draft.method} onValueChange={(v) => set('method', v as 'SPEI' | 'OXXO')}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione o meio" /></SelectTrigger>
            <SelectContent>
              {methods.map((m) => <SelectItem key={m.method} value={m.method}>{m.method} ({m.currency})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 4. Dados do pagador */}
      {draft.method && (
        <div className="space-y-3 rounded-md border p-3">
          <Label className="text-xs font-semibold">Dados do pagador</Label>
          <div className="space-y-1">
            <Label className="text-[11px]">Nome</Label>
            <div className="flex gap-2">
              <Select value={draft.payer_name_mode} onValueChange={(v) => set('payer_name_mode', v as 'auto' | 'variable')}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automático</SelectItem>
                  <SelectItem value="variable">Variável</SelectItem>
                </SelectContent>
              </Select>
              {draft.payer_name_mode === 'variable' && (
                <Input value={draft.payer_name_var ?? ''} onChange={(e) => set('payer_name_var', e.target.value)} placeholder="{{nome_completo}}" className="h-8 text-xs font-mono" />
              )}
            </div>
            {draft.payer_name_mode === 'auto' && (
              <p className="text-[10px] text-muted-foreground">Nome do lead → nome de exibição do WhatsApp. Se faltar, o bot pergunta só o nome e retoma a mesma execução.</p>
            )}
          </div>
          {emailApplies && (
            <div className="space-y-1">
              <Label className="text-[11px]">E-mail (exigido pelo OXXO)</Label>
              <div className="flex gap-2">
                <Select value={draft.payer_email_mode} onValueChange={(v) => set('payer_email_mode', v as 'auto' | 'variable' | 'ask')}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automático</SelectItem>
                    <SelectItem value="ask">Perguntar ao lead</SelectItem>
                    <SelectItem value="variable">Variável</SelectItem>
                  </SelectContent>
                </Select>
                {(draft.payer_email_mode === 'auto' || draft.payer_email_mode === 'random') && (
                  <Input value={draft.payer_email_domain ?? ''} onChange={(e) => set('payer_email_domain', e.target.value)} placeholder="gmail.com" className="h-8 text-xs font-mono" />
                )}
                {draft.payer_email_mode === 'variable' && (
                  <Input value={draft.payer_email_var ?? ''} onChange={(e) => set('payer_email_var', e.target.value)} placeholder="{{email}}" className="h-8 text-xs font-mono" />
                )}
              </div>
              {(draft.payer_email_mode === 'auto' || draft.payer_email_mode === 'random') && (
                <p className="text-[10px] text-muted-foreground">Usa o e-mail do lead se existir; senão gera nome.sobrenome + 3 dígitos@domínio (ex.: anderson.silva001@{draft.payer_email_domain || 'gmail.com'}) e não pergunta nada ao lead. O domínio é editável ao lado.</p>
              )}
              {draft.payer_email_mode === 'ask' && (
                <p className="text-[10px] text-muted-foreground">Se o lead não tiver e-mail, o bot pergunta só o e-mail e retoma a mesma execução.</p>
              )}
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-[11px]">Pergunta quando faltar o nome</Label>
            <Input value={draft.ask_name_message ?? ''} onChange={(e) => set('ask_name_message', e.target.value)} placeholder="¿Cuál es tu nombre completo?" className="h-8 text-xs" />
          </div>
          {emailApplies && (
            <div className="space-y-1">
              <Label className="text-[11px]">Pergunta quando faltar o e-mail</Label>
              <Input value={draft.ask_email_message ?? ''} onChange={(e) => set('ask_email_message', e.target.value)} placeholder="¿Cuál es tu correo electrónico?" className="h-8 text-xs" />
            </div>
          )}
        </div>
      )}

      {/* 5. Variáveis após a cobrança */}
      <Collapsible open={varsOpen} onOpenChange={setVarsOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-semibold">
          Variáveis após a cobrança
          <ChevronDown className={`h-4 w-4 transition-transform ${varsOpen ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-1">
          {methodVars.map((v) => (
            <div key={v.name} className="flex items-start gap-2 rounded border p-2">
              <div className="min-w-0 flex-1">
                <code className="text-[11px]">{`{{${v.name}}}`}</code>
                <p className="text-[10px] text-muted-foreground">{v.desc}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={`Copiar ${v.name}`}
                onClick={() => { navigator.clipboard.writeText(`{{${v.name}}}`); toast.success('Variável copiada'); }}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">
            Use no corpo da mensagem e no valor do botão Copiar. As variáveis ficam na execução do funil e não são gravadas no lead.
          </p>
        </CollapsibleContent>
      </Collapsible>

      {/* Rodapé */}
      <div className="flex items-center justify-end gap-2 border-t pt-3">
        {!complete && <span className="mr-auto text-[10px] text-amber-600">Falta: gateway, conta, meio{amountRequired ? ' e valor' : ''}.</span>}
        <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={!dirty}>Cancelar</Button>
        <Button type="button" size="sm" onClick={save} disabled={!dirty || !complete}>Salvar</Button>
      </div>
    </div>
  );
}
