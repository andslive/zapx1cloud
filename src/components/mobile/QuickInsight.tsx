import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, AlertTriangle, TrendingUp, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface QuickInsightProps {
  type?: 'info' | 'warning' | 'success';
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  delay?: number;
}

export function QuickInsight({
  type = 'info',
  title = 'Insight do Dia',
  message,
  actionLabel,
  onAction,
  delay = 0,
}: QuickInsightProps) {
  const icons = {
    info: Sparkles,
    warning: AlertTriangle,
    success: TrendingUp,
  };

  const colors = {
    info: {
      bg: 'bg-primary/10',
      border: 'border-primary/20',
      icon: 'text-primary',
      glow: 'shadow-primary/20',
    },
    warning: {
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/20',
      icon: 'text-yellow-500',
      glow: 'shadow-yellow-500/20',
    },
    success: {
      bg: 'bg-green-500/10',
      border: 'border-green-500/20',
      icon: 'text-green-500',
      glow: 'shadow-green-500/20',
    },
  };

  const Icon = icons[type];
  const colorClasses = colors[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay * 0.1 }}
    >
      <Card className={cn(
        "p-4 border-l-4 relative overflow-hidden",
        colorClasses.bg,
        colorClasses.border
      )}>
        {/* Animated background glow */}
        <motion.div
          className={cn(
            "absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20",
            colorClasses.bg
          )}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <div className="relative z-10">
          <div className="flex items-start gap-3">
            <motion.div
              className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0",
                colorClasses.bg
              )}
              animate={{
                rotate: [0, 5, -5, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Icon size={16} className={colorClasses.icon} />
            </motion.div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-xs font-semibold text-foreground">
                  ✨ {title}
                </h4>
              </div>
              
              <p className="text-sm text-muted-foreground leading-relaxed">
                {message}
              </p>
            </div>
          </div>

          {actionLabel && onAction && (
            <motion.div
              className="mt-3 flex justify-end"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: delay * 0.1 + 0.3 }}
            >
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs font-medium"
                onClick={onAction}
              >
                {actionLabel}
                <ArrowRight size={12} className="ml-1" />
              </Button>
            </motion.div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

// Generate contextual insight based on dashboard data
export function generateInsight(stats: {
  atRiskLeads?: number;
  hotLeads?: number;
  pendingTasks?: number;
  conversionRate?: number;
}): { type: 'info' | 'warning' | 'success'; message: string } {
  if (stats.atRiskLeads && stats.atRiskLeads > 0) {
    return {
      type: 'warning',
      message: `${stats.atRiskLeads} lead${stats.atRiskLeads > 1 ? 's' : ''} não ${stats.atRiskLeads > 1 ? 'foram contatados' : 'foi contatado'} nos últimos 3 dias. Priorize-os!`,
    };
  }

  if (stats.hotLeads && stats.hotLeads > 0) {
    return {
      type: 'success',
      message: `Você tem ${stats.hotLeads} lead${stats.hotLeads > 1 ? 's' : ''} quente${stats.hotLeads > 1 ? 's' : ''} prontos para fechar. Aproveite o momento!`,
    };
  }

  if (stats.conversionRate && stats.conversionRate > 30) {
    return {
      type: 'success',
      message: `Sua taxa de conversão está em ${stats.conversionRate}%. Continue assim!`,
    };
  }

  if (stats.pendingTasks && stats.pendingTasks > 5) {
    return {
      type: 'info',
      message: `Você tem ${stats.pendingTasks} tarefas pendentes hoje. Foque nas prioritárias!`,
    };
  }

  return {
    type: 'info',
    message: 'Revise seus leads e identifique oportunidades de follow-up.',
  };
}
