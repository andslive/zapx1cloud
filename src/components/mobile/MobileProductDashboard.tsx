import { motion } from 'framer-motion';
import { Users, TrendingUp, DollarSign, Target, ArrowRight, Phone, MessageSquare, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tables } from '@/integrations/supabase/types';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useAuth } from '@/hooks/useAuth';
import { useTodaysTasks, useCompleteTask } from '@/hooks/useTasks';
import { useCurrentGoal } from '@/hooks/useSalesGoals';
import { StatCardPremium } from './StatCardPremium';
import { QuickInsight, generateInsight } from './QuickInsight';
import { NextTask } from './NextTask';
import { MiniPipeline } from './MiniPipeline';
import { WeeklyPerformance } from './WeeklyPerformance';
import { Confetti } from './Confetti';
import { useHaptics } from '@/hooks/useHaptics';
import { formatCurrency } from '@/hooks/useAnimatedNumber';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { differenceInDays } from 'date-fns';

type DBProduct = Tables<'products'>;

interface MobileProductDashboardProps {
  product: DBProduct;
  onNavigate: (tab: string) => void;
}

export function MobileProductDashboard({ product, onNavigate }: MobileProductDashboardProps) {
  const { user, isAdmin, isManager } = useAuth();
  const userId = (isAdmin() || isManager()) ? undefined : user?.id;
  const { stats, trends, funnelData, weeklyData, sparklineData, isLoading } = useDashboardData(product.id, userId);
  const { data: todaysTasks } = useTodaysTasks(user?.id || '');
  const { data: currentGoal } = useCurrentGoal(user?.id || '', product.id);
  const completeTask = useCompleteTask();
  const haptics = useHaptics();
  
  const [showConfetti, setShowConfetti] = useState(false);

  const nextTask = todaysTasks?.find(t => t.status !== 'completed') || null;
  
  // Calculate goal progress
  const goalTarget = currentGoal?.target_value || 50000;
  const goalProgress = Math.min(100, ((stats?.wonDealsValue || 0) / goalTarget) * 100);
  const daysRemaining = currentGoal?.period_end 
    ? Math.max(0, differenceInDays(new Date(currentGoal.period_end), new Date()))
    : 0;

  const handleCompleteTask = async (taskId: string) => {
    haptics.medium();
    await completeTask.mutateAsync(taskId);
  };

  const insight = generateInsight({
    atRiskLeads: stats?.atRiskLeads?.length || 0,
    pendingTasks: todaysTasks?.filter(t => t.status !== 'completed').length || 0,
    conversionRate: stats?.conversionRate || 0,
  });

  const statCards = [
    {
      label: 'Leads Ativos',
      value: stats?.activeLeadsCount || 0,
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      format: 'number' as const,
      trend: trends?.leadsChange,
      sparklineData: sparklineData?.leads,
    },
    {
      label: 'Conversão',
      value: stats?.conversionRate || 0,
      icon: TrendingUp,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      format: 'percentage' as const,
      trend: trends?.conversionChange,
      sparklineData: sparklineData?.conversion,
    },
    {
      label: 'Faturado',
      value: stats?.wonDealsValue || 0,
      icon: DollarSign,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      format: 'currency' as const,
      trend: trends?.revenueChange,
      sparklineData: sparklineData?.revenue,
    },
    {
      label: 'Comissões',
      value: stats?.totalCommissions || 0,
      icon: Target,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      format: 'currency' as const,
      trend: trends?.commissionsChange,
      sparklineData: sparklineData?.commissions,
      subtitle: stats?.pendingCommissions ? `${formatCurrency(stats.pendingCommissions)} pendente` : undefined,
    },
  ];

  const quickActions = [
    { label: 'Leads', tab: 'leads', icon: Users },
    { label: 'IA', tab: 'ai', icon: TrendingUp },
    { label: 'Metas', tab: 'goals', icon: Target },
  ];

  return (
    <div className="p-4 space-y-4 pb-24">
      <Confetti isActive={showConfetti} onComplete={() => setShowConfetti(false)} />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {statCards.map((stat, index) => (
          <StatCardPremium
            key={stat.label}
            {...stat}
            delay={index}
            isLoading={isLoading}
          />
        ))}
      </div>

      {/* Goal Progress Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-foreground">🎯 Meta do Mês</h3>
              <p className="text-xs text-muted-foreground">
                {daysRemaining > 0 ? `${daysRemaining} dias restantes` : 'Último dia!'}
              </p>
            </div>
            <motion.span 
              className={cn(
                "text-lg font-bold",
                goalProgress >= 100 ? "text-green-500" : "text-primary"
              )}
              animate={goalProgress >= 100 ? { scale: [1, 1.1, 1] } : undefined}
              transition={{ repeat: goalProgress >= 100 ? Infinity : 0, duration: 2 }}
            >
              {goalProgress.toFixed(0)}%
            </motion.span>
          </div>
          
          <div className="relative mb-2">
            <Progress value={goalProgress} className="h-3" />
            {goalProgress >= 100 && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
              />
            )}
          </div>
          
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats?.wonDealsValue || 0)} de {formatCurrency(goalTarget)}
            </p>
            {goalProgress >= 80 && goalProgress < 100 && (
              <span className="text-xs text-primary font-medium">Quase lá! 🔥</span>
            )}
            {goalProgress >= 100 && (
              <span className="text-xs text-green-500 font-medium">Meta atingida! 🎉</span>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Quick Insight */}
      <QuickInsight
        type={insight.type}
        message={insight.message}
        actionLabel="Ver Leads"
        onAction={() => onNavigate('leads')}
        delay={5}
      />

      {/* Next Task */}
      <NextTask
        task={nextTask}
        onComplete={handleCompleteTask}
        onViewAll={() => onNavigate('tasks')}
        delay={6}
        isLoading={!todaysTasks}
      />

      {/* At Risk Leads */}
      {stats?.atRiskLeads && stats.atRiskLeads.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Card className="p-4 border-destructive/20 bg-destructive/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  <AlertTriangle size={16} className="text-destructive" />
                </motion.div>
                <h3 className="font-semibold text-foreground">Leads em Risco</h3>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs"
                onClick={() => onNavigate('leads')}
              >
                Ver todos
                <ArrowRight size={12} className="ml-1" />
              </Button>
            </div>
            
            <div className="space-y-2">
              {stats.atRiskLeads.slice(0, 3).map((lead, index) => (
                <motion.div 
                  key={lead.id} 
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + index * 0.1 }}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-destructive">
                        {lead.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{lead.name}</p>
                      <p className="text-xs text-destructive font-medium">
                        {lead.daysWithoutContact} dias sem contato
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <Phone size={14} className="text-green-500" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <MessageSquare size={14} className="text-primary" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}

      {/* Mini Pipeline */}
      <MiniPipeline
        stages={funnelData || []}
        onViewFull={() => onNavigate('leads')}
        delay={8}
        isLoading={isLoading}
      />

      {/* Weekly Performance */}
      <WeeklyPerformance
        weeklyData={weeklyData}
        totalDeals={stats?.wonDealsCount || 0}
        totalValue={stats?.wonDealsValue || 0}
        delay={9}
        isLoading={isLoading}
      />

      {/* Quick Actions */}
      <motion.div 
        className="grid grid-cols-3 gap-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
      >
        {quickActions.map((action, index) => {
          const Icon = action.icon;
          return (
            <motion.div
              key={action.tab}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                variant="outline"
                className="h-auto py-4 flex-col gap-2 w-full"
                onClick={() => {
                  haptics.light();
                  onNavigate(action.tab);
                }}
              >
                <Icon size={20} className="text-primary" />
                <span className="text-xs">{action.label}</span>
              </Button>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
