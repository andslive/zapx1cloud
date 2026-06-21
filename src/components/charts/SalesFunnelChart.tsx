import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown, ChevronDown } from 'lucide-react';
import { useAnimatedNumber } from '@/hooks/useAnimatedNumber';

interface FunnelStage {
  name: string;
  count: number;
  color: string;
}

interface SalesFunnelChartProps {
  stages: FunnelStage[];
  isLoading?: boolean;
  wonCount?: number;
  lostCount?: number;
}

function ConversionBadge({ rate }: { rate: number }) {
  const color =
    rate >= 70
      ? 'text-emerald-500'
      : rate >= 40
      ? 'text-amber-500'
      : 'text-red-500';
  const bg =
    rate >= 70
      ? 'bg-emerald-500/10'
      : rate >= 40
      ? 'bg-amber-500/10'
      : 'bg-red-500/10';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color} ${bg}`}>
      {rate}% conversão
    </span>
  );
}

function AnimatedCount({ value, delay }: { value: number; delay: number }) {
  const { value: animated } = useAnimatedNumber(value, { duration: 900, delay });
  return <>{Math.round(animated)}</>;
}

function FunnelStageBar({
  stage,
  widthPct,
  totalCount,
  index,
}: {
  stage: FunnelStage;
  widthPct: number;
  totalCount: number;
  index: number;
}) {
  const pct = totalCount > 0 ? Math.round((stage.count / totalCount) * 100) : 0;

  return (
    <div className="flex items-center gap-3 w-full">
      {/* Bar */}
      <div className="flex-1 relative h-10 flex items-center">
      <motion.div
          className="h-full rounded-md flex items-center px-3 overflow-hidden"
          style={{
            width: `${widthPct}%`,
            background: `linear-gradient(90deg, ${stage.color}dd, ${stage.color}99)`,
            boxShadow: `0 2px 8px ${stage.color}44`,
            originX: 0,
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{
            duration: 0.6,
            delay: index * 0.1,
            ease: [0.34, 1.56, 0.64, 1],
          }}
        >
          <span className="text-white text-xs font-semibold truncate drop-shadow-sm">
            {stage.name}
          </span>
        </motion.div>
      </div>

      {/* Count + % */}
      <motion.div
        className="flex items-center gap-2 shrink-0 w-20 justify-end"
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.1 + 0.3, duration: 0.4 }}
      >
        <span className="text-foreground font-bold text-sm tabular-nums">
          <AnimatedCount value={stage.count} delay={index * 100} />
        </span>
        <span className="text-muted-foreground text-xs tabular-nums w-8 text-right">
          {pct}%
        </span>
      </motion.div>
    </div>
  );
}

export function SalesFunnelChart({ stages, isLoading, wonCount = 0, lostCount = 0 }: SalesFunnelChartProps) {
  const chartData = useMemo(() => {
    if (!stages.length) return [];
    const maxCount = Math.max(...stages.map(s => s.count), 1);
    return stages.map((stage, index) => {
      const conversionRate =
        index > 0 && stages[index - 1].count > 0
          ? Math.round((stage.count / stages[index - 1].count) * 100)
          : null;
      return {
        ...stage,
        widthPct: Math.max((stage.count / maxCount) * 100, 12),
        conversionRate,
      };
    });
  }, [stages]);

  const totalCount = useMemo(() => stages.reduce((s, st) => s + st.count, 0), [stages]);
  const activeCount = totalCount - wonCount - lostCount;

  if (isLoading) {
    return (
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            Funil de Vendas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 py-2">
            {[80, 65, 50, 35, 20].map((w, i) => (
              <div key={i} className="h-10 rounded-md bg-muted animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!chartData.length) {
    return (
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            Funil de Vendas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Nenhum dado disponível
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            Funil de Vendas
          </CardTitle>
          <motion.span
            className="text-sm text-muted-foreground font-medium bg-muted/40 px-3 py-1 rounded-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <AnimatedCount value={totalCount} delay={0} /> leads
          </motion.span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {chartData.map((stage, index) => (
          <div key={stage.name} className="space-y-1">
            {/* Conversion arrow between stages */}
            {index > 0 && stage.conversionRate !== null && (
              <motion.div
                className="flex items-center gap-2 pl-2 py-0.5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.1 + 0.2 }}
              >
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                <ConversionBadge rate={stage.conversionRate} />
              </motion.div>
            )}

            <FunnelStageBar
              stage={stage}
              widthPct={stage.widthPct}
              totalCount={totalCount}
              index={index}
            />
          </div>
        ))}

        {/* Footer summary */}
        {(wonCount > 0 || lostCount > 0 || activeCount > 0) && (
          <motion.div
            className="flex flex-wrap gap-2 pt-4 mt-2 border-t border-border"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: chartData.length * 0.1 + 0.3 }}
          >
            {wonCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                {wonCount} ganhos ({totalCount > 0 ? Math.round((wonCount / totalCount) * 100) : 0}%)
              </div>
            )}
            {lostCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />
                {lostCount} perdidos ({totalCount > 0 ? Math.round((lostCount / totalCount) * 100) : 0}%)
              </div>
            )}
            {activeCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-full font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                {activeCount} ativos ({totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0}%)
              </div>
            )}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
