import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, Save, Phone, Clock, Bell, AlertTriangle, Send, Sparkles,
  Crown, Package, History, Check, Smartphone,
} from 'lucide-react';
import { useAutoNotificationSettings, useSaveAutoNotificationSettings } from '@/hooks/useAutoNotificationSettings';
import { useAuth } from '@/hooks/useAuth';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Database as DatabaseIcon, ShieldCheck } from 'lucide-react';

const DOW_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const KPI_OPTIONS = [
  { id: 'leads_created', label: 'Leads criados' },
  { id: 'conversions', label: 'Conversões' },
  { id: 'pipeline_total', label: 'Pipeline total' },
  { id: 'meetings', label: 'Reuniões' },
  { id: 'overdue_tasks', label: 'Tarefas em atraso' },
  { id: 'top_sellers', label: 'Top vendedores' },
];

// Data sources the admin agent can consult via read-only tools.
// Each one maps to a tool in admin-agent-handle-inbound and can be turned off
// to restrict what the agent is allowed to look at.
const ADMIN_DATA_SOURCES = [
  { id: 'get_pipeline_summary', label: 'Pipeline e deals abertos', description: 'Estágios, valores em aberto, distribuição' },
  { id: 'get_inbox_status', label: 'Inbox e conversas', description: 'Conversas ativas e sem atendimento' },
  { id: 'get_team_status', label: 'Equipe e status', description: 'Vendedores online/offline e carga de leads' },
  { id: 'get_tasks_overview', label: 'Tarefas pendentes', description: 'Tarefas vencidas e em andamento' },
  { id: 'get_bookings', label: 'Reuniões e agendamentos', description: 'Eventos do calendário' },
  { id: 'get_financial_summary', label: 'Financeiro e comissões', description: 'Receita, comissões pendentes, previsões' },
  { id: 'get_goals_progress', label: 'Metas e performance', description: 'Progresso individual e da equipe' },
  { id: 'get_agent_logs', label: 'Logs dos agentes IA', description: 'Erros e ações recentes dos agentes' },
];

function normalizePhoneInput(raw: string): string {
  let p = raw.replace(/\D/g, '');
  if (p.length >= 10 && p.length <= 11) p = '55' + p;
  return p;
}

interface AdminExecutivePanelProps {
  /** Compact mode shrinks paddings and hides header — used inside AgentEditor */
  compact?: boolean;
}

export function AdminExecutivePanel({ compact = false }: AdminExecutivePanelProps) {
  const { profile } = useAuth();
  const { data: settings, isLoading } = useAutoNotificationSettings();
  const { data: products } = useProducts();
  const saveSettings = useSaveAutoNotificationSettings();

  const { data: admins } = useQuery({
    queryKey: ['org-admins', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('organization_id', profile.organization_id)
        .in('id', ids);
      return profs ?? [];
    },
    enabled: !!profile?.organization_id,
  });

  // Recent admin messages (drawer)
  const { data: recentMessages, refetch: refetchMessages } = useQuery({
    queryKey: ['admin-agent-recent-messages', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data } = await supabase
        .from('admin_agent_messages')
        .select('id, direction, message_type, content, created_at, alert_kind')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!profile?.organization_id,
  });

  // WhatsApp connections (Evolution instances) for this org
  const { data: instances } = useQuery({
    queryKey: ['evolution-instances-for-admin', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data } = await supabase
        .from('evolution_instances')
        .select('id, name, status, is_default, phone_number')
        .eq('organization_id', profile.organization_id)
        .order('is_default', { ascending: false });
      return data ?? [];
    },
    enabled: !!profile?.organization_id,
  });

  const queryClient = useQueryClient();

  // Default global admin agent for this org — used to persist data-source toggles
  // in its `tool_configs.allowed_sources` (no schema change needed).
  const { data: adminAgent } = useQuery({
    queryKey: ['default-admin-agent', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;
      const { data } = await supabase
        .from('product_agents')
        .select('id, tool_configs')
        .eq('organization_id', profile.organization_id)
        .eq('agent_type', 'admin')
        .is('product_id', null)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!profile?.organization_id,
  });

  const allowedSources: string[] = (() => {
    const fromCfg = (adminAgent?.tool_configs as any)?.allowed_sources;
    // Default: all enabled when not explicitly set
    if (!Array.isArray(fromCfg)) return ADMIN_DATA_SOURCES.map((s) => s.id);
    return fromCfg as string[];
  })();

  const toggleDataSource = async (sourceId: string) => {
    if (!adminAgent?.id) {
      toast.error('Crie/ative o Agente Admin antes de configurar fontes.');
      return;
    }
    const next = allowedSources.includes(sourceId)
      ? allowedSources.filter((id) => id !== sourceId)
      : [...allowedSources, sourceId];
    const currentConfigs = (adminAgent.tool_configs ?? {}) as Record<string, unknown>;
    const newToolConfigs = {
      ...currentConfigs,
      allowed_sources: next,
    };
    const { error } = await supabase
      .from('product_agents')
      .update({ tool_configs: newToolConfigs as any })
      .eq('id', adminAgent.id);
    if (error) {
      toast.error('Falha ao salvar permissão: ' + error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['default-admin-agent', profile?.organization_id] });
  };

  const [form, setForm] = useState({
    admin_agent_enabled: false,
    admin_whatsapp_number: '',
    admin_user_id: '',
    monitored_product_ids: [] as string[],
    summary_kpis: ['leads_created', 'conversions', 'pipeline_total', 'meetings', 'overdue_tasks', 'top_sellers'],
    daily_summary_enabled: true,
    daily_summary_hour: 8,
    weekly_report_enabled: true,
    weekly_report_dow: 1,
    weekly_report_hour: 8,
    weekly_include_comparison: true,
    realtime_alerts_enabled: true,
    alert_high_value_threshold: 10000,
    alert_unattended_minutes: 15,
    alert_offline_minutes: 30,
    alert_agent_error_threshold: 3,
    alert_meeting_changes: true,
    alert_goal_achieved: true,
    alert_product_volume_spike: false,
    alert_product_volume_spike_pct: 50,
    alert_critical_product_idle_hours: 24,
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [testing, setTesting] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');

  useEffect(() => {
    if (settings) {
      setForm({
        admin_agent_enabled: settings.admin_agent_enabled ?? false,
        admin_whatsapp_number: settings.admin_whatsapp_number ?? '',
        admin_user_id: settings.admin_user_id ?? '',
        monitored_product_ids: settings.monitored_product_ids ?? [],
        summary_kpis: settings.summary_kpis ?? ['leads_created', 'conversions', 'pipeline_total', 'meetings', 'overdue_tasks', 'top_sellers'],
        daily_summary_enabled: settings.daily_summary_enabled ?? true,
        daily_summary_hour: settings.daily_summary_hour ?? 8,
        weekly_report_enabled: settings.weekly_report_enabled ?? true,
        weekly_report_dow: settings.weekly_report_dow ?? 1,
        weekly_report_hour: settings.weekly_report_hour ?? 8,
        weekly_include_comparison: settings.weekly_include_comparison ?? true,
        realtime_alerts_enabled: settings.realtime_alerts_enabled ?? true,
        alert_high_value_threshold: settings.alert_high_value_threshold ?? 10000,
        alert_unattended_minutes: settings.alert_unattended_minutes ?? 15,
        alert_offline_minutes: settings.alert_offline_minutes ?? 30,
        alert_agent_error_threshold: settings.alert_agent_error_threshold ?? 3,
        alert_meeting_changes: settings.alert_meeting_changes ?? true,
        alert_goal_achieved: settings.alert_goal_achieved ?? true,
        alert_product_volume_spike: settings.alert_product_volume_spike ?? false,
        alert_product_volume_spike_pct: settings.alert_product_volume_spike_pct ?? 50,
        alert_critical_product_idle_hours: settings.alert_critical_product_idle_hours ?? 24,
      });
    }
  }, [settings]);

  const update = (k: string, v: any) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    setHasChanges(true);
  };

  const toggleProduct = (productId: string) => {
    const current = form.monitored_product_ids;
    const next = current.includes(productId)
      ? current.filter((id) => id !== productId)
      : [...current, productId];
    update('monitored_product_ids', next);
  };

  const toggleKpi = (kpi: string) => {
    const current = form.summary_kpis;
    const next = current.includes(kpi)
      ? current.filter((k) => k !== kpi)
      : [...current, kpi];
    update('summary_kpis', next);
  };

  const handleSave = async () => {
    const payload = {
      ...form,
      admin_whatsapp_number: form.admin_whatsapp_number
        ? normalizePhoneInput(form.admin_whatsapp_number)
        : null,
      admin_user_id: form.admin_user_id || null,
      monitored_product_ids: form.monitored_product_ids.length ? form.monitored_product_ids : null,
    };
    await saveSettings.mutateAsync(payload);
    setHasChanges(false);
  };

  const handleTest = async () => {
    if (!form.admin_whatsapp_number) {
      toast.error('Cadastre um WhatsApp antes de testar');
      return;
    }
    // Pick instance: explicit selection > first connected > first
    const connected = (instances ?? []).filter((i: any) => i.status === 'connected');
    const fallbackInstanceId =
      selectedInstanceId ||
      (connected[0]?.id) ||
      (instances ?? [])[0]?.id ||
      '';
    if (!fallbackInstanceId) {
      toast.error('Nenhuma conexão WhatsApp cadastrada para esta empresa');
      return;
    }
    const chosen = (instances ?? []).find((i: any) => i.id === fallbackInstanceId);
    if (chosen && chosen.status !== 'connected') {
      toast.error(`Conexão "${chosen.name}" não está conectada (status: ${chosen.status}). Reconecte ou escolha outra.`);
      return;
    }
    setTesting(true);
    try {
      const phone = normalizePhoneInput(form.admin_whatsapp_number);
      const { error } = await supabase.functions.invoke('admin-agent-handle-inbound', {
        body: {
          organization_id: profile?.organization_id,
          message: 'Me mande um resumo de teste com os dados de hoje.',
          phone,
          instance_id: fallbackInstanceId,
        },
      });
      if (error) throw error;
      toast.success(`Mensagem enviada via "${chosen?.name ?? 'conexão'}" — confira seu WhatsApp.`);
    } catch (e: any) {
      toast.error('Falha ao enviar teste: ' + (e?.message ?? 'erro'));
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const disabled = !form.admin_agent_enabled;

  return (
    <div className={cn('space-y-6', compact && 'space-y-4')}>
      {!compact && (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              Agente Admin Executivo
              <Badge variant="secondary" className="ml-2 text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                IA
              </Badge>
            </h3>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Assistente IA exclusivo do administrador. Tudo configurado dentro do próprio agente.
            </p>
          </div>
        </div>
      )}

      {/* Master switch + identificação */}
      <Card className="border-primary/20 ring-1 ring-primary/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Crown className="h-4 w-4 text-primary" />
                Este é o Agente Executivo da organização
              </CardTitle>
              <CardDescription>
                Quando ativo, o agente envia resumos e responde apenas ao número configurado abaixo.
              </CardDescription>
            </div>
            <Switch
              checked={form.admin_agent_enabled}
              onCheckedChange={(v) => update('admin_agent_enabled', v)}
            />
          </div>
        </CardHeader>
        {form.admin_agent_enabled && (
          <CardContent className="space-y-4 pt-0">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  WhatsApp do administrador
                </Label>
                <Input
                  placeholder="(11) 99999-9999"
                  value={form.admin_whatsapp_number}
                  onChange={(e) => update('admin_whatsapp_number', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Apenas mensagens deste número são tratadas como admin. DDI 55 é adicionado automaticamente.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Vincular ao usuário admin</Label>
                <Select value={form.admin_user_id || 'none'} onValueChange={(v) => update('admin_user_id', v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Não vincular —</SelectItem>
                    {(admins ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.full_name || a.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Produtos sob acompanhamento */}
            <div className="space-y-2 pt-2">
              <Label className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Produtos sob acompanhamento
              </Label>
              <p className="text-xs text-muted-foreground">
                Selecione quais produtos o agente deve vigiar. Vazio = todos os produtos da organização.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(products ?? []).length === 0 && (
                  <span className="text-xs text-muted-foreground italic">Nenhum produto cadastrado.</span>
                )}
                {(products ?? []).map((p) => {
                  const active = form.monitored_product_ids.includes(p.id);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => toggleProduct(p.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors',
                        active
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'bg-muted/40 border-border hover:border-primary/40 text-muted-foreground'
                      )}
                    >
                      {active && <Check className="h-3 w-3" />}
                      <Package className="h-3 w-3" />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {form.admin_agent_enabled && (
        <>
          {/* Permissões de leitura — controle do que o agente pode consultar */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    Fontes de dados consultadas
                    <Badge variant="outline" className="text-[10px]">
                      <DatabaseIcon className="h-3 w-3 mr-1" />
                      somente leitura
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Controle exatamente o que o Agente Admin pode olhar. Desligue uma fonte e ele não terá acesso a esses dados.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {!adminAgent && (
                <p className="text-xs text-muted-foreground italic">
                  Crie um agente do tipo Administrativo para configurar as fontes.
                </p>
              )}
              {adminAgent && ADMIN_DATA_SOURCES.map((src) => {
                const enabled = allowedSources.includes(src.id);
                return (
                  <div
                    key={src.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-muted/40 border border-border"
                  >
                    <div className="min-w-0 flex-1">
                      <Label className="text-sm font-medium cursor-pointer">{src.label}</Label>
                      <p className="text-xs text-muted-foreground">{src.description}</p>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={() => toggleDataSource(src.id)}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Resumo Diário */}
          <Card className={cn(disabled && 'opacity-50 pointer-events-none')}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Resumo Diário</CardTitle>
                    <CardDescription>KPIs do dia anterior, todo dia de manhã</CardDescription>
                  </div>
                </div>
                <Switch
                  checked={form.daily_summary_enabled}
                  onCheckedChange={(v) => update('daily_summary_enabled', v)}
                />
              </div>
            </CardHeader>
            {form.daily_summary_enabled && (
              <CardContent className="pt-0 space-y-4">
                <div className="flex items-center gap-3 pl-12 flex-wrap">
                  <Label className="text-sm text-muted-foreground">Enviar às</Label>
                  <Select value={String(form.daily_summary_hour)} onValueChange={(v) => update('daily_summary_hour', parseInt(v))}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label className="text-sm text-muted-foreground">(horário de Brasília)</Label>
                </div>

                <div className="pl-12 space-y-2">
                  <Label className="text-sm">KPIs incluídos</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {KPI_OPTIONS.map((k) => {
                      const active = form.summary_kpis.includes(k.id);
                      return (
                        <button
                          type="button"
                          key={k.id}
                          onClick={() => toggleKpi(k.id)}
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors',
                            active
                              ? 'bg-primary/10 border-primary/40 text-primary'
                              : 'bg-muted/40 border-border hover:border-primary/40 text-muted-foreground'
                          )}
                        >
                          {active && <Check className="h-3 w-3" />}
                          {k.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Relatório Semanal */}
          <Card className={cn(disabled && 'opacity-50 pointer-events-none')}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/40">
                    <Bell className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Relatório Semanal</CardTitle>
                    <CardDescription>Comparativo da semana atual vs. semana anterior</CardDescription>
                  </div>
                </div>
                <Switch
                  checked={form.weekly_report_enabled}
                  onCheckedChange={(v) => update('weekly_report_enabled', v)}
                />
              </div>
            </CardHeader>
            {form.weekly_report_enabled && (
              <CardContent className="pt-0 space-y-3">
                <div className="flex items-center gap-3 pl-12 flex-wrap">
                  <Label className="text-sm text-muted-foreground">Toda</Label>
                  <Select value={String(form.weekly_report_dow)} onValueChange={(v) => update('weekly_report_dow', parseInt(v))}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOW_LABELS.map((d, i) => (
                        <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label className="text-sm text-muted-foreground">às</Label>
                  <Select value={String(form.weekly_report_hour)} onValueChange={(v) => update('weekly_report_hour', parseInt(v))}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between pl-12">
                  <Label className="text-sm">Incluir comparativo vs. semana anterior</Label>
                  <Switch
                    checked={form.weekly_include_comparison}
                    onCheckedChange={(v) => update('weekly_include_comparison', v)}
                  />
                </div>
              </CardContent>
            )}
          </Card>

          {/* Alertas em Tempo Real */}
          <Card className={cn(disabled && 'opacity-50 pointer-events-none')}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Alertas em Tempo Real</CardTitle>
                    <CardDescription>Notificações imediatas quando triggers disparam</CardDescription>
                  </div>
                </div>
                <Switch
                  checked={form.realtime_alerts_enabled}
                  onCheckedChange={(v) => update('realtime_alerts_enabled', v)}
                />
              </div>
            </CardHeader>
            {form.realtime_alerts_enabled && (
              <CardContent className="pt-0 space-y-4">
                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <Label className="text-sm font-medium">Lead de alto valor entra no pipeline</Label>
                      <p className="text-xs text-muted-foreground">Alertar quando deal_value ≥ valor abaixo</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">R$</span>
                      <Input
                        type="number"
                        className="w-32"
                        value={form.alert_high_value_threshold}
                        onChange={(e) => update('alert_high_value_threshold', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <Label className="text-sm font-medium">Conversa sem atendimento</Label>
                      <p className="text-xs text-muted-foreground">Alertar após X minutos sem resposta</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="w-24"
                        value={form.alert_unattended_minutes}
                        onChange={(e) => update('alert_unattended_minutes', parseInt(e.target.value) || 0)}
                      />
                      <span className="text-sm text-muted-foreground">min</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <Label className="text-sm font-medium">Vendedor offline em horário comercial</Label>
                      <p className="text-xs text-muted-foreground">Alertar após X minutos offline (8h-18h, dias úteis)</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="w-24"
                        value={form.alert_offline_minutes}
                        onChange={(e) => update('alert_offline_minutes', parseInt(e.target.value) || 0)}
                      />
                      <span className="text-sm text-muted-foreground">min</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <Label className="text-sm font-medium">Erros consecutivos em agente IA</Label>
                      <p className="text-xs text-muted-foreground">Alertar quando um agente acumular X falhas em 30min</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="w-24"
                        value={form.alert_agent_error_threshold}
                        onChange={(e) => update('alert_agent_error_threshold', parseInt(e.target.value) || 0)}
                      />
                      <span className="text-sm text-muted-foreground">erros</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-sm font-medium">Reuniões confirmadas/canceladas</Label>
                      <p className="text-xs text-muted-foreground">Notificar quando o status de uma reunião muda</p>
                    </div>
                    <Switch
                      checked={form.alert_meeting_changes}
                      onCheckedChange={(v) => update('alert_meeting_changes', v)}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-sm font-medium">Meta atingida</Label>
                      <p className="text-xs text-muted-foreground">Notificar quando vendedor bater a meta do período</p>
                    </div>
                    <Switch
                      checked={form.alert_goal_achieved}
                      onCheckedChange={(v) => update('alert_goal_achieved', v)}
                    />
                  </div>

                  <Separator />

                  {/* NOVO: pico de leads em produto */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <Label className="text-sm font-medium">Pico de leads em produto específico</Label>
                      <p className="text-xs text-muted-foreground">Alertar quando volume &gt; X% acima da média</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={form.alert_product_volume_spike}
                        onCheckedChange={(v) => update('alert_product_volume_spike', v)}
                      />
                      {form.alert_product_volume_spike && (
                        <>
                          <Input
                            type="number"
                            className="w-20"
                            value={form.alert_product_volume_spike_pct}
                            onChange={(e) => update('alert_product_volume_spike_pct', parseInt(e.target.value) || 0)}
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* NOVO: lead crítico parado */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <Label className="text-sm font-medium">Lead de produto crítico parado</Label>
                      <p className="text-xs text-muted-foreground">Alertar quando lead vigiado fica parado por X horas</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="w-20"
                        value={form.alert_critical_product_idle_hours}
                        onChange={(e) => update('alert_critical_product_idle_hours', parseInt(e.target.value) || 0)}
                      />
                      <span className="text-sm text-muted-foreground">h</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        </>
      )}

      {/* Footer actions */}
      <div className="space-y-3 pt-2 border-t">
        {form.admin_agent_enabled && (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-sm">
              <Smartphone className="h-4 w-4" />
              Conexão WhatsApp para o disparo
            </Label>
            <Select
              value={selectedInstanceId || 'auto'}
              onValueChange={(v) => setSelectedInstanceId(v === 'auto' ? '' : v)}
            >
              <SelectTrigger className="w-full sm:w-[420px]">
                <SelectValue placeholder="Selecione uma conexão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  Automático (preferir conexão conectada)
                </SelectItem>
                {(instances ?? []).map((i: any) => (
                  <SelectItem key={i.id} value={i.id}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          i.status === 'connected' ? 'bg-primary' : 'bg-muted-foreground/50'
                        )}
                      />
                      {i.name}
                      {i.phone_number && (
                        <span className="text-xs text-muted-foreground">
                          · {i.phone_number}
                        </span>
                      )}
                      {i.is_default && (
                        <Badge variant="outline" className="ml-1 text-[10px] h-4 px-1">
                          padrão
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-1">
                        ({i.status})
                      </span>
                    </span>
                  </SelectItem>
                ))}
                {(instances ?? []).length === 0 && (
                  <SelectItem value="none" disabled>
                    Nenhuma conexão cadastrada
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Você verá apenas conexões desta empresa. O agente responde sempre por essa conexão.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSave} disabled={!hasChanges || saveSettings.isPending}>
            {saveSettings.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar configurações
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing || !form.admin_agent_enabled}>
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar mensagem de teste
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" onClick={() => refetchMessages()}>
                <History className="h-4 w-4 mr-2" />
                Últimas mensagens
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-lg">
              <SheetHeader>
                <SheetTitle>Últimas mensagens enviadas pelo Agente Admin</SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-4">
                <div className="space-y-3">
                  {(recentMessages ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground italic">Nenhuma mensagem registrada ainda.</p>
                  )}
                  {(recentMessages ?? []).map((m: any) => (
                    <div
                      key={m.id}
                      className={cn(
                        'rounded-lg border p-3 text-sm',
                        m.direction === 'outbound'
                          ? 'bg-primary/5 border-primary/20'
                          : 'bg-muted/30 border-border'
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-[10px]">
                          {m.direction === 'outbound' ? '→ Enviada' : '← Recebida'} · {m.message_type}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(m.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-foreground/90">{m.content}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
}
