import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCaktoRecoveryConfig,
  useSaveCaktoRecoveryConfig,
  useCaktoRecoveryDispatches,
  type CaktoRecoveryConfig,
} from '@/hooks/useCaktoRecoveryConfig';
import { useAllAgents } from '@/hooks/useProductAgents';
import { Loader2, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PostSaleScenariosEditor } from './PostSaleScenariosEditor';

export function CaktoRecoveryPanel() {
  const { data: config, isLoading } = useCaktoRecoveryConfig();
  const { data: agents } = useAllAgents();
  const save = useSaveCaktoRecoveryConfig();
  const { data: dispatches } = useCaktoRecoveryDispatches(20);

  const [draft, setDraft] = useState<CaktoRecoveryConfig | null>(null);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  if (isLoading || !draft) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const update = <K extends keyof CaktoRecoveryConfig>(
    key: K,
    value: CaktoRecoveryConfig[K],
  ) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const handleSave = () => save.mutate(draft);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Recuperação Automática de Vendas</CardTitle>
              <CardDescription className="mt-1">
                Quando a Cakto enviar um evento (Pix gerado, pagamento, reembolso),
                o agente escolhido envia uma mensagem no WhatsApp do cliente — sem
                você precisar fazer nada.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="enabled" className="text-sm">
                {draft.is_enabled ? 'Ativo' : 'Desligado'}
              </Label>
              <Switch
                id="enabled"
                checked={draft.is_enabled}
                onCheckedChange={(v) => update('is_enabled', v)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Agente responsável pela recuperação</Label>
            <Select
              value={draft.recovery_agent_id ?? ''}
              onValueChange={(v) => update('recovery_agent_id', v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um agente" />
              </SelectTrigger>
              <SelectContent>
                {(agents ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                    {a.product?.name ? ` — ${a.product.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Recomendamos criar um agente dedicado em <b>Cérebro IA → Agentes</b>{' '}
              com prompt de recuperação (vamos te ajudar com o template).
            </p>
          </div>

          <div className="space-y-3">
            <Label>Quais eventos disparam o agente?</Label>
            <div className="space-y-3 rounded-lg border p-4">
              <ToggleRow
                title="Checkout abandonado"
                description="Cliente gerou Pix/boleto mas ainda não pagou. Recupera carrinho abandonado."
                checked={draft.trigger_on_abandoned}
                onChange={(v) => update('trigger_on_abandoned', v)}
              />
              <ToggleRow
                title="Pagamento confirmado"
                description="Cliente pagou. Mensagem de boas-vindas, próximo passo e upsell."
                checked={draft.trigger_on_paid}
                onChange={(v) => update('trigger_on_paid', v)}
              />
              <ToggleRow
                title="Reembolso / Chargeback"
                description="Cliente pediu reembolso. Tenta entender, recuperar a relação e propor alternativa."
                checked={draft.trigger_on_refunded}
                onChange={(v) => update('trigger_on_refunded', v)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cooldown">Cooldown (minutos)</Label>
              <Input
                id="cooldown"
                type="number"
                min={1}
                value={draft.cooldown_minutes}
                onChange={(e) =>
                  update('cooldown_minutes', Number(e.target.value) || 60)
                }
              />
              <p className="text-xs text-muted-foreground">
                Não envia o mesmo tipo de mensagem pro mesmo cliente nesse intervalo.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delay">Atraso antes de disparar (segundos)</Label>
              <Input
                id="delay"
                type="number"
                min={0}
                value={draft.delay_seconds}
                onChange={(e) =>
                  update('delay_seconds', Number(e.target.value) || 0)
                }
              />
              <p className="text-xs text-muted-foreground">
                Use 0 para envio imediato (recomendado para Pix).
              </p>
            </div>
          </div>

          {!draft.recovery_agent_id && draft.is_enabled && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 text-yellow-600" />
              <span>
                Selecione um agente antes de ativar. Sem agente, o sistema não
                envia nada.
              </span>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={save.isPending}>
              {save.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar configuração
            </Button>
          </div>
        </CardContent>
      </Card>

      <PostSaleScenariosEditor />

      <Card>
        <CardHeader>
          <CardTitle>Últimos disparos</CardTitle>
          <CardDescription>
            Histórico das mensagens enviadas automaticamente pela recuperação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!dispatches || dispatches.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum disparo ainda. Quando a Cakto enviar um evento, ele aparecerá aqui.
            </p>
          ) : (
            <div className="space-y-2">
              {dispatches.map((d: any) => (
                <div
                  key={d.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
                >
                  <div className="flex items-start gap-2">
                    {d.success ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 text-red-600" />
                    )}
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{d.cakto_event}</Badge>
                        {d.cakto_status && (
                          <span className="text-xs text-muted-foreground">
                            {d.cakto_status}
                          </span>
                        )}
                        {d.skipped_reason && (
                          <Badge variant="secondary" className="text-xs">
                            pulado: {d.skipped_reason}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {d.customer_phone || d.customer_email || 'sem contato'}
                      </div>
                      {d.message_sent && (
                        <div className="mt-1 max-w-xl truncate text-xs">
                          “{d.message_sent.slice(0, 140)}
                          {d.message_sent.length > 140 ? '…' : ''}”
                        </div>
                      )}
                      {d.error_message && (
                        <div className="mt-1 text-xs text-red-600">
                          {d.error_message}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(d.created_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
