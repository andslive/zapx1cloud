import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Bot, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

interface HumanizationSettings {
  ai_grouping_enabled: boolean;
  ai_grouping_window_ms: number;
  ai_grouping_max_ms: number;
  ai_typing_min_ms: number;
  ai_typing_max_ms: number;
  ai_dedup_enabled: boolean;
  ai_dedup_window_ms: number;
  ai_single_processing_per_conversation: boolean;
  presence_enabled: boolean;
  presence_recording_enabled: boolean;
  presence_typing_chars_per_sec: number;
  presence_jitter_pct: number;
}

const DEFAULTS: HumanizationSettings = {
  ai_grouping_enabled: true,
  ai_grouping_window_ms: 3000,
  ai_grouping_max_ms: 8000,
  ai_typing_min_ms: 1500,
  ai_typing_max_ms: 7000,
  ai_dedup_enabled: true,
  ai_dedup_window_ms: 120000,
  ai_single_processing_per_conversation: true,
  presence_enabled: true,
  presence_recording_enabled: true,
  presence_typing_chars_per_sec: 28,
  presence_jitter_pct: 15,
};

export function WhatsAppHumanizationSettings() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['org-humanization', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select(
          'ai_grouping_enabled, ai_grouping_window_ms, ai_grouping_max_ms, ai_typing_min_ms, ai_typing_max_ms, ai_dedup_enabled, ai_dedup_window_ms, ai_single_processing_per_conversation, presence_enabled, presence_recording_enabled, presence_typing_chars_per_sec, presence_jitter_pct'
        )
        .eq('id', orgId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? DEFAULTS) as HumanizationSettings;
    },
  });

  const [form, setForm] = useState<HumanizationSettings>(DEFAULTS);
  useEffect(() => {
    if (data) setForm({ ...DEFAULTS, ...data });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('Sem organização');
      const payload = {
        ...form,
        ai_grouping_window_ms: clamp(form.ai_grouping_window_ms, 0, 8000),
        ai_grouping_max_ms: clamp(form.ai_grouping_max_ms, 2000, 8000),
        ai_typing_min_ms: clamp(form.ai_typing_min_ms, 0, 15000),
        ai_typing_max_ms: clamp(form.ai_typing_max_ms, 500, 30000),
        ai_dedup_window_ms: clamp(form.ai_dedup_window_ms, 5000, 600000),
      };
      const { error } = await supabase.from('organizations').update(payload).eq('id', orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-humanization'] });
      toast({ title: 'Configurações salvas' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const update = <K extends keyof HumanizationSettings>(k: K, v: HumanizationSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-4 w-4" /> Humanização do WhatsApp (IA)
        </CardTitle>
        <CardDescription>
          Controle como a IA agrupa, responde e evita repetir mensagens. Valores altos pioram a
          experiência do cliente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <>
            <Section
              title="Agrupar mensagens recebidas"
              hint="Espera curta antes de responder, para juntar mensagens do cliente em uma única resposta."
            >
              <Toggle
                label="Ativar agrupamento"
                checked={form.ai_grouping_enabled}
                onChange={(v) => update('ai_grouping_enabled', v)}
              />
              <Pair>
                <Field
                  label="Janela de agrupamento (ms)"
                  hint="Padrão 3000 ms. Recomendado: 2000–4000."
                  value={form.ai_grouping_window_ms}
                  onChange={(v) => update('ai_grouping_window_ms', v)}
                  min={0}
                  max={8000}
                />
                <Field
                  label="Tempo máximo de espera (ms)"
                  hint="Limite absoluto. Padrão 8000 ms."
                  value={form.ai_grouping_max_ms}
                  onChange={(v) => update('ai_grouping_max_ms', v)}
                  min={2000}
                  max={8000}
                />
              </Pair>
            </Section>

            <Section
              title="Indicador de digitação"
              hint="Tempo simulado de 'digitando...' antes de cada balão."
            >
              <Pair>
                <Field
                  label="Mínimo (ms)"
                  value={form.ai_typing_min_ms}
                  onChange={(v) => update('ai_typing_min_ms', v)}
                  min={0}
                  max={15000}
                />
                <Field
                  label="Máximo (ms)"
                  value={form.ai_typing_max_ms}
                  onChange={(v) => update('ai_typing_max_ms', v)}
                  min={500}
                  max={30000}
                />
              </Pair>
            </Section>

            <Section
              title="Presença real no WhatsApp"
              hint="Dispara o status de 'digitando...' e 'gravando áudio...' que aparece no celular do cliente, em tempo real (via Evolution Go)."
            >
              <Toggle
                label="Mostrar 'digitando...' real"
                checked={form.presence_enabled}
                onChange={(v) => update('presence_enabled', v)}
              />
              <Toggle
                label="Mostrar 'gravando áudio...' quando IA enviar áudio"
                checked={form.presence_recording_enabled}
                onChange={(v) => update('presence_recording_enabled', v)}
              />
              <Pair>
                <Field
                  label="Velocidade de digitação (chars/s)"
                  hint="Padrão 28. Quanto maior, mais rápido digita."
                  value={form.presence_typing_chars_per_sec}
                  onChange={(v) => update('presence_typing_chars_per_sec', v)}
                  min={5}
                  max={120}
                />
                <Field
                  label="Variação aleatória (%)"
                  hint="Padrão 15%. Adiciona naturalidade."
                  value={form.presence_jitter_pct}
                  onChange={(v) => update('presence_jitter_pct', v)}
                  min={0}
                  max={60}
                />
              </Pair>
            </Section>

            <Section
              title="Anti-duplicação de respostas"
              hint="Bloqueia o envio de respostas idênticas para a mesma conversa em uma janela de tempo."
            >
              <Toggle
                label="Ativar anti-duplicação"
                checked={form.ai_dedup_enabled}
                onChange={(v) => update('ai_dedup_enabled', v)}
              />
              <Field
                label="Janela anti-duplicação (ms)"
                hint="Padrão 120000 ms (2 minutos)."
                value={form.ai_dedup_window_ms}
                onChange={(v) => update('ai_dedup_window_ms', v)}
                min={5000}
                max={600000}
              />
            </Section>

            <Section
              title="Trava por conversa"
              hint="Garante que apenas uma execução de IA por conversa rode por vez. Recomendado manter ligado."
            >
              <Toggle
                label="Processamento único por conversa"
                checked={form.ai_single_processing_per_conversation}
                onChange={(v) => update('ai_single_processing_per_conversation', v)}
              />
            </Section>

            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar configurações
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-b border-border last:border-0 pb-5 last:pb-0">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Pair({ children }: { children: React.ReactNode }) {
  return <div className="grid sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({
  label,
  hint,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border p-3">
      <Label className="text-sm font-normal cursor-pointer">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
