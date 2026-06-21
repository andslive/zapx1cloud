import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useActivePlans, type PlatformPlan } from '@/hooks/usePlatformPlans';
import { useOrganizationEffectivePlan } from '@/hooks/useOrganizationPlan';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Check, ArrowUpRight, ArrowDownRight, ArrowRight,
  Star, Crown, Zap, Rocket, Sparkles, Building2, ShieldCheck, Gem,
  Users, Plug, Layers, Package, Contact, MessageSquare, Brain,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Paleta rotativa por posição (segue tokens do design system)
const PLAN_THEMES = [
  { ring: 'ring-blue-500/40',  bg: 'bg-blue-500',    text: 'text-blue-500',    soft: 'bg-blue-500/10',    btn: 'bg-blue-500 hover:bg-blue-600 text-white' },
  { ring: 'ring-orange-500/40',bg: 'bg-orange-500',  text: 'text-orange-500',  soft: 'bg-orange-500/10',  btn: 'bg-orange-500 hover:bg-orange-600 text-white' },
  { ring: 'ring-purple-500/40',bg: 'bg-purple-500',  text: 'text-purple-500',  soft: 'bg-purple-500/10',  btn: 'bg-purple-500 hover:bg-purple-600 text-white' },
  { ring: 'ring-emerald-500/40',bg:'bg-emerald-500', text: 'text-emerald-500', soft: 'bg-emerald-500/10', btn: 'bg-emerald-500 hover:bg-emerald-600 text-white' },
  { ring: 'ring-pink-500/40',  bg: 'bg-pink-500',    text: 'text-pink-500',    soft: 'bg-pink-500/10',    btn: 'bg-pink-500 hover:bg-pink-600 text-white' },
];

const ICONS_BY_POSITION = [Star, Crown, Zap, Rocket, Sparkles, Building2, ShieldCheck, Gem];

// Mapa de feature flag → label amigável
const FEATURE_LABELS: Record<string, string> = {
  feature_whatsapp: 'WhatsApp',
  feature_facebook: 'Facebook',
  feature_instagram: 'Instagram',
  feature_internal_chat: 'Chat interno',
  feature_kanban: 'Kanban de leads',
  feature_pipeline: 'Pipeline de vendas',
  feature_scheduling: 'Agendamentos',
  feature_campaigns: 'Campanhas',
  feature_outreach: 'Cadência de follow-up',
  feature_ai_agents: 'Agentes de IA',
  feature_voice_agents: 'Agentes de voz',
  feature_audio_transcription_ai: 'Transcrição de áudio IA',
  feature_text_correction_ai: 'Correção de texto IA',
  feature_capture_funnels: 'Funis de captura',
  feature_forms: 'Formulários',
  feature_external_api: 'API externa',
  feature_integrations: 'Integrações nativas',
  feature_webhooks: 'Webhooks',
};

const FEATURE_ORDER = Object.keys(FEATURE_LABELS) as (keyof typeof FEATURE_LABELS)[];

type BillingCycle = 'monthly' | 'yearly';

function formatPrice(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (value >= 1000) return new Intl.NumberFormat('pt-BR').format(value);
  return String(value);
}

function PlanCardSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <Skeleton className="h-14 w-14 rounded-full mx-auto" />
      <Skeleton className="h-6 w-24 mx-auto" />
      <Skeleton className="h-10 w-32 mx-auto" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export function PlanSelector() {
  const { profile } = useAuth();
  const { data: plans, isLoading } = useActivePlans();
  const { data: effective } = useOrganizationEffectivePlan(profile?.organization_id);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  const visiblePlans = useMemo(
    () => (plans || []).filter((p) => p.is_public),
    [plans]
  );

  const currentPlanId = effective?.plan_id || null;

  // Para comparar upgrade/downgrade, usamos sempre o mesmo ciclo selecionado
  const getPrice = (p: PlatformPlan) =>
    cycle === 'yearly' ? p.price_yearly : p.price_monthly;

  const currentPrice = useMemo(() => {
    if (!currentPlanId) return null;
    const cur = visiblePlans.find((p) => p.id === currentPlanId);
    return cur ? getPrice(cur) : null;
  }, [currentPlanId, visiblePlans, cycle]);

  const handleSelect = (plan: PlatformPlan) => {
    if (!plan.checkout_url) return;
    window.open(plan.checkout_url, '_blank', 'noopener,noreferrer');
  };

  const renderButton = (plan: PlatformPlan, theme: typeof PLAN_THEMES[number]) => {
    const isCurrent = plan.id === currentPlanId;
    const noLink = !plan.checkout_url;

    if (isCurrent) {
      return (
        <Button disabled className="w-full" variant="outline">
          <Check className="h-4 w-4 mr-2" /> Plano Atual
        </Button>
      );
    }

    let label = 'Selecionar Plano';
    let Icon = ArrowRight;
    if (currentPrice !== null) {
      const planPrice = getPrice(plan);
      if (planPrice > currentPrice) {
        label = 'Fazer Upgrade';
        Icon = ArrowUpRight;
      } else if (planPrice < currentPrice) {
        label = 'Fazer Downgrade';
        Icon = ArrowDownRight;
      }
    }

    const btn = (
      <Button
        className={cn('w-full font-medium', !noLink && theme.btn)}
        disabled={noLink}
        variant={noLink ? 'outline' : 'default'}
        onClick={() => handleSelect(plan)}
      >
        {label} <Icon className="h-4 w-4 ml-2" />
      </Button>
    );

    if (noLink) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block w-full">{btn}</span>
            </TooltipTrigger>
            <TooltipContent>Contratação indisponível, fale com o suporte</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return btn;
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Cabeçalho */}
      <div className="text-center mb-6 space-y-2">
        <h1 className="text-3xl font-bold">Escolha seu Plano</h1>
        <p className="text-muted-foreground">
          Potencialize seus projetos com as ferramentas certas para cada necessidade
        </p>
      </div>

      {/* Toggle Mensal / Anual */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex items-center bg-muted rounded-full p-1">
          <button
            type="button"
            onClick={() => setCycle('monthly')}
            className={cn(
              'px-5 py-2 rounded-full text-sm font-medium transition-all',
              cycle === 'monthly'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Mensal
          </button>
          <button
            type="button"
            onClick={() => setCycle('yearly')}
            className={cn(
              'px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2',
              cycle === 'yearly'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Anual
            <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white text-[10px] px-1.5 py-0 h-4">
              Economize
            </Badge>
          </button>
        </div>
      </div>

      {/* Badge plano ativo */}
      {effective?.plan_name && currentPlanId && (
        <div className="flex justify-center mb-8">
          <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white px-4 py-2 text-sm rounded-full">
            <Check className="h-4 w-4 mr-1.5" />
            Plano Ativo: {effective.plan_name}
          </Badge>
        </div>
      )}

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <PlanCardSkeleton />
          <PlanCardSkeleton />
          <PlanCardSkeleton />
        </div>
      ) : visiblePlans.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-2xl bg-card">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Nenhum plano disponível no momento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visiblePlans.map((plan, idx) => {
            const theme = PLAN_THEMES[idx % PLAN_THEMES.length];
            const Icon = ICONS_BY_POSITION[idx % ICONS_BY_POSITION.length];
            const isCurrent = plan.id === currentPlanId;
            const features = FEATURE_ORDER.filter((k) => (plan as any)[k]);
            const price = getPrice(plan);
            const monthlyEquivalent = cycle === 'yearly' && plan.price_yearly
              ? Math.round(plan.price_yearly / 12)
              : null;

            const limits = [
              { icon: Users,         label: 'Usuários',        value: plan.max_users },
              { icon: Plug,          label: 'Conexões',        value: plan.max_connections },
              { icon: Layers,        label: 'Setores',         value: plan.max_sectors },
              { icon: Package,       label: 'Produtos',        value: plan.max_products },
              { icon: Contact,       label: 'Contatos',        value: plan.max_contacts },
              { icon: MessageSquare, label: 'Mensagens/mês',   value: plan.max_messages_month },
              { icon: Brain,         label: 'Tokens IA/mês',   value: plan.max_ai_tokens_month },
            ];

            return (
              <div
                key={plan.id}
                className={cn(
                  'relative rounded-2xl border bg-card p-6 flex flex-col transition-all',
                  isCurrent && `ring-2 ${theme.ring} shadow-lg`,
                  plan.highlight_label && !isCurrent && 'shadow-md'
                )}
              >
                {/* Tag "Mais Popular" / destaque */}
                {plan.highlight_label && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-orange-500 hover:bg-orange-500 text-white px-3 py-1 rounded-full">
                      {plan.highlight_label}
                    </Badge>
                  </div>
                )}

                {/* Tag "Plano Ativo" no canto */}
                {isCurrent && (
                  <div className="absolute -top-3 right-4">
                    <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white px-3 py-1 rounded-full">
                      Plano Ativo
                    </Badge>
                  </div>
                )}

                {/* Ícone */}
                <div className="flex justify-center mb-4 mt-2">
                  <div className={cn('h-16 w-16 rounded-full flex items-center justify-center', theme.bg)}>
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                </div>

                {/* Nome */}
                <h3 className="text-xl font-bold text-center mb-2">{plan.name}</h3>

                {/* Preço */}
                <div className="text-center mb-1">
                  <span className="text-3xl font-bold">{formatPrice(price)}</span>
                  <span className="text-muted-foreground text-sm ml-1">
                    {cycle === 'yearly' ? '/ano' : '/mês'}
                  </span>
                </div>
                {monthlyEquivalent !== null && monthlyEquivalent > 0 && (
                  <p className="text-xs text-muted-foreground text-center mb-2">
                    equivale a {formatPrice(monthlyEquivalent)}/mês
                  </p>
                )}

                {/* Descrição */}
                {plan.description && (
                  <p className="text-sm text-muted-foreground text-center mb-5 min-h-[2.5rem]">
                    {plan.description}
                  </p>
                )}

                {/* Limites do plano */}
                <div className={cn('rounded-xl p-4 mb-5', theme.soft)}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    O que está incluso
                  </p>
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {limits.map(({ icon: LIcon, label, value }) => (
                      <li key={label} className="flex items-center gap-2 text-sm">
                        <LIcon className={cn('h-3.5 w-3.5 shrink-0', theme.text)} />
                        <span className="font-semibold">{formatNumber(value)}</span>
                        <span className="text-muted-foreground text-xs truncate">{label}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Funcionalidades */}
                <ul className="space-y-2.5 mb-6 flex-1">
                  {features.map((key) => (
                    <li key={key} className="flex items-center gap-2 text-sm">
                      <Check className={cn('h-4 w-4 shrink-0', theme.text)} />
                      <span>{FEATURE_LABELS[key]}</span>
                    </li>
                  ))}
                  {features.length === 0 && (
                    <li className="text-xs text-muted-foreground italic text-center">
                      Sem funcionalidades configuradas
                    </li>
                  )}
                </ul>

                {/* Botão */}
                <div className="mt-auto">{renderButton(plan, theme)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
